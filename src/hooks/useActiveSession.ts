import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './useAuth';
import type { Session } from '../types';

/**
 * Real-time lookup of the current student's in-progress session, if any.
 * Powers both the "one active session at a time" guard in `CycleDetail` and
 * the global "Ver treino atual" banner — a student can only ever be "inside"
 * one workout, reachable from anywhere even after a logout/relogin.
 */
export function useActiveSession(): Session | null {
  const { currentUser, userProfile } = useAuth();
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const isStudent = !!currentUser && userProfile?.role === 'student';

  useEffect(() => {
    if (!isStudent || !currentUser) return;
    const q = query(
      collection(db, 'sessions'),
      where('studentUid', '==', currentUser.uid),
      where('status', '==', 'in_progress'),
      limit(1),
    );
    return onSnapshot(q, (snap) => {
      setActiveSession(snap.empty ? null : (snap.docs[0].data() as Session));
    });
  }, [currentUser, isStudent]);

  // Gate the returned value rather than resetting state on role change —
  // avoids a synchronous setState in the effect for the non-student branch.
  return isStudent ? activeSession : null;
}
