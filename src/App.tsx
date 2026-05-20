import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { useDarkMode } from './hooks/useDarkMode';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { Landing } from './pages/Landing';
import { TrainerDashboard } from './pages/TrainerDashboard';
import { StudentDashboard } from './pages/StudentDashboard';

/**
 * Sits inside AuthProvider so it can pass the authenticated profile's
 * language to LanguageProvider, keeping the UI in sync with Firestore.
 */
const AppShell: React.FC = () => {
  const { user, profile } = useAuth();
  useDarkMode(); // initialises dark class on <html> from localStorage

  return (
    <LanguageProvider
      userUid={profile?.uid}
      initialLanguage={profile?.selectedLanguage}
    >
      <BrowserRouter>
        <Routes>
          {/* Public: landing / sign-in */}
          <Route
            path="/"
            element={
              user && profile ? (
                <Navigate to={profile.role === 'trainer' ? '/trainer' : '/student'} replace />
              ) : (
                <Landing />
              )
            }
          />

          {/* Trainer */}
          <Route
            path="/trainer/*"
            element={
              <ProtectedRoute role="trainer">
                <Layout>
                  <TrainerDashboard />
                </Layout>
              </ProtectedRoute>
            }
          />

          {/* Student */}
          <Route
            path="/student/*"
            element={
              <ProtectedRoute role="student">
                <Layout>
                  <StudentDashboard />
                </Layout>
              </ProtectedRoute>
            }
          />

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </LanguageProvider>
  );
};

const App: React.FC = () => <AppShell />;

export default App;
