import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  Lock,
  MessageSquare,
  NotebookText,
  Pencil,
  Play,
  PlusCircle,
  Send,
  SkipBack,
  SkipForward,
  Trash2,
  Upload,
  Video,
  X,
} from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { useVideoCompress } from '../../hooks/useVideoCompress';
import { Layout } from '../../components/Layout';
import { StarRating } from '../../components/student/StarRating';
import { ChoiceButtons } from '../../components/student/ChoiceButtons';
import { WorkoutPlan } from '../../components/student/WorkoutPlan';
import type { ExerciseEntry } from '../../components/student/WorkoutPlan';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import {
  deleteDriveFile,
  getCycleWeekLabel,
  getOrCreateSessionFolder,
  uploadFileToDrive,
} from '../../services/driveService';
import {
  cellRange,
  getExerciseNames,
  parseTrainingTab,
  setKey,
  writeCells,
} from '../../services/sheetsService';
import { notifyTrainer } from '../../services/notifyService';
import { clearOfflineSnapshots } from '../../utils/session';
import { formatDuration } from '../../utils/duration';
import type { Cycle, CycleWeek, ParsedSheetTab, Session, SessionVideo } from '../../types';

// ── Constants ─────────────────────────────────────────────────────────────────

const PRE_FEELING_OPTIONS = ['Bem', 'Não estou muito legal'] as const;
const POST_FEELING_OPTIONS = [
  'Mantenho a resposta anterior',
  'Um pouco melhor',
  'Um pouco pior',
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBytes(mb: number): string {
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(mb * 1024).toFixed(0)} KB`;
}

/**
 * Square thumbnail for an uploaded video, sized to match the three text lines
 * beside it. Uses the stored thumbnail if present, otherwise Drive's thumbnail
 * endpoint (works when the user's Google session can read the file); falls back
 * to a video icon in the same fixed footprint if neither loads.
 */
function VideoThumb({ video }: { video: SessionVideo }) {
  const [errored, setErrored] = useState(false);
  const src =
    video.driveThumbnailUrl ??
    `https://drive.google.com/thumbnail?id=${video.driveFileId}&sz=w200`;
  return (
    <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-indigo-50 dark:bg-indigo-900/30">
      {src && !errored ? (
        <img
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setErrored(true)}
          className="h-full w-full object-cover"
        />
      ) : (
        <Video className="h-6 w-6 text-indigo-500" />
      )}
    </div>
  );
}

function todayStr(): string {
  // Local date (not toISOString, which is UTC and would drift +1 day in the
  // evening for negative-UTC zones).
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function offlineKey(sessionId: string): string {
  return `offline_session_${sessionId}`;
}

/**
 * Converts the in-memory per-set entries into the Firestore shape. A blank RPE
 * is **omitted** (never coerced to 0). Entirely-empty entries are dropped so the
 * saved map stays lean.
 */
function serializeEntries(
  entries: Record<string, ExerciseEntry>,
): Record<string, { observations: string; rpe?: number }> {
  const out: Record<string, { observations: string; rpe?: number }> = {};
  for (const [key, e] of Object.entries(entries)) {
    const observations = e.observations.trim();
    const hasRpe = typeof e.rpe === 'number';
    if (!observations && !hasRpe) continue;
    out[key] = { observations, ...(hasRpe ? { rpe: e.rpe as number } : {}) };
  }
  return out;
}

// ── "Notificar treinador" checkbox ────────────────────────────────────────────

function NotifyTrainerCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="mb-2 flex cursor-pointer select-none items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-700"
      />
      Notificar treinador
    </label>
  );
}

/**
 * In-memory parsed-plan cache, keyed by sessionId, for the lifetime of the
 * browser session (module scope). The first open of a session fetches + parses
 * the sheet live; re-opening it within the same session serves the cache
 * instead of re-hitting the Sheets API. A full reload clears it, so a fresh
 * parse still lands (and picks up any trainer edits).
 */
const planCache = new Map<string, ParsedSheetTab>();

// ── Upload state per video ────────────────────────────────────────────────────

/** Max videos selectable/uploadable in one batch — compressed and uploaded
 *  sequentially, so a larger cap is fine. */
const MAX_VIDEOS_PER_UPLOAD = 10;

