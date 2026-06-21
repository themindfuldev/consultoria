import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  collection,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  CheckCircle2,
  Download,
  Lock,
  MessageSquare,
  PlusCircle,
  RotateCcw,
  SkipForward,
  Upload,
  Video,
} from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../hooks/useAuth';
import { useVideoCompress } from '../../hooks/useVideoCompress';
import { Layout } from '../../components/Layout';
import { StarRating } from '../../components/student/StarRating';
import { ChoiceButtons } from '../../components/student/ChoiceButtons';
import { WorkoutPlan } from '../../components/student/WorkoutPlan';
import type { ExerciseEntry } from '../../components/student/WorkoutPlan';
import {
  getCycleWeekLabel,
  getOrCreateSessionFolder,
  uploadFileToDrive,
} from '../../services/driveService';
import {
  cellRange,
  getExerciseNames,
  parseTrainingTab,
  rowRange,
  writeCells,
} from '../../services/sheetsService';
import { notifyTrainer } from '../../services/notifyService';
import { clearOfflineSnapshots } from '../../utils/session';
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

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function offlineKey(sessionId: string): string {
  return `offline_session_${sessionId}`;
}

// ── Upload state per video ────────────────────────────────────────────────────

interface UploadState {
  fileName: string;
  originalMB: number;
  phase: 'compressing' | 'uploading' | 'done' | 'error';
  progress: number; // 0–1
  error?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function SessionDetail() {
  const { cycleId, sessionId } = useParams<{ cycleId: string; sessionId: string }>();
  const { currentUser, getAccessToken } = useAuth();
  const navigate = useNavigate();
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

  // Preview sheet state
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [selectedExercise, setSelectedExercise] = useState('');
  const [customExercise, setCustomExercise] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Notification state (video-ready notification)
  const [notifying, setNotifying] = useState(false);

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

  // Finish-session / post-workout form state
  const [showFinishForm, setShowFinishForm] = useState(false);
  const [postEnergy, setPostEnergy] = useState<1 | 2 | 3 | 4 | 5 | null>(null);
  const [postFeeling, setPostFeeling] = useState<typeof POST_FEELING_OPTIONS[number] | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState('');

  // Offline export
  const [savingOffline, setSavingOffline] = useState(false);

  const dateLabel = session?.date instanceof Timestamp
    ? session.date.toDate().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : '';

  // ── Phase derivation ────────────────────────────────────────────────────────
  // No new status enum needed — phase is derived from existing fields.
  const phase: 'pre' | 'training' | 'done' =
    !session?.preWorkout ? 'pre'
    : session.status === 'completed' ? 'done'
    : 'training';

  // A skipped session opens read-only (Despular to revert) regardless of how far
  // it had progressed before being skipped.
  const isSkipped = session?.status === 'skipped';
  const readOnly = weekConcluded || isSkipped;

  // ── Load cycle + session ────────────────────────────────────────────────────

  useEffect(() => {
    if (!cycleId || !sessionId) return;
    Promise.all([
      getDoc(doc(db, 'cycles', cycleId)),
      getDoc(doc(db, 'sessions', sessionId)),
    ]).then(([c, s]) => {
      if (c.exists()) setCycle(c.data() as Cycle);
      if (s.exists()) setSession(s.data() as Session);
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
    if (!cycle?.googleSheetId || !session?.tabName) return;
    setParsedTabLoading(true);
    getAccessToken()
      .then((token) => parseTrainingTab(cycle.googleSheetId, session.tabName, token))
      .then((tab) => {
        setParsedTab(tab);
        // Merge sheet exercise names with any already-tagged video names
        const sheetNames = getExerciseNames(tab);
        setExerciseOptions((prev) => {
          const combined = Array.from(new Set([...sheetNames, ...prev])).sort();
          return combined;
        });
      })
      .catch(() => {/* non-fatal — sheet might not have this tab yet */})
      .finally(() => setParsedTabLoading(false));
  }, [cycle?.googleSheetId, session?.tabName]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Seed exercise entries from Firestore once (avoid clobbering local edits) ─

  useEffect(() => {
    if (entriesInitialized.current || !session) return;
    if (session.exerciseEntries) {
      const seeded: Record<string, ExerciseEntry> = {};
      for (const [name, e] of Object.entries(session.exerciseEntries)) {
        seeded[name] = { observations: e.observations, rpe: e.rpe };
      }
      setExerciseEntries(seeded);
    }
    entriesInitialized.current = true;
  }, [session]);

  // ── Real-time videos listener ───────────────────────────────────────────────

  useEffect(() => {
    if (!sessionId) return;
    setLoading(true);
    const q = query(
      collection(db, 'videos'),
      where('sessionId', '==', sessionId),
      orderBy('uploadedAt', 'asc'),
    );
    return onSnapshot(
      q,
      (snap) => {
        const vids = snap.docs.map((d) => d.data() as SessionVideo);
        setVideos(vids);
        // Merge video exercise names into options
        const names = Array.from(
          new Set(vids.map((v) => v.exerciseName).filter(Boolean) as string[]),
        ).sort();
        setExerciseOptions((prev) => {
          const combined = Array.from(new Set([...prev, ...names])).sort();
          return combined;
        });
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [sessionId]);

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
      setSession((prev) => (prev ? { ...prev, preWorkout, status: 'in_progress' } : prev));

      notifyTrainer(
        cycle.workspaceId,
        `Comecei o treino *${session.tabName}*` +
          (session.weekNumber ? ` (Semana ${session.weekNumber}).` : '.'),
      ).catch(() => {/* notification is a convenience, never a blocker */});

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

  const handleEntryChange = (exerciseName: string, entry: ExerciseEntry) => {
    setExerciseEntries((prev) => {
      const next = { ...prev, [exerciseName]: entry };

      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        if (!sessionId) return;
        const toSave: Record<string, { observations: string; rpe: number }> = {};
        for (const [name, e] of Object.entries(next)) {
          toSave[name] = { observations: e.observations, rpe: e.rpe === '' ? 0 : e.rpe };
        }
        updateDoc(doc(db, 'sessions', sessionId), { exerciseEntries: toSave }).catch(() => {/* retried on next change */});
      }, 800);

      return next;
    });
  };

  // ── Finish session ──────────────────────────────────────────────────────────

  const handleFinishSession = async () => {
    if (!session || !cycle || !postEnergy || !postFeeling) return;
    setFinishError('');
    setFinishing(true);

    const postWorkout = { energyLevel: postEnergy, feeling: postFeeling };
    const finalEntries: Record<string, { observations: string; rpe: number }> = {};
    for (const [name, e] of Object.entries(exerciseEntries)) {
      if (e.observations.trim() || e.rpe !== '') {
        finalEntries[name] = { observations: e.observations.trim(), rpe: e.rpe === '' ? 0 : e.rpe };
      }
    }

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
        for (const ex of parsedTab.exercises) {
          const entry = finalEntries[ex.exerciseName];
          const row = ex.setGroups[0]?.rowNumber;
          if (entry && row) {
            updates.push({ range: rowRange(session.tabName, 'F', 'G', row), values: [[entry.observations, entry.rpe]] });
          }
        }
        updates.push({ range: cellRange(session.tabName, 'H', 2), values: [[true]] });

        getAccessToken()
          .then((token) => writeCells(cycle.googleSheetId, updates, token))
          .catch(() => {/* best-effort sync — Firestore remains canonical */});
      }

      // Notify trainer the workout is finished.
      notifyTrainer(
        cycle.workspaceId,
        `Terminei o treino *${session.tabName}* de ${dateLabel}.`,
      ).catch(() => {/* notification is a convenience, never a blocker */});

      // The offline snapshot is no longer useful once the session is done.
      localStorage.removeItem(offlineKey(session.id));

      setShowFinishForm(false);
    } catch {
      setFinishError('Não foi possível concluir a sessão. Tente novamente.');
    } finally {
      setFinishing(false);
    }
  };

  // ── Offline export ──────────────────────────────────────────────────────────

  const handleSaveOffline = () => {
    if (!session || !cycle || !parsedTab) return;
    setSavingOffline(true);
    try {
      const snapshot = {
        savedAt: Date.now(),
        cycleTitle: cycle.title,
        tabName: session.tabName,
        dateLabel,
        parsedTab,
        preWorkout: session.preWorkout ?? null,
        exerciseEntries,
      };
      localStorage.setItem(offlineKey(session.id), JSON.stringify(snapshot));
      window.open(`/offline/${session.id}`, '_blank');
    } finally {
      setSavingOffline(false);
    }
  };

  // ── File selected ───────────────────────────────────────────────────────────

  const handleFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPendingFile(file);
    e.target.value = '';
  };

  // ── Upload flow ─────────────────────────────────────────────────────────────

  const handleUpload = async () => {
    if (!pendingFile || !currentUser || !session || !cycle) return;

    const exerciseName =
      selectedExercise === '__custom__'
        ? customExercise.trim() || undefined
        : selectedExercise || undefined;

    const originalMB = pendingFile.size / 1_048_576;
    setUploadState({ fileName: pendingFile.name, originalMB, phase: 'compressing', progress: 0 });
    setPendingFile(null);
    setSelectedExercise('');
    setCustomExercise('');

    try {
      const token = await getAccessToken();

      // Step 1 — compress
      const { buffer, compressedSizeMB } = await compress(
        pendingFile,
        (p) => setUploadState((s) => s ? { ...s, progress: p } : s),
      );

      // Step 2 — ensure session folder exists
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

      // Step 3 — upload
      setUploadState((s) => s ? { ...s, phase: 'uploading', progress: 0 } : s);

      const uploaded = await uploadFileToDrive(
        `${session.tabName} - ${exerciseName ?? 'video'}_${Date.now()}.mp4`,
        'video/mp4',
        buffer,
        folderId,
        token,
        (p) => setUploadState((s) => s ? { ...s, progress: p } : s),
      );

      // Step 4 — Firestore writes
      const videoRef = doc(collection(db, 'videos'));
      await setDoc(videoRef, {
        id: videoRef.id,
        sessionId: session.id,
        cycleId: cycle.id,
        studentUid: currentUser.uid,
        workspaceId: cycle.workspaceId,
        exerciseName: exerciseName ?? null,
        freeFormDescription: null,
        driveFileId: uploaded.id,
        driveFileUrl: uploaded.webViewLink,
        driveThumbnailUrl: null,
        originalSizeMB: originalMB,
        compressedSizeMB,
        uploadedAt: serverTimestamp(),
      });

      if (!session.hasVideos) {
        await updateDoc(doc(db, 'sessions', session.id), { hasVideos: true });
        setSession((prev) => prev ? { ...prev, hasVideos: true } : prev);
      }

      setUploadState((s) => s ? { ...s, phase: 'done', progress: 1 } : s);
      setTimeout(() => setUploadState(null), 2500);
    } catch (err) {
      setUploadState((s) =>
        s ? { ...s, phase: 'error', error: String(err) } : s,
      );
    }
  };

  // ── Notify trainer about new videos via WhatsApp ─────────────────────────────

  const handleNotify = () => {
    if (!session || !cycle) return;
    setNotifying(true);
    const msg = `Enviei ${videos.length} vídeo(s) do treino *${session.tabName}* de ${dateLabel}.\n` +
      `Aguardo seu feedback: ${window.location.origin}/trainer/sessions/${session.id}`;
    notifyTrainer(cycle.workspaceId, msg)
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

  return (
    <Layout title={session?.tabName ?? 'Sessão'} backTo={cycleId ? `/student/cycles/${cycleId}` : '/student'}>
      {/* Session header */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
          {session?.tabName}
        </h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          {cycle?.title} · {dateLabel}
          {session?.weekNumber ? ` · Semana ${session.weekNumber}` : ''}
        </p>
      </div>

      {/* Read-only notice for sessions in a concluded week */}
      {weekConcluded && (
        <div className="mb-5 flex items-center gap-2 rounded-2xl bg-slate-100 px-4 py-3 text-sm font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
          <Lock className="h-4 w-4 flex-shrink-0" />
          Semana concluída — esta sessão é somente leitura.
        </div>
      )}

      {/* Feedback available banner */}
      {session?.feedbackStatus === 'complete' && (
        <button
          onClick={() => navigate(`/student/sessions/${sessionId}/feedback`)}
          className="mb-5 flex w-full items-center gap-3 rounded-2xl bg-emerald-50 p-4 text-left transition-all hover:bg-emerald-100 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/30"
        >
          <MessageSquare className="h-5 w-5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
          <div>
            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
              Feedback disponível!
            </p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              Toque para ver o feedback do seu treinador.
            </p>
          </div>
        </button>
      )}

      {/* ── Reading mode: workout plan, always expanded ─────────────────── */}
      <div className="mb-5">
        <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          📋 Plano de treino
          {parsedTabLoading && (
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
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
          />
        ) : !parsedTabLoading ? (
          <p className="text-xs text-slate-400 dark:text-slate-500 px-1">
            Não foi possível carregar o plano desta aba.
          </p>
        ) : null}
      </div>

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
            <RotateCcw className="h-4 w-4" />
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

          <button
            onClick={handleSubmitPreWorkout}
            disabled={!preEnergy || !preFeeling || preSubmitting || skipping}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-indigo-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
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

      {/* ── Phase B: training in progress ────────────────────────────────── */}
      {phase === 'training' && !readOnly && (
        <div className="mb-5 flex flex-col gap-3">
          <button
            onClick={handleSaveOffline}
            disabled={!parsedTab || savingOffline}
            className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <Download className="h-4 w-4" />
            Salvar para acesso offline
          </button>

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

              <div className="flex gap-3">
                <button
                  onClick={() => setShowFinishForm(false)}
                  disabled={finishing}
                  className="flex-1 rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  Voltar
                </button>
                <button
                  onClick={handleFinishSession}
                  disabled={!postEnergy || !postFeeling || finishing}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-emerald-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {finishing ? 'Concluindo…' : 'Concluir treino'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Phase C: completed — video feedback flow ─────────────────────── */}
      {phase === 'done' && (
        <>
          {/* Active upload progress */}
          {uploadState && (
            <div className="mb-4 rounded-2xl bg-indigo-50 p-4 dark:bg-indigo-900/20">
              <p className="mb-1.5 text-sm font-semibold text-indigo-800 dark:text-indigo-300">
                {uploadState.phase === 'compressing' && 'Comprimindo vídeo…'}
                {uploadState.phase === 'uploading' && 'Enviando para o Drive…'}
                {uploadState.phase === 'done' && '✅ Vídeo enviado com sucesso!'}
                {uploadState.phase === 'error' && '❌ Erro no envio'}
              </p>
              {uploadState.phase !== 'done' && uploadState.phase !== 'error' && (
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
                <p className="text-xs text-red-600 dark:text-red-400">{uploadState.error}</p>
              )}
            </div>
          )}

          {/* Video list */}
          {videos.length > 0 && (
            <ul className="mb-5 flex flex-col gap-2">
              {videos.map((v) => (
                <li
                  key={v.id}
                  className="glass-premium flex items-center gap-3 rounded-xl p-3"
                >
                  <Video className="h-5 w-5 flex-shrink-0 text-indigo-500" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-800 dark:text-white">
                      {v.exerciseName ?? 'Vídeo geral'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {fmtBytes(v.compressedSizeMB)} comprimido
                      {v.originalSizeMB > 0 && ` (original: ${fmtBytes(v.originalSizeMB)})`}
                    </p>
                  </div>
                  <a
                    href={v.driveFileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    Ver
                  </a>
                </li>
              ))}
            </ul>
          )}

          {/* Actions (hidden when read-only — concluded week or skipped) */}
          {!readOnly && (
            <div className="flex flex-col gap-3">
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                capture="environment"
                className="hidden"
                onChange={handleFileSelected}
              />

              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={!!uploadState && uploadState.phase !== 'done' && uploadState.phase !== 'error'}
                className="flex items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-white py-3 text-sm font-semibold text-indigo-700 shadow-sm transition-all hover:bg-indigo-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 dark:border-indigo-800 dark:bg-slate-800 dark:text-indigo-300 dark:hover:bg-slate-700"
              >
                <PlusCircle className="h-4 w-4" />
                Adicionar vídeo
              </button>

              {videos.length > 0 && (
                <button
                  onClick={handleNotify}
                  disabled={notifying}
                  className="flex items-center justify-center gap-2 rounded-xl bg-green-600 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-green-700 active:scale-95 disabled:opacity-60"
                >
                  📱 Notificar treinador
                </button>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Preview / exercise-label sheet ────────────────────────────── */}
      {pendingFile && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 backdrop-blur-sm">
          <div className="glass-premium w-full rounded-t-2xl p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <Video className="h-5 w-5 text-indigo-500" />
              <div>
                <p className="max-w-[240px] truncate text-sm font-semibold text-slate-900 dark:text-white">
                  {pendingFile.name}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Tamanho original: {fmtBytes(pendingFile.size / 1_048_576)}
                </p>
              </div>
            </div>

            <div className="mb-4 flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                Exercício (opcional)
              </label>
              <select
                value={selectedExercise}
                onChange={(e) => setSelectedExercise(e.target.value)}
                className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              >
                <option value="">Selecione ou deixe em branco…</option>
                {exerciseOptions.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
                <option value="__custom__">Outro — descreva</option>
              </select>

              {selectedExercise === '__custom__' && (
                <input
                  type="text"
                  value={customExercise}
                  onChange={(e) => setCustomExercise(e.target.value)}
                  placeholder="Nome do exercício…"
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => { setPendingFile(null); setSelectedExercise(''); setCustomExercise(''); }}
                className="flex-1 rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                Cancelar
              </button>
              <button
                onClick={handleUpload}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-indigo-700 active:scale-95"
              >
                <Upload className="h-4 w-4" />
                Comprimir e enviar
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
