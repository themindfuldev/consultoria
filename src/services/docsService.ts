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
 */

import type { ExerciseFeedback, SessionVideo } from '../types';
import { deleteDriveFile, makePublicViewer } from './driveService';

const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

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
            ? esc(ef.textFeedback).replace(/\n/g, '<br>')
            : '<em>Sem comentários.</em>';
          // (d) label + (c) line break before the text.
          return `
            <h3>${esc(ef.exerciseName)}</h3>
            ${vids.length ? `<p><strong>Vídeos:</strong></p><ul>${videoLinks}</ul>` : ''}
            <p><strong>Feedback:</strong><br>${text}</p>`;
        })
        .join('');

      const notes = sec.generalNotes
        ? `<p><strong>Observações gerais:</strong><br>${esc(sec.generalNotes).replace(/\n/g, '<br>')}</p>`
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
  .meta { color: #64748b; font-size: 14px; }
  .meta p { margin: 2px 0; }
</style>
</head>
<body>
  <h1>Feedbacks - Semana ${weekNumber}</h1>
  <div class="meta">
    <p><strong>Ciclo:</strong> ${esc(cycleTitle)}</p>
    <p><strong>Tipo:</strong> ${esc(modality)}</p>
    <p><strong>Semana:</strong> ${weekNumber}</p>
    <p><strong>Aluno(a):</strong> ${esc(studentName)}</p>
  </div>
  ${sectionHtml || '<p><em>Nenhum feedback ainda.</em></p>'}
</body>
</html>`;
}

// ── Doc creation ──────────────────────────────────────────────────────────────

export interface CreatedDoc {
  id: string;
  webViewLink: string;
}

/** Creates a Google Doc from HTML inside `folderId` and shares it (anyone → reader). */
export async function createDocFromHtml(
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
  await makePublicViewer(json.id, token).catch(() => {/* sharing is best-effort */});
  return json;
}

/**
 * Replaces the weekly doc: deletes the previous one (if any) and recreates it
 * from the latest HTML. Simpler and more reliable than an in-place Docs update,
 * since the doc is always rebuilt from all the week's feedbacks.
 */
export async function replaceWeeklyDoc(
  previousDocId: string | undefined,
  name: string,
  html: string,
  folderId: string,
  token: string,
): Promise<CreatedDoc> {
  if (previousDocId) {
    await deleteDriveFile(previousDocId, token).catch(() => {/* may already be gone */});
  }
  return createDocFromHtml(name, html, folderId, token);
}
