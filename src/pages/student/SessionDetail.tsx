import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  collection,
  doc,
  getDoc,
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
  ChevronDown,
  ChevronRight,
  MessageSquare,
  PlusCircle,
  Upload,
  Video,
} from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../hooks/useAuth';
import { useVideoCompress } from '../../hooks/useVideoCompress';
import { Layout } from '../../components/Layout';
import {
  getCycleWeekLabel,
  getOrCreateSessionFolder,
  uploadFileToDrive,
} from '../../services/driveService';
import { getExerciseNames, parseTrainingTab } from '../../services/sheetsService';
import type { Cycle, ParsedSheetTab, PlannedExercise, Session, SessionVideo } from '../../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBytes(mb: number): string {
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(mb * 1024).toFixed(0)} KB`;
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function fmtLoad(load: number | string): string {
  if (load === 'ESCOLHER') return 'a definir';
  if (load === '--' || !load) return '—';
  return `${load} kg`;
}

function fmtRpe(rpe: number | string): string {
  if (rpe === 'PREENCHER') return 'preencher';
  if (rpe === '--' || !rpe) return '—';
  return `RPE ${rpe}`;
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
  const { currentUser, userProfile, getAccessToken } = useAuth();
  const navigate = useNavigate();
  const { compress } = useVideoCompress();

  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [videos, setVideos] = useState<SessionVideo[]>([]);
  const [loading, setLoading] = useState(true);

  // Parsed sheet data for this session's tab
  const [parsedTab, setParsedTab] = useState<ParsedSheetTab | null>(null);
  const [parsedTabLoading, setParsedTabLoading] = useState(false);
  const [showWorkoutPlan, setShowWorkoutPlan] = useState(false);

  // Exercise options for the video tag dropdown
  const [exerciseOptions, setExerciseOptions] = useState<string[]>([]);

  // Per-video upload state (shown during active upload)
  const [uploadState, setUploadState] = useState<UploadState | null>(null);

  // Preview sheet state
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [selectedExercise, setSelectedExercise] = useState('');
  const [customExercise, setCustomExercise] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Notification state
  const [notifying, setNotifying] = useState(false);

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
        const weekLabel = getCycleWeekLabel(cycleStartDate, sessionDate);
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

  // ── Notify trainer via WhatsApp ─────────────────────────────────────────────

  const handleNotify = () => {
    if (!session || !cycle || !userProfile) return;
    setNotifying(true);
    const dateStr = session.date instanceof Timestamp
      ? session.date.toDate().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
      : '';
    const appUrl = window.location.origin;
    const msg = encodeURIComponent(
      `📹 Enviei ${videos.length} vídeo(s) do treino *${session.tabName}* de ${dateStr}.\n` +
      `Aguardo seu feedback: ${appUrl}/trainer/sessions/${session.id}`,
    );
    getDoc(doc(db, 'workspaces', cycle.workspaceId)).then((ws) => {
      const phone = (ws.data() as { whatsappPhone?: string })?.whatsappPhone ?? '';
      window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
      updateDoc(doc(db, 'sessions', session.id), {
        videosNotifiedAt: serverTimestamp(),
      });
    }).finally(() => setNotifying(false));
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading && !session) {
    return (
      <Layout title="Sessão">
        <div className="flex justify-center py-20">
          <div className="h-7 w-7 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
        </div>
      </Layout>
    );
  }

  const dateLabel = session?.date instanceof Timestamp
    ? session.date.toDate().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
    : '';

  return (
    <Layout title={session?.tabName ?? 'Sessão'}>
      {/* Session header */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
          {session?.tabName}
        </h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          {cycle?.title} · {dateLabel}
        </p>
      </div>

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

      {/* ── Workout plan from sheet ───────────────────────────────────── */}
      {(parsedTabLoading || parsedTab) && (
        <div className="mb-5">
          <button
            onClick={() => setShowWorkoutPlan((v) => !v)}
            className="mb-2 flex w-full items-center justify-between rounded-xl bg-slate-100/80 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-all hover:bg-slate-100 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <span className="flex items-center gap-2">
              📋 Plano de treino
              {parsedTabLoading && (
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
              )}
            </span>
            {showWorkoutPlan
              ? <ChevronDown className="h-4 w-4" />
              : <ChevronRight className="h-4 w-4" />}
          </button>

          {showWorkoutPlan && parsedTab && (
            <WorkoutPlan tab={parsedTab} />
          )}
        </div>
      )}

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

      {/* Actions */}
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

// ── WorkoutPlan sub-component ─────────────────────────────────────────────────

function WorkoutPlan({ tab }: { tab: ParsedSheetTab }) {
  // Group exercises by section
  const sections = new Map<string, PlannedExercise[]>();
  for (const ex of tab.exercises) {
    const list = sections.get(ex.section) ?? [];
    list.push(ex);
    sections.set(ex.section, list);
  }

  if (sections.size === 0) {
    return (
      <p className="text-xs text-slate-400 dark:text-slate-500 px-1">
        Nenhum exercício encontrado nesta aba.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {[...sections.entries()].map(([sectionName, exercises]) => (
        <div key={sectionName} className="rounded-xl border border-slate-200 bg-white/60 dark:border-slate-700 dark:bg-slate-800/60">
          <p className="rounded-t-xl bg-slate-100/80 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-600 dark:bg-slate-700/80 dark:text-slate-300">
            {sectionName}
          </p>
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {exercises.map((ex) => (
              <div key={ex.exerciseName} className="px-3 py-2.5">
                <p className="mb-1.5 text-sm font-semibold text-slate-800 dark:text-white">
                  {ex.exerciseName}
                </p>
                <div className="flex flex-col gap-0.5">
                  {ex.setGroups.map((sg, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                      <span className="min-w-[1.5rem] font-medium text-slate-700 dark:text-slate-300">
                        {sg.sets}×{sg.reps}
                      </span>
                      <span>{fmtLoad(sg.load)}</span>
                      {sg.rpe !== '--' && <span className="text-emerald-600 dark:text-emerald-400">{fmtRpe(sg.rpe)}</span>}
                      {sg.rest && <span>⏱ {sg.rest}</span>}
                      {sg.observations && (
                        <span className="ml-auto italic text-amber-600 dark:text-amber-400">
                          {sg.observations}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
