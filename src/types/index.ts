import type { Timestamp } from 'firebase/firestore';

// ── Primitives ────────────────────────────────────────────────────────────────

export type Language = 'en' | 'pt-BR';
export type UserRole = 'trainer' | 'student';
export type StudentStatus = 'pending' | 'active' | 'read-only';

// ── Firestore Collections ─────────────────────────────────────────────────────

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: UserRole;
  selectedLanguage: Language;
  createdAt: Timestamp;
}

export interface Workspace {
  id: string;
  trainerUid: string;
  trainerEmail: string;
  trainerName: string;
  language: Language;
  logoURL?: string;
  exerciseLibrarySheetId?: string;
  exerciseLibraryCreatedAt?: Timestamp;
  rootDriveFolderId?: string;
  feedbackFolderId?: string;
  setupComplete?: boolean;
  createdAt: Timestamp;
}

export interface StudentWorkspace {
  id: string;
  studentUid: string;           // empty string when status is 'pending'
  studentEmail: string;
  studentName?: string;         // denormalized on accept, for display in trainer view
  workspaceId: string;
  status: StudentStatus;
  joinedAt?: Timestamp;
  emailPreferences: {
    morningEmailEnabled: boolean;
    sessionDays: Record<string, number>; // sessionKey → day-of-week (0=Sun … 6=Sat)
  };
}

export interface TrainingCycle {
  id: string;
  workspaceId: string;
  studentUid: string;
  name: string;
  startDate: Timestamp;
  endDate: Timestamp;
  isActive: boolean;
  totalWeeks: number;
}

export interface SessionDefinition {
  tabName: string;
  sessionKey: string;
}

export interface WeeklySheet {
  id: string;
  cycleId: string;
  workspaceId: string;
  studentUid: string;
  weekNumber: number;
  weekStartDate: Timestamp;
  googleSheetId: string;
  googleSheetUrl: string;
  sessions: SessionDefinition[];
  createdAt: Timestamp;
}

export interface WorkoutExerciseCache {
  exerciseName: string;
  setIndex: number;
  plannedReps: number;
  plannedLoad: number;
  plannedRpe: number;
  actualReps?: number;
  actualLoad?: number;
  actualRpe?: number;
  wasCustomized: boolean;
  isDone: boolean;
  observations?: string;
}

export interface WorkoutLog {
  id: string;
  studentUid: string;
  workspaceId: string;
  cycleId: string;
  weeklySheetId: string;
  sessionKey: string;
  sessionTabName: string;
  googleSheetId: string;
  status: 'in_progress' | 'completed';
  startedAt: Timestamp;
  finishedAt?: Timestamp;
  preWorkout: {
    energyLevel: 1 | 2 | 3 | 4 | 5;
    feeling: 'well' | 'not-well';
  };
  postWorkout?: {
    feeling: 'same' | 'better' | 'worse';
  };
  exerciseCache: WorkoutExerciseCache[];
}

export interface Feedback {
  id: string;
  workoutLogId: string;
  studentUid: string;
  workspaceId: string;
  trainerUid: string;
  googleDocId: string;
  googleDocUrl: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
