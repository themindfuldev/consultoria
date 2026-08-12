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
 * That conversion always yields a *paged* doc, so a second call — the Docs API
 * `updateDocumentStyle` below — flips it to pageless.
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
 * setting, so it takes this extra Docs API round trip.
 *
 * `batchUpdate` accepts the `drive.file` scope the app already holds — the doc
 * was created by us, so no extra consent is needed. Pageless hides headers,
 * footers and page numbers, none of which the feedback HTML uses.
 */
async function makePageless(documentId: string, token: string): Promise<void> {
  const res = await fetch(`${DOCS_API}/documents/${documentId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
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
  // Both follow-ups are best-effort: a doc that stayed paged, or private, is
  // still a perfectly readable doc and must not fail the whole feedback flow.
  await Promise.all([
    makePublicViewer(json.id, token).catch(() => {/* sharing is best-effort */}),
    makePageless(json.id, token).catch(() => {/* pageless is best-effort */}),
  ]);
  return json;
}

/**
 * (Re)builds the weekly doc from the latest HTML. Always a fresh file rather
 * than an in-place Docs update — the doc is rebuilt from all of the week's
 * feedbacks anyway, and creating is far simpler than diffing.
 *
 * The previous doc is deliberately **not** deleted here: the caller must first
 * point the `weeks` doc at the new file and only then drop the old one. Deleting
 * up-front (as this used to) left the stored URL aimed at a dead file whenever
 * the creation that followed failed.
 */
export async function createWeeklyDoc(
  name: string,
  html: string,
  folderId: string,
  token: string,
): Promise<CreatedDoc> {
  return createDocFromHtml(name, html, folderId, token);
}
