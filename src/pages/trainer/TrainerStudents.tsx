import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { ChevronRight, Mail, Users } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../hooks/useAuth';
import { Layout } from '../../components/Layout';
import { Avatar } from '../../components/Avatar';
import type { StudentTrainer } from '../../types';

export function TrainerStudents() {
  const { currentUser, trainerProfile } = useAuth();
  const trainerEmail = trainerProfile?.email ?? currentUser?.email?.toLowerCase() ?? '';
  const navigate = useNavigate();

  const [students, setStudents] = useState<StudentTrainer[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Live list of students linked to this trainer ────────────────────────────
  useEffect(() => {
    if (!trainerEmail) return; // an authenticated trainer always has an email
    const q = query(
      collection(db, 'student_trainers'),
      where('trainerEmail', '==', trainerEmail),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => d.data() as StudentTrainer);
        rows.sort((a, b) =>
          (a.studentName ?? a.studentEmail).localeCompare(b.studentName ?? b.studentEmail),
        );
        setStudents(rows);
        setLoading(false);
      },
      () => setLoading(false),
    );
    return unsub;
  }, [trainerEmail]);

  return (
    <Layout title="Meus Alunos" backTo="/trainer">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
          <Users className="h-5 w-5 text-indigo-500" />
          Meus alunos
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Alunos que cadastraram você como treinador. Toque em um aluno para ver seus
          ciclos e sessões.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
        </div>
      ) : students.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 px-4 py-12 text-center dark:border-slate-700">
          <p className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
            Nenhum aluno ainda
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Assim que um aluno cadastrar você, ele aparecerá aqui.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {students.map((s) => (
            <li key={s.id}>
              <button
                onClick={() =>
                  navigate(`/trainer/students/${s.studentUid}`, {
                    state: { studentName: s.studentName ?? s.studentEmail },
                  })
                }
                className="glass flex w-full items-center gap-3 rounded-2xl border border-slate-200 px-4 py-3 text-left transition-all active:scale-[0.99] dark:border-slate-700"
              >
                <Avatar displayName={s.studentName ?? s.studentEmail} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                    {s.studentName ?? s.studentEmail}
                  </p>
                  <p className="flex items-center gap-1.5 truncate text-xs text-slate-500 dark:text-slate-400">
                    <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="truncate">{s.studentEmail}</span>
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-400" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Layout>
  );
}
