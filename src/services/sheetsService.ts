/**
 * sheetsService.ts
 *
 * Google Sheets API v4 helpers for reading, parsing, and writing back to
 * training session tabs.
 *
 * Template column layout (A–H):
 *   A  Exercício      — exercise name (empty = continuation of previous)
 *   B  Séries         — number of sets in this row group; also holds the
 *                        student's pre/post-workout answers on marker rows
 *   C  Repetições     — reps (number or range string)
 *   D  Carga          — load in kg, 'ESCOLHER' (student picks), or '--'
 *   E  Descanso       — rest time string
 *   F  Observações    — trainer notes; overwritten with the student's actual
 *                        observations per exercise on session finish
 *   G  RPE            — RPE target, 'PREENCHER' (student fills); overwritten
 *                        with the student's actual RPE per exercise on finish
 *   H2 ADMIN checkbox — fixed cell checked (TRUE) when the session is finished
 *
 * Tabs to ignore: "Template", "Dados", "Celular"
 * All other tabs are training sessions.
 *
 * The student's answers are written directly into these cells (the trainer's
 * layout/columns are never restructured) via `writeCells` — see below.
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
  const headers = { Authorization: `Bearer ${token}` };

  // Values give us the grid text; a second (grid) read gives us the links
  // attached to column-A exercise-name cells (YouTube demos). The link read is
  // best-effort — a failure there must not break parsing.
  const linkRange = encodeURIComponent(`${tabName}!A:A`);
  const linkFields = encodeURIComponent(
    'sheets(data(rowData(values(hyperlink,userEnteredValue,textFormatRuns))))',
  );
  const [res, linksRes] = await Promise.all([
    fetch(`${SHEETS_API}/${spreadsheetId}/values/${range}`, { headers }),
    fetch(`${SHEETS_API}/${spreadsheetId}?ranges=${linkRange}&fields=${linkFields}`, { headers }),
  ]);
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${await res.text()}`);

  const data = (await res.json()) as { values?: string[][] };
  const videoByRow = linksRes.ok
    ? _extractColumnAVideoLinks(await linksRes.json())
    : new Map<number, string>();
  return _parseRows(tabName, data.values ?? [], videoByRow);
}

// ── Column-A link extraction ──────────────────────────────────────────────────

function isYouTubeUrl(url: string): boolean {
  return /(?:youtube\.com|youtu\.be)/i.test(url);
}

/** Pulls a link off a single cell: whole-cell hyperlink, rich-text run link, or a `=HYPERLINK()` formula. */
function _cellLink(cell: {
  hyperlink?: string;
  userEnteredValue?: { formulaValue?: string };
  textFormatRuns?: Array<{ format?: { link?: { uri?: string } } }>;
}): string | null {
  if (typeof cell.hyperlink === 'string' && cell.hyperlink) return cell.hyperlink;
  for (const run of cell.textFormatRuns ?? []) {
    const uri = run.format?.link?.uri;
    if (uri) return uri;
  }
  const formula = cell.userEnteredValue?.formulaValue;
  const m = typeof formula === 'string' ? formula.match(/HYPERLINK\(\s*"([^"]+)"/i) : null;
  return m ? m[1] : null;
}

/** Maps 1-based row number → YouTube URL for any column-A cell that links to one. */
function _extractColumnAVideoLinks(json: {
  sheets?: Array<{ data?: Array<{ startRow?: number; rowData?: Array<{ values?: unknown[] }> }> }>;
}): Map<number, string> {
  const map = new Map<number, string>();
  const grid = json.sheets?.[0]?.data?.[0];
  const startRow = grid?.startRow ?? 0;
  const rowData = grid?.rowData ?? [];
  for (let i = 0; i < rowData.length; i++) {
    const cell = rowData[i]?.values?.[0] as Parameters<typeof _cellLink>[0] | undefined;
    if (!cell) continue;
    const url = _cellLink(cell);
    if (url && isYouTubeUrl(url)) map.set(startRow + i + 1, url);
  }
  return map;
}

// ── Row parser ────────────────────────────────────────────────────────────────

