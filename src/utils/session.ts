import type { Session } from '../types';

/**
 * True if `session` is the student's current workout — i.e. it's running right
 * now. A **paused** session is deliberately not "open": it's still resumable,
 * but the student has said they're not training it at the moment, so it stops
 * claiming the "Treino em andamento" bar.
 *
 * There is otherwise no time limit: a workout stays open, resumable and
 * banner-worthy until the student pauses, concludes or skips it, however many
 * days that takes. The header's duration reports the elapsed span minus paused
 * time (days included), so a session left running is visible rather than
 * silently dropped.
 */
export function isSessionOpen(session: Session): boolean {
  return session.status === 'in_progress';
}

/**
 * Where "Despular" puts a session back — the state it was in before it was
 * skipped, reconstructed from the stamps it still carries.
 *
 * Paused comes first: an open pause interval is only closed (and folded into
 * `pausedMs`) by resuming, so returning a paused-then-skipped session straight
 * to `in_progress` would silently drop that interval and inflate its duration.
 */
export function unskippedStatus(session: Session): Session['status'] {
  if (session.pausedAt) return 'paused';
  return session.preWorkout ? 'in_progress' : 'pending';
}

const OFFLINE_PREFIX = 'offline_session_';

export function offlineKey(sessionId: string): string {
  return `${OFFLINE_PREFIX}${sessionId}`;
}

/**
 * Removes every cached offline-export snapshot from localStorage. Starting a
 * new workout invalidates whatever was cached for offline use.
 */
export function clearOfflineSnapshots(): void {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key?.startsWith(OFFLINE_PREFIX)) localStorage.removeItem(key);
  }
}

export interface OfflineRef {
  sessionId: string;
  /** Cycle the snapshot belongs to — lets callers build the full session URL.
   *  Absent on older snapshots saved before cycleId was stored. */
  cycleId?: string;
  tabName: string;
  savedAt: number;
}

/**
 * Returns the most recent offline snapshot in localStorage, or null. Powers the
 * login-page "offline session available" entry that lets a signed-out student
 * reopen their in-progress workout. Snapshots don't age out — like the sessions
 * they mirror, they live until the workout is finished (which removes the
 * snapshot) or a new one is started (which clears them all).
 */
export function findCurrentOfflineSession(): OfflineRef | null {
  let best: OfflineRef | null = null;
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (!key?.startsWith(OFFLINE_PREFIX)) continue;
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as { savedAt: number; tabName?: string; cycleId?: string };
      if (!best || parsed.savedAt > best.savedAt) {
        best = {
          sessionId: key.slice(OFFLINE_PREFIX.length),
          cycleId: parsed.cycleId,
          tabName: parsed.tabName ?? 'Treino',
          savedAt: parsed.savedAt,
        };
      }
    } catch {
      localStorage.removeItem(key);
    }
  }
  return best;
}
