interface ChoiceButtonsProps<T extends string> {
  options: readonly T[];
  value: T | null | undefined;
  onChange: (value: T) => void;
  disabled?: boolean;
}

/**
 * Group of large tap-target buttons for picking exactly one string option —
 * used for "Como está se sentindo" (pre/post-workout). The chosen label is
 * also the literal string written back into the spreadsheet, so options
 * should be the exact PT-BR text the trainer should see.
 */
export function ChoiceButtons<T extends string>({ options, value, onChange, disabled }: ChoiceButtonsProps<T>) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap" role="radiogroup">
      {options.map((opt) => {
        const selected = value === opt;
        return (
          <button
            key={opt}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(opt)}
            className={
              selected
                ? 'flex-1 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-md transition-all active:scale-95 disabled:cursor-not-allowed sm:flex-initial'
                : 'flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-all hover:bg-slate-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 sm:flex-initial'
            }
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}
