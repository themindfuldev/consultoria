import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  ChevronDown,
  Flag,
  Lock,
  Play,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import type { useCycleWeek } from '../../hooks/useCycleWeek';
import type { TabSessionRow } from '../../hooks/useCycleWeek';
import type { Session } from '../../types';

interface CycleWeekPanelProps {
  /** Result of calling `useCycleWeek(cycle)` in the parent — passed down rather
   * than called again here so a page that also needs the full session list
   * (e.g. `CycleDetail`) doesn't end up with duplicate Firestore listeners and
   * Sheets API calls. */
  cycleWeek: ReturnType<typeof useCycleWeek>;
}

type SessionStatus = Session['status'];

// ── Status column meta ────────────────────────────────────────────────────────

const STATUS_META: Record<SessionStatus, { label: string; dot: string; text: string }> = {
  pending:     { label: 'Não iniciado', dot: 'bg-slate-400',   text: 'text-slate-500 dark:text-slate-400' },
  in_progress: { label: 'Em andamento', dot: 'bg-indigo-500',  text: 'text-indigo-600 dark:text-indigo-400' },
  skipped:     { label: 'Pulado',       dot: 'bg-amber-500',   text: 'text-amber-600 dark:text-amber-400' },
  completed:   { label: 'Concluído',    dot: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
};

function StatusCell({ status }: { status: SessionStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={`flex w-[104px] flex-shrink-0 items-center gap-1.5 text-[11px] font-semibold ${meta.text}`}>
      <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

// ── One week's session rows (table-like) ──────────────────────────────────────

function SessionRows({
  rows,
  readOnly,
  pendingActionTab,
  onOpen,
  onSkip,
  onUnskip,
}: {
  rows: TabSessionRow[];
  readOnly: boolean;
  pendingActionTab: string | null;
  onOpen: (row: TabSessionRow) => void;
  onSkip: (tab: string) => void;
  onUnskip: (session: Session) => void;
}) {
  return (
    <ol className="flex flex-col gap-1.5">
      {rows.map((row, idx) => {
        const status: SessionStatus = row.session?.status ?? 'pending';
        const busy = pendingActionTab === row.tab;
        const canSkip = !readOnly && (status === 'pending' || status === 'in_progress');
        const canUnskip = !readOnly && status === 'skipped';
        return (
          <li
            key={row.tab}
            className="flex items-center gap-2 rounded-xl bg-white/50 px-2.5 py-2 dark:bg-slate-800/40"
          >
            <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-slate-200 text-[11px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
              {idx + 1}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-slate-100">
              {row.tab}
            </span>

            <StatusCell status={status} />

            <div className="flex flex-shrink-0 gap-1.5">
              <button
                onClick={() => onOpen(row)}
                disabled={busy}
                className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white transition-all hover:bg-indigo-700 active:scale-95 disabled:opacity-60"
              >
                {busy ? '…' : 'Abrir'}
              </button>
              {canSkip && (
                <button
                  onClick={() => onSkip(row.tab)}
                  disabled={busy}
                  className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  Pular
                </button>
              )}
              {canUnskip && (
                <button
                  onClick={() => onUnskip(row.session!)}
                  disabled={busy}
                  className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  <RotateCcw className="h-3 w-3" />
                  Despular
                </button>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Week control + numbered list of this week's training sessions (one row per
 * spreadsheet tab) with a status column and per-row actions. Shared by the
 * dashboard's `CycleCard` and the full `CycleDetail` page so the start/conclude
 * rules and read-only gating live in exactly one place.
 */
export function CycleWeekPanel({ cycleWeek }: CycleWeekPanelProps) {
  const navigate = useNavigate();
  const {
    cycleId,
    currentWeek,
    currentWeekStatus,
    currentWeekConcluded,
    nextWeekNumber,
    pastWeeks,
    startingWeek,
    concludingWeek,
    weekError,
    startWeek,
    concludeWeek,
    canConcludeWeek,
    canStartNextWeek,
    sheetTabsLoading,
    sheetTabsError,
    retryLoadSheetTabs,
    rows,
    pendingAction,
    actionError,
    openSession,
    skipSession,
    unskipSession,
  } = cycleWeek;

  // Which past-week accordions are expanded.
  const [openWeeks, setOpenWeeks] = useState<Set<string>>(new Set());
  const toggleWeek = (id: string) =>
    setOpenWeeks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleOpen = async (row: TabSessionRow) => {
    if (row.session) {
      navigate(`/student/cycles/${cycleId}/sessions/${row.session.id}`);
      return;
    }
    const sessionId = await openSession(row.tab);
    if (sessionId) navigate(`/student/cycles/${cycleId}/sessions/${sessionId}`);
  };

  return (
    <div>
      {/* ── Week control ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {currentWeek ? 'Semana atual' : 'Ciclo ainda não iniciado'}
          </p>
          <p className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
            {currentWeek ? `Semana ${currentWeek.weekNumber}` : 'Comece a primeira semana'}
            {currentWeekStatus === 'in_progress' && (
              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                Em andamento
              </span>
            )}
            {currentWeekStatus === 'completed' && (
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                Concluída
              </span>
            )}
          </p>
        </div>

        {/* Conclude the current week (all sessions terminal, not yet concluded) */}
        {canConcludeWeek && (
          <button
            onClick={concludeWeek}
            disabled={concludingWeek}
            className="flex flex-shrink-0 items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-emerald-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Flag className="h-3.5 w-3.5" />
            {concludingWeek ? 'Concluindo…' : `Concluir Semana ${currentWeek!.weekNumber}`}
          </button>
        )}

        {/* Start the next week (current one concluded, or no week yet) */}
        {canStartNextWeek && (
          <button
            onClick={startWeek}
            disabled={startingWeek}
            className="flex flex-shrink-0 items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-indigo-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Play className="h-3.5 w-3.5" />
            {startingWeek ? 'Iniciando…' : `Começar Semana ${nextWeekNumber}`}
          </button>
        )}
      </div>

      {currentWeek && !currentWeekConcluded && !canConcludeWeek && (
        <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
          Finalize ou pule os treinos desta semana para poder concluí-la.
        </p>
      )}
      {currentWeekConcluded && (
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
          <Lock className="h-3.5 w-3.5" />
          Semana concluída — os treinos estão em modo somente leitura.
        </p>
      )}
      {weekError && (
        <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">{weekError}</p>
      )}

      {/* ── This week's sessions ─────────────────────────────────────────── */}
      {currentWeek ? (
        <div className="mt-3">
          {rows.length > 0 ? (
            <SessionRows
              rows={rows}
              readOnly={currentWeekConcluded}
              pendingActionTab={pendingAction?.tab ?? null}
              onOpen={handleOpen}
              onSkip={skipSession}
              onUnskip={unskipSession}
            />
          ) : sheetTabsLoading ? (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
              Carregando treinos da planilha…
            </div>
          ) : sheetTabsError ? (
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-red-500 dark:text-red-400">{sheetTabsError}</p>
              <button
                onClick={retryLoadSheetTabs}
                className="flex flex-shrink-0 items-center gap-1 text-xs text-indigo-600 hover:underline dark:text-indigo-400"
              >
                <RefreshCw className="h-3 w-3" /> Tentar novamente
              </button>
            </div>
          ) : (
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Nenhum treino encontrado na planilha.
            </p>
          )}
          {actionError && (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">{actionError}</p>
          )}
        </div>
      ) : (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
          <Lock className="h-3.5 w-3.5" />
          Comece a semana para ver os treinos.
        </p>
      )}

      {/* ── Past weeks (read-only accordions) ────────────────────────────── */}
      {pastWeeks.length > 0 && (
        <div className="mt-4 border-t border-slate-200/70 pt-3 dark:border-slate-700/50">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Semanas anteriores
          </p>
          <div className="flex flex-col gap-2">
            {pastWeeks.map(({ week, rows: weekRows }) => {
              const isOpen = openWeeks.has(week.id);
              return (
                <div
                  key={week.id}
                  className="overflow-hidden rounded-xl border border-slate-200/70 dark:border-slate-700/50"
                >
                  <button
                    onClick={() => toggleWeek(week.id)}
                    className="flex w-full items-center gap-2 bg-white/40 px-3 py-2 text-left dark:bg-slate-800/40"
                  >
                    <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-500" />
                    <span className="flex-1 text-sm font-semibold text-slate-700 dark:text-slate-200">
                      Semana {week.weekNumber}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                      Concluída
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 flex-shrink-0 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-2 pb-2 pt-1">
                      {weekRows.length > 0 ? (
                        <SessionRows
                          rows={weekRows}
                          readOnly
                          pendingActionTab={null}
                          onOpen={handleOpen}
                          onSkip={skipSession}
                          onUnskip={unskipSession}
                        />
                      ) : (
                        <p className="px-1 py-2 text-xs text-slate-400 dark:text-slate-500">
                          Nenhuma sessão registrada nesta semana.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
