import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowLeft, Moon, NotebookText, Save, Sun, Trash2 } from 'lucide-react';
import { useDarkMode } from '../hooks/useDarkMode';
import { WorkoutPlan } from '../components/student/WorkoutPlan';
import type { ExerciseEntry } from '../components/student/WorkoutPlan';
import type { ParsedSheetTab } from '../types';

const EXPIRY_MS = 4 * 60 * 60 * 1000; // 4 hours

interface OfflineSnapshot {
  savedAt: number;
  cycleId?: string;
  cycleTitle: string;
  tabName: string;
  dateLabel: string;
  parsedTab: ParsedSheetTab;
  preWorkout: { energyLevel: number; feeling: string } | null;
  exerciseEntries: Record<string, ExerciseEntry>;
}

function offlineKey(sessionId: string): string {
  return `offline_session_${sessionId}`;
}

function fmtSavedAt(ms: number): string {
  const d = new Date(ms);
  const date = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const time = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return `${date} às ${time}`;
}

interface LoadedSnapshot {
  state: 'ok' | 'missing' | 'expired';
  snapshot: OfflineSnapshot | null;
}

function loadSnapshot(sessionId: string | undefined): LoadedSnapshot {
  if (!sessionId) return { state: 'missing', snapshot: null };
  const key = offlineKey(sessionId);
  const raw = localStorage.getItem(key);
  if (!raw) return { state: 'missing', snapshot: null };
  try {
    const parsed = JSON.parse(raw) as OfflineSnapshot;
    if (Date.now() - parsed.savedAt > EXPIRY_MS) {
      localStorage.removeItem(key);
      return { state: 'expired', snapshot: null };
    }
    return { state: 'ok', snapshot: parsed };
  } catch {
    localStorage.removeItem(key);
    return { state: 'missing', snapshot: null };
  }
}

/**
 * Fully standalone, unauthenticated static snapshot viewer — deliberately has
 * NO Firebase/auth/Layout dependencies so it survives the student being logged
 * out (token expiry, session timeout). Reads a JSON snapshot the live
 * `SessionDetail` page wrote to `localStorage` and renders it statelessly.
 */
export function OfflineSession() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [{ state, snapshot }] = useState<LoadedSnapshot>(() => loadSnapshot(sessionId));
  const { isDark, toggle } = useDarkMode();

  // Leave the standalone viewer via a full navigation back to the live session
  // page. The normal app + ProtectedRoute then land a logged-in student there
  // and everyone else on the login page. (Falls back to home for older
  // snapshots saved without a cycleId.)
  const handleBack = () => {
    window.location.href =
      snapshot?.cycleId && sessionId
        ? `/student/cycles/${snapshot.cycleId}/sessions/${sessionId}`
        : '/student';
  };

  // Same, but also drops the snapshot first.
  const handleDiscard = () => {
    if (sessionId) localStorage.removeItem(offlineKey(sessionId));
    handleBack();
  };

  if (state !== 'ok' || !snapshot) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 px-6 text-center dark:bg-slate-950">
        <Save className="h-12 w-12 text-slate-400" aria-hidden />
        <p className="text-base font-bold text-slate-900 dark:text-white">
          {state === 'expired'
            ? 'Esse instantâneo expirou'
            : 'Esse instantâneo não existe mais'}
        </p>
        <p className="max-w-xs text-sm text-slate-500 dark:text-slate-400">
          Instantâneos offline ficam disponíveis por até 4 horas após serem salvos.
          Abra a sessão novamente e toque em "Salvar para acesso offline".
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Top bar — mirrors the logged-in session header */}
      <header className="glass sticky top-0 z-40 border-b border-slate-200 dark:border-slate-800">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
          <div className="flex min-w-0 items-center gap-1">
            <button
              onClick={handleBack}
              aria-label="Voltar"
              className="-ml-1.5 rounded-full p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="flex min-w-0 items-center gap-1.5 text-base font-black text-slate-900 dark:text-white">
              <img src="/app-icon.png" alt="" className="h-6 w-6 flex-shrink-0" />
              <span className="truncate">{snapshot.tabName}</span>
            </div>
          </div>
          <button
            onClick={toggle}
            aria-label={isDark ? 'Ativar modo claro' : 'Ativar modo escuro'}
            className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-800 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          <Save className="h-4 w-4 flex-shrink-0" />
          Treino em andamento offline - salvo em {fmtSavedAt(snapshot.savedAt)}
        </div>

        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
          {snapshot.tabName}
        </h1>
        <p className="mb-5 mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          {snapshot.cycleTitle} · {snapshot.dateLabel}
        </p>

        <p className="mb-2 flex items-center text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          <NotebookText className="h-4 w-4" />
          <span className="ml-2">Plano de treino</span>
        </p>
        <WorkoutPlan tab={snapshot.parsedTab} />

        <button
          onClick={handleDiscard}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-6 py-3 text-sm font-semibold text-red-600 transition-all hover:bg-red-50 active:scale-95 dark:border-red-900/50 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-red-950/30"
        >
          <Trash2 className="h-4 w-4" />
          Descartar treino offline
        </button>
      </div>
    </div>
  );
}