interface UploadState {
  fileName: string;
  originalMB: number;
  phase: 'compressing' | 'uploading' | 'error';
  progress: number; // 0–1
  error?: string;
  /** 1-based position and total when several videos are uploaded in one batch. */
  index?: number;
  total?: number;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SessionDetail() {
  const { cycleId, sessionId } = useParams<{ cycleId: string; sessionId: string }>();
  const { currentUser, userProfile, getAccessToken } = useAuth();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { compress } = useVideoCompress();

  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [videos, setVideos] = useState<SessionVideo[]>([]);
  const [loading, setLoading] = useState(true);

  // Whether this session's week has been concluded → everything read-only.
  const [weekConcluded, setWeekConcluded] = useState(false);

  // Parsed sheet data for this session's tab
  const [parsedTab, setParsedTab] = useState<ParsedSheetTab | null>(null);
  const [parsedTabLoading, setParsedTabLoading] = useState(false);

  // Exercise options for the video tag dropdown
  const [exerciseOptions, setExerciseOptions] = useState<string[]>([]);

  // Per-video upload state (shown during active upload)
  const [uploadState, setUploadState] = useState<UploadState | null>(null);

  // Preview sheet state — up to 3 videos at once, each with its own tag.
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [pendingTags, setPendingTags] = useState<{ selected: string; custom: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Inline exercise editing on an already-uploaded video
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null);
  const [editSelected, setEditSelected] = useState('');
  const [editCustom, setEditCustom] = useState('');

  // Notification state (video-ready notification)
  const [notifying, setNotifying] = useState(false);

  // "Notificar treinador" preference (saved on the user profile; default on).
  const [notify, setNotify] = useState(true);
  useEffect(() => {
    if (userProfile) setNotify(userProfile.notifyTrainer ?? true);
  }, [userProfile]);
  const toggleNotify = (value: boolean) => {
    setNotify(value);
    if (currentUser) {
      updateDoc(doc(db, 'users', currentUser.uid), { notifyTrainer: value }).catch(() => {/* best-effort */});
    }
  };

  // Pre-workout form state
  const [preEnergy, setPreEnergy] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [preFeeling, setPreFeeling] = useState<typeof PRE_FEELING_OPTIONS[number] | null>(null);
  const [preSubmitting, setPreSubmitting] = useState(false);
  const [preError, setPreError] = useState('');
  const [skipping, setSkipping] = useState(false);
  const [unskipping, setUnskipping] = useState(false);

  // Per-exercise entries (Observações + RPE), debounced-autosaved
  const [exerciseEntries, setExerciseEntries] = useState<Record<string, ExerciseEntry>>({});
  const entriesInitialized = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Per-set completion (timeline checkboxes) — persisted immediately per toggle.
  const [completedSets, setCompletedSets] = useState<Record<string, true>>({});
  useEffect(() => {
    setCompletedSets(session?.completedSets ?? {});
  }, [session?.completedSets]);

  // Finish-session / post-workout form state
  const [showFinishForm, setShowFinishForm] = useState(false);
  const [postEnergy, setPostEnergy] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [postFeeling, setPostFeeling] = useState<typeof POST_FEELING_OPTIONS[number] | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState('');

  const dateLabel = session?.date instanceof Timestamp
    ? session.date.toDate().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : '';

  // Ticks every minute so a live (in-progress) session's duration keeps counting
  // up while the page is open. Only mounts the interval while training.
  const [now, setNow] = useState(() => Date.now());

  // ── Phase derivation ────────────────────────────────────────────────────────
  // No new status enum needed — phase is derived from existing fields.
  const phase: 'pre' | 'training' | 'done' =
    !session?.preWorkout ? 'pre'
    : session.status === 'completed' ? 'done'
    : 'training';

  useEffect(() => {
    if (phase !== 'training') return;
    // Refresh immediately on entering `training` — otherwise `now` is still the
    // (earlier) mount time when the session is started, making now − startedAt
    // negative so the duration renders empty until the first minute ticks.
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [phase]);

  // Duration shown in the header (HH:mm). Starts counting once the session has a
  // start stamp: live (now − startedAt) while training, frozen (finished −
  // started) once concluded. Legacy sessions missing `startedAt` show none.
  const durationLabel = session?.startedAt instanceof Timestamp
    ? phase === 'done' && session.finishedAt instanceof Timestamp
      ? formatDuration(session.finishedAt.toMillis() - session.startedAt.toMillis())
      : phase === 'training'
        ? formatDuration(now - session.startedAt.toMillis())
        : ''
    : '';

  // A skipped session opens read-only (Despular to revert) regardless of how far
  // it had progressed before being skipped.
  const isSkipped = session?.status === 'skipped';
  const readOnly = weekConcluded || isSkipped;

  // Before the session is under way (not started, or skipped and awaiting
  // "Despular"), the call-to-action box goes above the workout plan so the
  // student acts first and reads the plan below. Once training/done, the plan
  // returns to the top since that's what they're actively working through.
  const actionsFirst =
    (phase === 'pre' && !readOnly) || (isSkipped && !weekConcluded);

  // Once the trainer's feedback is in, the session is locked: no more video
  // add/delete or re-sending for feedback.
  const feedbackAvailable = session?.feedbackStatus === 'complete';

  // ── Load cycle + session ────────────────────────────────────────────────────

  useEffect(() => {
    if (!cycleId || !sessionId) return;
    Promise.all([
      getDoc(doc(db, 'cycles', cycleId)),
      getDoc(doc(db, 'sessions', sessionId)),
    ]).then(([c, s]) => {
      if (c.exists()) setCycle(c.data() as Cycle);
      if (!s.exists()) return;
      const sess = s.data() as Session;
      setSession(sess);

      // Self-heal legacy date drift: `date` used to be derived from a UTC day
      // (off by +1 in the evening for negative-UTC zones). For a completed
      // session, `finishedAt` is the source of truth — correct `date` to its
      // local day if they differ.
      if (sess.status === 'completed' && sess.finishedAt instanceof Timestamp) {
        const fin = sess.finishedAt.toDate();
        const cur = sess.date instanceof Timestamp ? sess.date.toDate() : null;
        const sameDay = !!cur
          && cur.getFullYear() === fin.getFullYear()
          && cur.getMonth() === fin.getMonth()
          && cur.getDate() === fin.getDate();
        if (!sameDay) {
          const fixed = Timestamp.fromDate(new Date(fin.getFullYear(), fin.getMonth(), fin.getDate()));
          updateDoc(doc(db, 'sessions', sessionId), { date: fixed }).catch(() => {/* best-effort */});
          setSession((prev) => (prev ? { ...prev, date: fixed } : prev));
        }
      }
    });
  }, [cycleId, sessionId]);

  // ── Is this session's week concluded? (locks the session read-only) ─────────

  useEffect(() => {
    if (!cycleId || !session?.weekNumber) return;
    getDocs(
      query(
        collection(db, 'cycles', cycleId, 'weeks'),
        where('weekNumber', '==', session.weekNumber),
        limit(1),
      ),
    )
      .then((snap) => {
        const week = snap.docs[0]?.data() as CycleWeek | undefined;
        setWeekConcluded((week?.status ?? 'in_progress') === 'completed');
      })
      .catch(() => {/* default: not concluded */});
  }, [cycleId, session?.weekNumber]);

  // ── Load parsed sheet tab for this session ──────────────────────────────────

  useEffect(() => {
    if (!cycle?.googleSheetId || !session?.tabName || !sessionId) return;

    // Instant paint: reuse this browser session's cached parse, else the
    // persisted snapshot (session.plan) written on a previous open.
    const seed = planCache.get(sessionId) ?? session.plan ?? null;
    if (seed) {
      setParsedTab(seed);
      setExerciseOptions((prev) => Array.from(new Set([...getExerciseNames(seed), ...prev])));
    }

    // Fetch live only the first time this session is opened this browser
    // session; afterwards the cache serves it (a reload clears it → refetch,
    // which also catches any trainer edits to the sheet).
    if (planCache.has(sessionId)) return;

    setParsedTabLoading(true);
    getAccessToken()
      .then((token) => parseTrainingTab(cycle.googleSheetId, session.tabName, token))
      .then((tab) => {
        planCache.set(sessionId, tab);
        setParsedTab(tab);
        // Snapshot the plan onto the session so the (Google-less) trainer can
        // render the same "Plano de treino". JSON round-trip strips undefined
        // (Firestore rejects it). Best-effort — never blocks the view.
        updateDoc(doc(db, 'sessions', sessionId), { plan: JSON.parse(JSON.stringify(tab)) })
          .catch(() => {/* non-fatal */});
        // Sheet order first, then any extra video-only names appended (no sort).
        setExerciseOptions((prev) => Array.from(new Set([...getExerciseNames(tab), ...prev])));
      })
      .catch(() => {/* non-fatal — sheet might not have this tab yet */})
      .finally(() => setParsedTabLoading(false));
  }, [cycle?.googleSheetId, session?.tabName, sessionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Seed per-set entries once, from the sheet (preloaded) + saved values ─────
  // Needs the parsed tab so every set is pre-filled with the trainer's
  // Observações (col F) and RPE (col G); any previously-saved student edits win.

  useEffect(() => {
    if (entriesInitialized.current || !parsedTab) return;
    const saved = session?.exerciseEntries ?? {};
    const seeded: Record<string, ExerciseEntry> = {};
    for (const ex of parsedTab.exercises) {
      ex.setGroups.forEach((sg, i) => {
        const key = setKey(ex.exerciseName, i, sg.rowNumber);
        const savedEntry = saved[key];
        seeded[key] = {
          observations: savedEntry?.observations ?? sg.observations ?? '',
          rpe: savedEntry?.rpe != null
            ? savedEntry.rpe
            : (typeof sg.rpe === 'number' ? sg.rpe : ''),
        };
      });
    }
    setExerciseEntries(seeded);
    entriesInitialized.current = true;
  }, [parsedTab, session]);

  // ── Real-time videos listener ───────────────────────────────────────────────

  useEffect(() => {
    if (!sessionId || !currentUser) return;
    setLoading(true);
    // Must filter by studentUid: the videos read rule checks
    // `resource.data.studentUid == uid`, and Firestore rules are not filters —
    // a query not constrained to studentUid is denied outright. Also no
    // `orderBy('uploadedAt')` (a pending server timestamp would be excluded
    // until resolved) — sort client-side instead.
    const q = query(
      collection(db, 'videos'),
      where('sessionId', '==', sessionId),
      where('studentUid', '==', currentUser.uid),
    );
    return onSnapshot(
      q,
      (snap) => {
        const vids = snap.docs.map((d) => d.data() as SessionVideo);
        vids.sort((a, b) => (a.uploadedAt?.seconds ?? Infinity) - (b.uploadedAt?.seconds ?? Infinity));
        setVideos(vids);
        // Append any video-tagged names not already present (keep sheet order first).
        const names = vids.map((v) => v.exerciseName).filter(Boolean) as string[];
        setExerciseOptions((prev) =>
          Array.from(new Set([...prev, ...names])),
        );
        setLoading(false);
      },
      (err) => { console.error('Falha ao carregar vídeos:', err); setLoading(false); },
    );
  }, [sessionId, currentUser]);

  // ── Pre-workout submit ──────────────────────────────────────────────────────

  const handleSubmitPreWorkout = async () => {
    if (!session || !cycle || !preEnergy || !preFeeling) return;
    setPreError('');
    setPreSubmitting(true);
    const preWorkout = { energyLevel: preEnergy, feeling: preFeeling };
    try {
      // Filling the pre-workout questions is what actually *starts* the session:
      // only now do we mark it in_progress, stamp the start time, and notify the
      // trainer — opening the page beforehand ("Abrir") does none of this.
      clearOfflineSnapshots();
      await updateDoc(doc(db, 'sessions', session.id), {
        preWorkout,
        status: 'in_progress',
        date: Timestamp.fromDate(new Date(`${todayStr()}T00:00:00`)),
        startedAt: serverTimestamp(),
      });
      // Optimistic local `startedAt` (the server value resolves a beat later) so
      // the header duration starts counting immediately, without a reload.
      setSession((prev) => (prev ? { ...prev, preWorkout, status: 'in_progress', startedAt: Timestamp.now() } : prev));

      if (notify) {
        notifyTrainer(
          cycle.trainerEmail,
          'Treino iniciado',
          `Comecei o treino *${session.tabName}*` +
            (session.weekNumber ? ` (Semana ${session.weekNumber}).` : '.'),
        ).catch(() => {/* notification is a convenience, never a blocker */});
      }

      // Best-effort write-back into the trainer's sheet — never blocks the flow.
      if (parsedTab) {
        const updates: { range: string; values: (string | number | boolean)[][] }[] = [];
        if (parsedTab.preWorkout.energyLevelRow) {
          updates.push({ range: cellRange(session.tabName, 'B', parsedTab.preWorkout.energyLevelRow), values: [[preEnergy]] });
        }
        if (parsedTab.preWorkout.feelingRow) {
          updates.push({ range: cellRange(session.tabName, 'B', parsedTab.preWorkout.feelingRow), values: [[preFeeling]] });
        }
        if (updates.length > 0) {
          getAccessToken()
            .then((token) => writeCells(cycle.googleSheetId, updates, token))
            .catch(() => {/* best-effort sync — Firestore remains canonical */});
        }
      }
    } catch {
      setPreError('Não foi possível salvar suas respostas. Tente novamente.');
    } finally {
      setPreSubmitting(false);
    }
  };

  // ── Skip session (from the pre-workout screen, before starting) ─────────────

  const handleSkipSession = async () => {
    if (!session) return;
    const confirmed = window.confirm(`Pular o treino "${session.tabName}"?`);
    if (!confirmed) return;
    setPreError('');
    setSkipping(true);
    try {
      await updateDoc(doc(db, 'sessions', session.id), {
        status: 'skipped',
        skippedAt: serverTimestamp(),
      });
      navigate(`/student/cycles/${cycleId}`);
    } catch {
      setPreError('Não foi possível pular o treino. Tente novamente.');
      setSkipping(false);
    }
  };

  // ── Un-skip session (revert a skipped session back to "Não iniciado") ───────

  const handleUnskipSession = async () => {
    if (!session) return;
    setPreError('');
    setUnskipping(true);
    // Revert to where it was before being skipped: a session that had already
    // started (pre-workout filled) returns to in_progress; otherwise pending.
    const revertStatus = session.preWorkout ? 'in_progress' : 'pending';
    try {
      await updateDoc(doc(db, 'sessions', session.id), {
        status: revertStatus,
        skippedAt: deleteField(),
      });
      setSession((prev) => (prev ? { ...prev, status: revertStatus } : prev));
    } catch {
      setPreError('Não foi possível desfazer. Tente novamente.');
    } finally {
      setUnskipping(false);
    }
  };

  // ── Exercise entry change (debounced autosave) ──────────────────────────────

  const handleEntryChange = (key: string, entry: ExerciseEntry) => {
    setExerciseEntries((prev) => {
      const next = { ...prev, [key]: entry };

      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        if (!sessionId) return;
        updateDoc(doc(db, 'sessions', sessionId), { exerciseEntries: serializeEntries(next) })
          .catch(() => {/* retried on next change */});
      }, 800);

      return next;
    });
  };

  // ── Toggle a set's completion (timeline checkbox) ───────────────────────────
  // Independent per set (students may skip exercises) — only the clicked set
  // changes. Persisted immediately, since it's a discrete action.

  const handleToggleSet = (key: string, next: boolean) => {
    setCompletedSets((prev) => {
      const updated = { ...prev };
      if (next) updated[key] = true;
      else delete updated[key];

      if (sessionId) {
        updateDoc(doc(db, 'sessions', sessionId), {
          [`completedSets.${key}`]: next ? true : deleteField(),
        }).catch(() => {/* best-effort; local state stays authoritative */});
      }
      return updated;
    });
  };

  // ── Finish session ──────────────────────────────────────────────────────────

  const handleFinishSession = async () => {
    if (!session || !cycle || !postEnergy || !postFeeling) return;
    setFinishError('');
    setFinishing(true);

    const postWorkout = { energyLevel: postEnergy, feeling: postFeeling };
    const finalEntries = serializeEntries(exerciseEntries);

    try {
      await updateDoc(doc(db, 'sessions', session.id), {
        postWorkout,
        exerciseEntries: finalEntries,
        status: 'completed',
        finishedAt: serverTimestamp(),
      });
      setSession((prev) => (prev ? { ...prev, postWorkout, exerciseEntries: finalEntries, status: 'completed' } : prev));

      // Single batched, best-effort write-back: post-workout answers, every
      // exercise's Observações/RPE, and the "FINAL DO TREINO" checkbox at H2.
      if (parsedTab) {
        const updates: { range: string; values: (string | number | boolean)[][] }[] = [];
        if (parsedTab.postWorkout.energyLevelRow) {
          updates.push({ range: cellRange(session.tabName, 'B', parsedTab.postWorkout.energyLevelRow), values: [[postEnergy]] });
        }
        if (parsedTab.postWorkout.feelingRow) {
          updates.push({ range: cellRange(session.tabName, 'B', parsedTab.postWorkout.feelingRow), values: [[postFeeling]] });
        }
        // Per-set write-back: Observações → col F; RPE → col G only when the
        // student actually set a number (a blank RPE leaves the sheet value).
        for (const ex of parsedTab.exercises) {
          ex.setGroups.forEach((sg, i) => {
            const row = sg.rowNumber;
            if (!row) return;
            const entry = exerciseEntries[setKey(ex.exerciseName, i, row)];
            if (!entry) return;
            updates.push({ range: cellRange(session.tabName, 'F', row), values: [[entry.observations]] });
            if (typeof entry.rpe === 'number') {
              updates.push({ range: cellRange(session.tabName, 'G', row), values: [[entry.rpe]] });
            }
          });
        }
        updates.push({ range: cellRange(session.tabName, 'H', 2), values: [[true]] });

        getAccessToken()
          .then((token) => writeCells(cycle.googleSheetId, updates, token))
          .catch(() => {/* best-effort sync — Firestore remains canonical */});
      }

      // Notify trainer the workout is finished (unless the student opted out).
      if (notify) {
        notifyTrainer(
          cycle.trainerEmail,
          'Treino concluído',
          `Terminei o treino *${session.tabName}*` +
            (session.weekNumber ? ` (Semana ${session.weekNumber}).` : '.'),
        ).catch(() => {/* notification is a convenience, never a blocker */});
      }

      // The offline snapshot is no longer useful once the session is done.
      localStorage.removeItem(offlineKey(session.id));

      setShowFinishForm(false);
    } catch {
      setFinishError('Não foi possível concluir a sessão. Tente novamente.');
    } finally {
      setFinishing(false);
    }
  };

  // ── Automatic offline snapshot ───────────────────────────────────────────────
  // While the workout is in progress, keep a fresh read-only snapshot in
  // localStorage. If the student gets logged out mid-session (token expiry), the
  // same session URL — now unauthenticated — falls back to rendering this
  // snapshot. Debounced so rapid edits (notes/RPE/set toggles) coalesce.

  useEffect(() => {
    if (phase !== 'training' || readOnly) return;
    if (!session || !cycle || !parsedTab) return;
    const id = setTimeout(() => {
      const snapshot = {
        savedAt: Date.now(),
        cycleId: cycle.id,
        cycleTitle: cycle.title,
        tabName: session.tabName,
        dateLabel,
        // Start time (ms) so the offline viewer can keep counting the duration.
        startedAt: session.startedAt instanceof Timestamp ? session.startedAt.toMillis() : null,
        parsedTab,
        preWorkout: session.preWorkout ?? null,
        exerciseEntries,
        completedSets,
      };
      try {
        localStorage.setItem(offlineKey(session.id), JSON.stringify(snapshot));
      } catch {/* storage full / unavailable — offline fallback is best-effort */}
    }, 800);
    return () => clearTimeout(id);
  }, [phase, readOnly, session, cycle, parsedTab, dateLabel, exerciseEntries, completedSets]);

  // ── File selected ───────────────────────────────────────────────────────────

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, MAX_VIDEOS_PER_UPLOAD);
    if (files.length === 0) return;
    setPendingFiles(files);
    setPendingTags(files.map(() => ({ selected: '', custom: '' })));
    e.target.value = '';
  };

