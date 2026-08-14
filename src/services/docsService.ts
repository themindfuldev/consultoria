/**
 * docsService.ts
 *
 * Builds and writes the weekly feedback Google Doc into the student's Drive.
 * There is ONE doc per cycle-week ("Feedbacks - Semana X") inside the week
 * folder; it lists every session's per-exercise feedback and video links.
 *
 * The Drive multipart upload must send the HTML with a `text/html` media part
 * while the metadata declares `application/vnd.google-apps.document` as the
 * target type — Drive then converts the HTML into a native Google Doc. (Sending
 * the Google-Apps mime as the media Content-Type is what returned HTTP 400.)
 *
 * A week keeps **one** file for its whole life: rebuilds overwrite that file's
 * content in place (`uploadType=media` PATCH) instead of creating a replacement
 * and deleting the old one. That halves the Drive traffic per rebuild, skips the
 * week-folder lookup entirely, and keeps the doc's URL stable for anyone who
 * bookmarked it. A fresh file is created only when the week has no doc yet, or
 * when the one it points at is gone.
 */

import type { ExerciseFeedback, SessionVideo } from '../types';
import { makePublicViewer } from './driveService';
import { linkifyToHtml } from '../utils/linkify';
import { trimText } from '../utils/text';

const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const DOCS_API = 'https://docs.googleapis.com/v1';

// ── HTML builder ──────────────────────────────────────────────────────────────

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** One session's contribution to the weekly doc. */
export interface WeeklySection {
  sessionLabel: string;             // e.g. "Treino 1 · 04 de julho de 2026"
  exerciseFeedback: ExerciseFeedback[];
  videos: SessionVideo[];
  generalNotes?: string;
}

/**
 * Builds the full HTML for the weekly feedback doc. Drive converts it into a
 * Google Doc. Header carries the cycle name, type and week; then one section per
 * session, each listing the exercises with the trainer's feedback + video links.
 */
