import { Navigate } from 'react-router-dom';
import { Clock, LogOut, Moon, Sun } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useDarkMode } from '../hooks/useDarkMode';

/**
 * Shown to a signed-in account whose email has not been approved for
 * registration yet. Google authentication succeeds for anyone, but a new
 * student can only create a profile once their email is added to the
 * `allowlist` collection (done manually in the Firebase console). Until then
 * they land here — they can see nothing else and hold no data.
 */
export function PendingApproval() {
  const { currentUser, userProfile, trainerEligible, approved, logOut } = useAuth();
  const { isDark, toggle } = useDarkMode();

  // Signed out → back to the landing page.
  if (!currentUser) return <Navigate to="/" replace />;
  // Already has access (approved, onboarded, or a trainer) → don't strand them
  // here; let the landing redirect route them to their section.
  if (userProfile || trainerEligible || approved) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950">
      {/* Minimal header */}
      <div className="flex items-center justify-between px-4 py-4">
        <span className="inline-flex items-center gap-1.5 text-base font-black text-slate-900 dark:text-white">
          <img src="/app-icon.png" alt="" className="h-6 w-6" /> Consultoria
        </span>
        <button
          onClick={toggle}
          aria-label="Alternar tema"
          className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-4 pb-12">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-500/15">
            <Clock className="h-8 w-8 text-amber-600 dark:text-amber-400" />
          </div>

          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Conta aguardando aprovação
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            Seu acesso ainda não foi liberado. Novos cadastros passam por aprovação
            manual — assim que sua conta for autorizada, você poderá entrar
            normalmente.
          </p>

          {currentUser?.email && (
            <p className="mt-4 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {currentUser.email}
            </p>
          )}

          <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
            Já foi aprovado? Saia e entre novamente para atualizar o acesso.
          </p>

          <button
            onClick={logOut}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </div>
      </div>
    </div>
  );
}
