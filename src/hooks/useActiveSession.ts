import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import type { Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './useAuth';
import { isSessionOpen } from '../utils/session';
import type { Session } from '../types';

/**
 * Ranks a session by how recently it was started, for picking the newest one.
 *
 * Two cases need care beyond a plain `toMillis()`:
 *  - `null` — a `serverTimestamp()` that hasn't round-tripped yet. The local
 *    snapshot fires before the server resolves it, and a session written this
 *    instant is by definition the most recent one.
 *  - missing — a legacy session doc from before `startedAt` was recorded.
 *    Nothing better to go on, so it ranks oldest and only wins if it's alone.
 */
function startedRank(session: Session): number {
  const startedAt = session.startedAt as Timestamp | null | undefined;
  if (startedAt === undefined) return 0;
  if (startedAt === null) return Number.MAX_SAFE_INTEGER;
  return startedAt.toMillis?.() ?? 0;
}

/**
 * Real-time lookup of the student's current session — the one the global
 * "Treino em andamento" bar links to, reachable from anywhere even after a
 * logout/relogin.
 *
 * Nothing stops a student from having several workouts in progress at once
 * (two programs running in parallel, or a session left unconcluded), and since
 * an open session has no time limit, those stack up rather than ageing out. So
 * this deliberately returns **one**: the most recently started. Picking the
 * newest client-side — rather than `orderBy('startedAt')` in the query — keeps
 * legacy sessions that have no `startedAt` from being dropped from the result
 * set entirely, and needs no composite index. The set being ranked is a
 * student's open workouts, so it's a handful of docs at most.
 */
export function useActiveSession(): Session | null {
  const { currentUser, userProfile } = useAuth();
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const isStudent = !!currentUser && !!userProfile;

  useEffect(() => {
    if (!isStudent || !currentUser) return;
    const q = query(
      collection(db, 'sessions'),
      where('studentUid', '==', currentUser.uid),
      where('status', '==', 'in_progress'),
    );
    return onSnapshot(q, (snap) => {
      const open = snap.docs.map((d) => d.data() as Session).filter(isSessionOpen);
      setActiveSession(
        open.reduce<Session | null>(
          (newest, s) => (!newest || startedRank(s) > startedRank(newest) ? s : newest),
          null,
        ),
      );
    });
  }, [currentUser, isStudent]);

  // Gate the returned value rather than resetting state on role change —
  // avoids a synchronous setState in the effect for the non-student branch.
  return isStudent ? activeSession : null;
}
