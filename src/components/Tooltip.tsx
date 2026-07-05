import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * Click-to-toggle tooltip with a caret (works on touch). Tapping the trigger
 * opens/closes the bubble; any click outside closes it. Positioned below the
 * trigger and left-aligned so it never overflows off the left edge.
 */
export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex text-left"
      >
        {children}
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute left-0 top-full z-50 mt-2 whitespace-nowrap rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium leading-relaxed text-white shadow-lg dark:bg-slate-700"
        >
          {content}
          {/* Caret pointing up at the tooltip's top edge */}
          <span className="absolute bottom-full left-4 border-4 border-transparent border-b-slate-900 dark:border-b-slate-700" />
        </span>
      )}
    </span>
  );
}
