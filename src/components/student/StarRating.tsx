import { Star } from 'lucide-react';

interface StarRatingProps {
  /** Currently selected rating (1–5), or null/undefined if unanswered. */
  value: number | null | undefined;
  onChange: (value: 1 | 2 | 3 | 4 | 5) => void;
  disabled?: boolean;
}

/** Large-tap-target 1–5 star selector — used for "Qual o seu nível de ânimo". */
export function StarRating({ value, onChange, disabled }: StarRatingProps) {
  return (
    <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Nível de ânimo">
      {([1, 2, 3, 4, 5] as const).map((n) => {
        const filled = !!value && n <= value;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} de 5 estrelas`}
            disabled={disabled}
            onClick={() => onChange(n)}
            className="rounded-lg p-1.5 transition-transform active:scale-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Star
              className={`h-8 w-8 transition-colors ${
                filled
                  ? 'fill-amber-400 text-amber-400'
                  : 'fill-transparent text-slate-300 dark:text-slate-600'
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}
