import { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { Check, Mail } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../hooks/useAuth';
import { Layout } from '../../components/Layout';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { WhatsAppIcon } from '../../components/icons/WhatsAppIcon';

export function TrainerProfile() {
  const { currentUser, trainerProfile } = useAuth();
  const trainerEmail = trainerProfile?.email ?? currentUser?.email?.toLowerCase() ?? '';

  // The trainer record is already resolved by the app-level loading gate before
  // this page renders, so we can seed the input directly.
  const [phone, setPhone] = useState(trainerProfile?.whatsappPhone ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!trainerEmail) return;
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length < 11) {
      setError('Digite o número completo com código do país e DDD (ex: +55 11 99999-9999).');
      return;
    }
    setError('');
    setSaving(true);
    setSaved(false);
    try {
      await updateDoc(doc(db, 'trainers', trainerEmail), { whatsappPhone: cleaned });
      setSaved(true);
    } catch {
      setError('Não foi possível salvar. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout title="Meu Perfil" backTo="/trainer">
      <Breadcrumbs
        items={[
          { label: 'Painel do Treinador', to: '/trainer' },
          { label: 'Meu perfil' },
        ]}
      />

      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Meu perfil</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Atualize seu número de WhatsApp usado nas notificações com seus alunos.
        </p>
      </div>

      <div className="glass-premium flex flex-col gap-5 rounded-2xl p-4">
        {/* Email (read-only) */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            E-mail
          </label>
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
            <Mail className="h-4 w-4 flex-shrink-0" />
            <span className="truncate">{trainerEmail || '—'}</span>
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            O e-mail identifica sua conta e não pode ser alterado.
          </p>
        </div>

        {/* WhatsApp (editable) */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            WhatsApp
          </label>
          <div className="relative">
            <WhatsAppIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="tel"
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setSaved(false); setError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              placeholder="+55 11 99999-9999"
              autoComplete="tel"
              className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-4 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
            />
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Inclua o código do país. Seus alunos usam este número para falar com você.
          </p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <button
          onClick={handleSave}
          disabled={saving}
          className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-indigo-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saved ? <Check className="h-4 w-4" /> : null}
          {saving ? 'Salvando…' : saved ? 'Salvo' : 'Salvar'}
        </button>
      </div>
    </Layout>
  );
}
