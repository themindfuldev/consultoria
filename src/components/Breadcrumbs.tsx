import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

export interface Crumb {
  label: string;
  /** When set (and not the last crumb), the label renders as a link. */
  to?: string;
}

/** Compact breadcrumb trail. Parent crumbs with a `to` are clickable links. */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav
      aria-label="breadcrumb"
      className="mb-3 flex flex-wrap items-center gap-1 text-xs text-slate-500 dark:text-slate-400"
    >
      {items.map((c, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={i} className="flex items-center gap-1">
            {c.to && !isLast ? (
              <Link
                to={c.to}
                className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
              >
                {c.label}
              </Link>
            ) : (
              <span className={isLast ? 'font-medium text-slate-700 dark:text-slate-200' : ''}>
                {c.label}
              </span>
            )}
            {!isLast && <ChevronRight className="h-3 w-3 flex-shrink-0 text-slate-400" />}
          </span>
        );
      })}
    </nav>
  );
}