export function buildWeeklyFeedbackHtml(
  weekNumber: number,
  cycleTitle: string,
  modality: string,
  studentName: string,
  sections: WeeklySection[],
): string {
  const sectionHtml = sections
    .map((sec) => {
      const videosByExercise = new Map<string, SessionVideo[]>();
      for (const v of sec.videos) {
        const key = v.exerciseName ?? 'Geral';
        (videosByExercise.get(key) ?? videosByExercise.set(key, []).get(key)!).push(v);
      }

      const exerciseBlocks = sec.exerciseFeedback
        .map((ef) => {
          const vids = videosByExercise.get(ef.exerciseName) ?? [];
          const videoLinks = vids
            .map((v, i) => `<li><a href="${esc(v.driveFileUrl)}">Vídeo ${i + 1}</a></li>`)
            .join('');
          const text = ef.textFeedback
            ? linkifyToHtml(ef.textFeedback)
            : '<em>Sem comentários.</em>';
          // Label + empty line before it, then a line break before the text.
          return `
            <h3>${esc(trimText(ef.exerciseName))}</h3>
            ${vids.length ? `<p><strong>Vídeos:</strong></p><ul>${videoLinks}</ul>` : ''}
            <p></p>
            <p><strong>Feedback:</strong><br>${text}</p>`;
        })
        .join('');

      const notes = sec.generalNotes
        ? `<p></p><p><strong>Observações gerais:</strong><br>${linkifyToHtml(sec.generalNotes)}</p>`
        : '';

      // (b) full horizontal line before each training session (incl. the first).
      return `<hr><h2>${esc(sec.sessionLabel)}</h2>${exerciseBlocks}${notes}`;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 24px; color: #1e293b; }
  h1 { color: #4f46e5; margin-bottom: 6px; }
  h2 { color: #334155; margin-top: 8px; }
  h3 { color: #475569; margin-top: 18px; margin-bottom: 4px; }
  hr { border: none; border-top: 2px solid #94a3b8; margin: 28px 0 12px; }
  a { color: #4f46e5; }
  p.meta { color: #64748b; font-size: 14px; margin: 2px 0; }
</style>
</head>
<body>
  <h1>Feedbacks - Semana ${weekNumber}</h1>
  <p class="meta"><strong>Ciclo:</strong> ${esc(cycleTitle)}</p>
  <p class="meta"><strong>Tipo:</strong> ${esc(modality)}</p>
  <p class="meta"><strong>Semana:</strong> ${weekNumber}</p>
  <p class="meta"><strong>Aluno(a):</strong> ${esc(studentName)}</p>
  ${sectionHtml || '<p><em>Nenhum feedback ainda.</em></p>'}
</body>
</html>`;
}

// ── Doc creation ──────────────────────────────────────────────────────────────

export interface CreatedDoc {
  id: string;
  webViewLink: string;
}

/**
 * Switches a Google Doc to pageless. Drive's HTML→Doc conversion can only
 * produce a paged doc, and neither the HTML nor the upload metadata carries the
 * setting, so it takes a separate Docs API round trip.
 *
 * `batchUpdate` accepts the `drive.file` scope the app already holds — the doc
 * was created by us, so no extra consent is needed. Pageless hides headers,
 * footers and page numbers, none of which the feedback HTML uses.
 *
 * **Never awaited** (see `firePageless`): it is the slowest call in the rebuild —
 * the Docs backend has to load the document model of a file Drive has only just
 * converted — and nothing downstream depends on it. Blocking the student's
 * "Atualizar" on a cosmetic setting is what made rebuilds feel slow.
 */
async function makePageless(documentId: string, token: string): Promise<void> {
  const res = await fetch(`${DOCS_API}/documents/${documentId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    // Let the request outlive the page: the student may navigate away the moment
    // the link appears. The body is a few hundred bytes, far under the 64 KB
    // budget `keepalive` allows.
    keepalive: true,
    body: JSON.stringify({
      requests: [
        {
          updateDocumentStyle: {
            documentStyle: { documentFormat: { documentMode: 'PAGELESS' } },
            fields: 'documentFormat.documentMode',
          },
        },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`Docs API batchUpdate → ${res.status}: ${await res.text()}`);
  }
}

/**
 * Kicks off the pageless switch without waiting for it.
 *
 * Re-uploading HTML over a doc rebuilds its whole document model, so the setting
 * is re-applied after *every* rebuild rather than only at creation: whether the
 * conversion preserves `documentMode` is Drive's business, and re-asserting it
 * costs nothing now that it is off the critical path. Failures are swallowed —
 * a doc that stayed paged is still perfectly readable.
 */
function firePageless(documentId: string, token: string): void {
  void makePageless(documentId, token).catch(() => {/* pageless is best-effort */});
}

/** Creates a Google Doc from HTML inside `folderId` and shares it (anyone → reader). */
async function createDocFromHtml(
  name: string,
  html: string,
  folderId: string,
  token: string,
): Promise<CreatedDoc> {
  const boundary = 'consultoria_doc_' + Date.now();
  const metadata = JSON.stringify({
    name,
    mimeType: 'application/vnd.google-apps.document',
    parents: [folderId],
  });
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
    `--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n${html}\r\n` +
    `--${boundary}--`;

  const res = await fetch(
    `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,webViewLink`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  if (!res.ok) {
    throw new Error(`Falha ao criar documento: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as CreatedDoc;
  // Sharing is awaited: the link this returns is handed straight to the student,
  // so it should be openable by the time they see it. Still best-effort — a
  // private doc beats a failed rebuild.
  await makePublicViewer(json.id, token).catch(() => {/* sharing is best-effort */});
  firePageless(json.id, token);
  return json;
}

/**
 * Overwrites an existing doc's content with fresh HTML, keeping the same file —
 * same id, same URL, same sharing, no folder lookup. Drive re-runs the same
 * HTML→Doc conversion it uses on create.
 *
 * Returns `null` when the file can't be overwritten and the caller should make a
 * new one instead: it was deleted (404/410), it is in the bin, or the grant on it
 * is gone (403 — `drive.file` access is per-file and the student can revoke it).
 * A doc in the bin is deliberately not resurrected; `driveFileExists` already
 * treats trashed as gone, so reviving it here would put the week's link back on a
 * file the student had thrown away.
 */
async function updateDocHtml(
  documentId: string,
  html: string,
  token: string,
): Promise<CreatedDoc | null> {
  const res = await fetch(
    `${DRIVE_UPLOAD_API}/files/${documentId}?uploadType=media&fields=id,webViewLink,trashed`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'text/html; charset=UTF-8',
      },
      body: html,
    },
  );
  if (res.status === 404 || res.status === 410 || res.status === 403) return null;
  if (!res.ok) {
    throw new Error(`Falha ao atualizar documento: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as CreatedDoc & { trashed?: boolean };
  if (json.trashed) return null;
  firePageless(json.id, token);
  return { id: json.id, webViewLink: json.webViewLink };
}

export interface WeeklyDocRequest {
  /** File name, used only when a new doc has to be created. */
  name: string;
  html: string;
  token: string;
  /** The doc this week already points at, if any. Overwritten in place. */
  existingDocId?: string | null;
  /**
   * Resolves the week folder that a *new* doc goes into. A callback rather than
   * an id because `getOrCreateWeekFolder` is three chained Drive round trips —
   * the overwrite path must not pay for a folder it never uses.
   */
  resolveFolderId: () => Promise<string>;
}

/**
 * (Re)builds the weekly doc from the latest HTML.
 *
 * Overwrites the week's existing file when there is one, so its id and URL
 * survive every rebuild; falls back to creating a fresh doc when the week has
 * none or the old one is unreachable. The whole doc is rewritten either way —
 * it is rebuilt from all of the week's feedbacks anyway, and replacing the
 * content wholesale is far simpler than diffing.
 *
 * When this *does* create a new file, the previous one is deliberately **not**
 * deleted here: the caller must first point the `weeks` doc at the new file and
 * only then drop the old one. Deleting up-front (as this used to) left the
 * stored URL aimed at a dead file whenever the creation that followed failed.
 */
export async function upsertWeeklyDoc(req: WeeklyDocRequest): Promise<CreatedDoc> {
  if (req.existingDocId) {
    const updated = await updateDocHtml(req.existingDocId, req.html, req.token);
    if (updated) return updated;
  }
  const folderId = await req.resolveFolderId();
  return createDocFromHtml(req.name, req.html, folderId, req.token);
}
