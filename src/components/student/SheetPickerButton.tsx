import { FileSpreadsheet } from 'lucide-react';
import { trimText } from '../../utils/text';

interface SheetPickerButtonProps {
  /** Display name of the currently-selected sheet, or null when none is chosen. */
  sheetName?: string | null;
  /** True while the Picker is opening / a token is being fetched. */
  picking: boolean;
  onClick: () => void;
}

/**
 * Button that opens the Google spreadsheet Picker. Shows the selected sheet's
 * name once chosen, otherwise a "select a spreadsheet" prompt. Replaces the old
 * paste-a-URL input — picking is what grants `drive.file` access to the sheet.
 */
export function SheetPickerButton({ sheetName, picking, onClick }: SheetPickerButtonProps) {
  // Sheet names come from Drive untouched — trim before showing.
  const name = trimText(sheetName);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={picking}
      className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-900 transition-colors hover:border-indigo-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
    >
      <FileSpreadsheet className="h-4 w-4 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
      <span className={`flex-1 truncate ${name ? '' : 'text-slate-400 dark:text-slate-500'}`}>
        {picking ? 'Abrindo o Google…' : name || 'Selecionar planilha do Google Sheets'}
      </span>
      <span className="flex-shrink-0 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
        {name ? 'Trocar' : 'Selecionar'}
      </span>
    </button>
  );
}
