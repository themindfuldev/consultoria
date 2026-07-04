import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { ArchiveRestore, PlusCircle, Users } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../hooks/useAuth';
import { useGoogleTokenWarmup } from '../../hooks/useGoogleTokenWarmup';
import { Layout } from '../../components/Layout';
import { CycleCard } from '../../components/student/CycleCard';
import type { Cycle } from '../../types';

export function StudentDashboard() {
  const { currentUser, userProfile } = useAuth();
  const navigate = useNavigate();

  // On open, re-authorize Google up front if the token has expired (daily),
  // so the sheet loads don't fail and force a manual "Tentar novamente".
  useGoogleTokenWarmup();

  // Cycles state
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [cyclesLoading, setCyclesLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [cardError, setCardError] = useState('');

  // ── Cycles real-time listener ───────────────────────────────────────────────

  useEffect(() => {
    if (!currentUser) return;

    // `cyclesLoading` already starts `true` — the snapshot/error callbacks
    // below are what flip it to `false` once the first page of data arrives.
    // Fetch ALL cycles for this student (both active + archived).
    // Filtering is done client-side since the count is always small.
    const q = query(
      collection(db, 'cycles'),
      where('studentUid', '==', currentUser.uid),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const all = snap.docs.map((d) => d.data() as Cycle);
        // Sort: active first by createdAt desc, then archived by archivedAt desc.
        all.sort((a, b) => {
          const aTime = a.createdAt?.seconds ?? 0;
          const bTime = b.createdAt?.seconds ?? 0;
          return bTime - aTime;
        });
        setCycles(all);
        setCyclesLoading(false);
      },
      () => setCyclesLoading(false),
    );
    return unsub;
  }, [currentUser]);

  // ── Derived lists ───────────────────────────────────────────────────────────

  const activeCycles   = cycles.filter((c) => c.status === 'active');
  const archivedCycles = cycles.filter((c) => c.status === 'archived');
  const visibleCycles  = showArchived ? archivedCycles : activeCycles;

  // ── Early exits ─────────────────────────────────────────────────────────────

  if (cyclesLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
        </div>
      </Layout>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Layout title="Meus Treinos">
      {/* Greeting */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
          Olá, {userProfile?.displayName?.split(' ')[0]} 💪
        </h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          {activeCycles.length === 0
            ? 'Adicione seu primeiro programa de treino abaixo.'
            : `${activeCycles.length} programa${activeCycles.length !== 1 ? 's' : ''} ativo${activeCycles.length !== 1 ? 's' : ''}.`}
        </p>
      </div>

      {/* Error from card actions */}
      {cardError && (
        <p role="alert" className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
          {cardError}
        </p>
      )}

      {/* ── Toolbar: view toggle + add button ──────────────────────────── */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <button
          onClick={() => navigate('/student/trainers')}
          className="flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <Users className="h-3.5 w-3.5" />
          Meus treinadores
        </button>

        {archivedCycles.length > 0 && (
          <button
            onClick={() => setShowArchived((s) => !s)}
            className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
              showArchived
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
            }`}
          >
            <ArchiveRestore className="h-3.5 w-3.5" />
            {showArchived ? 'Ver ativos' : `Ver arquivados (${archivedCycles.length})`}
          </button>
        )}

        {!showArchived && (
          <button
            onClick={() => navigate('/student/add-cycle')}
            className="ml-auto flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-indigo-700 active:scale-95"
          >
            <PlusCircle className="h-3.5 w-3.5" />
            Adicionar programa
          </button>
        )}
      </div>

      {/* ── Cycle list ─────────────────────────────────────────────────── */}
      {visibleCycles.length === 0 ? (
        showArchived ? (
          <EmptyState
            icon="🗄️"
            title="Nenhum programa arquivado"
            description="Programas que você arquivar aparecem aqui."
          />
        ) : (
          <EmptyState
            icon="📋"
            title="Nenhum programa ainda"
            description="Cole o link da planilha do seu treinador para começar."
            action={
              <button
                onClick={() => navigate('/student/add-cycle')}
                className="mt-4 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-md transition-all hover:bg-indigo-700 active:scale-95"
              >
                Adicionar programa
              </button>
            }
          />
        )
      ) : (
        <ul className="flex flex-col gap-3">
          {visibleCycles.map((cycle) => (
            <li key={cycle.id}>
              <CycleCard cycle={cycle} onError={setCardError} />
            </li>
          ))}
        </ul>
      )}
    </Layout>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-slate-200 px-4 py-12 text-center dark:border-slate-700">
      <div className="mb-3 text-4xl">{icon}</div>
      <h2 className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-300">{title}</h2>
      <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>
      {action}
    </div>
  );
}
