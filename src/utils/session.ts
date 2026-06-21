import type { Session } from '../types';

/**
 * How long a started workout stays "open" — resumable and worthy of the
 * "Ver treino atual" banner — after it was opened. Once this elapses the
 * session is considered abandoned/expired: it no longer drives the banner
 * nor the single-active-session guard, even though its Firestore status is
 * still 'in_progress'.
 */
export const SESSION_OPEN_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

/**
 * True if `session` is an in-progress workout opened within the last 4 hours —
 * i.e. genuinely the student's *current* session. An in-progress session older
 * than that has effectively expired.
 *
 * A freshly-created session whose `startedAt` server timestamp hasn't resolved
 * yet is treated as open (it was opened this instant).
 */
export function isSessionOpen(session: Session, now: number = Date.now()): boolean {
  if (session.status !== 'in_progress') return false;
  const startedMs = session.startedAt?.toMillis?.();
  if (!startedMs) return true; // just opened — server time not resolved yet
  return now - startedMs < SESSION_OPEN_TTL_MS;
}

/**
 * Removes every cached offline-export snapshot from localStorage. Starting a
 * new workout invalidates whatever was cached for offline use.
 */
export function clearOfflineSnapshots(): void {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i);
    if (key?.startsWith('offline_session_')) localStorage.removeItem(key);
  }
}
