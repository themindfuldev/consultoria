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
                <p className="mb-1.5 text-sm font-semibold text-slate-800 dark:text-white">
                  {ex.exerciseName}
                </p>
                <div className="flex flex-col gap-0.5">
                  {ex.setGroups.map((sg, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="min-w-[1.5rem] font-medium text-slate-700 dark:text-slate-300">
                        {sg.sets}×{sg.reps}
                      </span>
                      <span>{fmtLoad(sg.load)}</span>
                      {sg.rpe !== '--' && <span className="text-emerald-600 dark:text-emerald-400">{fmtRpe(sg.rpe)}</span>}
                      {sg.rest && <span>⏱ {sg.rest}</span>}
                      {sg.observations && (
                        <span className="ml-auto italic text-amber-600 dark:text-amber-400">
                          {sg.observations}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {editable && (
                  <ExerciseEntryFields
                    exerciseName={ex.exerciseName}
                    entry={entries?.[ex.exerciseName] ?? { observations: '', rpe: '' }}
                    onChange={(entry) => onEntryChange!(ex.exerciseName, entry)}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Per-exercise input fields (Observações + RPE) ─────────────────────────────

function ExerciseEntryFields({
  entry,
  onChange,
}: {
  exerciseName: string;
  entry: ExerciseEntry;
  onChange: (entry: ExerciseEntry) => void;
}) {
  return (
    <div className="mt-2 flex flex-col gap-1.5 sm:flex-row sm:items-start">
      <input
        type="text"
        value={entry.observations}
        onChange={(e) => onChange({ ...entry, observations: e.target.value })}
        placeholder="Observações…"
        className="w-full flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
      />
      <input
        type="number"
        inputMode="numeric"
        min={1}
        max={10}
        value={entry.rpe}
        onChange={(e) => {
          const raw = e.target.value;
          const n = raw === '' ? '' : Math.min(10, Math.max(1, parseInt(raw) || 1));
          onChange({ ...entry, rpe: n });
        }}
        placeholder="RPE"
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500 sm:w-20"
      />
    </div>
  );
}
