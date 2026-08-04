/**
 * useWakeLock
 *
 * Holds a screen wake lock for the duration of a long foreground task so the
 * phone doesn't auto-lock partway through. Compressing and uploading a video
 * takes minutes of CPU time, and once the screen locks the browser freezes the
 * page — including the ffmpeg Web Worker — so the job stalls until the user
 * comes back.
 *
 * This only covers the auto-lock case. Switching to another app still freezes
 * the page: the platform releases the lock on hide, and no web API grants a
 * page sustained background CPU.
 *
 * Usage:
 *   const wakeLock = useWakeLock();
 *   await wakeLock.acquire();
 *   try { ...long task... } finally { wakeLock.release(); }
 *
 * Unsupported browsers (iOS < 16.4, and installed PWAs before iOS 18.4 where
 * the API existed but was broken) resolve to a no-op — the task still runs.
 */

import { useCallback, useEffect, useRef } from 'react';

export function useWakeLock() {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  // Whether a caller currently wants the lock held. Kept separate from the
  // sentinel because the platform revokes the sentinel whenever the page is
  // hidden, and we need to know whether to take a fresh one on return.
  const wantedRef = useRef(false);

  const request = useCallback(async () => {
    if (!('wakeLock' in navigator) || sentinelRef.current) return;
    try {
      const sentinel = await navigator.wakeLock.request('screen');
      // A lock released by the platform (screen off, tab hidden) fires this;
      // clearing the ref lets the visibilitychange handler re-request it.
      sentinel.addEventListener('release', () => {
        if (sentinelRef.current === sentinel) sentinelRef.current = null;
      });
      sentinelRef.current = sentinel;
    } catch {
      // NotAllowedError — battery saver, no user activation, or an OS policy.
      // Nothing to do: the caller's task proceeds without the lock.
    }
  }, []);

  const acquire = useCallback(async () => {
    wantedRef.current = true;
    await request();
  }, [request]);

  const release = useCallback(() => {
    wantedRef.current = false;
    const sentinel = sentinelRef.current;
    sentinelRef.current = null;
    void sentinel?.release().catch(() => {
      // Already released by the platform.
    });
  }, []);

  // Re-acquire on return to the foreground: the platform drops the lock every
  // time the page is hidden, so without this a single app switch would leave
  // the rest of a long upload unprotected.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (wantedRef.current && document.visibilityState === 'visible') {
        void request();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      void sentinelRef.current?.release().catch(() => {});
      sentinelRef.current = null;
      wantedRef.current = false;
    };
  }, [request]);

  return { acquire, release };
}
