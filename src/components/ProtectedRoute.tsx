import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { LoadingSpinner } from './LoadingSpinner';

interface ProtectedRouteProps {
  children: ReactNode;
  /** If provided, redirects users whose role doesn't match. */
  role?: 'trainer' | 'student';
  /**
   * When false, the route is accessible even without a Firestore profile.
   * Used for the /onboarding route.  Defaults to true.
   */
  requireProfile?: boolean;
}

export function ProtectedRoute({
  children,
  role,
  requireProfile = true,
}: ProtectedRouteProps) {
  const { currentUser, userProfile, loading } = useAuth();

  if (loading) return <LoadingSpinner />;

  // Must be authenticated.
  if (!currentUser) return <Navigate to="/" replace />;

  // If requireProfile, must have a Firestore profile.
  if (requireProfile && !userProfile) return <Navigate to="/onboarding" replace />;

  // If the user has a profile but is already on /onboarding, redirect them home.
  if (!requireProfile && userProfile) {
    const dest = userProfile.role === 'trainer' ? '/trainer' : '/student';
    return <Navigate to={dest} replace />;
  }

  // Role-based guard.
  if (role && userProfile && userProfile.role !== role) {
    const dest = userProfile.role === 'trainer' ? '/trainer' : '/student';
    return <Navigate to={dest} replace />;
  }

  return <>{children}</>;
}
