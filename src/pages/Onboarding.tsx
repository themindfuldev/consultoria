import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Moon, Sun } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { useDarkMode } from '../hooks/useDarkMode';
import { WhatsAppIcon } from '../components/icons/WhatsAppIcon';

export function Onboarding() {
  const { currentUser } = useAuth();
  const { isDark, toggle } = useDarkMode();
  const navigate = useNavigate();

  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!currentUser) return null;

  const handleSubmit = async () => {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length < 11) {
      setError('Por favor, insira o número completo com código do país e DDD (ex: +55 11 99999-9999).');
      return;
    }

    setSaving(true);
    setError('');

    try {
      await setDoc(doc(db, 'users', currentUser.uid), {
        uid: currentUser.uid,
        email: currentUser.email ?? '',
        displayName: currentUser.displayName ?? '',
        photoURL: currentUser.photoURL ?? '',
        whatsappPhone: cleaned,
        createdAt: serverTimestamp(),
      });
      navigate('/student', { replace: true });
    } catch (err) {
      console.error(err);
      setError('Ocorreu um erro ao salvar. Por favor, tente novamente.');
    } finally {
      setSaving(false);
    }
  };

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
        <div className="w-full max-w-sm">
          {/* User greeting */}
          <div className="mb-8 text-center">
            {currentUser.photoURL && (
              <img
                src={currentUser.photoURL}
                alt="Foto de perfil"
                referrerPolicy="no-referrer"
                className="mx-auto mb-3 h-16 w-16 rounded-full ring-2 ring-indigo-500/30"
              />
            )}
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Bem-vindo, {currentUser.displayName?.split(' ')[0] ?? 'usuário'}!
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Vamos configurar sua conta
            </p>
          </div>

          <h3 className="mb-1 text-base font-semibold text-slate-800 dark:text-slate-100">
            Seu número do WhatsApp
          </h3>
          <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            Inclua o código do país (ex: +55 para Brasil). Usado para notificações de
            treino — somente você e seu treinador verão este número.
          </p>

          <div className="relative mb-4">
            <WhatsAppIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder="+55 11 99999-9999"
              autoComplete="tel"
              className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500 dark:focus:border-indigo-400"
            />
          </div>

          {error && (
            <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}

          <button
            onClick={handleSubmit}
            disabled={saving}
            className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-indigo-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Salvando...' : 'Continuar →'}
          </button>
        </div>
      </div>
    </div>
  );
}
