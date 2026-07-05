import { Link } from 'react-router-dom';
import { Dumbbell, Play, Save } from 'lucide-react';

interface SessionBarProps {
  /** Live in-progress session path — renders the "Abrir" action when set. */
  activeSessionHref?: string | null;
  /** Offline snapshot id — renders the "Offline" action when set. */
  offlineSessionId?: string | null;
  /** Extra classes for positioning (sticky/fixed offsets, z-index). */
  className?: string;
}

/**
 * Non-clickable "Treino em andamento" bar with up to two actions: "Abrir" opens
 * the live session, "Offline" opens the saved static snapshot (same tab).
 * Shared by the app shell (`Layout`) and the login page (`Landing`).
 */
export function SessionBar({ activeSessionHref, offlineSessionId, className = '' }: SessionBarProps) {
  return (
    <div
      className={`flex items-center justify-center gap-3 bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-md ${className}`}
    >
      <span className="flex items-center gap-2">
        <Dumbbell className="h-4 w-4" />
        Treino em andamento
      </span>
      {activeSessionHref && (
        <Link
          to={activeSessionHref}
          className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-indigo-700 transition-colors hover:bg-indigo-50"
        >
          <Play className="h-3.5 w-3.5" />
          Abrir
        </Link>
      )}
      {offlineSessionId && (
        <a
          href={`/offline/${offlineSessionId}`}
          className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-orange-600 transition-colors hover:bg-orange-50"
        >
          <Save className="h-3.5 w-3.5" />
          Offline
        </a>
      )}
    </div>
  );
}
