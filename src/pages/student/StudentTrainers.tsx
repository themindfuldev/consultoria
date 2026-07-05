import { useEffect, useState } from 'react';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { CheckCircle2, Clock, Info, Mail, Send, Trash2, UserPlus } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../hooks/useAuth';
import { openWhatsApp } from '../../services/notifyService';
import { Layout } from '../../components/Layout';
import { WhatsAppIcon } from '../../components/icons/WhatsAppIcon';
import type { StudentTrainer, Trainer } from '../../types';

/** Row shown in the list: the link plus the resolved (global) trainer record. */
interface TrainerRow {
  link: StudentTrainer;
  trainer: Trainer | null;
}

export function StudentTrainers() {
  const { currentUser, userProfile } = useAuth();

  const [rows, setRows] = useState<TrainerRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Add form
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // ── Live list of the student's linked trainers ──────────────────────────────

  useEffect(() => {
    if (!currentUser) return;
    const q = query(
      collection(db, 'student_trainers'),
      where('studentUid', '==', currentUser.uid),
    );
    const unsub = onSnapshot(q, async (snap) => {
      const links = snap.docs.map((d) => d.data() as StudentTrainer);
      const resolved = await Promise.all(
        links.map(async (link) => {
          const tSnap = await getDoc(doc(db, 'trainers', link.trainerEmail));
          return { link, trainer: tSnap.exists() ? (tSnap.data() as Trainer) : null };
        }),
      );
      resolved.sort((a, b) =>
        (a.link.trainerName ?? a.link.trainerEmail).localeCompare(
          b.link.trainerName ?? b.link.trainerEmail,
        ),
      );
      setRows(resolved);
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, [currentUser]);

  // ── Register a trainer ──────────────────────────────────────────────────────

  const handleAdd = async () => {
    if (!currentUser || !userProfile) return;

    const trimmedName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.replace(/\D/g, '');
    if (!trimmedName) {
      setError('Digite o nome do treinador.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      setError('Digite um e-mail válido para o treinador.');
      return;
    }
    if (cleanPhone.length < 11) {
      setError('Digite o WhatsApp completo do treinador (com código do país e DDD).');
      return;
    }
    if (rows.some((r) => r.link.trainerEmail === cleanEmail)) {
      setError('Você já cadastrou esse treinador.');
      return;
    }

    setError('');
    setSaving(true);
    try {
      const trainerRef = doc(db, 'trainers', cleanEmail);
      const existing = await getDoc(trainerRef);
      if (!existing.exists()) {
        // First student to register this trainer creates the global record.
        await setDoc(trainerRef, {
          id: cleanEmail,
          email: cleanEmail,
          name: trimmedName,
          whatsappPhone: cleanPhone,
          status: 'pending',
          createdByStudentUid: currentUser.uid,
          createdAt: serverTimestamp(),
        });
      }

      const linkId = `${currentUser.uid}_${cleanEmail}`;
      await setDoc(doc(db, 'student_trainers', linkId), {
        id: linkId,
        studentUid: currentUser.uid,
        studentEmail: userProfile.email,
        studentName: userProfile.displayName,
        trainerEmail: cleanEmail,
        trainerName: trimmedName,
        createdAt: serverTimestamp(),
      });

      // Nudge the trainer to confirm, then remind about sheet sharing.
      sendConfirmation(cleanPhone, cleanEmail);

      setName('');
      setEmail('');
      setPhone('');
    } catch (err) {
      console.error(err);
      setError('Não foi possível cadastrar o treinador. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const sendConfirmation = (whatsappPhone: string, trainerEmail: string) => {
    const url = `${window.location.origin}/trainer/login`;
    const body =
      `Olá! Cadastrei você no Consultoria para receber feedbacks de treinos. ` +
      `Confirme seu acesso clicando no link abaixo:\n` +
      `URL: ${url}\n` +
      `E-mail: ${trainerEmail}`;
    openWhatsApp(whatsappPhone, 'Confirmação de cadastro', body);
  };

  const handleRemove = async (link: StudentTrainer) => {
    if (!window.confirm(`Remover o treinador ${link.trainerName ?? link.trainerEmail}?`)) return;
    try {
      await deleteDoc(doc(db, 'student_trainers', link.id));
    } catch {
      setError('Não foi possível remover. Tente novamente.');
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Layout title="Meus Treinadores" backTo="/student">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
          Meus treinadores
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Cadastre os treinadores que acompanharão seus treinos.
        </p>
      </div>

      {/* Sheet-sharing reminder */}
      <div className="mb-6 flex items-center gap-2 rounded-2xl border border-amber-800 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-300 dark:bg-amber-900/20 dark:text-amber-300">
        <Info className="h-4 w-4 flex-shrink-0" />
        <span>
          Lembre-se de compartilhar suas planilhas do Google Sheets e pastas do
          Google Drive com o e-mail de cada treinador.
        </span>
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
          {error}
        </p>
      )}

      {/* ── Registered trainers ────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
        </div>
      ) : rows.length > 0 ? (
        <ul className="mb-8 flex flex-col gap-2">
          {rows.map(({ link, trainer }) => {
            const confirmed = trainer?.status === 'confirmed';
            const phoneToUse = trainer?.whatsappPhone ?? '';
            return (
              <li
                key={link.id}
                className="glass-premium flex items-center gap-3 rounded-2xl px-4 py-3"
              >
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">
                  {(link.trainerName ?? link.trainerEmail).charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  {/* Name + status badge */}
                  <div className="mb-2 flex items-center gap-2">
                    <p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-900 dark:text-white">
                      {link.trainerName ?? link.trainerEmail}
                    </p>
                    {confirmed ? (
                      <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Confirmado
                      </span>
                    ) : (
                      <button
                        onClick={() => phoneToUse && sendConfirmation(phoneToUse, link.trainerEmail)}
                        className="flex flex-shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-300"
                      >
                        <Clock className="h-3.5 w-3.5" /> Reenviar
                      </button>
                    )}
                  </div>
                  {/* Email + WhatsApp, with delete centered alongside */}
                  <div className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-xs text-slate-500 dark:text-slate-400">
                        <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                        <span className="truncate">{link.trainerEmail}</span>
                      </p>
                      {phoneToUse && (
                        <p className="flex items-center gap-1.5 truncate text-xs text-slate-500 dark:text-slate-400">
                          <WhatsAppIcon className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="truncate">+{phoneToUse}</span>
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleRemove(link)}
                      aria-label="Remover treinador"
                      className="flex-shrink-0 rounded-full p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="mb-8 rounded-2xl border-2 border-dashed border-slate-200 px-4 py-8 text-center dark:border-slate-700">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Nenhum treinador cadastrado ainda.
          </p>
        </div>
      )}

      {/* ── Add trainer form ───────────────────────────────────────────── */}
      <div className="glass-premium rounded-2xl p-4">
        <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
          <UserPlus className="h-4 w-4 text-indigo-500" />
          Cadastrar treinador
        </h2>

        <div className="flex flex-col gap-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome do treinador"
            className={inputCls}
          />
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@treinador.com"
              autoComplete="off"
              className={`${inputCls} pl-10`}
            />
          </div>
          <div className="relative">
            <WhatsAppIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+55 11 99999-9999 (WhatsApp)"
              className={`${inputCls} pl-10`}
            />
          </div>

          <button
            onClick={handleAdd}
            disabled={saving}
            className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-indigo-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Send className="h-4 w-4" />
            {saving ? 'Cadastrando…' : 'Cadastrar e enviar confirmação'}
          </button>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Enviaremos um link de confirmação pelo WhatsApp. O treinador confirma
            entrando com o e-mail cadastrado.
          </p>
        </div>
      </div>
    </Layout>
  );
}

const inputCls =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500';
