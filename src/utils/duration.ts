/**
 * duration.ts
 *
 * Formats an elapsed span of time. Shared by the live session header and the
 * offline viewer so both render session duration identically.
 */

/**
 * Net elapsed milliseconds of a session: the span from `startedAt` to `endedAt`
 * minus the time it spent paused.
 *
 * `endedAt` is whichever "now" applies to the session's state — the live clock
 * while training, `pausedAt` while paused (which freezes the reading), or
 * `finishedAt` once concluded. Clamped at zero: `pausedMs` is accumulated from
 * client-side deltas while the stamps are server-side, so a very short pause can
 * leave the subtraction fractionally negative.
 */
export function netElapsedMs(startedAt: number, endedAt: number, pausedMs = 0): number {
  return Math.max(0, endedAt - startedAt - pausedMs);
}

/**
 * Elapsed milliseconds as `HH:mm`, prefixed with whole days once the span
 * reaches 24h (`2d 03:15`). A session left open overnight — or across a few
 * days, which happens when a student forgets to conclude it — would otherwise
 * read as a bare `75:15`, which is easy to misread as hours-of-training.
 * A non-positive span reads `00:00` rather than disappearing — a session paused
 * the moment it started still has a duration, it's just zero so far.
 */
export function formatDuration(ms: number): string {
  if (ms <= 0) return '00:00';
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  const clock = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  return days > 0 ? `${days}d ${clock}` : clock;
}
