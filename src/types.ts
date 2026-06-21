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

// ── Cycle weeks ───────────────────────────────────────────────────────────────

/** Sub-collection: cycles/{cycleId}/weeks/{weekId}. One doc per "Começar Semana X" tap. */
export interface CycleWeek {
  id: string;
  cycleId: string;
  weekNumber: number;
  startedAt: Timestamp;
  /**
   * 'in_progress' once started; 'completed' once the student concludes it
   * (after which its sessions are read-only). Absent on legacy docs → treated
   * as 'in_progress'. A week that hasn't been started yet simply has no doc
   * ("Não iniciada").
   */
  status?: 'in_progress' | 'completed';
  completedAt?: Timestamp;
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export interface Session {
  id: string;
  cycleId: string;
  studentUid: string;
  workspaceId: string;
  tabName: string;
  /** Number of the cycle week this session belongs to — copied from the active CycleWeek at creation time. */
  weekNumber: number;
  /**
   * 'pending'     — pre-created when the week starts, not opened yet.
   * 'in_progress' — opened by the student (resumable for 4h, see SESSION_OPEN_TTL_MS).
   * 'completed'   — finished.
   * 'skipped'     — explicitly skipped for the week.
   */
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  date: Timestamp;
  /** Set when the session is first opened (pending → in_progress); absent while still pending. */
  startedAt?: Timestamp;
  finishedAt?: Timestamp;
  skippedAt?: Timestamp;
  preWorkout?: {
    energyLevel: 1 | 2 | 3 | 4 | 5;
    feeling: 'Bem' | 'Não estou muito legal';
  };
  postWorkout?: {
    energyLevel: 1 | 2 | 3 | 4 | 5;
    feeling: 'Mantenho a resposta anterior' | 'Um pouco melhor' | 'Um pouco pior';
  };
  /** Student-filled per-exercise notes, keyed by exercise name — written back to sheet columns F/G on finish. */
  exerciseEntries?: Record<string, { observations: string; rpe: number }>;
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
  /** 1-based row index in the sheet — used to write Observações/RPE back to columns F/G. */
  rowNumber?: number;
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
    /** 1-based row indices of the marker rows — used to write answers back to column B. */
    energyLevelRow?: number;
    feelingRow?: number;
  };
  postWorkout: {
    energyLevel: number | null;
    feeling: string | null;
    energyLevelRow?: number;
    feelingRow?: number;
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