  const updateTag = (i: number, patch: Partial<{ selected: string; custom: string }>) =>
    setPendingTags((prev) => prev.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));

  const cancelPending = () => { setPendingFiles([]); setPendingTags([]); };

  // ── Upload flow ─────────────────────────────────────────────────────────────

  const handleUpload = async () => {
    if (pendingFiles.length === 0 || !currentUser || !session || !cycle) return;

    const files = pendingFiles;
    const tags = pendingTags;
    const total = files.length;
    cancelPending(); // close the sheet; progress shows below

    // Confirm the selection landed on the (now clean) page, right before the
    // slower compress/upload queue starts and the progress UI takes over.
    showToast(
      total > 1 ? `${total} vídeos selecionados` : 'Vídeo selecionado',
      3000,
    );

    try {
      const token = await getAccessToken();

      // Ensure the session's Drive folder exists once, up front, then reuse it
      // for every video in the batch.
      let folderId = session.driveFolderId;
      let folderUrl = session.driveFolderUrl;
      if (!folderId) {
        const sessionDate = session.date instanceof Timestamp ? session.date.toDate() : new Date();
        const dateStr = session.date instanceof Timestamp
          ? sessionDate.toISOString().slice(0, 10)
          : todayStr();
        const cycleStartDate = cycle.startDate instanceof Timestamp
          ? cycle.startDate.toDate()
          : sessionDate;
        // Prefer the explicit week number from "Começar Semana X" — falls back
        // to date-derived calculation only for legacy sessions without it.
        const weekLabel = session.weekNumber
          ? `Semana ${session.weekNumber}`
          : getCycleWeekLabel(cycleStartDate, sessionDate);
        const sessionLabel = `${session.tabName} — ${dateStr}`;
        const folder = await getOrCreateSessionFolder(
          cycle.trainerName ?? 'Treinador',
          currentUser.displayName ?? 'Aluno',
          cycle.title,
          weekLabel,
          sessionLabel,
          token,
        );
        folderId = folder.id;
        folderUrl = folder.webViewLink;
        await updateDoc(doc(db, 'sessions', session.id), {
          driveFolderId: folderId,
          driveFolderUrl: folderUrl,
        });
        setSession((prev) => prev ? { ...prev, driveFolderId: folderId!, driveFolderUrl: folderUrl! } : prev);
      }

      // Compress + upload each file sequentially (compression is CPU-heavy).
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const tag = tags[i] ?? { selected: '', custom: '' };
        const exerciseName =
          tag.selected === '__custom__'
            ? tag.custom.trim() || undefined
            : tag.selected || undefined;
        const originalMB = file.size / 1_048_576;

        setUploadState({ fileName: file.name, originalMB, phase: 'compressing', progress: 0, index: i + 1, total });

        const { buffer, compressedSizeMB } = await compress(
          file,
          (p) => setUploadState((s) => s ? { ...s, progress: p } : s),
        );

        setUploadState((s) => s ? { ...s, phase: 'uploading', progress: 0 } : s);
        const uploaded = await uploadFileToDrive(
          `${session.tabName} - ${exerciseName ?? 'video'}_${Date.now()}.mp4`,
          'video/mp4',
          buffer,
          folderId,
          token,
          (p) => setUploadState((s) => s ? { ...s, progress: p } : s),
        );

        const videoRef = doc(collection(db, 'videos'));
        await setDoc(videoRef, {
          id: videoRef.id,
          sessionId: session.id,
          cycleId: cycle.id,
          studentUid: currentUser.uid,
          trainerEmail: cycle.trainerEmail ?? '',
          exerciseName: exerciseName ?? null,
          freeFormDescription: null,
          driveFileId: uploaded.id,
          driveFileUrl: uploaded.webViewLink,
          driveThumbnailUrl: null,
          originalSizeMB: originalMB,
          compressedSizeMB,
          uploadedAt: serverTimestamp(),
        });
      }

      if (!session.hasVideos) {
        await updateDoc(doc(db, 'sessions', session.id), { hasVideos: true });
        setSession((prev) => prev ? { ...prev, hasVideos: true } : prev);
      }

      // The videos appear in the list below via the real-time listener; a
      // transient toast confirms the upload succeeded.
      setUploadState(null);
      showToast(
        total > 1
          ? 'Vídeos adicionados com sucesso!'
          : 'Vídeo adicionado com sucesso!',
      );
    } catch (err) {
      console.error('Falha no upload do vídeo:', err);
      setUploadState((s) =>
        s ? { ...s, phase: 'error', error: String(err) } : s,
      );
    }
  };

  // ── Edit an uploaded video's exercise tag ─────────────────────────────────────

  const startEditVideo = (v: SessionVideo) => {
    setEditingVideoId(v.id);
    const name = v.exerciseName ?? '';
    if (name && exerciseOptions.includes(name)) {
      setEditSelected(name);
      setEditCustom('');
    } else if (name) {
      setEditSelected('__custom__');
      setEditCustom(name);
    } else {
      setEditSelected('');
      setEditCustom('');
    }
  };

  const saveEditVideo = async (v: SessionVideo) => {
    const name =
      editSelected === '__custom__'
        ? editCustom.trim() || null
        : editSelected || null;
    setEditingVideoId(null);
    try {
      await updateDoc(doc(db, 'videos', v.id), { exerciseName: name });
    } catch (err) {
      console.error('Falha ao atualizar o exercício do vídeo:', err);
    }
  };

  // ── Delete a video ───────────────────────────────────────────────────────────

  const handleDeleteVideo = async (v: SessionVideo) => {
    if (!window.confirm('Excluir este vídeo?')) return;
    try {
      await deleteDoc(doc(db, 'videos', v.id));
      // If that was the last video, clear the session's hasVideos flag so it
      // drops out of the trainer's "aguardando feedback" queue.
      if (session && videos.filter((x) => x.id !== v.id).length === 0) {
        await updateDoc(doc(db, 'sessions', session.id), { hasVideos: false });
        setSession((prev) => (prev ? { ...prev, hasVideos: false } : prev));
      }
      // Best-effort: also remove the file from Drive.
      getAccessToken()
        .then((token) => deleteDriveFile(v.driveFileId, token))
        .catch(() => {/* Drive cleanup is best-effort */});
    } catch (err) {
      console.error('Falha ao excluir vídeo:', err);
    }
  };

  // ── Send the session to the trainer for feedback (via WhatsApp) ──────────────

  const handleNotify = () => {
    // Only sent when there are videos to review.
    if (!session || !cycle || !cycle.trainerEmail || videos.length === 0) return;
    setNotifying(true);
    const weekSuffix = session.weekNumber ? ` (Semana ${session.weekNumber}).` : '.';
    const body =
      `Há ${videos.length} vídeos do treino *${session.tabName}*${weekSuffix}\n` +
      `Acessar treino: ${window.location.origin}/trainer/sessions/${session.id}`;
    notifyTrainer(cycle.trainerEmail, 'Treino disponível para feedback', body)
      .then(() => updateDoc(doc(db, 'sessions', session.id), { videosNotifiedAt: serverTimestamp() }))
      .finally(() => setNotifying(false));
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading && !session) {
    return (
      <Layout title="Sessão" backTo={cycleId ? `/student/cycles/${cycleId}` : '/student'}>
        <div className="flex justify-center py-20">
          <div className="h-7 w-7 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
        </div>
      </Layout>
    );
  }

  // Workout plan preview — placed above or below the action box depending on
  // `actionsFirst` (see below), so it's declared once and rendered in one slot.
  const planSection = (
    <div className="mb-5">
      <p className="mb-2 flex items-center text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        <NotebookText className="h-4 w-4" />
        <span className="ml-2">Plano de treino</span>
        {parsedTabLoading && (
          <span className="ml-2 h-3 w-3 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
        )}
      </p>
      {parsedTab ? (
        <WorkoutPlan
          tab={parsedTab}
          // Editable while training; read-only (but still shown) once done or
          // when the week is concluded, so the student can review what they
          // filled in.
          entries={phase === 'pre' ? undefined : exerciseEntries}
          onEntryChange={phase === 'training' && !readOnly ? handleEntryChange : undefined}
          completedSets={completedSets}
          onToggleSet={phase === 'training' && !readOnly ? handleToggleSet : undefined}
        />
      ) : !parsedTabLoading ? (
        <p className="text-xs text-slate-400 dark:text-slate-500 px-1">
          Não foi possível carregar o plano desta aba.
        </p>
      ) : null}
    </div>
  );

  return (
    <Layout title={session?.tabName ?? 'Sessão'} backTo={cycleId ? `/student/cycles/${cycleId}` : '/student'}>
      <Breadcrumbs
        items={[
          { label: 'Meus Treinos', to: '/student' },
          { label: cycle?.title ?? 'Programa', to: cycleId ? `/student/cycles/${cycleId}` : undefined },
          { label: session?.tabName ?? 'Treino' },
        ]}
      />

      {/* Session header */}
      <div className="mb-5 min-w-0">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
          {session?.weekNumber ? `Semana ${session.weekNumber} · ` : ''}{session?.tabName}
        </h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          {cycle?.title} · {dateLabel}
        </p>
        {durationLabel && (
          <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-slate-700 dark:text-slate-200">
            <Clock className="h-4 w-4 text-slate-400 dark:text-slate-500" />
            Duração: {durationLabel}
          </p>
        )}
      </div>

      {/* Read-only notice for sessions in a concluded week */}
      {weekConcluded && (
        <div className="mb-5 flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-3 text-sm font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <Lock className="h-4 w-4 flex-shrink-0" />
          Semana concluída.
        </div>
      )}

      {/* Reading mode: workout plan. Above the action box while training/done,
          below it before the session is under way (see `actionsFirst`). */}
      {!actionsFirst && planSection}

      {/* ── Phase A0: skipped — read-only until un-skipped ───────────────── */}
      {isSkipped && !weekConcluded && (
        <div className="glass-premium mb-5 rounded-2xl p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-bold text-amber-600 dark:text-amber-400">
            <SkipForward className="h-4 w-4" />
            Treino pulado
          </div>
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
            Este treino foi pulado. Despule para preencher as respostas e começar.
          </p>
          {preError && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{preError}</p>}
          <button
            onClick={handleUnskipSession}
            disabled={unskipping}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-indigo-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <SkipBack className="h-4 w-4" />
            {unskipping ? 'Despulando…' : 'Despular'}
          </button>
        </div>
      )}

      {/* ── Phase A: pre-workout form ────────────────────────────────────── */}
      {phase === 'pre' && !readOnly && (
        <div className="glass-premium mb-5 rounded-2xl p-4">
          <p className="mb-3 text-sm font-bold text-slate-900 dark:text-white">
            Preencha abaixo (INÍCIO DO TREINO)
          </p>

          <div className="mb-4 flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Qual o seu nível de ânimo?
            </label>
            <StarRating value={preEnergy} onChange={setPreEnergy} disabled={preSubmitting} />
          </div>

          <div className="mb-4 flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              Como está se sentindo?
            </label>
            <ChoiceButtons
              options={PRE_FEELING_OPTIONS}
              value={preFeeling}
              onChange={setPreFeeling}
              disabled={preSubmitting}
            />
          </div>

          {preError && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{preError}</p>}

          {cycle?.trainerEmail && (
            <NotifyTrainerCheckbox checked={notify} onChange={toggleNotify} />
          )}
          <button
            onClick={handleSubmitPreWorkout}
            disabled={!preEnergy || !preFeeling || preSubmitting || skipping}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-indigo-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Play className="h-4 w-4" />
            {preSubmitting ? 'Salvando…' : 'Começar treino'}
          </button>

          <button
            onClick={handleSkipSession}
            disabled={preSubmitting || skipping}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-600 transition-all hover:bg-slate-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
          >
            <SkipForward className="h-4 w-4" />
            {skipping ? 'Pulando…' : 'Pular treino'}
          </button>
        </div>
      )}

      {/* Workout plan below the action box before the session is under way. */}
      {actionsFirst && planSection}

      {/* Uploaded videos — shown whenever any exist, regardless of phase. */}
      {videos.length > 0 && (
        <div className="mb-5">
          <p className="mb-2 flex items-center text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <Video className="h-4 w-4" />
            <span className="ml-2">Vídeos enviados ({videos.length})</span>
          </p>
          <ul className="flex flex-col gap-2">
            {videos.map((v) => (
              <li
                key={v.id}
                className="glass-premium flex items-center gap-3 rounded-xl p-3"
              >
                <VideoThumb video={v} />
                {editingVideoId === v.id ? (
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <select
                      value={editSelected}
                      onChange={(e) => setEditSelected(e.target.value)}
                      className="w-full appearance-none rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    >
                      <option value="">Vídeo geral (sem exercício)</option>
                      {exerciseOptions.map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                      <option value="__custom__">Outro — descreva</option>
                    </select>
                    {editSelected === '__custom__' && (
                      <input
                        type="text"
                        value={editCustom}
                        onChange={(e) => setEditCustom(e.target.value)}
                        placeholder="Nome do exercício…"
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                      />
                    )}
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => saveEditVideo(v)}
                        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700"
                      >
                        Salvar
                      </button>
                      <button
                        onClick={() => setEditingVideoId(null)}
                        className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="min-w-0 flex-1">
                      {/* Exercise name + tiny inline edit pencil (matches the
                          sheet/trainer name pattern on the cycle page). */}
                      <div className="flex items-center gap-1.5">
                        <p className="truncate text-sm font-medium text-slate-800 dark:text-white">
                          {v.exerciseName ?? 'Vídeo geral'}
                        </p>
                        {!readOnly && !feedbackAvailable && (
                          <button
                            onClick={() => startEditVideo(v)}
                            aria-label="Editar exercício"
                            className="flex-shrink-0 rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-slate-800 dark:hover:text-indigo-400"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {fmtBytes(v.compressedSizeMB)} comprimido
                      </p>
                      {v.originalSizeMB > 0 && (
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          original: {fmtBytes(v.originalSizeMB)}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1">
                      <a
                        href={v.driveFileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label="Abrir vídeo"
                        className="rounded-lg p-2 text-indigo-600 transition-colors hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-900/30"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                      {!readOnly && !feedbackAvailable && (
                        <button
                          onClick={() => handleDeleteVideo(v)}
                          aria-label="Excluir vídeo"
                          className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Videos: upload flow ──────────────────────────────────────────────
          Available while the session is still in progress (a session can stay
          open for days) and after it's concluded. Only the "Solicitar feedback"
          action below is gated to the concluded phase. */}
      {(phase === 'training' || phase === 'done') && (
        <>
          {/* Active upload progress / error */}
          {uploadState && (
            <div
              className={`mb-4 rounded-2xl p-4 ${
                uploadState.phase === 'error'
                  ? 'bg-red-50 dark:bg-red-950/30'
                  : 'bg-indigo-50 dark:bg-indigo-900/20'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <p className={`mb-1.5 text-sm font-semibold ${
                  uploadState.phase === 'error'
                    ? 'text-red-700 dark:text-red-300'
                    : 'text-indigo-800 dark:text-indigo-300'
                }`}>
                  {uploadState.phase === 'compressing' && `Comprimindo vídeo${uploadState.total && uploadState.total > 1 ? ` (${uploadState.index}/${uploadState.total})` : ''}…`}
                  {uploadState.phase === 'uploading' && `Enviando para o Drive${uploadState.total && uploadState.total > 1 ? ` (${uploadState.index}/${uploadState.total})` : ''}…`}
                  {uploadState.phase === 'error' && 'Falha no envio — nada foi salvo.'}
                </p>
                {uploadState.phase === 'error' && (
                  <button
                    onClick={() => setUploadState(null)}
                    aria-label="Fechar"
                    className="flex-shrink-0 rounded-full p-1 text-slate-400 hover:bg-black/5 hover:text-slate-700 dark:hover:bg-white/10"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {uploadState.phase !== 'error' && (
                <>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-indigo-200 dark:bg-indigo-800">
                    <div
                      className="h-full rounded-full bg-indigo-600 transition-all duration-300"
                      style={{ width: `${Math.round(uploadState.progress * 100)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-indigo-600 dark:text-indigo-400">
                    {Math.round(uploadState.progress * 100)}%
                    {uploadState.phase === 'compressing' &&
                      ` · Original: ${fmtBytes(uploadState.originalMB)}`}
                  </p>
                </>
              )}
              {uploadState.phase === 'error' && (
                <p className="text-xs text-red-600 dark:text-red-400">
                  {uploadState.error} — tente novamente.
                </p>
              )}
            </div>
          )}

          {/* Actions (hidden when read-only, or once feedback has arrived) */}
          {!readOnly && !feedbackAvailable && (
            <div className="flex flex-col gap-3">
              {/* Hidden file input — no `capture` so it opens the library/camera
                  roll picker (lets the student choose an already-recorded video). */}
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                multiple
                className="hidden"
                onChange={handleFileSelected}
              />

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={!!uploadState && uploadState.phase !== 'error'}
                className="mb-2 flex items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-white py-3 text-sm font-semibold text-indigo-700 shadow-sm transition-all hover:bg-indigo-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 dark:border-indigo-800 dark:bg-slate-800 dark:text-indigo-300 dark:hover:bg-slate-700"
              >
                <PlusCircle className="h-4 w-4" />
                Adicionar vídeos
              </button>

              {phase === 'done' && cycle?.trainerEmail && videos.length > 0 && (
                <button
                  onClick={handleNotify}
                  disabled={notifying}
                  className="flex items-center justify-center gap-2 rounded-xl bg-green-600 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-green-700 active:scale-95 disabled:opacity-60"
                >
                  <Send className="h-4 w-4" />
                  {session?.videosNotifiedAt ? 'Re-solicitar feedback' : 'Solicitar feedback'}
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Phase B: training in progress — finish flow ──────────────────────
          The offline snapshot is maintained automatically in the background;
          this block is just the "Finalizar treino" flow, below the video
          actions. */}
      {phase === 'training' && !readOnly && (
        <div className="mb-5 flex flex-col gap-3">
          {!showFinishForm ? (
            <button
              onClick={() => setShowFinishForm(true)}
              className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-emerald-700 active:scale-95"
            >
              <CheckCircle2 className="h-4 w-4" />
              Finalizar treino
            </button>
          ) : (
            <div className="glass-premium rounded-2xl p-4">
              <p className="mb-3 text-sm font-bold text-slate-900 dark:text-white">
                Preencha abaixo (FINAL DO TREINO)
              </p>

              <div className="mb-4 flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Qual o seu nível de ânimo?
                </label>
                <StarRating value={postEnergy} onChange={setPostEnergy} disabled={finishing} />
              </div>

              <div className="mb-4 flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Como está se sentindo?
                </label>
                <ChoiceButtons
                  options={POST_FEELING_OPTIONS}
                  value={postFeeling}
                  onChange={setPostFeeling}
                  disabled={finishing}
                />
              </div>

              {finishError && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{finishError}</p>}

              {cycle?.trainerEmail && (
                <NotifyTrainerCheckbox checked={notify} onChange={toggleNotify} />
              )}
              {!!uploadState && uploadState.phase !== 'error' && (
                <p className="mb-2 text-xs text-amber-700 dark:text-amber-400">
                  Aguarde o envio do vídeo terminar para concluir o treino.
                </p>
              )}
              <div className="flex gap-3">
                <button
                  onClick={handleFinishSession}
                  disabled={!postEnergy || !postFeeling || finishing || (!!uploadState && uploadState.phase !== 'error')}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-emerald-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {finishing ? 'Concluindo…' : 'Concluir treino'}
                </button>
                <button
                  onClick={() => setShowFinishForm(false)}
                  disabled={finishing}
                  className="flex-1 rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  Voltar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Feedback available: non-clickable banner + "Ver feedback" ────── */}
      {feedbackAvailable && (
        <div className="mt-6">
          <div className="rounded-2xl bg-emerald-50 p-4 dark:bg-emerald-900/20">
            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
              Feedback disponível!
            </p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              Seu treinador enviou o feedback desta sessão.
            </p>
          </div>
          <button
            onClick={() => navigate(`/student/sessions/${sessionId}/feedback`)}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-emerald-700 active:scale-95"
          >
            <MessageSquare className="h-4 w-4" />
            Ver feedback
          </button>
        </div>
      )}

      {/* ── Preview / exercise-label sheet (up to 3 videos) ───────────────── */}
      {pendingFiles.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 backdrop-blur-sm">
          <div className="glass-premium max-h-[85vh] w-full overflow-y-auto rounded-t-2xl p-6 shadow-2xl">
            <p className="mb-4 text-sm font-bold text-slate-900 dark:text-white">
              {pendingFiles.length === 1 ? '1 vídeo para enviar' : `${pendingFiles.length} vídeos para enviar`}
            </p>

            <div className="mb-4 flex flex-col gap-4">
              {pendingFiles.map((file, i) => {
                const tag = pendingTags[i] ?? { selected: '', custom: '' };
                return (
                  <div key={i} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                    <div className="mb-2 flex items-center gap-3">
                      <Video className="h-5 w-5 flex-shrink-0 text-indigo-500" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                          {file.name}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Tamanho original: {fmtBytes(file.size / 1_048_576)}
                        </p>
                      </div>
                    </div>

                    <label className="mb-1 block text-xs font-semibold text-slate-700 dark:text-slate-200">
                      Exercício
                    </label>
                    <select
                      value={tag.selected}
                      onChange={(e) => updateTag(i, { selected: e.target.value })}
                      className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                    >
                      <option value="">Selecione ou deixe em branco…</option>
                      {exerciseOptions.map((o) => (
                        <option key={o} value={o}>{o}</option>
                      ))}
                      <option value="__custom__">Outro — descreva</option>
                    </select>

                    {tag.selected === '__custom__' && (
                      <input
                        type="text"
                        value={tag.custom}
                        onChange={(e) => updateTag(i, { custom: e.target.value })}
                        placeholder="Nome do exercício…"
                        className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleUpload}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-indigo-700 active:scale-95"
              >
                <Upload className="h-4 w-4" />
                Comprimir e enviar
              </button>
              <button
                onClick={cancelPending}
                className="flex-1 rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
