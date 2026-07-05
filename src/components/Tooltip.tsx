import type { ReactNode } from 'react';

/**
 * Lightweight hover tooltip with a caret. CSS-only (group-hover), positioned
 * below the trigger and left-aligned so it never overflows off the left edge.
 */
export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full z-50 mt-2 hidden whitespace-nowrap rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium leading-relaxed text-white shadow-lg group-hover:block dark:bg-slate-700"
      >
        {content}
        {/* Caret pointing up at the tooltip's top edge */}
        <span className="absolute bottom-full left-4 border-4 border-transparent border-b-slate-900 dark:border-b-slate-700" />
      </span>
    </span>
  );
}
