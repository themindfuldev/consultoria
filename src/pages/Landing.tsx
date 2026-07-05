import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Moon, Sun } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useDarkMode } from '../hooks/useDarkMode';
import { LoadingSpinner } from '../components/LoadingSpinner';
import { SessionBar } from '../components/SessionBar';
import { findCurrentOfflineSession } from '../utils/session';

export function Landing() {
  const { currentUser, userProfile, trainerProfile, loading, signInWithGoogle } = useAuth();
  const { isDark, toggle } = useDarkMode();
  const navigate = useNavigate();
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState('');

  // Redirect once auth + profile are resolved.
  useEffect(() => {
    if (loading || !currentUser) return;
    // Email-link users are trainers — never route them into student onboarding,
    // even if their trainer record hasn't loaded/been created yet.
    const isTrainerUser = currentUser.providerData.some((p) => p.providerId === 'password');
    const dest = trainerProfile || isTrainerUser
      ? '/trainer'
      : userProfile
        ? '/student'
        : '/onboarding';
    navigate(dest, { replace: true });
  }, [loading, currentUser, userProfile, trainerProfile, navigate]);

  if (loading) return <LoadingSpinner />;
  if (currentUser) return <LoadingSpinner message="Redirecionando..." />;

  const handleSignIn = async () => {
    setAuthError('');
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } catch (err: unknown) {
      const code = (err as { code?: string }).code;
      // User cancelled — not an error worth showing.
      if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
        setAuthError('Não foi possível fazer login. Tente novamente.');
      }
    } finally {
      setSigningIn(false);
    }
  };

  // A saved offline snapshot can be reopened straight from the login screen,
  // even while logged out.
  const offline = findCurrentOfflineSession();

  return (
    <div className="animated-gradient relative flex min-h-screen flex-col">
      {offline && <SessionBar offlineSessionId={offline.sessionId} className="z-30" />}

      {/* Dark mode toggle */}
      <button
        onClick={toggle}
        aria-label={isDark ? 'Ativar modo claro' : 'Ativar modo escuro'}
        className={`absolute right-4 rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 ${offline ? 'top-16' : 'top-4'}`}
      >
        {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>

      {/* Card */}
      <div className="flex flex-1 items-center justify-center p-4">
      <div className="glass-premium w-full max-w-sm rounded-3xl p-8 text-center shadow-2xl">
        {/* Logo mark */}
        <img
          src="/app-icon.png"
          alt="Consultoria"
          className="mx-auto mb-6 h-16 w-16 shadow-lg"
        />

        <h1 className="mb-2 text-3xl font-black tracking-tight text-slate-900 dark:text-white">
          Consultoria
        </h1>
        <p className="mb-8 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
          Treinamento personalizado com acompanhamento real.
          <br />
          Seus treinos. Seu progresso. Seu treinador.
        </p>

        {/* Google Sign-In button */}
        <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
          É aluno?
        </p>
        <button
          onClick={handleSignIn}
          disabled={signingIn}
          className="flex w-full items-center justify-center gap-3 rounded-2xl bg-white px-6 py-3.5 text-sm font-semibold text-slate-700 shadow-md transition-all duration-150 hover:bg-slate-50 hover:shadow-lg active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
        >
          {signingIn ? (
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
          ) : (
            /* Google logo SVG */
            <svg className="h-5 w-5 flex-shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
          )}
          {signingIn ? 'Entrando...' : 'Entrar com Google'}
        </button>

        {authError && (
          <p className="mt-4 text-sm text-red-600 dark:text-red-400">{authError}</p>
        )}

        {/* Trainer entry point — no Google, email magic-link instead */}
        <div className="mt-6 border-t border-slate-200 pt-5 dark:border-slate-700">
          <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
            É treinador?
          </p>
          <button
            onClick={() => navigate('/trainer/login')}
            className="w-full rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 shadow-md transition-all hover:bg-slate-50 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Entrar por link no e-mail
          </button>
        </div>

        <p className="mt-6 text-xs text-slate-500 dark:text-slate-400">
          Ao entrar, você concorda com o uso dos seus dados para fins de acompanhamento de treino.
        </p>
      </div>
      </div>
    </div>
  );
}
