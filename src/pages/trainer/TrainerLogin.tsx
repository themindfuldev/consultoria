import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Mail, Moon, Sun } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useDarkMode } from '../../hooks/useDarkMode';

/**
 * Trainer sign-in via Firebase passwordless email link. Trainers don't use
 * Google (they never touch Sheets/Drive with their own token). A student
 * registers them first; clicking the link in their inbox both authenticates the
 * browser and confirms their account (email ownership is proven).
 */
export function TrainerLogin() {
  const { currentUser, userProfile, trainerProfile, sendTrainerMagicLink } = useAuth();
  const { isDark, toggle } = useDarkMode();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Where to land after the link is clicked (set by ProtectedRoute), default dashboard.
  const nextPath = searchParams.get('next') || '/trainer';

  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  // Already authenticated → skip the form.
  useEffect(() => {
    if (trainerProfile) { navigate(nextPath, { replace: true }); return; }
    if (currentUser && userProfile) navigate('/student', { replace: true });
  }, [currentUser, userProfile, trainerProfile, nextPath, navigate]);

  const handleSend = async () => {
    const cleaned = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
      setError('Digite um e-mail válido.');
      return;
    }
    setError('');
    setSending(true);
    try {
      await sendTrainerMagicLink(cleaned, nextPath);
      setSent(true);
    } catch (err) {
      console.error(err);
      setError('Não foi possível enviar o link. Tente novamente.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="animated-gradient relative flex min-h-screen items-center justify-center p-4">
      <button
        onClick={toggle}
        aria-label={isDark ? 'Ativar modo claro' : 'Ativar modo escuro'}
        className="absolute right-4 top-4 rounded-full p-2 text-white/80 transition-colors hover:bg-white/10"
      >
        {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>

      <div className="glass-premium w-full max-w-sm rounded-3xl p-8 text-center shadow-2xl">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 text-3xl shadow-lg">
          <Mail className="h-8 w-8 text-white" />
        </div>

        <h1 className="mb-2 text-2xl font-black tracking-tight text-slate-900 dark:text-white">
          Área do Treinador
        </h1>

        {sent ? (
          <>
            <p className="mb-6 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Enviamos um link de acesso para <strong>{email.trim().toLowerCase()}</strong>.
              Abra seu e-mail e toque no link para entrar.
            </p>
            <button
              onClick={() => { setSent(false); setEmail(''); }}
              className="text-sm font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
            >
              Usar outro e-mail
            </button>
          </>
        ) : (
          <>
            <p className="mb-6 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              Digite o e-mail com que seu aluno cadastrou você. Enviaremos um link
              de acesso — sem senha.
            </p>

            <div className="relative mb-4">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="seu@email.com"
                autoComplete="email"
                className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
              />
            </div>

            {error && (
              <p className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>
            )}

            <button
              onClick={handleSend}
              disabled={sending}
              className="w-full rounded-2xl bg-indigo-600 px-6 py-3.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-indigo-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sending ? 'Enviando...' : 'Enviar link de acesso'}
            </button>
          </>
        )}

        <button
          onClick={() => navigate('/')}
          className="mt-6 flex items-center gap-1 text-xs text-slate-500 hover:underline dark:text-slate-400"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Voltar
        </button>
      </div>
    </div>
  );
}
