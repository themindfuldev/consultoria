import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ExternalLink, Pencil } from 'lucide-react';
import { db } from '../../firebase';
import { Layout } from '../../components/Layout';
import { useCycleWeek } from '../../hooks/useCycleWeek';
import { useGoogleTokenWarmup } from '../../hooks/useGoogleTokenWarmup';
import { CycleWeekPanel } from '../../components/student/CycleWeekPanel';
import type { Cycle } from '../../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extracts the spreadsheet ID from a Google Sheets URL. Returns null if invalid. */
function extractSheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CycleDetail() {
  const { cycleId } = useParams<{ cycleId: string }>();

  // Re-authorize Google on open if the (daily-expiring) token is stale.
  useGoogleTokenWarmup();

  const [cycle, setCycle] = useState<Cycle | null>(null);
  const cycleWeek = useCycleWeek(cycle);

  // Replace spreadsheet
  const [showReplaceSheet, setShowReplaceSheet] = useState(false);
  const [replaceUrl, setReplaceUrl] = useState('');
  const [replaceError, setReplaceError] = useState('');
  const [replacing, setReplacing] = useState(false);

  // ── Load cycle doc ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!cycleId) return;
    getDoc(doc(db, 'cycles', cycleId)).then((snap) => {
      if (snap.exists()) setCycle(snap.data() as Cycle);
    });
  }, [cycleId]);

  // ── Replace spreadsheet ─────────────────────────────────────────────────────

  const handleReplaceSheet = async () => {
    if (!cycle) return;
    const trimmed = replaceUrl.trim();
    const sheetId = extractSheetId(trimmed);
    if (!sheetId) {
      setReplaceError('Cole um link válido do Google Sheets.');
      return;
    }
    setReplaceError('');
    setReplacing(true);
    try {
      await updateDoc(doc(db, 'cycles', cycle.id), {
        googleSheetId: sheetId,
        googleSheetUrl: trimmed,
      });
      setCycle((prev) => (prev ? { ...prev, googleSheetId: sheetId, googleSheetUrl: trimmed } : prev));
      setShowReplaceSheet(false);
      setReplaceUrl('');
    } catch {
      setReplaceError('Não foi possível atualizar a planilha. Tente novamente.');
    } finally {
      setReplacing(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Layout title={cycle?.title ?? 'Sessões'} backTo="/student">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
          {cycle?.title ?? '…'}
        </h1>
        <div className="mt-1 flex items-center gap-3">
          {cycle?.trainerName && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Treinador: {cycle.trainerName}
            </p>
          )}
          {cycle?.googleSheetUrl && (
            <a
              href={cycle.googleSheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              <ExternalLink className="h-3 w-3" /> Planilha
            </a>
          )}
          <button
            onClick={() => { setShowReplaceSheet(true); setReplaceUrl(cycle?.googleSheetUrl ?? ''); setReplaceError(''); }}
            className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-indigo-600 hover:underline dark:text-slate-500 dark:hover:text-indigo-400"
          >
            <Pencil className="h-3 w-3" /> Trocar planilha
          </button>
        </div>
      </div>

      {/* ── Week control + sessions (current + past weeks) ────────────────── */}
      {cycle && (
        <div className="glass-premium mb-5 rounded-2xl p-4">
          <CycleWeekPanel cycleWeek={cycleWeek} />
        </div>
      )}

      {/* ── Replace spreadsheet sheet ─────────────────────────────────── */}
      {showReplaceSheet && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 backdrop-blur-sm">
          <div className="glass-premium w-full rounded-t-2xl p-6 shadow-2xl">
            <h2 className="mb-1 text-lg font-bold text-slate-900 dark:text-white">
              Trocar planilha
            </h2>
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
              Cole o link da nova planilha do Google Sheets para este ciclo.
            </p>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Link da planilha
                </label>
                <input
                  type="text"
                  value={replaceUrl}
                  onChange={(e) => { setReplaceUrl(e.target.value); setReplaceError(''); }}
                  placeholder="https://docs.google.com/spreadsheets/d/…"
                  autoFocus
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                />
              </div>

              {replaceError && (
                <p className="text-xs text-red-600 dark:text-red-400">{replaceError}</p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => { setShowReplaceSheet(false); setReplaceUrl(''); setReplaceError(''); }}
                  className="flex-1 rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleReplaceSheet}
                  disabled={replacing}
                  className="flex-1 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-indigo-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {replacing ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