function _parseRows(
  tabName: string,
  rows: string[][],
  videoByRow: Map<number, string> = new Map(),
): ParsedSheetTab {
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

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const rawRow = rows[rowIdx];
    // 1-based row number, matching the sheet's own row numbering — used for write-back.
    const rowNumber = rowIdx + 1;
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
      const block = postWorkoutSection ? postWorkout : preWorkout;
      block.energyLevelRow = rowNumber;
      if (!isNaN(level) && level >= 1 && level <= 5) {
        block.energyLevel = level;
      }
      continue;
    }

    // ── Feeling row ─────────────────────────────────────────────────────────
    if (colA.includes('Como está se sentindo')) {
      const feeling = colB && colB !== '-' ? colB : null;
      const block = postWorkoutSection ? postWorkout : preWorkout;
      block.feelingRow = rowNumber;
      block.feeling = feeling;
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
        const videoUrl = videoByRow.get(rowNumber);
        currentExercise = {
          exerciseName: colA,
          section: currentSection,
          setGroups: [],
          // Only set when present — keeps the object Firestore-safe (no undefined).
          ...(videoUrl ? { videoUrl } : {}),
        };
        exercises.push(currentExercise);
      }

      // Add set-group data (even for continuation rows)
      if (currentExercise && (colB || colC || colD)) {
        currentExercise.setGroups.push(_parseSetGroup(colB, colC, colD, colE, colF, colG, rowNumber));
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
  rowNumber: number,
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
    rowNumber,
  };
}

// ── Write-back ────────────────────────────────────────────────────────────────

/**
 * Writes one or more cell ranges back into the spreadsheet in a single batch
 * request. Used to record the student's pre/post-workout answers, per-exercise
 * Observações/RPE, and the "FINAL DO TREINO" checkbox directly into the
 * trainer's existing tabs (the trainer's layout/columns are never altered —
 * only specific cells are overwritten with student-entered values).
 *
 * Best-effort: callers should treat failures as non-fatal — Firestore remains
 * the canonical record regardless of whether the sheet sync succeeds.
 */
export async function writeCells(
  spreadsheetId: string,
  updates: { range: string; values: (string | number | boolean)[][] }[],
  token: string,
): Promise<void> {
  if (updates.length === 0) return;

  const res = await fetch(`${SHEETS_API}/${spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      valueInputOption: 'USER_ENTERED',
      data: updates.map((u) => ({ range: u.range, values: u.values })),
    }),
  });
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${await res.text()}`);
}

/** Builds an `A1`-style range string for a single row span within a tab, e.g. `Terça!F3:G3`. */
export function rowRange(tabName: string, startCol: string, endCol: string, row: number): string {
  return `${tabName}!${startCol}${row}:${endCol}${row}`;
}

/** Builds an `A1`-style range string for a single cell within a tab, e.g. `Terça!B5`. */
export function cellRange(tabName: string, col: string, row: number): string {
  return `${tabName}!${col}${row}`;
}

/**
 * Stable key for a single set within a session's per-set entries map. Prefers
 * the sheet row number (so it maps cleanly to columns F/G on write-back); falls
 * back to exercise name + set index when a row number isn't available.
 */
export function setKey(exerciseName: string, index: number, rowNumber?: number): string {
  return rowNumber != null ? `r${rowNumber}` : `${exerciseName}#${index}`;
}

// ── Convenience: get unique exercise names from a parsed tab ──────────────────

/**
 * Returns a deduplicated list of exercise names from a parsed tab, **in
 * spreadsheet order** (first occurrence wins). Used to pre-populate the
 * video-tagging dropdown so it mirrors the sheet, not alphabetical order.
 * Warm-up ("Aquecimento") exercises are excluded — students don't film those.
 */
export function getExerciseNames(tab: ParsedSheetTab): string[] {
  return Array.from(
    new Set(
      tab.exercises
        .filter((e) => !/aquecimento/i.test(e.section))
        .map((e) => e.exerciseName)
        .filter(Boolean),
    ),
  );
}
