import type { Modality } from '../../types';

/** Badge colours per training modality (shared by the card and cycle pages). */
export const MODALITY_STYLE: Record<Modality, string> = {
  'Força':      'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  'Mobilidade': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  'Cardio':     'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  'Competição': 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  'Outro':      'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
};
