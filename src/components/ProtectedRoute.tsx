import React from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import type { UserRole } from '../types';

interface ProtectedRouteProps {
  children: React.ReactNode;
  role: UserRole;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, role }) => {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
      </div>
    );
  }

  if (!user) return <Navigate to="/" replace />;

  // User signed in but hasn't chosen a role yet → back to Landing for role selection
  if (!profile) return <Navigate to="/" replace />;

  // Wrong role → redirect to their correct dashboard
  if (profile.role !== role) {
    return <Navigate to={profile.role === 'trainer' ? '/trainer' : '/student'} replace />;
  }

  return <>{children}</>;
};
