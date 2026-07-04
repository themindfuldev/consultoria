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
  // Local date (not toISOString, which is UTC and rolls to the next day in the
  // evening for negative-UTC zones — that caused session dates to drift +1 day).
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
  const [concludingWeek, setConcludingWeek] = useState(false);
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

  // ── Backfill `order` on legacy sessions ─────────────────────────────────────
  // Sessions created before the `order` field existed would otherwise reshuffle
  // each time the slower live Sheets fetch lands. Stamp them once (no-ops as
  // soon as every session has an order), using the current sheet position.

  useEffect(() => {
    const week = weeks[0];
    if (!week || sheetTabs.length === 0) return;
    for (const s of sessions) {
      if (s.weekNumber !== week.weekNumber || typeof s.order === 'number') continue;
      const idx = sheetTabs.indexOf(s.tabName);
      if (idx >= 0) updateDoc(doc(db, 'sessions', s.id), { order: idx }).catch(() => {/* best-effort */});
    }
  }, [sheetTabs, sessions, weeks]);

  // ── Derived state ────────────────────────────────────────────────────────────

  const currentWeek = weeks[0] ?? null;
  const nextWeekNumber = (currentWeek?.weekNumber ?? 0) + 1;

  const currentWeekStatus: 'in_progress' | 'completed' | null = currentWeek
    ? (currentWeek.status ?? 'in_progress')
    : null;
  const currentWeekConcluded = currentWeekStatus === 'completed';

  const sessionsThisWeek = currentWeek
    ? sessions.filter((s) => s.weekNumber === currentWeek.weekNumber)
    : [];

  const sessionByTab = new Map(sessionsThisWeek.map((s) => [s.tabName, s] as const));

  // Stable order index for a session: prefer the `order` baked in at creation
  // (so rows don't reshuffle when the slower live Sheets fetch arrives); fall
  // back to the current sheet position for legacy sessions created before that.
  const tabOrder = (tabName: string): number => {
    const i = sheetTabs.indexOf(tabName);
    return i >= 0 ? i : Number.MAX_SAFE_INTEGER;
  };
  const sessionOrder = (s: Session): number =>
    typeof s.order === 'number' ? s.order : tabOrder(s.tabName);

  // Current-week rows are driven by the sessions persisted for this week, sorted
  // by their stable order. Any sheet tabs that don't have a session yet (new
  // tabs) are appended at the end.
  const sortedThisWeek = [...sessionsThisWeek].sort((a, b) => {
    const d = sessionOrder(a) - sessionOrder(b);
    return d !== 0 ? d : a.tabName.localeCompare(b.tabName);
  });
  const tabsWithSession = new Set(sessionsThisWeek.map((s) => s.tabName));
  const rows: TabSessionRow[] = [
    ...sortedThisWeek.map((s) => ({ tab: s.tabName, session: s })),
    ...sheetTabs.filter((t) => !tabsWithSession.has(t)).map((t) => ({ tab: t, session: null })),
  ];

  // Past weeks (everything below the latest) shown as read-only accordions, each
  // built from that week's own session docs (the live sheet may have changed).
  const pastWeeks: { week: CycleWeek; rows: TabSessionRow[] }[] = weeks.slice(1).map((w) => ({
    week: w,
    rows: sessions
      .filter((s) => s.weekNumber === w.weekNumber)
      .sort((a, b) => {
        const d = (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER);
        return d !== 0 ? d : a.tabName.localeCompare(b.tabName);
      })
      .map((s) => ({ tab: s.tabName, session: s })),
  }));

  // A week can only be *concluded* once every training day has reached a terminal
  // state (completed or skipped). We gate on the rows (all tabs), not just the
  // existing session docs, so an un-opened tab still blocks conclusion.
  const canConcludeWeek =
    !!currentWeek &&
    !currentWeekConcluded &&
    rows.length > 0 &&
    rows.every((r) => r.session?.status === 'completed' || r.session?.status === 'skipped');

  // The next week can only be started once the current one is concluded — or
  // when there's no week at all yet (the very first week).
  const canStartNextWeek = !currentWeek || currentWeekConcluded;

  // ── Start week ───────────────────────────────────────────────────────────────

  const startWeek = async () => {
    if (!cycleId || !cycle || !currentUser || startingWeek) return;
    setStartingWeek(true);
    setWeekError('');
    try {
      // Always re-read the spreadsheet: the trainer may have updated the plan for
      // the new week, so the new week's sessions come from the *current* tabs.
      let tabs: string[] = [];
      if (cycle.googleSheetId) {
        const token = await getAccessToken();
        tabs = await getTrainingTabs(cycle.googleSheetId, token);
        setSheetTabs(tabs);
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
        status: 'in_progress',
        startedAt: serverTimestamp(),
      });

      // Save every training tab as a pending session under the new week, so the
      // student sees the full week's plan with Abrir/Pular actions right away.
      const today = Timestamp.fromDate(new Date(`${todayStr()}T00:00:00`));
      await Promise.all(
        tabs.map((tab, index) => {
          const sessionRef = doc(collection(db, 'sessions'));
          return setDoc(sessionRef, {
            id: sessionRef.id,
            cycleId: cycle.id,
            studentUid: currentUser.uid,
            trainerEmail: cycle.trainerEmail ?? '',
            studentName: cycle.studentName ?? '',
            studentWhatsapp: cycle.studentWhatsapp ?? '',
            tabName: tab,
            order: index,
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

  // ── Conclude the current week (locks its sessions read-only) ────────────────

  const concludeWeek = async () => {
    if (!cycleId || !currentWeek || concludingWeek) return;
    setConcludingWeek(true);
    setWeekError('');
    try {
      await updateDoc(doc(db, 'cycles', cycleId, 'weeks', currentWeek.id), {
        status: 'completed',
        completedAt: serverTimestamp(),
      });
    } catch {
      setWeekError('Não foi possível concluir a semana. Tente novamente.');
    } finally {
      setConcludingWeek(false);
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
        trainerEmail: cycle.trainerEmail ?? '',
        studentName: cycle.studentName ?? '',
        studentWhatsapp: cycle.studentWhatsapp ?? '',
        tabName,
        order: tabOrder(tabName),
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
    if (pendingAction || currentWeekConcluded) return;
    setActionError('');
    setPendingAction({ tab: session.tabName, kind: 'unskip' });
    try {
      await updateDoc(doc(db, 'sessions', session.id), {
        // Return to where it was before being skipped.
        status: session.preWorkout ? 'in_progress' : 'pending',
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
    if (!currentUser || !cycle || !currentWeek || pendingAction || currentWeekConcluded) return;

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
          trainerEmail: cycle.trainerEmail ?? '',
          studentName: cycle.studentName ?? '',
          studentWhatsapp: cycle.studentWhatsapp ?? '',
          tabName,
          order: tabOrder(tabName),
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
    cycleId,
    weeks,
    currentWeek,
    currentWeekStatus,
    currentWeekConcluded,
    nextWeekNumber,
    pastWeeks,
    startingWeek,
    concludingWeek,
    weekError,
    startWeek,
    concludeWeek,

    sheetTabs,
    sheetTabsLoading,
    sheetTabsError,
    retryLoadSheetTabs: () => cycle?.googleSheetId && loadSheetTabs(cycle.googleSheetId),

    sessions,
    sessionsLoading,
    sessionsThisWeek,
    rows,
    canConcludeWeek,
    canStartNextWeek,

    pendingAction,
    actionError,
    openSession,
    skipSession,
    unskipSession,
  };
}
