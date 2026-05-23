import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { Search, UserCheck } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../hooks/useAuth';
import { Layout } from '../../components/Layout';
import type { StudentWorkspace, Workspace } from '../../types';

export function TrainerSelect() {
  const { currentUser, userProfile } = useAuth();
  const navigate = useNavigate();

  const [trainers, setTrainers] = useState<Workspace[]>([]);
  const [selected, setSelected] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  // Check if student already has a connection (active or pending) — if so redirect.
  useEffect(() => {
    if (!currentUser) return;

    const checkExisting = async () => {
      const q = query(
        collection(db, 'student_workspaces'),
        where('studentUid', '==', currentUser.uid),
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const conn = snap.docs[0].data() as StudentWorkspace;
        navigate(conn.status === 'active' ? '/student' : '/student/pending', { replace: true });
      }
    };

    checkExisting().catch(console.error);
  }, [currentUser, navigate]);

  // Fetch all registered trainers.
  useEffect(() => {
    const fetchTrainers = async () => {
      try {
        const snap = await getDocs(collection(db, 'workspaces'));
        setTrainers(snap.docs.map((d) => d.data() as Workspace));
      } catch {
        setError('Não foi possível carregar a lista de treinadores.');
      } finally {
        setLoading(false);
      }
    };
    fetchTrainers();
  }, []);

  const handleSubmit = async () => {
    if (!selected || !currentUser || !userProfile) return;
    setError('');
    setSubmitting(true);

    const docId = `${currentUser.uid}_${selected.id}`;

    try {
      // Write without a typed interface — serverTimestamp() is a FieldValue at
      // write time and resolves to Timestamp when read back.
      await setDoc(doc(db, 'student_workspaces', docId), {
        id: docId,
        studentUid: currentUser.uid,
        studentEmail: userProfile.email,
        studentName: userProfile.displayName,
        workspaceId: selected.id,
        status: 'pending',
        createdAt: serverTimestamp(),
      });
      navigate('/student/pending', { replace: true });
    } catch {
      setError('Não foi possível enviar a solicitação. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = trainers.filter(
    (t) =>
      t.trainerName.toLowerCase().includes(search.toLowerCase()) ||
      t.trainerEmail.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Layout title="Escolher Treinador">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
          Selecione seu treinador
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Escolha o treinador que está te acompanhando. Ele precisará aprovar sua solicitação.
        </p>
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
        </div>
      ) : trainers.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 px-4 py-12 text-center dark:border-slate-700">
          <p className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
            Nenhum treinador cadastrado ainda.
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Peça ao seu treinador para se cadastrar no Consultoria primeiro.
          </p>
        </div>
      ) : (
        <>
          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar treinador..."
              className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-4 text-sm placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
            />
          </div>

          {/* Trainer list */}
          <ul className="mb-6 flex flex-col gap-2">
            {filtered.length === 0 ? (
              <li className="py-4 text-center text-sm text-slate-500 dark:text-slate-400">
                Nenhum treinador encontrado.
              </li>
            ) : (
              filtered.map((trainer) => {
                const isSelected = selected?.id === trainer.id;
                return (
                  <li key={trainer.id}>
                    <button
                      onClick={() => setSelected(isSelected ? null : trainer)}
                      className={`w-full rounded-2xl border-2 px-4 py-3 text-left transition-all ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-950/40'
                          : 'border-transparent bg-white hover:border-slate-200 hover:bg-slate-50 dark:bg-slate-800 dark:hover:border-slate-700 dark:hover:bg-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">
                          {trainer.trainerName.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                            {trainer.trainerName}
                          </p>
                          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                            {trainer.trainerEmail}
                          </p>
                        </div>
                        {isSelected && (
                          <UserCheck className="h-5 w-5 flex-shrink-0 text-indigo-600 dark:text-indigo-400" />
                        )}
                      </div>
                    </button>
                  </li>
                );
              })
            )}
          </ul>

          <button
            onClick={handleSubmit}
            disabled={!selected || submitting}
            className="w-full rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-indigo-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting
              ? 'Enviando solicitação...'
              : selected
                ? `Solicitar conexão com ${selected.trainerName}`
                : 'Selecione um treinador'}
          </button>
        </>
      )}
    </Layout>
  );
}
