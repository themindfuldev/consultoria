import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogOut, Moon, Sun } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useDarkMode } from '../hooks/useDarkMode';
import { Avatar } from './Avatar';

interface LayoutProps {
  children: ReactNode;
  /** Optional page title rendered centred in the header. */
  title?: string;
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

export function Layout({ children, title, maxWidth = '2xl' }: LayoutProps) {
  const { currentUser, userProfile, logOut } = useAuth();
  const { isDark, toggle } = useDarkMode();
  const navigate = useNavigate();

  const handleLogOut = async () => {
    await logOut();
    navigate('/');
  };

  const homeHref = userProfile?.role === 'trainer' ? '/trainer' : '/student';
  const mw = MAX_WIDTH_CLASSES[maxWidth];

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950">
      {/* ── Sticky top nav ─────────────────────────────────────────────────── */}
      <header className="glass sticky top-0 z-40 border-b border-slate-200 dark:border-slate-800">
        <div className={`mx-auto flex h-14 ${mw} items-center justify-between px-4`}>
          {/* Logo / home link */}
          <Link
            to={homeHref}
            className="flex items-center gap-1.5 text-base font-black text-slate-900 dark:text-white"
          >
            <span className="text-indigo-600 dark:text-indigo-400">⚡</span>
            Consultoria
          </Link>

          {/* Centred page title */}
          {title && (
            <span className="absolute left-1/2 -translate-x-1/2 text-sm font-semibold text-slate-700 dark:text-slate-200 pointer-events-none">
              {title}
            </span>
          )}

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

      {/* ── Page content ───────────────────────────────────────────────────── */}
      <main className="flex-1">
        <div className={`mx-auto ${mw} px-4 py-6`}>{children}</div>
      </main>
    </div>
  );
}
