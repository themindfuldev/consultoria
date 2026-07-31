import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './useAuth';
import { isSessionOpen } from '../utils/session';
import type { Session } from '../types';

/**
 * Real-time lookup of the current student's *open* session, if any — a workout
 * that's in progress, for as long as it stays that way. Powers both the "one
 * active session at a time" guard in `useCycleWeek` and the global "Treino em
 * andamento" bar — a student can only ever be "inside" one workout, reachable
 * from anywhere even after a logout/relogin, until they conclude or skip it.
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
      limit(1),
    );
    return onSnapshot(q, (snap) => {
      const s = snap.empty ? null : (snap.docs[0].data() as Session);
      setActiveSession(s && isSessionOpen(s) ? s : null);
    });
  }, [currentUser, isStudent]);

  // Gate the returned value rather than resetting state on role change —
  // avoids a synchronous setState in the effect for the non-student branch.
  return isStudent ? activeSession : null;
}
