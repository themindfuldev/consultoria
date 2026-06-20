import { useEffect, useState } from 'react';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './useAuth';
import { useActiveSession } from './useActiveSession';
import { getTrainingTabs } from '../services/sheetsService';
import { notifyTrainer } from '../services/notifyService';
import type { Cycle, CycleWeek, Session } from '../types';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Removes every cached offline-export snapshot — starting a new session
 * invalidates whatever was cached for offline use. */
function clearOfflineSnapshots() {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key?.startsWith('offline_session_')) localStorage.removeItem(key);
  }
}

export interface TabSessionRow {
  tab: string;
  session: Session | null;
}

export interface StartSessionResult {
  cycleId: string;
  sessionId: string;
  /** True if this points at a different session than the one just requested — the
   * single-active-session guard redirected the student to their existing workout. */
  redirected: boolean;
}

interface PendingAction {
  tab: string;
  kind: 'start' | 'skip';
}

/**
 * Shared week/session-tab logic for a cycle — powers both the dashboard
 * card's compact panel and the full CycleDetail page so the "start week",
 * "start/continue/skip session", and "can advance to next week" rules live
 * in exactly one place.
 */
export function useCycleWeek(cycle: Cycle | null) {
  const { currentUser, getAccessToken } = useAuth();
  const activeSession = useActiveSession();

  const cycleId = cycle?.id ?? null;

  const [weeks, setWeeks] = useState<CycleWeek[]>([]);
  const [startingWeek, setStartingWeek] = useState(false);

  const [sheetTabs, setSheetTabs] = useState<string[]>([]);
  const [sheetTabsLoading, setSheetTabsLoading] = useState(false);
  const [sheetTabsError, setSheetTabsError] = useState('');

  const [sessions, setSessions] = useState<Session[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);

  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [actionError, setActionError] = useState('');

  // ── Weeks listener (current week = highest weekNumber) ─────────────────────

  useEffect(() => {
    if (!cycleId) return;
    const q = query(collection(db, 'cycles', cycleId, 'weeks'), orderBy('weekNumber', 'desc'));
    return onSnapshot(q, (snap) => setWeeks(snap.docs.map((d) => d.data() as CycleWeek)));
  }, [cycleId]);

  // ── Sheet tabs loader ────────────────────────────────────────────────────────

  const loadSheetTabs = async (spreadsheetId: string) => {
    setSheetTabsLoading(true);
    setSheetTabsError('');
    try {
      const token = await getAccessToken();
      setSheetTabs(await getTrainingTabs(spreadsheetId, token));
    } catch {
      setSheetTabsError('Não foi possível carregar as abas da planilha.');
    } finally {
      setSheetTabsLoading(false);
    }
  };

  useEffect(() => {
    if (!cycle?.googleSheetId) return;
    // `loadSheetTabs` is also called from the "Tentar novamente" retry action —
    // the standard fetch-with-retry shape, intentionally not split in two.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSheetTabs(cycle.googleSheetId);
  }, [cycle?.googleSheetId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── All sessions for this cycle ──────────────────────────────────────────────

  useEffect(() => {
    if (!currentUser || !cycleId) return;
    // `sessionsLoading` already starts `true` — the snapshot/error callbacks
    // below are what flip it to `false` once the first page of data arrives.
    const q = query(
      collection(db, 'sessions'),
      where('cycleId', '==', cycleId),
      where('studentUid', '==', currentUser.uid),
      orderBy('date', 'desc'),
    );
    return onSnapshot(
      q,
      (snap) => {
        setSessions(snap.docs.map((d) => d.data() as Session));
        setSessionsLoading(false);
      },
      () => setSessionsLoading(false),
    );
  }, [currentUser, cycleId]);

  // ── Derived state ────────────────────────────────────────────────────────────

  const currentWeek = weeks[0] ?? null;
  const nextWeekNumber = (currentWeek?.weekNumber ?? 0) + 1;

  const sessionsThisWeek = currentWeek
    ? sessions.filter((s) => s.weekNumber === currentWeek.weekNumber)
    : [];

  const sessionByTab = new Map(sessionsThisWeek.map((s) => [s.tabName, s] as const));

  const rows: TabSessionRow[] = sheetTabs.map((tab) => ({
    tab,
    session: sessionByTab.get(tab) ?? null,
  }));

  // The next week can only start once every training day of the current week
  // has reached a terminal state (finalized or skipped) — never while one is
  // still in progress, and never while some tab hasn't been touched at all.
  // A spreadsheet we couldn't load (or week 1, with no current week yet) never
  // blocks progress.
  const canStartNextWeek =
    !currentWeek ||
    sheetTabsError !== '' ||
    (sheetTabs.length > 0 && rows.every((r) => r.session?.status === 'completed' || r.session?.status === 'skipped'));

  // ── Start week ───────────────────────────────────────────────────────────────

  const startWeek = async () => {
    if (!cycleId || startingWeek) return;
    setStartingWeek(true);
    try {
      const weekRef = doc(collection(db, 'cycles', cycleId, 'weeks'));
      await setDoc(weekRef, {
        id: weekRef.id,
        cycleId,
        weekNumber: nextWeekNumber,
        startedAt: serverTimestamp(),
      });
    } finally {
      setStartingWeek(false);
    }
  };

  // ── Start (or continue) a session for a given tab ───────────────────────────

  const startSession = async (tabName: string): Promise<StartSessionResult | null> => {
    if (!currentUser || !cycle || !currentWeek || pendingAction) return null;

    const existing = sessionByTab.get(tabName);
    if (existing) {
      // Already started (or finished) — just point at it, no write needed.
      return { cycleId: cycle.id, sessionId: existing.id, redirected: false };
    }

    // One active session at a time, controlled in the browser — redirect
    // straight into the existing one instead of starting a second.
    if (activeSession) {
      setActionError('Você já tem um treino em andamento — abrindo…');
      await new Promise((r) => setTimeout(r, 900));
      return { cycleId: activeSession.cycleId, sessionId: activeSession.id, redirected: true };
    }

    setActionError('');
    setPendingAction({ tab: tabName, kind: 'start' });
    try {
      // Starting a new session invalidates any cached offline snapshot.
      clearOfflineSnapshots();

      const sessionRef = doc(collection(db, 'sessions'));
      await setDoc(sessionRef, {
        id: sessionRef.id,
        cycleId: cycle.id,
        studentUid: currentUser.uid,
        workspaceId: cycle.workspaceId,
        tabName,
        weekNumber: currentWeek.weekNumber,
        status: 'in_progress',
        date: Timestamp.fromDate(new Date(`${todayStr()}T00:00:00`)),
        startedAt: serverTimestamp(),
        hasVideos: false,
        feedbackStatus: 'none',
      });

      notifyTrainer(
        cycle.workspaceId,
        `🏋️ Comecei o treino *${tabName}* (Semana ${currentWeek.weekNumber}).`,
      ).catch(() => {/* notification is a convenience, never a blocker */});

      return { cycleId: cycle.id, sessionId: sessionRef.id, redirected: false };
    } catch {
      setActionError('Não foi possível iniciar a sessão. Tente novamente.');
      return null;
    } finally {
      setPendingAction(null);
    }
  };

  // ── Skip a tab for the current week ─────────────────────────────────────────

  const skipSession = async (tabName: string): Promise<void> => {
    if (!currentUser || !cycle || !currentWeek || pendingAction) return;

    const existing = sessionByTab.get(tabName);
    if (existing?.status === 'in_progress') {
      const confirmed = window.confirm(
        `Pular o treino "${tabName}"? O progresso já preenchido nesta sessão será descartado.`,
      );
      if (!confirmed) return;
    }

    setActionError('');
    setPendingAction({ tab: tabName, kind: 'skip' });
    try {
      if (existing) {
        await updateDoc(doc(db, 'sessions', existing.id), {
          status: 'skipped',
          skippedAt: serverTimestamp(),
        });
      } else {
        const sessionRef = doc(collection(db, 'sessions'));
        await setDoc(sessionRef, {
          id: sessionRef.id,
          cycleId: cycle.id,
          studentUid: currentUser.uid,
          workspaceId: cycle.workspaceId,
          tabName,
          weekNumber: currentWeek.weekNumber,
          status: 'skipped',
          date: Timestamp.fromDate(new Date(`${todayStr()}T00:00:00`)),
          startedAt: serverTimestamp(),
          skippedAt: serverTimestamp(),
          hasVideos: false,
          feedbackStatus: 'none',
        });
      }
    } catch {
      setActionError('Não foi possível pular esse treino. Tente novamente.');
    } finally {
      setPendingAction(null);
    }
  };

  return {
    weeks,
    currentWeek,
    nextWeekNumber,
    startingWeek,
    startWeek,

    sheetTabs,
    sheetTabsLoading,
    sheetTabsError,
    retryLoadSheetTabs: () => cycle?.googleSheetId && loadSheetTabs(cycle.googleSheetId),

    sessions,
    sessionsLoading,
    sessionsThisWeek,
    rows,
    canStartNextWeek,

    pendingAction,
    actionError,
    startSession,
    skipSession,
  };
}
