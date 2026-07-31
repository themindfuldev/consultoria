import { useEffect } from 'react';
import { useAuth } from './useAuth';

/**
 * Keeps Google authorization fresh on student pages that need Sheets/Drive.
 *
 * The OAuth access token only lives ~1h, so it's commonly expired on a return
 * visit. When that happens we must re-authorize — but browsers only let the
 * Google popup open from a user gesture, so a gesture-less page load can't open
 * it on its own (which is why the old flow left you to click "Tentar novamente").
 *
 * Strategy:
 *  1. Try immediately — succeeds with no popup when the token can be refreshed
 *     silently (or when the browser happens to allow the popup).
 *  2. If a popup is still needed, open it on the *first* interaction anywhere on
 *     the page, so you never have to hunt for the retry link.
 *
 * No-ops for non-students and whenever a valid token is already cached (e.g.
 * right after sign-in, which now captures the token with the right scopes).
 */
/**
 * When the last gesture-less attempt was made, shared across every mount of the
 * hook. The hook now runs on several pages, so without this a student walking
 * dashboard → cycle → session would fire three doomed requests in a row; and a
 * request that failed once (popup blocked, offline) is unlikely to succeed a
 * second later. The gesture fallback below is unaffected — it always retries.
 */
let lastSilentAttempt = 0;
const SILENT_RETRY_MS = 60 * 1_000;

export function useGoogleTokenWarmup(): void {
  const { userProfile, getAccessToken, isGoogleTokenValid } = useAuth();

  useEffect(() => {
    if (!userProfile) return;
    if (isGoogleTokenValid()) return;

    // 1. Attempt right away (silent refresh, or popup if the browser allows it).
    if (Date.now() - lastSilentAttempt > SILENT_RETRY_MS) {
      lastSilentAttempt = Date.now();
      getAccessToken().catch(() => {});
    }

    // 2. Fallback: the first user gesture provides what the popup needs.
    const onFirstGesture = () => {
      if (isGoogleTokenValid()) {
        window.removeEventListener('pointerdown', onFirstGesture, true);
        return;
      }
      getAccessToken()
        .then(() => window.removeEventListener('pointerdown', onFirstGesture, true))
        .catch(() => {/* keep listening so a later gesture can retry */});
    };
    window.addEventListener('pointerdown', onFirstGesture, true);
    return () => window.removeEventListener('pointerdown', onFirstGesture, true);
  }, [userProfile, getAccessToken, isGoogleTokenValid]);
}
