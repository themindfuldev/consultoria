import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Clock, SquareChevronRight, Weight } from 'lucide-react';
import { setKey } from '../../services/sheetsService';
import { YouTubeIcon } from '../icons/YouTubeIcon';
import type { ParsedSheetTab, PlannedExercise, PlannedSetGroup } from '../../types';

// ── Display helpers ───────────────────────────────────────────────────────────

/** Raw load value (no "kg" suffix) — rendered as "Carga: {value}". */
function fmtLoadValue(load: number | string): string {
  if (load === 'ESCOLHER') return 'a definir';
  if (load === '--' || !load) return '—';
  return `${load}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface ExerciseEntry {
  observations: string;
  rpe: number | '';
}

interface WorkoutPlanProps {
  tab: ParsedSheetTab;
  /**
   * When provided (together with `onEntryChange`), renders editable
   * "Observações" / "RPE" inputs per **set** — the student's actual notes for
   * that set, later written back to sheet columns F/G. Keyed by set key (see
   * `setKey`). Omit both to render a read-only reference view (e.g. offline).
   */
  entries?: Record<string, ExerciseEntry>;
  onEntryChange?: (setKey: string, entry: ExerciseEntry) => void;
  /**
   * Set keys the student has ticked as completed. Drives the timeline: the
   * connector segment leading **into** a set's node is solid when that set is
   * completed, dashed otherwise. Always rendered (read-only when
   * `onToggleSet` is omitted).
   */
  completedSets?: Record<string, true>;
  /** Toggles a single set's completion. Presence makes the nodes interactive. */
  onToggleSet?: (setKey: string, next: boolean) => void;
}

// A "row" in the flattened timeline: a section label, an exercise name, or a
// single set (the only kind that carries a node/checkbox).
type TimelineRow =
  | { kind: 'section'; id: string; name: string }
  | { kind: 'exercise'; id: string; name: string; videoUrl?: string }
  | {
      kind: 'set';
      id: string;
      ex: PlannedExercise;
      sg: PlannedSetGroup;
      index: number;
      setK: string;
      done: boolean;
    };

/** Vertical connector classes for a segment. `null` → no line (nothing below). */
function connectorClasses(done: boolean | null): string | null {
  if (done === null) return null;
  return done
    ? 'border-solid border-emerald-500'
    : 'border-dashed border-slate-300 dark:border-slate-600';
}

/**
 * Read-only rendering of a parsed training tab as a GitHub-style vertical
 * timeline: one continuous rail on the left, a circular checkbox node per set,
 * and the set details in a card to the right. Purely presentational — no
 * Firebase/auth dependencies, so it's reusable from the offline static snapshot
 * page as well as the live session page.
 */
export function WorkoutPlan({ tab, entries, onEntryChange, completedSets, onToggleSet }: WorkoutPlanProps) {
  const editable = !!onEntryChange;
  const interactive = !!onToggleSet;

  // Group exercises by section (insertion order preserved).
  const sections = new Map<string, PlannedExercise[]>();
  for (const ex of tab.exercises) {
    const list = sections.get(ex.section) ?? [];
    list.push(ex);
    sections.set(ex.section, list);
  }

  if (sections.size === 0) {
    return (
      <p className="text-xs text-slate-400 dark:text-slate-500 px-1">
        Nenhum exercício encontrado nesta aba.
      </p>
    );
  }

  // Flatten into ordered timeline rows.
  const rows: TimelineRow[] = [];
  for (const [sectionName, exercises] of sections) {
    rows.push({ kind: 'section', id: `s:${sectionName}`, name: sectionName });
    for (const ex of exercises) {
      rows.push({ kind: 'exercise', id: `e:${sectionName}:${ex.exerciseName}`, name: ex.exerciseName, videoUrl: ex.videoUrl });
      ex.setGroups.forEach((sg, index) => {
        const setK = setKey(ex.exerciseName, index, sg.rowNumber);
        rows.push({ kind: 'set', id: `set:${setK}:${index}`, ex, sg, index, setK, done: !!completedSets?.[setK] });
      });
    }
  }

  // For each row, the completion of the nearest set row *after* it — this drives
  // the connector below headers and the bottom half of a set's rail.
  const nextSetDone: (boolean | null)[] = new Array(rows.length).fill(null);
  {
    let carry: boolean | null = null;
    for (let i = rows.length - 1; i >= 0; i--) {
      nextSetDone[i] = carry;
      if (rows[i].kind === 'set') carry = (rows[i] as Extract<TimelineRow, { kind: 'set' }>).done;
    }
  }

  return (
    <div className="flex flex-col">
      {rows.map((row, i) => {
        // ── Section / exercise header: rail passes straight through ──────────
        if (row.kind !== 'set') {
          const through = connectorClasses(nextSetDone[i]);
          return (
            <div key={row.id} className="flex gap-3">
              <div className="relative w-6 flex-none">
                {through && (
                  <span className={`absolute left-1/2 top-0 bottom-0 -translate-x-1/2 border-l-2 ${through}`} />
                )}
              </div>
              <div className={`min-w-0 flex-1 ${row.kind === 'section' ? 'pb-1 pt-3' : 'pt-2'}`}>
                {row.kind === 'section' ? (
                  <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    <SquareChevronRight className="h-4 w-4 flex-shrink-0" />
                    {row.name}
                  </p>
                ) : (
                  <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-white">
                    {row.name}
                    {row.videoUrl && (
                      <a
                        href={row.videoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Ver vídeo do exercício"
                        className="flex-shrink-0 text-red-600 transition-colors hover:text-red-700 dark:text-red-500 dark:hover:text-red-400"
                      >
                        <YouTubeIcon className="h-4 w-4" />
                      </a>
                    )}
                  </p>
                )}
              </div>
            </div>
          );
        }

        // ── Set row: node + rail (dashed/solid), then the set card ───────────
        const { sg, setK, done } = row;
        const entry: ExerciseEntry = entries?.[setK] ?? { observations: '', rpe: '' };
        const displayRpe = typeof entry.rpe === 'number'
          ? entry.rpe
          : (typeof sg.rpe === 'number' ? sg.rpe : null);
        const hasLoad = sg.load !== '--' && sg.load !== '' && sg.load != null;
        const rest = sg.rest ? sg.rest.replace(/[()]/g, '').trim() : '';
        const showObs = editable || !!entry.observations || !!sg.observations;

        const topHalf = connectorClasses(done);
        const bottomHalf = connectorClasses(nextSetDone[i]);
        const nodeStyle = done
          ? 'border-emerald-500 bg-emerald-500 text-white'
          : 'border-slate-300 bg-white dark:border-slate-500 dark:bg-slate-800';

        return (
          <div key={row.id} className="flex gap-3">
            {/* Rail: top half (this set), bottom half (next set), node centered at 18px */}
            <div className="relative w-6 flex-none">
              {topHalf && (
                <span className={`absolute left-1/2 top-0 h-[18px] -translate-x-1/2 border-l-2 ${topHalf}`} />
              )}
              {bottomHalf && (
                <span className={`absolute left-1/2 top-[18px] bottom-0 -translate-x-1/2 border-l-2 ${bottomHalf}`} />
              )}
              {interactive ? (
                <button
                  type="button"
                  onClick={() => onToggleSet!(setK, !done)}
                  aria-pressed={done}
                  aria-label={done ? 'Marcar série como não concluída' : 'Marcar série como concluída'}
                  className={`absolute left-1/2 top-[18px] z-10 flex h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 transition-colors before:absolute before:-inset-2 before:content-[''] ${nodeStyle}`}
                >
                  {done && <Check className="h-3 w-3" strokeWidth={3} />}
                </button>
              ) : (
                <span
                  className={`absolute left-1/2 top-[18px] z-10 flex h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 ${nodeStyle}`}
                >
                  {done && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
              )}
            </div>

            {/* Set card */}
            <div className="min-w-0 flex-1 pb-2.5">
              <div className="rounded-xl border border-slate-200 bg-white/60 px-3 py-2.5 dark:border-slate-700 dark:bg-slate-800/60">
                <div className="flex items-center gap-3 text-xs">
                  <span className="whitespace-nowrap font-medium text-slate-700 dark:text-slate-300">
                    {sg.sets}×{sg.reps}
                  </span>
                  {hasLoad && (
                    <span className="flex items-center gap-1 whitespace-nowrap text-slate-500 dark:text-slate-400">
                      <Weight className="h-3.5 w-3.5 flex-shrink-0" />
                      {fmtLoadValue(sg.load)}
                    </span>
                  )}
                  <span className="flex-1" />
                  {rest && (
                    <span className="flex items-center gap-1 whitespace-nowrap text-slate-500 dark:text-slate-400">
                      <Clock className="h-3.5 w-3.5 flex-shrink-0" />
                      {rest}
                    </span>
                  )}
                  <span className="flex w-16 flex-none justify-end">
                    {editable ? (
                      <RpeSelect
                        value={entry.rpe}
                        onChange={(rpe) => onEntryChange!(setK, { ...entry, rpe })}
                      />
                    ) : displayRpe != null ? (
                      <span className={`inline-block rounded-lg px-2 py-0.5 font-bold ${rpeChipClasses(displayRpe)}`}>
                        RPE {displayRpe}
                      </span>
                    ) : null}
                  </span>
                </div>

                {/* Observações: full width */}
                {showObs && (
                  <div className="mt-2 min-w-0">
                    {editable ? (
                      <input
                        type="text"
                        value={entry.observations}
                        onChange={(e) => onEntryChange!(setK, { ...entry, observations: e.target.value })}
                        placeholder="Observações…"
                        className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                      />
                    ) : (
                      <span className="block w-full rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-700 dark:bg-slate-700/60 dark:text-slate-200">
                        {entry.observations || sg.observations}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── RPE select (color-coded 1–10 dropdown, still type-able) ───────────────────

/** Background/text classes for an RPE value, dark-mode friendly:
 *  1–3 dark green · 4–5 light green · 6–7 orange · 8–10 red. */
function rpeChipClasses(n: number): string {
  if (n <= 3) return 'bg-emerald-700 text-white';
  if (n <= 5) return 'bg-emerald-400 text-emerald-950';
  if (n <= 7) return 'bg-orange-500 text-white';
  return 'bg-red-600 text-white';
}

const RPE_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

function RpeSelect({
  value,
  onChange,
}: {
  value: number | '';
  onChange: (rpe: number | '') => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close the dropdown when clicking/tapping outside it.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const colored = typeof value === 'number';
  // A plain button (not a text input) so mobile browsers never auto-zoom the
  // page on focus — the 1–10 picker below covers every value, so there's no
  // need to type.
  const triggerClasses = colored
    ? `border-transparent font-bold ${rpeChipClasses(value)}`
    : 'border-slate-200 bg-white text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500';

  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center justify-between gap-1 rounded-lg border px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/40 ${triggerClasses}`}
      >
        <span>{colored ? value : 'RPE'}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 flex-shrink-0 ${colored ? 'text-white/80' : 'text-slate-400'}`}
        />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 w-max rounded-xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-800">
          <div className="grid grid-cols-5 gap-1.5">
            {RPE_VALUES.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => {
                  onChange(n);
                  setOpen(false);
                }}
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-transform hover:scale-110 ${rpeChipClasses(n)} ${value === n ? 'ring-2 ring-indigo-500 ring-offset-1 dark:ring-offset-slate-800' : ''}`}
              >
                {n}
              </button>
            ))}
          </div>
          {colored && (
            <button
              type="button"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
              className="mt-1.5 w-full rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700/60"
            >
              Limpar
            </button>
          )}
        </div>
      )}
    </div>
  );
}
