import { useEffect, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  query,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { CheckCircle, Clock, Users, XCircle } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../hooks/useAuth';
import { Layout } from '../../components/Layout';
import { Avatar } from '../../components/Avatar';
import type { StudentWorkspace } from '../../types';

export function TrainerDashboard() {
  const { userProfile } = useAuth();
  const [pending, setPending] = useState<StudentWorkspace[]>([]);
  const [active, setActive] = useState<StudentWorkspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState('');

  const workspaceId = userProfile?.email ?? '';

  // Real-time listener on student_workspaces for this trainer's workspace.
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
