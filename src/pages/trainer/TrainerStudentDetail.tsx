import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { collection, getDocs, query, Timestamp, where } from 'firebase/firestore';
import { ChevronRight, Dumbbell, MessageSquare } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../hooks/useAuth';
import { Layout } from '../../components/Layout';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { MODALITY_STYLE } from '../../components/student/modality';
import type { Cycle, Session } from '../../types';

// ── Status pill (read-only, mirrors the student's CycleWeekPanel) ─────────────

const STATUS_META: Record<Session['status'], { label: string; badge: string }> = {
  pending:     { label: 'Não iniciado', badge: 'bg-slate-100 text-slate-600 dark:bg-slate-700/60 dark:text-slate-300' },
  in_progress: { label: 'Em andamento', badge: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' },
  skipped:     { label: 'Pulado',       badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  completed:   { label: 'Concluído',    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
};

function StatusBadge({ session }: { session: Session }) {
  const meta = STATUS_META[session.status];
  let label = meta.label;
  if (session.status === 'completed' && session.finishedAt instanceof Timestamp) {
    const d = session.finishedAt.toDate().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    label = `Concluído em ${d}`;
  }
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${meta.badge}`}>
      {label}
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface WeekGroup {
  weekNumber: number;
  sessions: Session[];
}

export function TrainerStudentDetail() {
  const { studentUid } = useParams<{ studentUid: string }>();
  const { currentUser, trainerProfile } = useAuth();
  const trainerEmail = trainerProfile?.email ?? currentUser?.email?.toLowerCase() ?? '';
  const navigate = useNavigate();
  const location = useLocation();
  const nameHint = (location.state as { studentName?: string } | null)?.studentName;

  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  // ── Load cycles + sessions the trainer is allowed to see, then filter to
  //    this student. Both queries key off `trainerEmail` (a single-field
  //    equality the security rules already authorize). ─────────────────────────
  useEffect(() => {
    const load = async () => {
      if (!trainerEmail || !studentUid) { setLoading(false); return; }
      try {
        const [cycleSnap, sessionSnap] = await Promise.all([
          getDocs(query(collection(db, 'cycles'), where('trainerEmail', '==', trainerEmail))),
          getDocs(query(collection(db, 'sessions'), where('trainerEmail', '==', trainerEmail))),
        ]);
        const cyclesForStudent = cycleSnap.docs
          .map((d) => d.data() as Cycle)
          .filter((c) => c.studentUid === studentUid)
          .sort((a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
        const sessionsForStudent = sessionSnap.docs
          .map((d) => d.data() as Session)
          .filter((s) => s.studentUid === studentUid);
        setCycles(cyclesForStudent);
        setSessions(sessionsForStudent);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [trainerEmail, studentUid]);

  // Sessions grouped by cycle → week (newest week first).
  const weeksByCycle = useMemo(() => {
    const byCycle = new Map<string, WeekGroup[]>();
    for (const cycle of cycles) {
      const cycleSessions = sessions.filter((s) => s.cycleId === cycle.id);
      const weekMap = new Map<number, Session[]>();
      for (const s of cycleSessions) {
        const wk = s.weekNumber ?? 0;
        (weekMap.get(wk) ?? weekMap.set(wk, []).get(wk)!).push(s);
      }
      const weeks: WeekGroup[] = [...weekMap.entries()]
        .map(([weekNumber, items]) => ({
          weekNumber,
          sessions: items.sort(
            (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.tabName.localeCompare(b.tabName),
          ),
        }))
        .sort((a, b) => b.weekNumber - a.weekNumber);
      byCycle.set(cycle.id, weeks);
    }
    return byCycle;
  }, [cycles, sessions]);

  const studentName =
    cycles.find((c) => c.studentName)?.studentName ??
    sessions.find((s) => s.studentName)?.studentName ??
    nameHint ??
    'Aluno';

  return (
    <Layout title={studentName} backTo="/trainer/students">
      <Breadcrumbs
        items={[
          { label: 'Meus Alunos', to: '/trainer/students' },
          { label: studentName },
        ]}
      />

      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">{studentName}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Ciclos e sessões atribuídos a você — somente leitura.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
        </div>
      ) : cycles.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 px-4 py-12 text-center dark:border-slate-700">
          <p className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
            Nenhum ciclo atribuído
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Este aluno ainda não tem ciclos vinculados a você.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {cycles.map((cycle) => {
            const weeks = weeksByCycle.get(cycle.id) ?? [];
            const modalityLabel =
              cycle.modality === 'Outro' && cycle.modalityCustom
                ? cycle.modalityCustom
                : cycle.modality;
            return (
              <div key={cycle.id} className="glass-premium rounded-2xl p-4">
                {/* Cycle header */}
                <div className="mb-3 flex items-center gap-2">
                  <h2 className="min-w-0 flex-1 truncate text-base font-bold text-slate-900 dark:text-white">
                    {cycle.title}
                  </h2>
                  <span className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${MODALITY_STYLE[cycle.modality]}`}>
                    {modalityLabel}
                  </span>
                  {cycle.status === 'archived' && (
                    <span className="flex-shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                      Arquivado
                    </span>
                  )}
                </div>

                {weeks.length === 0 ? (
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    Nenhuma sessão registrada neste ciclo.
                  </p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {weeks.map((week) => (
                      <div key={week.weekNumber}>
                        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Semana {week.weekNumber}
                        </p>
                        <ol className="flex flex-col gap-1.5">
                          {week.sessions.map((s, idx) => {
                            const hasFeedback = s.feedbackStatus === 'complete';
                            return (
                              <li
                                key={s.id}
                                className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-center gap-2 rounded-xl bg-white/50 px-2.5 py-2 dark:bg-slate-800/40"
                              >
                                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-slate-200 text-[11px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                                  {idx + 1}
                                </span>
                                <div className="min-w-0">
                                  <button
                                    onClick={() => navigate(`/trainer/sessions/${s.id}`)}
                                    className="flex w-full items-center gap-1.5 text-left text-sm font-medium text-slate-800 hover:underline dark:text-slate-100"
                                  >
                                    <Dumbbell className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
                                    <span className="truncate">{s.tabName}</span>
                                  </button>
                                  <div className="mt-1 overflow-hidden">
                                    <StatusBadge session={s} />
                                  </div>
                                </div>
                                <div className="flex items-center gap-1">
                                  {hasFeedback && (
                                    <MessageSquare className="h-3.5 w-3.5 text-emerald-500" />
                                  )}
                                  <ChevronRight className="h-4 w-4 flex-shrink-0 text-slate-400" />
                                </div>
                              </li>
                            );
                          })}
                        </ol>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Layout>
  );
}
