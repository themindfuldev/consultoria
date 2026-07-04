import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { LoadingSpinner } from './LoadingSpinner';

interface ProtectedRouteProps {
  children: ReactNode;
  /**
   * Which kind of user this route is for:
   * - 'student' → Google-authenticated student with a `users` profile
   * - 'trainer' → email-link-authenticated trainer with a `trainers` record
   */
  role?: 'trainer' | 'student';
  /**
   * When false, the route is accessible to a signed-in student without a
   * Firestore profile yet. Used for the /onboarding route. Defaults to true.
   */
  requireProfile?: boolean;
}

export function ProtectedRoute({
  children,
  role,
  requireProfile = true,
}: ProtectedRouteProps) {
  const { currentUser, userProfile, trainerProfile, loading } = useAuth();
  const location = useLocation();

  if (loading) return <LoadingSpinner />;

  // ── Trainer routes ──────────────────────────────────────────────────────────
  if (role === 'trainer') {
    if (!currentUser) {
      // Bounce to the trainer login, remembering where they were headed so the
      // magic link returns them here.
      const next = encodeURIComponent(location.pathname + location.search);
      return <Navigate to={`/trainer/login?next=${next}`} replace />;
    }
    // Signed-in student landing on a trainer route → send them home.
    if (userProfile) return <Navigate to="/student" replace />;
    return <>{children}</>;
  }

  // ── Student routes ────────────────────────────────────────────────────────────

  // Must be authenticated.
  if (!currentUser) return <Navigate to="/" replace />;

  // A trainer (email-link) landing on a student route → send to their dashboard.
  if (trainerProfile && !userProfile) return <Navigate to="/trainer" replace />;

  // If requireProfile, must have a Firestore student profile.
  if (requireProfile && !userProfile) return <Navigate to="/onboarding" replace />;

  // If the user has a profile but is on /onboarding, redirect them home.
  if (!requireProfile && userProfile) return <Navigate to="/student" replace />;

  return <>{children}</>;
}
