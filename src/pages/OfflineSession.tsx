import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { WifiOff } from 'lucide-react';
import { WorkoutPlan } from '../components/student/WorkoutPlan';
import type { ExerciseEntry } from '../components/student/WorkoutPlan';
import type { ParsedSheetTab } from '../types';

const EXPIRY_MS = 4 * 60 * 60 * 1000; // 4 hours

interface OfflineSnapshot {
  savedAt: number;
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
  return new Date(ms).toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
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

  if (state !== 'ok' || !snapshot) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50 px-6 text-center dark:bg-slate-950">
        <WifiOff className="h-10 w-10 text-slate-400 dark:text-slate-600" />
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
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          <WifiOff className="h-4 w-4 flex-shrink-0" />
          📴 Modo offline — instantâneo salvo em {fmtSavedAt(snapshot.savedAt)}
        </div>

        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
          {snapshot.tabName}
        </h1>
        <p className="mb-5 mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          {snapshot.cycleTitle} · {snapshot.dateLabel}
        </p>

        {snapshot.preWorkout && (
          <div className="glass-premium mb-5 rounded-2xl p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Início do treino
            </p>
            <p className="text-sm text-slate-700 dark:text-slate-200">
              Ânimo: {'⭐'.repeat(snapshot.preWorkout.energyLevel)} · {snapshot.preWorkout.feeling}
            </p>
          </div>
        )}

        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          📋 Plano de treino
        </p>
        <WorkoutPlan tab={snapshot.parsedTab} />
      </div>
    </div>
  );
}
