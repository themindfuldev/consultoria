import { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { LoadingSpinner } from '../../components/LoadingSpinner';
import { OfflineSession } from '../OfflineSession';
import { SessionDetail } from './SessionDetail';

/**
 * Single public entry point for a session URL. It auto-switches by auth state:
 *
 * - signed-in student → the full live `SessionDetail` (auth, Firebase, Drive);
 * - signed-out / token expired → the dependency-free, read-only `OfflineSession`
 *   snapshot viewer.
 *
 * This merges what used to be two destinations (the protected live page and the
 * standalone `/offline/:sessionId` viewer) into one URL, so a student who gets
 * logged out mid-workout stays on the same page and simply sees the offline
 * fallback — no separate button or route.
 */
export function SessionRoute() {
  const { currentUser, userProfile, mode, setMode, loading } = useAuth();

  // Keep the active mode as "student" while on a session page, mirroring the
  // guard the old ProtectedRoute applied — so the header menu shows the student
  // section rather than a leftover trainer view.
  useEffect(() => {
    if (loading || !currentUser) return;
    if (mode !== 'student') setMode('student');
  }, [loading, currentUser, mode, setMode]);

  if (loading) return <LoadingSpinner />;

  // Signed out → static offline snapshot (survives token expiry / logout).
  if (!currentUser) return <OfflineSession />;

  // Signed in but not onboarded as a student yet → finish onboarding first.
  if (!userProfile) return <Navigate to="/onboarding" replace />;

  return <SessionDetail />;
}
