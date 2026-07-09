/**
 * linkify.ts
 *
 * Turns plain text that may contain URLs into either React-renderable tokens or
 * an HTML string with `<a>` anchors. Used so trainer-typed feedback (a plain
 * string) shows clickable links both in the student's feedback view and in the
 * generated Google Doc.
 */

/** Matches an http(s) URL up to the next whitespace or angle bracket. */
const URL_RE = /https?:\/\/[^\s<>]+/gi;

/** Trailing characters that are almost always sentence punctuation, not part of the URL. */
const TRAILING_PUNCT_RE = /[.,;:!?)\]}"']+$/;

export interface LinkToken {
  type: 'text' | 'url';
  value: string;
}

/**
 * Splits `text` into ordered text/url tokens. Trailing sentence punctuation
 * (e.g. the period in "veja https://x.com.") is peeled back off the URL into a
 * following text token so the link itself stays clean.
 */
export function tokenizeLinks(text: string): LinkToken[] {
  const tokens: LinkToken[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_RE)) {
    const start = match.index ?? 0;
    let url = match[0];
    let trailing = '';
    const trail = url.match(TRAILING_PUNCT_RE);
    if (trail) {
      trailing = trail[0];
      url = url.slice(0, url.length - trailing.length);
    }

    if (start > lastIndex) tokens.push({ type: 'text', value: text.slice(lastIndex, start) });
    if (url) tokens.push({ type: 'url', value: url });
    if (trailing) tokens.push({ type: 'text', value: trailing });
    lastIndex = start + match[0].length;
  }

  if (lastIndex < text.length) tokens.push({ type: 'text', value: text.slice(lastIndex) });
  return tokens;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Escapes `text` for HTML, converts newlines to `<br>`, and wraps any URLs in
 * `<a>` anchors. Safe to drop straight into the feedback-doc HTML.
 */
export function linkifyToHtml(text: string): string {
  return tokenizeLinks(text)
    .map((t) =>
      t.type === 'url'
        ? `<a href="${escapeHtml(t.value)}">${escapeHtml(t.value)}</a>`
        : escapeHtml(t.value).replace(/\n/g, '<br>'),
    )
    .join('');
}
