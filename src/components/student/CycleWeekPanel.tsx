import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import {
  CheckCircle2,
  ChevronDown,
  FileText,
  Flag,
  Lock,
  MessageSquare,
  Play,
  RefreshCw,
  RotateCcw,
  SkipForward,
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

const STATUS_META: Record<SessionStatus, { label: string; badge: string }> = {
  pending:     { label: 'Não iniciado', badge: 'bg-slate-100 text-slate-600 dark:bg-slate-700/60 dark:text-slate-300' },
  in_progress: { label: 'Em andamento', badge: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' },
  skipped:     { label: 'Pulado',       badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  completed:   { label: 'Concluído',    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
};

/** Status pill for the fixed status column (caps, colored bg). */
function StatusBadge({ session }: { session: Session | null }) {
  const status: SessionStatus = session?.status ?? 'pending';
  const meta = STATUS_META[status];
  let label = meta.label;
  if (status === 'completed' && session?.finishedAt instanceof Timestamp) {
    const d = session.finishedAt.toDate().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    label = `Concluído em ${d}`;
  }
  return (
    <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${meta.badge}`}>
      {label}
    </span>
  );
}

// ── One week's session rows (table) ───────────────────────────────────────────

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
  const navigate = useNavigate();
  return (
    <ol className="flex flex-col gap-1.5">
      {rows.map((row, idx) => {
        const status: SessionStatus = row.session?.status ?? 'pending';
        const busy = pendingActionTab === row.tab;
        const canSkip = !readOnly && (status === 'pending' || status === 'in_progress');
        const canUnskip = !readOnly && status === 'skipped';
        const hasFeedback = row.session?.feedbackStatus === 'complete';
        return (
          <li
            key={row.tab}
            className="grid grid-cols-[1.25rem_minmax(0,1fr)_5.75rem] items-center gap-2 rounded-xl bg-white/50 px-2.5 py-2 dark:bg-slate-800/40 sm:grid-cols-[1.25rem_minmax(0,1fr)_7.75rem_5.75rem]"
          >
            <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-slate-200 text-[11px] font-bold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
              {idx + 1}
            </span>

            {/* Name (tap to open) + status below it on mobile. */}
            <div className="min-w-0">
              <button
                onClick={() => onOpen(row)}
                disabled={busy}
                className="block w-full truncate text-left text-sm font-medium text-slate-800 hover:underline disabled:opacity-60 dark:text-slate-100"
              >
                {row.tab}
              </button>
              <div className="mt-1 overflow-hidden sm:hidden">
                <StatusBadge session={row.session} />
              </div>
            </div>

            {/* Status — fixed-width middle column on sm+ only. */}
            <div className="hidden overflow-hidden sm:block">
              <StatusBadge session={row.session} />
            </div>

            {/* Actions — icon buttons; Feedback always shows (disabled if none). */}
            <div className="flex items-center justify-end gap-1">
              {canSkip && (
                <button
                  onClick={() => onSkip(row.tab)}
                  disabled={busy}
                  aria-label="Pular" title="Pular"
                  className="rounded-lg border border-slate-200 p-1.5 text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  <SkipForward className="h-4 w-4" />
                </button>
              )}
              {canUnskip && (
                <button
                  onClick={() => onUnskip(row.session!)}
                  disabled={busy}
                  aria-label="Despular" title="Despular"
                  className="rounded-lg border border-slate-200 p-1.5 text-slate-500 transition-colors hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              )}
              <button
                onClick={() => onOpen(row)}
                disabled={busy}
                aria-label="Abrir" title="Abrir"
                className="rounded-lg bg-indigo-600 p-1.5 text-white transition-all hover:bg-indigo-700 active:scale-95 disabled:opacity-60"
              >
                <Play className="h-4 w-4" />
              </button>
              <button
                onClick={() => row.session && navigate(`/student/sessions/${row.session.id}/feedback`)}
                disabled={!hasFeedback}
                aria-label="Feedback" title={hasFeedback ? 'Ver feedback' : 'Feedback ainda não disponível'}
                className="rounded-lg bg-emerald-600 p-1.5 text-white transition-all hover:bg-emerald-700 active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 dark:disabled:bg-slate-700 dark:disabled:text-slate-500"
              >
                <MessageSquare className="h-4 w-4" />
              </button>
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
        <div className="min-w-0 flex-1">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Semana atual
          </p>
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
              {currentWeek ? `Semana ${currentWeek.weekNumber}` : 'Ciclo ainda não iniciado'}
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
            {currentWeek?.startedAt instanceof Timestamp && (
              <span className="flex-shrink-0 text-xs font-normal text-slate-400 dark:text-slate-500">
                Desde {currentWeek.startedAt.toDate().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
              </span>
            )}
          </div>
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

        {/* Start the next week after concluding the current one (inline). The
            initial "cycle not started" case renders its button full-width at
            the bottom instead — see below. */}
        {canStartNextWeek && currentWeek && (
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
          Finalize ou pule os treinos para concluir a semana.
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

          {/* Weekly feedback Google Doc (if generated) — below all sessions */}
          {currentWeek.feedbackDocUrl && (
            <a
              href={currentWeek.feedbackDocUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-blue-700 active:scale-95"
            >
              <FileText className="h-4 w-4" /> Ver feedback da semana
            </a>
          )}
        </div>
      ) : (
        <>
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
            Comece a semana para ver os treinos.
          </p>
          {canStartNextWeek && (
            <button
              onClick={startWeek}
              disabled={startingWeek}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-indigo-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Play className="h-3.5 w-3.5" />
              {startingWeek ? 'Iniciando…' : `Começar Semana ${nextWeekNumber}`}
            </button>
          )}
        </>
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
                      {week.feedbackDocUrl && (
                        <a
                          href={week.feedbackDocUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-2 text-xs font-semibold text-white transition-all hover:bg-blue-700 active:scale-95"
                        >
                          <FileText className="h-4 w-4" /> Ver feedback da semana
                        </a>
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
