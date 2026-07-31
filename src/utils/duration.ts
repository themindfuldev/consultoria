/**
 * duration.ts
 *
 * Formats an elapsed span of time. Shared by the live session header and the
 * offline viewer so both render session duration identically.
 */

/**
 * Elapsed milliseconds as `HH:mm`, prefixed with whole days once the span
 * reaches 24h (`2d 03:15`). A session left open overnight — or across a few
 * days, which happens when a student forgets to conclude it — would otherwise
 * read as a bare `75:15`, which is easy to misread as hours-of-training.
 * Returns an empty string for a non-positive span.
 */
export function formatDuration(ms: number): string {
  if (ms <= 0) return '';
  const totalMinutes = Math.floor(ms / 60_000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  const clock = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  return days > 0 ? `${days}d ${clock}` : clock;
}
