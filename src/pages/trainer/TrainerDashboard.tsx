import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { Check, MessageSquare, Pencil, Phone, Users, Video, X } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../hooks/useAuth';
import { Layout } from '../../components/Layout';
import { Avatar } from '../../components/Avatar';
import type { Session } from '../../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function shortDate(ts?: Timestamp): string {
  return ts instanceof Timestamp
    ? ts.toDate().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
    : '';
}

/** Sessions grouped by student, most recent first within each group. */
interface StudentGroup {
  studentName: string;
  sessions: Session[];
}

function groupByStudent(sessions: Session[]): StudentGroup[] {
  const map = new Map<string, Session[]>();
  for (const s of sessions) {
    const key = s.studentName || 'Aluno';
    (map.get(key) ?? map.set(key, []).get(key)!).push(s);
  }
  return [...map.entries()]
    .map(([studentName, list]) => ({ studentName, sessions: list }))
    .sort((a, b) => a.studentName.localeCompare(b.studentName));
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TrainerDashboard() {
  const { currentUser, trainerProfile } = useAuth();
  const navigate = useNavigate();

  const trainerEmail = trainerProfile?.email ?? currentUser?.email?.toLowerCase() ?? '';

  const [awaiting, setAwaiting] = useState<Session[]>([]);
  const [completed, setCompleted] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  // WhatsApp edit state
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);

  // ── Load the trainer's sessions (awaiting + completed feedback) ─────────────

  useEffect(() => {
    const load = async () => {
      if (!trainerEmail) { setLoading(false); return; }
      try {
        const [awaitingSnap, completedSnap] = await Promise.all([
          getDocs(query(
            collection(db, 'sessions'),
            where('trainerEmail', '==', trainerEmail),
            where('hasVideos', '==', true),
            orderBy('date', 'desc'),
          )),
          getDocs(query(
            collection(db, 'sessions'),
            where('trainerEmail', '==', trainerEmail),
            where('feedbackStatus', '==', 'complete'),
            orderBy('date', 'desc'),
          )),
        ]);

        const awaitingSessions = awaitingSnap.docs
          .map((d) => d.data() as Session)
          .filter((s) => s.feedbackStatus !== 'complete');
        setAwaiting(awaitingSessions);
        setCompleted(completedSnap.docs.map((d) => d.data() as Session));
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [trainerEmail]);

  const completedGroups = useMemo(() => groupByStudent(completed), [completed]);
  const activeStudentCount = useMemo(
    () => new Set(completed.map((s) => s.studentName || 'Aluno')).size,
    [completed],
  );

  // ── Save WhatsApp number ────────────────────────────────────────────────────

  const startEditPhone = () => {
    setPhoneInput(trainerProfile?.whatsappPhone ?? '');
    setEditingPhone(true);
  };

  const savePhone = async () => {
    if (!trainerEmail) return;
    const cleaned = phoneInput.replace(/\D/g, '');
    if (cleaned.length < 11) return;
    setSavingPhone(true);
    try {
      await updateDoc(doc(db, 'trainers', trainerEmail), { whatsappPhone: cleaned });
      setEditingPhone(false);
    } finally {
      setSavingPhone(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!trainerProfile && !loading) {
    return (
      <Layout title="Painel do Treinador">
        <div className="rounded-2xl border-2 border-dashed border-slate-200 px-4 py-12 text-center dark:border-slate-700">
          <p className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
            Conta de treinador não encontrada.
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Peça ao seu aluno para cadastrar você no Consultoria com este e-mail.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Painel do Treinador">
      {/* Greeting + WhatsApp */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
          Olá{trainerProfile?.name ? `, ${trainerProfile.name.split(' ')[0]}` : ''} 👋
        </h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          {trainerEmail}
        </p>

        {/* WhatsApp editor */}
        <div className="mt-3 flex items-center gap-2">
          <Phone className="h-4 w-4 text-slate-400" />
          {editingPhone ? (
            <>
              <input
                type="tel"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="+55 11 99999-9999"
                className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              <button
                onClick={savePhone}
                disabled={savingPhone}
                aria-label="Salvar"
                className="rounded-lg bg-emerald-600 p-1.5 text-white transition-colors hover:bg-emerald-700 disabled:opacity-60"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                onClick={() => setEditingPhone(false)}
                aria-label="Cancelar"
                className="rounded-lg bg-slate-200 p-1.5 text-slate-600 transition-colors hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <span className="text-sm text-slate-600 dark:text-slate-300">
                {trainerProfile?.whatsappPhone
                  ? `+${trainerProfile.whatsappPhone}`
                  : 'Sem WhatsApp'}
              </span>
              <button
                onClick={startEditPhone}
                aria-label="Editar WhatsApp"
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
        </div>
      ) : (
        <>
          {/* ── Awaiting feedback ─────────────────────────────────────── */}
          {awaiting.length > 0 && (
            <section className="mb-8">
              <div className="mb-3 flex items-center gap-2">
                <Video className="h-4 w-4 text-violet-500" />
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Aguardando feedback
                </h2>
                <span className="ml-auto rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                  {awaiting.length}
                </span>
              </div>

              <ul className="flex flex-col gap-2">
                {awaiting.map((s) => (
                  <li key={s.id}>
                    <button
                      onClick={() => navigate(`/trainer/sessions/${s.id}`)}
                      className="glass-premium flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all active:scale-[0.99]"
                    >
                      <MessageSquare className="h-5 w-5 flex-shrink-0 text-violet-500" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                          {s.studentName || 'Aluno'}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {s.tabName} · {shortDate(s.date)}
                        </p>
                      </div>
                      <span className="flex-shrink-0 text-xs font-medium text-violet-600 dark:text-violet-400">
                        Ver →
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* ── Feedbacks by student ──────────────────────────────────── */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Users className="h-4 w-4 text-indigo-500" />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Feedbacks por aluno
              </h2>
              {activeStudentCount > 0 && (
                <span className="ml-auto rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                  {activeStudentCount}
                </span>
              )}
            </div>

            {completedGroups.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-slate-200 px-4 py-8 text-center dark:border-slate-700">
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Nenhum feedback concluído ainda.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {completedGroups.map((group) => (
                  <div key={group.studentName}>
                    <div className="mb-2 flex items-center gap-2">
                      <Avatar displayName={group.studentName} size="sm" />
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {group.studentName}
                      </p>
                      <span className="text-xs text-slate-400">
                        {group.sessions.length} feedback{group.sessions.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <ul className="flex flex-col gap-2">
                      {group.sessions.map((s) => (
                        <li key={s.id}>
                          <button
                            onClick={() => navigate(`/trainer/sessions/${s.id}`)}
                            className="glass flex w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-left transition-all active:scale-[0.99]"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                                {s.tabName}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                {shortDate(s.date)}
                              </p>
                            </div>
                            <span className="flex-shrink-0 text-xs font-medium text-indigo-600 dark:text-indigo-400">
                              Ver →
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </Layout>
  );
}
