import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { setKey } from '../../services/sheetsService';
import type { ParsedSheetTab, PlannedExercise } from '../../types';

// ── Display helpers ───────────────────────────────────────────────────────────

function fmtLoad(load: number | string): string {
  if (load === 'ESCOLHER') return 'a definir';
  if (load === '--' || !load) return '—';
  return `${load} kg`;
}

function fmtRpe(rpe: number | string): string {
  if (rpe === 'PREENCHER') return 'preencher';
  if (rpe === '--' || !rpe) return '—';
  return `RPE ${rpe}`;
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
   * "Observações" / "RPE" inputs under each exercise — the student's actual
   * notes for that exercise, later written back to sheet columns F/G.
   * Omit both to render a purely read-only reference view (e.g. offline export).
   */
  entries?: Record<string, ExerciseEntry>;
  onEntryChange?: (exerciseName: string, entry: ExerciseEntry) => void;
}

/**
 * Read-only rendering of a parsed training tab, grouped by section — the
 * student's "reading mode" reference while training. Purely presentational:
 * no Firebase/auth dependencies, so it's reusable from the offline static
 * snapshot page as well as the live session page.
 */
export function WorkoutPlan({ tab, entries, onEntryChange }: WorkoutPlanProps) {
  const editable = !!onEntryChange;

  // Group exercises by section
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

  return (
    <div className="flex flex-col gap-3">
      {[...sections.entries()].map(([sectionName, exercises]) => (
        <div key={sectionName} className="rounded-xl border border-slate-200 bg-white/60 dark:border-slate-700 dark:bg-slate-800/60">
          <p className="rounded-t-xl bg-slate-100/80 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-600 dark:bg-slate-700/80 dark:text-slate-300">
            {sectionName}
          </p>
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {exercises.map((ex) => (
              <div key={ex.exerciseName} className="px-3 py-2.5">
                <p className="mb-2 text-sm font-semibold text-slate-800 dark:text-white">
                  {ex.exerciseName}
                </p>
                <div className="flex flex-col gap-3">
                  {ex.setGroups.map((sg, i) => {
                    const key = setKey(ex.exerciseName, i, sg.rowNumber);
                    const entry: ExerciseEntry = entries?.[key] ?? { observations: '', rpe: '' };
                    return (
                      <div key={i} className="flex flex-col gap-1.5">
                        {/* Planned reference line (read-only) */}
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="min-w-[1.5rem] font-medium text-slate-700 dark:text-slate-300">
                            {sg.sets}×{sg.reps}
                          </span>
                          <span>{fmtLoad(sg.load)}</span>
                          {sg.rpe !== '--' && <span className="text-emerald-600 dark:text-emerald-400">{fmtRpe(sg.rpe)}</span>}
                          {sg.rest && <span>⏱ {sg.rest}</span>}
                        </div>

                        {editable ? (
                          // Per-set editable Observações + RPE (preloaded from the sheet).
                          <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start">
                            <input
                              type="text"
                              value={entry.observations}
                              onChange={(e) => onEntryChange!(key, { ...entry, observations: e.target.value })}
                              placeholder="Observações…"
                              className="w-full flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                            />
                            <RpeSelect
                              value={entry.rpe}
                              onChange={(rpe) => onEntryChange!(key, { ...entry, rpe })}
                            />
                          </div>
                        ) : entries?.[key] ? (
                          <ExerciseEntryReadOnly entry={entry} />
                        ) : sg.observations ? (
                          // Reference view (pre-workout / offline): trainer's note.
                          <p className="text-xs italic text-amber-600 dark:text-amber-400">
                            {sg.observations}
                          </p>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Read-only entry summary (filled Observações + RPE, shown after finishing) ─

function ExerciseEntryReadOnly({ entry }: { entry: ExerciseEntry }) {
  const hasObs = entry.observations.trim() !== '';
  const hasRpe = entry.rpe !== '' && entry.rpe !== 0;
  if (!hasObs && !hasRpe) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
      {hasObs && (
        <span className="rounded-lg bg-slate-100 px-2 py-1 text-slate-700 dark:bg-slate-700/60 dark:text-slate-200">
          📝 {entry.observations}
        </span>
      )}
      {hasRpe && (
        <span className={`rounded-full px-2 py-0.5 font-bold ${rpeChipClasses(entry.rpe as number)}`}>
          RPE {entry.rpe}
        </span>
      )}
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
  const inputClasses = colored
    ? `border-transparent font-bold ${rpeChipClasses(value)} placeholder-white/70`
    : 'border-slate-200 bg-white text-slate-900 placeholder-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500';

  return (
    <div ref={ref} className="relative w-full sm:w-20">
      <input
        type="text"
        inputMode="numeric"
        maxLength={2}
        value={value}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          // Digits only; empty clears, otherwise clamp to 1–10.
          const digits = e.target.value.replace(/\D/g, '');
          if (digits === '') { onChange(''); return; }
          onChange(Math.min(10, Math.max(1, parseInt(digits, 10))));
        }}
        placeholder="RPE"
        className={`w-full rounded-lg border px-3 py-2 pr-7 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/40 ${inputClasses}`}
      />
      <ChevronDown
        className={`pointer-events-none absolute right-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${colored ? 'text-white/80' : 'text-slate-400'}`}
      />

      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 grid w-max grid-cols-5 gap-1.5 rounded-xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-800">
          {RPE_VALUES.map((n) => (
            <button
              key={n}
              type="button"
              // pointerdown (not click) so the input doesn't blur and re-close
              // the menu before the selection registers.
              onPointerDown={(e) => {
                e.preventDefault();
                onChange(n);
                setOpen(false);
              }}
              className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-transform hover:scale-110 ${rpeChipClasses(n)} ${value === n ? 'ring-2 ring-indigo-500 ring-offset-1 dark:ring-offset-slate-800' : ''}`}
            >
              {n}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
