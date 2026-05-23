import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { PlusCircle } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../hooks/useAuth';
import { Layout } from '../../components/Layout';
import type { StudentWorkspace } from '../../types';

export function StudentDashboard() {
  const { currentUser, userProfile } = useAuth();
  const navigate = useNavigate();
  const [connectionStatus, setConnectionStatus] = useState<'loading' | 'none' | 'pending' | 'active'>('loading');

  // Verify connection status — redirect if not yet active.
  useEffect(() => {
    if (!currentUser) return;

    const q = query(
      collection(db, 'student_workspaces'),
      where('studentUid', '==', currentUser.uid),
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      if (snap.empty) {
        setConnectionStatus('none');
        navigate('/student/select-trainer', { replace: true });
        return;
      }

      // Check if any connection is active.
      const connections = snap.docs.map((d) => d.data() as StudentWorkspace);
      const hasActive = connections.some((c) => c.status === 'active');
      const hasPending = connections.some((c) => c.status === 'pending');

      if (hasActive) {
        setConnectionStatus('active');
      } else if (hasPending) {
        setConnectionStatus('pending');
        navigate('/student/pending', { replace: true });
      } else {
        setConnectionStatus('none');
        navigate('/student/select-trainer', { replace: true });
      }
    });

    return unsubscribe;
  }, [currentUser, navigate]);

  if (connectionStatus === 'loading') {
    return (
      <Layout>
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
        </div>
      </Layout>
    );
  }

  if (connectionStatus !== 'active') return null;

  return (
    <Layout title="Meus Treinos">
      {/* Greeting */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
          Olá, {userProfile?.displayName?.split(' ')[0]} 💪
        </h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          Seus programas de treino aparecem aqui.
        </p>
      </div>

      {/* Empty state — Phase 2 will populate this with cycle cards */}
      <div className="rounded-2xl border-2 border-dashed border-slate-200 px-4 py-12 text-center dark:border-slate-700">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/40">
          <PlusCircle className="h-7 w-7 text-indigo-600 dark:text-indigo-400" />
        </div>
        <h2 className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
          Nenhum programa adicionado
        </h2>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
          Adicione seu primeiro programa colando o link da planilha do seu treinador.
        </p>
        {/* Placeholder button — will be wired up in Phase 2 */}
        <button
          disabled
          className="rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white opacity-50 cursor-not-allowed"
        >
          Adicionar Programa
        </button>
      </div>
    </Layout>
  );
}
