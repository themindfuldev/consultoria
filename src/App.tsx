import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoadingSpinner } from './components/LoadingSpinner';
import { Landing } from './pages/Landing';
import { Onboarding } from './pages/Onboarding';
import { TrainerDashboard } from './pages/trainer/TrainerDashboard';
import { TrainerFeedbackView } from './pages/trainer/TrainerFeedbackView';
import { StudentDashboard } from './pages/student/StudentDashboard';
import { TrainerSelect } from './pages/student/TrainerSelect';
import { PendingApproval } from './pages/student/PendingApproval';
import { AddCycle } from './pages/student/AddCycle';
import { CycleDetail } from './pages/student/CycleDetail';
import { SessionDetail } from './pages/student/SessionDetail';
import { FeedbackView } from './pages/student/FeedbackView';

export default function App() {
  const { loading } = useAuth();

  // Single top-level loading gate — prevents any route from rendering while
  // the initial Firebase Auth state is still resolving.
  if (loading) return <LoadingSpinner />;

  return (
    <Routes>
      {/* ── Public ─────────────────────────────────────────────────────── */}
      <Route path="/" element={<Landing />} />

      {/* ── Onboarding: auth required, NO profile required ─────────────── */}
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute requireProfile={false}>
            <Onboarding />
          </ProtectedRoute>
        }
      />

      {/* ── Trainer ────────────────────────────────────────────────────── */}
      <Route
        path="/trainer"
        element={
          <ProtectedRoute role="trainer">
            <TrainerDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/trainer/sessions/:sessionId"
        element={
          <ProtectedRoute role="trainer">
            <TrainerFeedbackView />
          </ProtectedRoute>
        }
      />

      {/* ── Student ────────────────────────────────────────────────────── */}
      <Route
        path="/student"
        element={
          <ProtectedRoute role="student">
            <StudentDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/select-trainer"
        element={
          <ProtectedRoute role="student">
            <TrainerSelect />
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/pending"
        element={
          <ProtectedRoute role="student">
            <PendingApproval />
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/add-cycle"
        element={
          <ProtectedRoute role="student">
            <AddCycle />
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/cycles/:cycleId"
        element={
          <ProtectedRoute role="student">
            <CycleDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/cycles/:cycleId/sessions/:sessionId"
        element={
          <ProtectedRoute role="student">
            <SessionDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/sessions/:sessionId/feedback"
        element={
          <ProtectedRoute role="student">
            <FeedbackView />
          </ProtectedRoute>
        }
      />

      {/* ── Fallback ───────────────────────────────────────────────────── */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
