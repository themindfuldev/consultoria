/**
 * docsService.ts
 *
 * Creates a "Feedback" Google Doc inside the student's session Drive folder.
 * Uses the Drive API multipart upload with mimeType=application/vnd.google-apps.document
 * so that Drive automatically converts the HTML payload into a native Google Doc.
 */

import type { Feedback, SessionVideo } from '../types';
import { uploadFileToDrive } from './driveService';

// ── HTML builder ──────────────────────────────────────────────────────────────

function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Builds an HTML string from a completed Feedback document.
 * Drive converts this HTML into a properly formatted Google Doc.
 */
export function buildFeedbackHtml(
  feedback: Feedback,
  sessionLabel: string,       // e.g. "Terça · 25 de maio de 2026"
  cycleTitle: string,
  studentName: string,
  videos: SessionVideo[],
): string {
  const videosByExercise = new Map<string, SessionVideo[]>();
  for (const v of videos) {
    const key = v.exerciseName ?? 'Geral';
    const list = videosByExercise.get(key) ?? [];
    list.push(v);
    videosByExercise.set(key, list);
  }

  const exerciseBlocks = feedback.exerciseFeedback
    .map((ef) => {
      const exerciseVideos = videosByExercise.get(ef.exerciseName) ?? [];
      const videoLinks = exerciseVideos
        .map(
          (v, i) =>
            `<li><a href="${esc(v.driveFileUrl)}">Vídeo ${i + 1}</a></li>`,
        )
        .join('');

      const mediaLinks =
        ef.mediaFiles.length > 0
          ? `<p><strong>Respostas do treinador:</strong></p><ul>` +
            ef.mediaFiles
              .map(
                (m) =>
                  `<li><a href="${esc(m.driveFileUrl)}">${esc(m.fileName)}</a> (${m.mediaType})</li>`,
              )
              .join('') +
            `</ul>`
          : '';

      return `
      <h2>${esc(ef.exerciseName)}</h2>
      ${exerciseVideos.length > 0 ? `<p><strong>Vídeos:</strong></p><ul>${videoLinks}</ul>` : ''}
      <p><strong>Feedback:</strong></p>
      <p>${esc(ef.textFeedback).replace(/\n/g, '<br>')}</p>
      ${mediaLinks}
    `;
    })
    .join('<hr>');

  const generalNotes = feedback.generalNotes
    ? `<h2>Observações Gerais</h2><p>${esc(feedback.generalNotes).replace(/\n/g, '<br>')}</p>`
    : '';

  const completedDate = feedback.completedAt
    ? new Date(feedback.completedAt.seconds * 1000).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : '';

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8">
<style>
  body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 24px; color: #1e293b; }
  h1 { color: #4f46e5; }
  h2 { color: #334155; margin-top: 28px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
  hr { border: none; border-top: 2px solid #e2e8f0; margin: 24px 0; }
  a { color: #4f46e5; }
  .meta { color: #64748b; font-size: 14px; margin-bottom: 24px; }
</style>
</head>
<body>
  <h1>Feedback — ${esc(cycleTitle)}</h1>
  <div class="meta">
    <p><strong>Aluno(a):</strong> ${esc(studentName)}</p>
    <p><strong>Sessão:</strong> ${esc(sessionLabel)}</p>
    ${completedDate ? `<p><strong>Data do feedback:</strong> ${completedDate}</p>` : ''}
  </div>
  ${exerciseBlocks}
  ${generalNotes}
</body>
</html>`;
}

// ── Doc creation ──────────────────────────────────────────────────────────────

export interface CreatedDoc {
  id: string;
  webViewLink: string;
}

/**
 * Creates a "Feedback.gdoc" inside the given Drive folder.
 * Returns the Google Doc's id and shareable URL.
 */
export async function createFeedbackDoc(
  html: string,
  folderId: string,
  token: string,
): Promise<CreatedDoc> {
  const htmlBytes = new TextEncoder().encode(html);

  const result = await uploadFileToDrive(
    'Feedback',
    'application/vnd.google-apps.document',
    htmlBytes,
    folderId,
    token,
  );

  return { id: result.id, webViewLink: result.webViewLink };
}
