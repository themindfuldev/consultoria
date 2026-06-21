import { useEffect, useState } from 'react';
import {
  collection,
  deleteField,
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
import { getTrainingTabs } from '../services/sheetsService';
import type { Cycle, CycleWeek, Session } from '../types';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface TabSessionRow {
  tab: string;
  session: Session | null;
}

interface PendingAction {
  tab: string;
  kind: 'open' | 'skip' | 'unskip';
}

/**
 * Shared week/session-tab logic for a cycle — powers both the dashboard
 * card's compact panel and the full CycleDetail page so the "start week",
 * "start/continue/skip session", and "can advance to next week" rules live
 * in exactly one place.
 */
export function useCycleWeek(cycle: Cycle | null) {
  const { currentUser, getAccessToken } = useAuth();

  const cycleId = cycle?.id ?? null;

  const [weeks, setWeeks] = useState<CycleWeek[]>([]);
  const [startingWeek, setStartingWeek] = useState(false);
  const [weekError, setWeekError] = useState('');

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

  // Rows are driven by the sessions persisted for this week (created up-front
  // when the week starts), ordered to match the spreadsheet's tab order when
  // it's available — so a transient Sheets load error never hides the week's
  // already-saved sessions.
  const orderedTabs: string[] = [];
  const seenTabs = new Set<string>();
  for (const tab of [...sheetTabs, ...sessionsThisWeek.map((s) => s.tabName)]) {
    if (!seenTabs.has(tab)) { seenTabs.add(tab); orderedTabs.push(tab); }
  }
  const rows: TabSessionRow[] = orderedTabs.map((tab) => ({
    tab,
    session: sessionByTab.get(tab) ?? null,
  }));

  // The next week can only start once every training day of the current week
  // has reached a terminal state (completed or skipped) — never while one is
  // still pending or in progress. We gate on the persisted session docs (not
  // the live sheet) so the button only shows when we actually *know* the week
  // is done. Week 1 (no current week yet) is always startable.
  const canStartNextWeek =
    !currentWeek ||
    (sessionsThisWeek.length > 0 &&
      sessionsThisWeek.every((s) => s.status === 'completed' || s.status === 'skipped'));

  // ── Start week ───────────────────────────────────────────────────────────────

  const startWeek = async () => {
    if (!cycleId || !cycle || !currentUser || startingWeek) return;
    setStartingWeek(true);
    setWeekError('');
    try {
      // We pre-create one session per training tab, so we need the tab list up
      // front. Use what's already loaded; otherwise fetch it fresh so we never
      // create an empty week.
      let tabs = sheetTabs;
      if (tabs.length === 0 && cycle.googleSheetId) {
        const token = await getAccessToken();
        tabs = await getTrainingTabs(cycle.googleSheetId, token);
      }
      if (tabs.length === 0) {
        setWeekError('Não foi possível carregar os treinos da planilha. Tente novamente.');
        return;
      }

      const weekNumber = nextWeekNumber;
      const weekRef = doc(collection(db, 'cycles', cycleId, 'weeks'));
      await setDoc(weekRef, {
        id: weekRef.id,
        cycleId,
        weekNumber,
        startedAt: serverTimestamp(),
      });

      // Save every training tab as a pending session under the new week, so the
      // student sees the full week's plan with Iniciar/Pular actions right away.
      const today = Timestamp.fromDate(new Date(`${todayStr()}T00:00:00`));
      await Promise.all(
        tabs.map((tab) => {
          const sessionRef = doc(collection(db, 'sessions'));
          return setDoc(sessionRef, {
            id: sessionRef.id,
            cycleId: cycle.id,
            studentUid: currentUser!.uid,
            workspaceId: cycle.workspaceId,
            tabName: tab,
            weekNumber,
            status: 'pending',
            date: today,
            hasVideos: false,
            feedbackStatus: 'none',
          });
        }),
      );
    } catch {
      setWeekError('Não foi possível começar a semana. Tente novamente.');
    } finally {
      setStartingWeek(false);
    }
  };

  // ── Open a session for a given tab (without starting it) ────────────────────

  /**
   * Returns the id of the session for `tabName` so the caller can navigate to
   * its page — *without* marking it started. Opening just views the session;
   * it's only marked `in_progress` (and the trainer notified) once the student
   * fills the pre-workout questions and taps "Começar treino" on the session
   * page. Creates a pending session on the fly if one doesn't exist yet (legacy
   * weeks, or a tab added to the sheet after the week started).
   */
  const openSession = async (tabName: string): Promise<string | null> => {
    if (!currentUser || !cycle || !currentWeek) return null;

    const existing = sessionByTab.get(tabName);
    if (existing) return existing.id;

    setActionError('');
    setPendingAction({ tab: tabName, kind: 'open' });
    try {
      const sessionRef = doc(collection(db, 'sessions'));
      await setDoc(sessionRef, {
        id: sessionRef.id,
        cycleId: cycle.id,
        studentUid: currentUser.uid,
        workspaceId: cycle.workspaceId,
        tabName,
        weekNumber: currentWeek.weekNumber,
        status: 'pending',
        date: Timestamp.fromDate(new Date(`${todayStr()}T00:00:00`)),
        hasVideos: false,
        feedbackStatus: 'none',
      });
      return sessionRef.id;
    } catch {
      setActionError('Não foi possível abrir a sessão. Tente novamente.');
      return null;
    } finally {
      setPendingAction(null);
    }
  };

  // ── Un-skip a session (revert a skipped tab back to pending) ─────────────────

  const unskipSession = async (session: Session): Promise<void> => {
    if (pendingAction) return;
    setActionError('');
    setPendingAction({ tab: session.tabName, kind: 'unskip' });
    try {
      await updateDoc(doc(db, 'sessions', session.id), {
        status: 'pending',
        skippedAt: deleteField(),
      });
    } catch {
      setActionError('Não foi possível desfazer. Tente novamente.');
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
    weekError,
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
    openSession,
    skipSession,
    unskipSession,
  };
}
