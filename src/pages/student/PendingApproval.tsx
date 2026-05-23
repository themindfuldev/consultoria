import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { Clock, LogOut } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../hooks/useAuth';
import { useDarkMode } from '../../hooks/useDarkMode';
import type { StudentWorkspace, Workspace } from '../../types';

export function PendingApproval() {
  const { currentUser, logOut } = useAuth();
  const { isDark, toggle } = useDarkMode();
  const navigate = useNavigate();

  const [connection, setConnection] = useState<StudentWorkspace | null>(null);
  const [trainer, setTrainer] = useState<Workspace | null>(null);

  // Real-time listener — navigates away as soon as the trainer approves.
  useEffect(() => {
    if (!currentUser) return;

    const q = query(
      collection(db, 'student_workspaces'),
      where('studentUid', '==', currentUser.uid),
    );

    const unsubscribe = onSnapshot(q, (snap) => {
      if (snap.empty) {
        // No connection at all → back to trainer select.
        navigate('/student/select-trainer', { replace: true });
        return;
      }

      const conn = snap.docs[0].data() as StudentWorkspace;
      setConnection(conn);

      if (conn.status === 'active') {
        navigate('/student', { replace: true });
      }
    });

    return unsubscribe;
  }, [currentUser, navigate]);

  // Fetch trainer info for display.
  useEffect(() => {
    if (!connection) return;

    const q = query(
      collection(db, 'workspaces'),
      where('id', '==', connection.workspaceId),
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      if (!snap.empty) setTrainer(snap.docs[0].data() as Workspace);
    });
    return unsubscribe;
  }, [connection]);

  const handleLogOut = async () => {
    await logOut();
    navigate('/');
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 dark:bg-slate-950">
      {/* Controls */}
      <div className="absolute right-4 top-4 flex gap-2">
        <button
          onClick={toggle}
          aria-label="Alternar tema"
          className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          {isDark ? '☀️' : '🌙'}
        </button>
        <button
          onClick={handleLogOut}
          aria-label="Sair"
          className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>

      <div className="glass-premium w-full max-w-sm rounded-3xl p-8 text-center shadow-xl">
        {/* Animated clock icon */}
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
          <Clock className="h-8 w-8 animate-pulse text-amber-600 dark:text-amber-400" />
        </div>

        <h1 className="mb-2 text-xl font-bold text-slate-900 dark:text-white">
          Aguardando aprovação
        </h1>

        {trainer ? (
          <p className="mb-6 text-sm text-slate-600 dark:text-slate-300">
            Sua solicitação foi enviada para{' '}
            <span className="font-semibold text-slate-900 dark:text-white">
              {trainer.trainerName}
            </span>
            . Assim que ele aprovar, você poderá adicionar seus programas de treino.
          </p>
        ) : (
          <p className="mb-6 text-sm text-slate-600 dark:text-slate-300">
            Sua solicitação foi enviada. Aguardando aprovação do treinador.
          </p>
        )}

        <div className="rounded-xl bg-amber-50 px-4 py-3 dark:bg-amber-900/20">
          <p className="text-xs text-amber-700 dark:text-amber-300">
            💡 Esta página se atualiza automaticamente. Você não precisa recarregar.
          </p>
        </div>
      </div>
    </div>
  );
}
