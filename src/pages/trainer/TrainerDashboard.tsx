import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { CheckCircle, Clock, MessageSquare, Users, Video, XCircle } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../hooks/useAuth';
import { Layout } from '../../components/Layout';
import { Avatar } from '../../components/Avatar';
import type { Feedback, Session, StudentWorkspace, UserProfile } from '../../types';

// ── Pending-feedback item ─────────────────────────────────────────────────────

interface PendingFeedbackItem {
  session: Session;
  studentName: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TrainerDashboard() {
  const { userProfile } = useAuth();
  const navigate = useNavigate();
  const [pending, setPending] = useState<StudentWorkspace[]>([]);
  const [active, setActive] = useState<StudentWorkspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState('');

  // Sessions waiting for feedback
  const [feedbackQueue, setFeedbackQueue] = useState<PendingFeedbackItem[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);

  const workspaceId = userProfile?.email ?? '';

  // ── Student workspace listener ──────────────────────────────────────────────

  useEffect(() => {
    if (!workspaceId) return;
    const q = query(
      collection(db, 'student_workspaces'),
      where('workspaceId', '==', workspaceId),
    );
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs.map((d) => d.data() as StudentWorkspace);
        setPending(docs.filter((d) => d.status === 'pending'));
        setActive(docs.filter((d) => d.status === 'active'));
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsubscribe;
  }, [workspaceId]);

  // ── Feedback queue ──────────────────────────────────────────────────────────
  // Query sessions with hasVideos==true, then filter those without complete feedback.

  useEffect(() => {
    if (!workspaceId) return;

    // `queueLoading` already starts `true` — the `finally` below is what
    // flips it to `false` once the queue has been (re)computed.
    const loadQueue = async () => {
      try {
        const sessionsSnap = await getDocs(
          query(
            collection(db, 'sessions'),
            where('workspaceId', '==', workspaceId),
            where('hasVideos', '==', true),
            orderBy('date', 'desc'),
          ),
        );

        const sessions = sessionsSnap.docs.map((d) => d.data() as Session);

        // Parallel-fetch feedback docs + student profiles
        const feedbackResults = await Promise.all(
          sessions.map((s) => getDoc(doc(db, 'feedback', s.id))),
        );

        // Keep only sessions where feedback is not yet complete
        const needsFeedback = sessions.filter((_, i) => {
          const fb = feedbackResults[i];
          if (!fb.exists()) return true;
          return (fb.data() as Feedback).status !== 'complete';
        });

        // Fetch student display names (parallel, cached via workspace active list)
        const studentNames = await Promise.all(
          needsFeedback.map(async (s) => {
            const u = await getDoc(doc(db, 'users', s.studentUid));
            return u.exists() ? (u.data() as UserProfile).displayName : s.studentUid;
          }),
        );

        setFeedbackQueue(
          needsFeedback.map((s, i) => ({ session: s, studentName: studentNames[i] })),
        );
      } finally {
        setQueueLoading(false);
      }
    };

    loadQueue();
  }, [workspaceId]);

  // ── Actions ─────────────────────────────────────────────────────────────────

  const handleApprove = async (connection: StudentWorkspace) => {
    setActionError('');
    try {
      await updateDoc(doc(db, 'student_workspaces', connection.id), {
        status: 'active',
        joinedAt: Timestamp.now(),
      });
    } catch {
      setActionError('Não foi possível aprovar. Tente novamente.');
    }
  };

  const handleReject = async (connection: StudentWorkspace) => {
    setActionError('');
    try {
      await updateDoc(doc(db, 'student_workspaces', connection.id), {
        status: 'rejected',
      });
    } catch {
      setActionError('Não foi possível rejeitar. Tente novamente.');
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Layout title="Painel do Treinador">
      {/* Greeting */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
          Olá, {userProfile?.displayName?.split(' ')[0]} 👋
        </h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Gerencie seus alunos e acompanhe os treinos.
        </p>
      </div>

      {actionError && (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
          {actionError}
        </p>
      )}

      {/* ── Feedback queue ────────────────────────────────────────────── */}
      {!queueLoading && feedbackQueue.length > 0 && (
        <section className="mb-8">
          <div className="mb-3 flex items-center gap-2">
            <Video className="h-4 w-4 text-violet-500" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Aguardando feedback
            </h2>
            <span className="ml-auto rounded-full bg-violet-100 px-2 py-0.5 text-xs font-bold text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
              {feedbackQueue.length}
            </span>
          </div>

          <ul className="flex flex-col gap-2">
            {feedbackQueue.map(({ session, studentName }) => {
              const dateLabel = session.date instanceof Timestamp
                ? session.date.toDate().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
                : '';
              return (
                <li key={session.id}>
                  <button
                    onClick={() => navigate(`/trainer/sessions/${session.id}`)}
                    className="glass-premium flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition-all active:scale-[0.99]"
                  >
                    <MessageSquare className="h-5 w-5 flex-shrink-0 text-violet-500" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                        {studentName}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {session.tabName} · {dateLabel}
                      </p>
                    </div>
                    <span className="flex-shrink-0 text-xs font-medium text-violet-600 dark:text-violet-400">
                      Ver →
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
        </div>
      ) : (
        <>
          {/* ── Pending requests ──────────────────────────────────────── */}
          <section className="mb-8">
            <div className="mb-3 flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-500" />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Solicitações pendentes
              </h2>
              {pending.length > 0 && (
                <span className="ml-auto rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                  {pending.length}
                </span>
              )}
            </div>

            {pending.length === 0 ? (
              <EmptyState message="Nenhuma solicitação pendente." />
            ) : (
              <ul className="flex flex-col gap-3">
                {pending.map((conn) => (
                  <li
                    key={conn.id}
                    className="glass-premium flex items-center gap-3 rounded-2xl px-4 py-3"
                  >
                    <Avatar displayName={conn.studentName} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                        {conn.studentName}
                      </p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {conn.studentEmail}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleApprove(conn)}
                        aria-label={`Aprovar ${conn.studentName}`}
                        className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-all hover:bg-emerald-700 active:scale-95"
                      >
                        <span className="flex items-center gap-1">
                          <CheckCircle className="h-3.5 w-3.5" />
                          Aprovar
                        </span>
                      </button>
                      <button
                        onClick={() => handleReject(conn)}
                        aria-label={`Rejeitar ${conn.studentName}`}
                        className="rounded-xl bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition-all hover:bg-slate-300 active:scale-95 dark:bg-slate-700 dark:text-slate-200 dark:hover:bg-slate-600"
                      >
                        <span className="flex items-center gap-1">
                          <XCircle className="h-3.5 w-3.5" />
                          Rejeitar
                        </span>
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── Active students ───────────────────────────────────────── */}
          <section>
            <div className="mb-3 flex items-center gap-2">
              <Users className="h-4 w-4 text-indigo-500" />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Alunos ativos
              </h2>
              {active.length > 0 && (
                <span className="ml-auto rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                  {active.length}
                </span>
              )}
            </div>

            {active.length === 0 ? (
              <EmptyState message="Nenhum aluno ativo ainda. Aprove as solicitações acima." />
            ) : (
              <ul className="flex flex-col gap-3">
                {active.map((conn) => (
                  <li
                    key={conn.id}
                    className="glass flex items-center gap-3 rounded-2xl px-4 py-3"
                  >
                    <Avatar displayName={conn.studentName} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                        {conn.studentName}
                      </p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {conn.studentEmail}
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                      Ativo
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </Layout>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-slate-200 px-4 py-8 text-center dark:border-slate-700">
      <p className="text-sm text-slate-500 dark:text-slate-400">{message}</p>
    </div>
  );
}
