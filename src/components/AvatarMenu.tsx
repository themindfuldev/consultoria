import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { ComponentType } from 'react';
import { Avatar } from './Avatar';

export interface AvatarMenuItem {
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Navigation target. Provide this OR `onClick` (e.g. the mode switcher). */
  to?: string;
  /** Action handler for non-navigation items (mutually exclusive with `to`). */
  onClick?: () => void;
  /** When true, render a divider above this item, visually grouping it apart. */
  divider?: boolean;
}

/**
 * The account avatar rendered as a dropdown trigger. Clicking it opens a small
 * menu of navigation items (icon + label). Shared by the student and trainer
 * headers via `Layout`.
 */
export function AvatarMenu({
  photoURL,
  displayName,
  items,
}: {
  photoURL?: string | null;
  displayName?: string | null;
  items: AvatarMenuItem[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Menu da conta"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center rounded-full transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
      >
        <Avatar photoURL={photoURL} displayName={displayName} size="sm" />
      </button>

      {open && (
        <>
          {/* Click-away backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            role="menu"
            className="absolute right-0 top-10 z-50 w-52 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800"
          >
            {items.map((item) => {
              const cls =
                'flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700';
              const inner = (
                <>
                  <item.icon className="h-4 w-4 flex-shrink-0 text-indigo-500" />
                  {item.label}
                </>
              );
              return (
                <div key={item.label}>
                  {item.divider && (
                    <hr className="border-slate-200 dark:border-slate-700" />
                  )}
                  {item.to ? (
                    <Link to={item.to} role="menuitem" onClick={() => setOpen(false)} className={cls}>
                      {inner}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { setOpen(false); item.onClick?.(); }}
                      className={cls}
                    >
                      {inner}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
