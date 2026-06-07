import type { Timestamp } from 'firebase/firestore';

// ── User ──────────────────────────────────────────────────────────────────────

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  role: 'trainer' | 'student';
  /** E.164-style without '+', e.g. "5511999999999". Used to build wa.me links. */
  whatsappPhone: string;
  createdAt: Timestamp;
}

// ── Workspace (one per trainer) ───────────────────────────────────────────────

export interface Workspace {
  /** Document ID = trainer's email (stable, human-readable). */
  id: string;
  trainerUid: string;
  trainerEmail: string;
  trainerName: string;
  whatsappPhone: string;
  createdAt: Timestamp;
}

// ── Student ↔ Trainer connection ──────────────────────────────────────────────

export interface StudentWorkspace {
  /** Document ID = `${studentUid}_${workspaceId}`. */
  id: string;
  studentUid: string;
  studentEmail: string;
  studentName: string;
  /** workspaceId = trainer's email. */
  workspaceId: string;
  status: 'pending' | 'active';
  joinedAt?: Timestamp;
  createdAt: Timestamp;
}

// ── Cycles (Google Sheets programs) ──────────────────────────────────────────

export type Modality =
  | 'Força'
  | 'Mobilidade'
  | 'Cardio'
  | 'Competição'
  | 'Outro';

export const MODALITIES: readonly Modality[] = [
  'Força',
  'Mobilidade',
  'Cardio',
  'Competição',
  'Outro',
] as const;

export interface Cycle {
  id: string;
  studentUid: string;
  workspaceId: string;
  googleSheetId: string;
  googleSheetUrl: string;
  title: string;
  modality: Modality;
  modalityCustom?: string;
  status: 'active' | 'archived';
  startDate: Timestamp;
  archivedAt?: Timestamp;
  createdAt: Timestamp;
  /** Denormalised from the trainer's workspace doc at creation time — avoids extra queries when rendering cycle cards. */
  trainerName?: string;
  trainerEmail?: string;
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export interface Session {
  id: string;
  cycleId: string;
  studentUid: string;
  workspaceId: string;
  tabName: string;
  status: 'in_progress' | 'completed';
  date: Timestamp;
  startedAt: Timestamp;
  finishedAt?: Timestamp;
  preWorkout?: {
    energyLevel: 1 | 2 | 3 | 4 | 5;
    feeling: 'bem' | 'mal';
  };
  postWorkout?: {
    energyLevel: 1 | 2 | 3 | 4 | 5;
    feeling: 'igual' | 'melhor' | 'pior';
  };
  driveFolderId?: string;
  driveFolderUrl?: string;
  hasVideos: boolean;
  videosNotifiedAt?: Timestamp;
  /** Denormalised from the feedback doc — avoids N+1 reads on trainer dashboard. */
  feedbackStatus?: 'none' | 'draft' | 'complete';
}

// ── Session exercises (actuals cache) ─────────────────────────────────────────

export interface SessionExercise {
  /** `${sessionId}_${exerciseSlug}_${setIndex}` */
  id: string;
  sessionId: string;
  cycleId: string;
  studentUid: string;
  workspaceId: string;
  tabName: string;
  exerciseName: string;
  setIndex: number;
  plannedReps?: number;
  plannedLoad?: number;
  plannedRpe?: number;
  plannedRest?: string;
  group?: string;
  actualReps?: number;
  actualLoad?: number;
  actualRpe?: number;
  observations?: string;
  isDone: boolean;
  isPersonalRecord?: boolean;
  sessionDate: Timestamp;
}

// ── Videos ────────────────────────────────────────────────────────────────────

export interface SessionVideo {
  id: string;
  sessionId: string;
  cycleId: string;
  studentUid: string;
  workspaceId: string;
  exerciseName?: string;
  freeFormDescription?: string;
  driveFileId: string;
  driveFileUrl: string;
  driveThumbnailUrl?: string;
  originalSizeMB: number;
  compressedSizeMB: number;
  uploadedAt: Timestamp;
}

// ── Trainer feedback ──────────────────────────────────────────────────────────

export interface FeedbackMediaFile {
  driveFileId: string;
  driveFileUrl: string;
  mediaType: 'audio' | 'video';
  fileName: string;
  sizeMB: number;
}

export interface ExerciseFeedback {
  exerciseName: string;
  textFeedback: string;
  mediaFiles: FeedbackMediaFile[];
}

export interface Feedback {
  /** Document ID = sessionId. */
  id: string;
  sessionId: string;
  cycleId: string;
  studentUid: string;
  workspaceId: string;
  trainerUid: string;
  status: 'draft' | 'complete';
  exerciseFeedback: ExerciseFeedback[];
  generalNotes: string;
  createdAt: Timestamp;
  completedAt?: Timestamp;
  /** Google Docs URL for the exported feedback document (created on first student view). */
  feedbackDocUrl?: string;
}

// ── Parsed Google Sheet data ──────────────────────────────────────────────────

/** One "set group" row from the sheet: e.g. "3 series × 5 reps @ 100 kg, RPE 8" */
export interface PlannedSetGroup {
  sets: number;
  reps: number | string;  // number, or string like "6-8", or '--'
  load: number | string;  // number, 'ESCOLHER' (student picks), or '--'
  rest: string;           // rest time string or ''
  observations: string;   // trainer notes inline in the cell
  rpe: number | string;   // number, 'PREENCHER' (student fills), or '--'
}

/** A single exercise entry from the sheet, with all its set-group rows. */
export interface PlannedExercise {
  exerciseName: string;
  section: string;          // e.g. "Aquecimento", "Treino", "Extra"
  setGroups: PlannedSetGroup[];
}

/** Full parsed content of one training tab. */
export interface ParsedSheetTab {
  tabName: string;
  exercises: PlannedExercise[];
  preWorkout: {
    energyLevel: number | null;  // 1–5, or null if not filled
    feeling: string | null;      // "Bem" / "Mal" / "-" / null
  };
  postWorkout: {
    energyLevel: number | null;
    feeling: string | null;
  };
}

// ── Progress photos ───────────────────────────────────────────────────────────

/** Sub-collection: cycles/{cycleId}/progressPhotoFolders/{docId} */
export interface ProgressPhotoFolder {
  id: string;
  driveFolderId: string;
  driveFolderUrl: string;
  date: Timestamp;
  createdAt: Timestamp;
}
