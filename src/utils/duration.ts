/**
 * duration.ts
 *
 * Formats an elapsed span of time as `HH:mm`. Shared by the live session header
 * and the offline viewer so both render session duration identically.
 */

/**
 * Elapsed milliseconds as `HH:mm` (hours can exceed 24 for a long-open
 * session). Returns an empty string for a non-positive span.
 */
export function formatDuration(ms: number): string {
  if (ms <= 0) return '';
  const totalMinutes = Math.floor(ms / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
