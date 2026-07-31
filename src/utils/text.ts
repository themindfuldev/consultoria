/**
 * text.ts
 *
 * Display helpers for text that originates in the trainer's spreadsheet.
 *
 * Sheet-derived names (tab/session names, exercise names, the spreadsheet's own
 * title) are stored and used *verbatim*: a tab title is matched literally when
 * building A1 ranges, so `"Treino 3 "` has to stay `"Treino 3 "` everywhere it
 * addresses the sheet. The stray spaces only become a problem on the way out —
 * they push headings around and, worse, break WhatsApp markup, where
 * `*Treino 3 *` renders as literal asterisks instead of bold because the closing
 * `*` isn't flush against a word.
 *
 * So: trim at the point of rendering, never at the point of reading.
 */

/** Sheet-derived text, ready to render on a page, in a message, or in a file name. */
export function trimText(value: string | null | undefined): string {
  return (value ?? '').trim();
}
