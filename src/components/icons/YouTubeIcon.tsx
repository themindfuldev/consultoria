import type { SVGProps } from 'react';

/**
 * Outline YouTube glyph in the same style as our lucide-react icons and the
 * custom WhatsApp icon (24×24 viewBox, stroke=currentColor, width 2, round
 * caps/joins) — a rounded frame with a play triangle.
 */
export function YouTubeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M3 5m0 4a4 4 0 0 1 4 -4h10a4 4 0 0 1 4 4v6a4 4 0 0 1 -4 4h-10a4 4 0 0 1 -4 -4z" />
      <path d="M10 9l5 3l-5 3z" />
    </svg>
  );
}
