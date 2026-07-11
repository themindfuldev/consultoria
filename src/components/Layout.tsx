import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowLeftRight, CircleUser, ClipboardList, LayoutDashboard, LogOut, Moon, Sun, Users } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useActiveSession } from '../hooks/useActiveSession';
import { useDarkMode } from '../hooks/useDarkMode';
import { findCurrentOfflineSession } from '../utils/session';
import { AvatarMenu } from './AvatarMenu';
import type { AvatarMenuItem } from './AvatarMenu';
import { SessionBar } from './SessionBar';

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
  const { currentUser, userProfile, trainerEligible, mode, setMode, logOut } = useAuth();
  const { isDark, toggle } = useDarkMode();
  const navigate = useNavigate();
  const location = useLocation();
  const activeSession = useActiveSession();

  const handleLogOut = async () => {
    await logOut();
    navigate('/');
  };

  const mw = MAX_WIDTH_CLASSES[maxWidth];

  // Account dropdown items — differ by the active mode.
  const menuItems: AvatarMenuItem[] = mode === 'trainer'
    ? [
        { label: 'Meu perfil', to: '/trainer/profile', icon: CircleUser },
        { label: 'Painel do treinador', to: '/trainer', icon: LayoutDashboard },
        { label: 'Meus alunos', to: '/trainer/students', icon: Users },
      ]
    : [
        { label: 'Meu perfil', to: '/student/profile', icon: CircleUser },
        { label: 'Meus treinos', to: '/student', icon: ClipboardList },
        { label: 'Meus treinadores', to: '/student/trainers', icon: Users },
      ];

  // Accounts invited as a trainer can switch modes — a divided item at the
  // bottom that jumps to the other section (and remembers the choice).
  if (trainerEligible) {
    menuItems.push(
      mode === 'trainer'
        ? {
            label: 'Modo Aluno',
            icon: ArrowLeftRight,
            divider: true,
            onClick: () => { setMode('student'); navigate('/student'); },
          }
        : {
            label: 'Modo Treinador',
            icon: ArrowLeftRight,
            divider: true,
            onClick: () => { setMode('trainer'); navigate('/trainer'); },
          },
    );
  }

  const activeSessionHref = activeSession
    ? `/student/cycles/${activeSession.cycleId}/sessions/${activeSession.id}`
    : null;

  // An offline snapshot available in localStorage → an "Offline" action that
  // opens the static viewer in a new tab. Students only — never surface a
  // leftover snapshot to a trainer.
  const offline = mode === 'student' && userProfile ? findCurrentOfflineSession() : null;

  // "Treino em andamento" bar: shown while a workout is open (live session
  // and/or a saved offline snapshot), but hidden while viewing that very
  // session's page.
  const currentSessionId = location.pathname.match(/\/sessions\/([^/]+)/)?.[1];
  const onOwnSessionPage =
    (!!activeSession && currentSessionId === activeSession.id) ||
    (!!offline && currentSessionId === offline.sessionId);
  const showSessionBar = (!!activeSession || !!offline) && !onOwnSessionPage;

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
            <div className="flex min-w-0 items-center gap-1.5 text-base font-black text-slate-900 dark:text-white">
              <img src="/app-icon.png" alt="" className="h-6 w-6 flex-shrink-0" />
              <span className="truncate">{title ?? 'Consultoria'}</span>
            </div>
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
                <AvatarMenu
                  photoURL={currentUser.photoURL}
                  displayName={currentUser.displayName}
                  items={menuItems}
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

      {/* ── "Treino em andamento" bar (non-clickable; the buttons act) ──────── */}
      {showSessionBar && (
        <SessionBar
          activeSessionHref={activeSessionHref}
          offlineSessionId={offline?.sessionId ?? null}
          className="sticky top-14 z-30"
        />
      )}

      {/* ── Page content ───────────────────────────────────────────────────── */}
      <main className="flex-1">
        <div className={`mx-auto ${mw} px-4 py-6`}>{children}</div>
      </main>
    </div>
  );
}
