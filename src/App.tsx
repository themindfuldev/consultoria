import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoadingSpinner } from './components/LoadingSpinner';
import { Landing } from './pages/Landing';
import { OfflineSession } from './pages/OfflineSession';
import { Onboarding } from './pages/Onboarding';
import { TrainerDashboard } from './pages/trainer/TrainerDashboard';
import { TrainerFeedbackView } from './pages/trainer/TrainerFeedbackView';
import { TrainerProfile } from './pages/trainer/TrainerProfile';
import { TrainerStudents } from './pages/trainer/TrainerStudents';
import { TrainerStudentDetail } from './pages/trainer/TrainerStudentDetail';
import { StudentDashboard } from './pages/student/StudentDashboard';
import { StudentProfile } from './pages/student/StudentProfile';
import { StudentTrainers } from './pages/student/StudentTrainers';
import { AddCycle } from './pages/student/AddCycle';
import { CycleDetail } from './pages/student/CycleDetail';
import { SessionDetail } from './pages/student/SessionDetail';
import { FeedbackView } from './pages/student/FeedbackView';
import { PickerPoc } from './pages/dev/PickerPoc';

export default function App() {
  const { loading } = useAuth();

  // Single top-level loading gate — prevents any route from rendering while
  // the initial Firebase Auth state is still resolving.
  if (loading) return <LoadingSpinner />;

  return (
    <Routes>
      {/* ── Public ─────────────────────────────────────────────────────── */}
      <Route path="/" element={<Landing />} />
      {/* Standalone static snapshot viewer — outside auth, survives logout/timeout */}
      <Route path="/offline/:sessionId" element={<OfflineSession />} />

      {/* ── Onboarding: auth required, NO profile required ─────────────── */}
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute requireProfile={false}>
            <Onboarding />
          </ProtectedRoute>
        }
      />

      {/* ── Trainer (email-link auth) ──────────────────────────────────── */}
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
      <Route
        path="/trainer/profile"
        element={
          <ProtectedRoute role="trainer">
            <TrainerProfile />
          </ProtectedRoute>
        }
      />
      <Route
        path="/trainer/students"
        element={
          <ProtectedRoute role="trainer">
            <TrainerStudents />
          </ProtectedRoute>
        }
      />
      <Route
        path="/trainer/students/:studentUid"
        element={
          <ProtectedRoute role="trainer">
            <TrainerStudentDetail />
          </ProtectedRoute>
        }
      />

      {/* ── Student (Google auth) ──────────────────────────────────────── */}
      <Route
        path="/student"
        element={
          <ProtectedRoute role="student">
            <StudentDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/profile"
        element={
          <ProtectedRoute role="student">
            <StudentProfile />
          </ProtectedRoute>
        }
      />
      <Route
        path="/student/trainers"
        element={
          <ProtectedRoute role="student">
            <StudentTrainers />
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

      {/* ── Dev-only: Picker + drive.file write proof-of-concept ───────── */}
      {import.meta.env.DEV && <Route path="/dev/picker-poc" element={<PickerPoc />} />}

      {/* ── Fallback ───────────────────────────────────────────────────── */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
