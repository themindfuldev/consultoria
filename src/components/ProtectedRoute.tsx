import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { LoadingSpinner } from './LoadingSpinner';

interface ProtectedRouteProps {
  children: ReactNode;
  /**
   * Which section this route belongs to:
   * - 'student'  → requires a `users` profile (the Google account is a student)
   * - 'trainer'  → requires trainer eligibility (invited as a trainer by email)
   * A single account may hold both capabilities and switch between them; the
   * active `mode` is kept in sync with whichever section is being viewed.
   */
  role?: 'trainer' | 'student';
  /**
   * When false, the route is accessible to a signed-in user without a Firestore
   * student profile yet. Used for the /onboarding route. Defaults to true.
   */
  requireProfile?: boolean;
}

export function ProtectedRoute({
  children,
  role,
  requireProfile = true,
}: ProtectedRouteProps) {
  const { currentUser, userProfile, trainerEligible, mode, setMode, loading } = useAuth();

  // Keep the active mode in sync with the section being viewed, so the header
  // menu and the post-login default landing reflect where the user actually is.
  // Only switches when the user has the capability for this route — the guards
  // below handle users who don't.
  useEffect(() => {
    if (loading || !currentUser || !role) return;
    if (role === 'trainer' && trainerEligible && mode !== 'trainer') setMode('trainer');
    if (role === 'student' && mode !== 'student') setMode('student');
  }, [loading, currentUser, role, trainerEligible, mode, setMode]);

  if (loading) return <LoadingSpinner />;

  // Every protected route requires a signed-in account.
  if (!currentUser) return <Navigate to="/" replace />;

  // ── Trainer routes ──────────────────────────────────────────────────────────
  if (role === 'trainer') {
    // Not invited as a trainer → nothing to see here; send to the student side.
    if (!trainerEligible) return <Navigate to="/student" replace />;
    return <>{children}</>;
  }

  // ── Student routes (and the profile-less /onboarding route) ─────────────────

  // If a student profile is required, bounce to onboarding until it exists.
  if (requireProfile && !userProfile) return <Navigate to="/onboarding" replace />;

  // Already onboarded but sitting on /onboarding → send home.
  if (!requireProfile && userProfile) return <Navigate to="/student" replace />;

  return <>{children}</>;
}
