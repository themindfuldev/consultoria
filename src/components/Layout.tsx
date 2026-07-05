import type { ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Dumbbell, LogOut, Moon, Sun, WifiOff } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useActiveSession } from '../hooks/useActiveSession';
import { useDarkMode } from '../hooks/useDarkMode';
import { findCurrentOfflineSession } from '../utils/session';
import { Avatar } from './Avatar';

interface LayoutProps {
  children: ReactNode;
  /** Optional page title rendered centred in the header. */
  title?: string;
  /** When set, renders a back arrow in the header that navigates to this path. */
  backTo?: string;
  /** Maximum content width. Defaults to "2xl" (672px). */
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

const MAX_WIDTH_CLASSES: Record<NonNullable<LayoutProps['maxWidth']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
};

export function Layout({ children, title, backTo, maxWidth = '2xl' }: LayoutProps) {
  const { currentUser, userProfile, trainerProfile, logOut } = useAuth();
  const { isDark, toggle } = useDarkMode();
  const navigate = useNavigate();
  const location = useLocation();
  const activeSession = useActiveSession();

  const handleLogOut = async () => {
    await logOut();
    navigate('/');
  };

  const homeHref = trainerProfile ? '/trainer' : userProfile ? '/student' : '/';
  const mw = MAX_WIDTH_CLASSES[maxWidth];

  const activeSessionHref = activeSession
    ? `/student/cycles/${activeSession.cycleId}/sessions/${activeSession.id}`
    : null;
  const showActiveSessionBanner = !!activeSessionHref && location.pathname !== activeSessionHref;

  // An offline snapshot available in localStorage → banner that opens the static
  // offline viewer in a new tab (works irrespective of login).
  const offline = findCurrentOfflineSession();

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950">
      {/* ── Sticky top nav ─────────────────────────────────────────────────── */}
      <header className="glass sticky top-0 z-40 border-b border-slate-200 dark:border-slate-800">
        <div className={`mx-auto flex h-14 ${mw} items-center justify-between px-4`}>
          {/* Back button + logo / home link */}
          <div className="flex items-center gap-1">
            {backTo && (
              <button
                onClick={() => navigate(backTo)}
                aria-label="Voltar"
                className="-ml-1.5 rounded-full p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
            )}
            <Link
              to={homeHref}
              className="flex min-w-0 items-center gap-1.5 text-base font-black text-slate-900 dark:text-white"
            >
              <img src="/favicon.svg" alt="" className="h-6 w-6 flex-shrink-0" />
              <span className="truncate">{title ?? 'Consultoria'}</span>
            </Link>
          </div>

          {/* Right-side controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={toggle}
              aria-label={isDark ? 'Ativar modo claro' : 'Ativar modo escuro'}
              className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>

            {currentUser && (
              <>
                <Avatar
                  photoURL={currentUser.photoURL}
                  displayName={currentUser.displayName}
                  size="sm"
                />
                <button
                  onClick={handleLogOut}
                  aria-label="Sair"
                  className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ── Active-session banner ──────────────────────────────────────────── */}
      {showActiveSessionBanner && activeSessionHref && (
        <Link
          to={activeSessionHref}
          className="sticky top-14 z-30 flex items-center justify-center gap-2 bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-md transition-colors hover:bg-indigo-700"
        >
          <Dumbbell className="h-4 w-4" />
          Ver treino atual
        </Link>
      )}

      {/* ── Offline snapshot banner (opens the static viewer in a new tab) ──── */}
      {offline && (
        <a
          href={`/offline/${offline.sessionId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-sm font-semibold text-white shadow-md transition-colors hover:bg-amber-600"
        >
          <WifiOff className="h-4 w-4" />
          Abrir treino offline ({offline.tabName})
        </a>
      )}

      {/* ── Page content ───────────────────────────────────────────────────── */}
      <main className="flex-1">
        <div className={`mx-auto ${mw} px-4 py-6`}>{children}</div>
      </main>
    </div>
  );
}
