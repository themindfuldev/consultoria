import { useEffect, useState } from 'react';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from './useAuth';
import { SESSION_OPEN_TTL_MS, isSessionOpen } from '../utils/session';
import type { Session } from '../types';

/**
 * Real-time lookup of the current student's *open* session, if any — an
 * in-progress workout opened within the last 4 hours (see SESSION_OPEN_TTL_MS).
 * Powers both the "one active session at a time" guard in `useCycleWeek` and
 * the global "Ver treino atual" banner — a student can only ever be "inside"
 * one workout, reachable from anywhere even after a logout/relogin, and only
 * while that workout is still fresh.
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
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = onSnapshot(q, (snap) => {
      if (expiryTimer) { clearTimeout(expiryTimer); expiryTimer = undefined; }
      const s = snap.empty ? null : (snap.docs[0].data() as Session);
      if (s && isSessionOpen(s)) {
        setActiveSession(s);
        // Drop it from "active" the moment its 4h window elapses, even without a
        // new snapshot — the Firestore status stays 'in_progress' but the banner
        // and guard should let go.
        const startedMs = s.startedAt?.toMillis?.();
        if (startedMs) {
          const msLeft = Math.max(0, SESSION_OPEN_TTL_MS - (Date.now() - startedMs));
          expiryTimer = setTimeout(() => setActiveSession(null), msLeft);
        }
      } else {
        setActiveSession(null);
      }
    });
    return () => {
      if (expiryTimer) clearTimeout(expiryTimer);
      unsubscribe();
    };
  }, [currentUser, isStudent]);

  // Gate the returned value rather than resetting state on role change —
  // avoids a synchronous setState in the effect for the non-student branch.
  return isStudent ? activeSession : null;
}
