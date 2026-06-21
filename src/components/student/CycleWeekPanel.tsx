import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Lock, Play, RefreshCw, SkipForward } from 'lucide-react';
import type { useCycleWeek } from '../../hooks/useCycleWeek';

interface CycleWeekPanelProps {
  /** Result of calling `useCycleWeek(cycle)` in the parent — passed down rather
   * than called again here so a page that also needs the full session list
   * (e.g. `CycleDetail`) doesn't end up with duplicate Firestore listeners and
   * Sheets API calls. */
  cycleWeek: ReturnType<typeof useCycleWeek>;
}

/**
 * Week control + numbered list of this week's training sessions (one row per
 * spreadsheet tab), each with Iniciar/Continuar + Pular actions. Shared by the
 * dashboard's `CycleCard` and the full `CycleDetail` page so the start/skip
 * rules and "can advance to next week" gating stay in exactly one place.
 */
export function CycleWeekPanel({ cycleWeek }: CycleWeekPanelProps) {
  const navigate = useNavigate();
  const {
    currentWeek,
    nextWeekNumber,
    startingWeek,
    weekError,
    startWeek,
    canStartNextWeek,
    sheetTabsLoading,
    sheetTabsError,
    retryLoadSheetTabs,
    rows,
    pendingAction,
    actionError,
    startSession,
    skipSession,
  } = cycleWeek;

  const handleStart = async (tab: string) => {
    const result = await startSession(tab);
    if (result) navigate(`/student/cycles/${result.cycleId}/sessions/${result.sessionId}`);
  };

  return (
    <div>
      {/* ── Week control ─────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {currentWeek ? 'Semana atual' : 'Ciclo ainda não iniciado'}
          </p>
          <p className="text-base font-bold text-slate-900 dark:text-white">
            {currentWeek ? `Semana ${currentWeek.weekNumber}` : 'Comece a primeira semana'}
          </p>
        </div>
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

      {currentWeek && !canStartNextWeek && (
        <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
          Finalize ou pule os treinos desta semana para liberar a próxima.
        </p>
      )}

      {weekError && (
        <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">{weekError}</p>
      )}

      {/* ── This week's sessions ─────────────────────────────────────────── */}
      {currentWeek ? (
        <div className="mt-3">
          {rows.length > 0 ? (
            <ol className="flex flex-col gap-1.5">
              {rows.map((row, idx) => {
                const isPendingStart = pendingAction?.tab === row.tab && pendingAction.kind === 'start';
                const isPendingSkip = pendingAction?.tab === row.tab && pendingAction.kind === 'skip';
                return (
                  <li
                    key={row.tab}
                    className="flex items-center gap-2.5 rounded-xl bg-white/50 px-3 py-2 dark:bg-slate-800/40"
                  >
                    <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-slate-200 text-[11px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                      {idx + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                      {row.tab}
                    </span>

                    {row.session?.status === 'completed' && (
                      <span className="flex flex-shrink-0 items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Concluído
                      </span>
                    )}
                    {row.session?.status === 'skipped' && (
                      <span className="flex flex-shrink-0 items-center gap-1 text-xs font-semibold text-slate-400 dark:text-slate-500">
                        <SkipForward className="h-3.5 w-3.5" /> Pulado
                      </span>
                    )}
                    {(!row.session
                      || row.session.status === 'pending'
                      || row.session.status === 'in_progress') && (
                      <div className="flex flex-shrink-0 gap-1.5">
                        <button
                          onClick={() => handleStart(row.tab)}
                          disabled={!!pendingAction}
                          className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-semibold text-white transition-all hover:bg-indigo-700 active:scale-95 disabled:opacity-60"
                        >
                          {isPendingStart ? '…' : row.session?.status === 'in_progress' ? 'Continuar' : 'Iniciar'}
                        </button>
                        <button
                          onClick={() => skipSession(row.tab)}
                          disabled={!!pendingAction}
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                        >
                          {isPendingSkip ? '…' : 'Pular'}
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
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
    </div>
  );
}
