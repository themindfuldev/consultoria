import { useEffect, useRef } from 'react';
import { useAuth } from './useAuth';

/**
 * Proactively re-authorizes Google when a student opens a page that needs
 * Sheets/Drive access.
 *
 * The GIS access token only lives ~1h, so by the next day it's expired. Without
 * this, the page would fire a background data load, fail the silent refresh,
 * and leave the student to click "Tentar novamente" (the gesture that finally
 * lets Google's popup open). Here we instead detect the stale token on open and
 * kick off the authorization right away.
 *
 * Note: browsers only allow the Google popup to open from a user gesture, so on
 * a hard page reload it may still be blocked — the retry action remains as a
 * fallback. Allowing pop-ups for this site makes the refresh fully automatic.
 *
 * Safe to call unconditionally; it no-ops for non-students and when a valid
 * token is already cached, and only fires once per mount.
 */
export function useGoogleTokenWarmup(): void {
  const { userProfile, getAccessToken, isGoogleTokenValid } = useAuth();
  const triedRef = useRef(false);

  useEffect(() => {
    if (userProfile?.role !== 'student') return;
    if (triedRef.current || isGoogleTokenValid()) return;
    triedRef.current = true;
    // Errors here are surfaced by the actual data calls (and their retry UI).
    getAccessToken().catch(() => {});
  }, [userProfile, getAccessToken, isGoogleTokenValid]);
}
