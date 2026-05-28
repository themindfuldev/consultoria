/**
 * sheetsService.ts
 *
 * Google Sheets API v4 helpers for reading and parsing training session tabs.
 *
 * Template column layout (A–H):
 *   A  Exercício      — exercise name (empty = continuation of previous)
 *   B  Séries         — number of sets in this row group
 *   C  Repetições     — reps (number or range string)
 *   D  Carga          — load in kg, 'ESCOLHER' (student picks), or '--'
 *   E  Descanso       — rest time string
 *   F  Observações    — trainer notes (inline cell text)
 *   G  RPE            — RPE target, 'PREENCHER' (student fills), or '--'
 *   H  ADMIN          — trainer-only column (ignored by parser)
 *
 * Tabs to ignore: "Template", "Dados", "Celular"
 * All other tabs are training sessions.
 */

import type { ParsedSheetTab, PlannedExercise, PlannedSetGroup } from '../types';

const SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets';

/** Tabs that are configuration/reference — never treated as training sessions. */
const IGNORED_TABS = new Set(['Template', 'Dados', 'Celular']);

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns the list of training-session tab names from the spreadsheet,
 * excluding ignored utility tabs.
 */
export async function getTrainingTabs(
  spreadsheetId: string,
  token: string,
): Promise<string[]> {
  const res = await fetch(
    `${SHEETS_API}/${spreadsheetId}?fields=sheets.properties.title`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${await res.text()}`);

  const data = (await res.json()) as {
    sheets: Array<{ properties: { title: string } }>;
  };

  return data.sheets
    .map((s) => s.properties.title)
    .filter((name) => !IGNORED_TABS.has(name));
}

/**
 * Fetches and parses a single training tab.
 * Returns structured exercises plus pre/post workout data.
 */
export async function parseTrainingTab(
  spreadsheetId: string,
  tabName: string,
  token: string,
): Promise<ParsedSheetTab> {
  const range = encodeURIComponent(`${tabName}!A:H`);
  const res = await fetch(
    `${SHEETS_API}/${spreadsheetId}/values/${range}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${await res.text()}`);

  const data = (await res.json()) as { values?: string[][] };
  return _parseRows(tabName, data.values ?? []);
}

// ── Row parser ────────────────────────────────────────────────────────────────

function _parseRows(tabName: string, rows: string[][]): ParsedSheetTab {
  const exercises: PlannedExercise[] = [];
  let currentSection = '';
  let inExerciseSection = false;
  let postWorkoutSection = false;
  let currentExercise: PlannedExercise | null = null;

  const preWorkout: ParsedSheetTab['preWorkout'] = {
    energyLevel: null,
    feeling: null,
  };
  const postWorkout: ParsedSheetTab['postWorkout'] = {
    energyLevel: null,
    feeling: null,
  };

  for (const rawRow of rows) {
    // Pad to 8 cells and trim whitespace
    const row = Array.from({ length: 8 }, (_, i) => (rawRow[i] ?? '').trim());
    const [colA, colB, colC, colD, colE, colF, colG] = row;

    // ── Skip entirely-empty rows ────────────────────────────────────────────
    if (row.every((c) => !c)) continue;

    // ── Skip metadata rows (rows 1–2): contain "Ciclo" or motto ────────────
    if (colA.includes('Funcionalidade acima da estética')) continue;
    if (!colA && row.some((c) => c === 'Ciclo' || c === 'Visto do Aluno')) continue;

    // ── Skip utility rows ───────────────────────────────────────────────────
    if (colA === 'MODO CELULAR') continue;
    if (colA === 'Gerar modo celular') continue;

    // ── INÍCIO DO TREINO marker ─────────────────────────────────────────────
    if (colA.includes('INÍCIO DO TREINO')) continue;

    // ── FINAL DO TREINO marker ──────────────────────────────────────────────
    if (colA.includes('FINAL DO TREINO')) {
      postWorkoutSection = true;
      inExerciseSection = false;
      currentExercise = null;
      continue;
    }

    // ── Energy level row ────────────────────────────────────────────────────
    if (colA.includes('nível de ânimo')) {
      const level = parseInt(colB);
      if (!isNaN(level) && level >= 1 && level <= 5) {
        if (!postWorkoutSection) preWorkout.energyLevel = level;
        else postWorkout.energyLevel = level;
      }
      continue;
    }

    // ── Feeling row ─────────────────────────────────────────────────────────
    if (colA.includes('Como está se sentindo')) {
      const feeling = colB && colB !== '-' ? colB : null;
      if (!postWorkoutSection) preWorkout.feeling = feeling;
      else postWorkout.feeling = feeling;
      continue;
    }

    // ── Column header row ───────────────────────────────────────────────────
    if (colA === 'Exercício' && colB === 'Séries') continue;

    // ── Section header row ──────────────────────────────────────────────────
    // Pattern: colA has text AND all of B–G are empty (merged cells in the sheet).
    // Skip if we're in the post-workout block.
    if (colA && !colB && !colC && !colD && !colE && !colF && !colG && !postWorkoutSection) {
      currentSection = colA;
      inExerciseSection = true;
      currentExercise = null;
      continue;
    }

    // ── Exercise row ────────────────────────────────────────────────────────
    if (inExerciseSection && !postWorkoutSection) {
      const isContinuation = !colA;

      if (!isContinuation) {
        // New named exercise
        currentExercise = {
          exerciseName: colA,
          section: currentSection,
          setGroups: [],
        };
        exercises.push(currentExercise);
      }

      // Add set-group data (even for continuation rows)
      if (currentExercise && (colB || colC || colD)) {
        currentExercise.setGroups.push(_parseSetGroup(colB, colC, colD, colE, colF, colG));
      }
    }
  }

  return { tabName, exercises, preWorkout, postWorkout };
}

// ── Set-group helper ──────────────────────────────────────────────────────────

function _parseSetGroup(
  rawSets: string,
  rawReps: string,
  rawLoad: string,
  rawRest: string,
  rawObs: string,
  rawRpe: string,
): PlannedSetGroup {
  const sets = parseInt(rawSets) || 1;

  const reps: number | string =
    rawReps === '--' || !rawReps ? '--' : (parseInt(rawReps) || rawReps);

  const load: number | string =
    rawLoad === 'ESCOLHER' ? 'ESCOLHER' :
    rawLoad === '--' || !rawLoad ? '--' :
    (parseFloat(rawLoad) || rawLoad);

  const rpe: number | string =
    rawRpe === 'PREENCHER' ? 'PREENCHER' :
    rawRpe === '--' || !rawRpe ? '--' :
    (parseFloat(rawRpe) || rawRpe);

  return {
    sets,
    reps,
    load,
    rest: rawRest ?? '',
    observations: rawObs ?? '',
    rpe,
  };
}

// ── Convenience: get unique exercise names from a parsed tab ──────────────────

/**
 * Returns a deduplicated, sorted list of exercise names from a parsed tab.
 * Useful for pre-populating the video-tagging dropdown.
 */
export function getExerciseNames(tab: ParsedSheetTab): string[] {
  return Array.from(
    new Set(tab.exercises.map((e) => e.exerciseName).filter(Boolean)),
  ).sort();
}
