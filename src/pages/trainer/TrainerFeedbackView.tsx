import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { Mic, Save, Send, Upload } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../hooks/useAuth';
import { Layout } from '../../components/Layout';
import {
  getOrCreateTrainerFeedbackFolder,
  uploadFileToDrive,
} from '../../services/driveService';
import type {
  Cycle,
  ExerciseFeedback,
  Feedback,
  FeedbackMediaFile,
  Session,
  SessionVideo,
  UserProfile,
  Workspace,
} from '../../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(ts: Timestamp): string {
  return ts.toDate().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TrainerFeedbackView() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { currentUser, getAccessToken } = useAuth();
  const navigate = useNavigate();

  const [session, setSession] = useState<Session | null>(null);
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [studentProfile, setStudentProfile] = useState<UserProfile | null>(null);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [videos, setVideos] = useState<SessionVideo[]>([]);
  const [loading, setLoading] = useState(true);

  // Feedback form state — keyed by exerciseName
  const [feedbackMap, setFeedbackMap] = useState<Map<string, string>>(new Map());
  const [generalNotes, setGeneralNotes] = useState('');
  const [mediaMap, setMediaMap] = useState<Map<string, FeedbackMediaFile[]>>(new Map());
  const [uploadingMedia, setUploadingMedia] = useState<string | null>(null); // exerciseName or 'general'

  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  const mediaInputRef = useRef<HTMLInputElement>(null);
  const activeMediaTarget = useRef<string>(''); // exerciseName or 'general'

  // ── Load session + related data ─────────────────────────────────────────────

  useEffect(() => {
    if (!sessionId) return;

    const loadAll = async () => {
      try {
        const sessionSnap = await getDoc(doc(db, 'sessions', sessionId));
        if (!sessionSnap.exists()) return;
        const s = sessionSnap.data() as Session;
        setSession(s);

        const [cycleSnap, studentSnap, wsSnap, videosSnap, feedbackSnap] = await Promise.all([
          getDoc(doc(db, 'cycles', s.cycleId)),
          getDoc(doc(db, 'users', s.studentUid)),
          getDoc(doc(db, 'workspaces', s.workspaceId)),
          getDocs(query(
            collection(db, 'videos'),
            where('sessionId', '==', sessionId),
            orderBy('uploadedAt', 'asc'),
          )),
          getDoc(doc(db, 'feedback', sessionId)),
        ]);

        if (cycleSnap.exists()) setCycle(cycleSnap.data() as Cycle);
        if (studentSnap.exists()) setStudentProfile(studentSnap.data() as UserProfile);
        if (wsSnap.exists()) setWorkspace(wsSnap.data() as Workspace);

        const vids = videosSnap.docs.map((d) => d.data() as SessionVideo);
        setVideos(vids);

        // Pre-fill form if draft exists
        if (feedbackSnap.exists()) {
          const fb = feedbackSnap.data() as Feedback;
          const fMap = new Map<string, string>();
          const mMap = new Map<string, FeedbackMediaFile[]>();
          for (const ef of fb.exerciseFeedback) {
            fMap.set(ef.exerciseName, ef.textFeedback);
            if (ef.mediaFiles.length > 0) mMap.set(ef.exerciseName, ef.mediaFiles);
          }
          setFeedbackMap(fMap);
          setGeneralNotes(fb.generalNotes ?? '');
          setMediaMap(mMap);
        }
      } finally {
        setLoading(false);
      }
    };

    loadAll();
  }, [sessionId]);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  const exerciseGroups = (() => {
    const map = new Map<string, SessionVideo[]>();
    const generalGroup: SessionVideo[] = [];
    for (const v of videos) {
      if (v.exerciseName) {
        const list = map.get(v.exerciseName) ?? [];
        list.push(v);
        map.set(v.exerciseName, list);
      } else {
        generalGroup.push(v);
      }
    }
    return { byExercise: map, general: generalGroup };
  })();

  const buildExerciseFeedbackArray = (): ExerciseFeedback[] => {
    const result: ExerciseFeedback[] = [];
    for (const [name] of exerciseGroups.byExercise) {
      result.push({
        exerciseName: name,
        textFeedback: feedbackMap.get(name) ?? '',
        mediaFiles: mediaMap.get(name) ?? [],
      });
    }
    if (exerciseGroups.general.length > 0) {
      result.push({
        exerciseName: 'Geral',
        textFeedback: feedbackMap.get('Geral') ?? '',
        mediaFiles: mediaMap.get('Geral') ?? [],
      });
    }
    return result;
  };

  // ── Save draft ──────────────────────────────────────────────────────────────

  const handleSaveDraft = async () => {
    if (!currentUser || !session) return;
    setSaving(true);
    setSaveError('');
    try {
      const exerciseFeedback = buildExerciseFeedbackArray();
      await setDoc(
        doc(db, 'feedback', sessionId!),
        {
          id: sessionId,
          sessionId,
          cycleId: session.cycleId,
          studentUid: session.studentUid,
          workspaceId: session.workspaceId,
          trainerUid: currentUser.uid,
          status: 'draft',
          exerciseFeedback,
          generalNotes,
          createdAt: serverTimestamp(),
        },
        { merge: true },
      );
      // Denormalise feedbackStatus on session
      await updateDoc(doc(db, 'sessions', sessionId!), { feedbackStatus: 'draft' });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch {
      setSaveError('Não foi possível salvar o rascunho.');
    } finally {
      setSaving(false);
    }
  };

  // ── Complete feedback + WhatsApp + feedbackStatus ────────────────────────────

  const handleComplete = async () => {
    if (!currentUser || !session || !studentProfile || !cycle) return;
    setCompleting(true);
    setSaveError('');
    try {
      const exerciseFeedback = buildExerciseFeedbackArray();
      await setDoc(
        doc(db, 'feedback', sessionId!),
        {
          id: sessionId,
          sessionId,
          cycleId: session.cycleId,
          studentUid: session.studentUid,
          workspaceId: session.workspaceId,
          trainerUid: currentUser.uid,
          status: 'complete',
          exerciseFeedback,
          generalNotes,
          createdAt: serverTimestamp(),
          completedAt: serverTimestamp(),
        },
        { merge: true },
      );
      await updateDoc(doc(db, 'sessions', sessionId!), { feedbackStatus: 'complete' });

      // WhatsApp notification to student
      const dateStr = session.date instanceof Timestamp ? fmtDate(session.date) : '';
      const appUrl = window.location.origin;
      const msg = encodeURIComponent(
        `📝 Seu feedback do treino *${session.tabName}* de ${dateStr} está pronto!\n` +
        `${appUrl}/student/sessions/${sessionId}/feedback`,
      );
      window.open(
        `https://wa.me/${studentProfile.whatsappPhone}?text=${msg}`,
        '_blank',
      );

      navigate('/trainer');
    } catch {
      setSaveError('Não foi possível concluir o feedback.');
    } finally {
      setCompleting(false);
    }
  };

  // ── Trainer media upload ────────────────────────────────────────────────────

  const handleMediaFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !currentUser || !session || !studentProfile) return;

    const target = activeMediaTarget.current;
    setUploadingMedia(target);

    try {
      const token = await getAccessToken();

      const dateStr = session.date instanceof Timestamp
        ? session.date.toDate().toISOString().slice(0, 10)
        : '';
      const sessionLabel = `${session.tabName} — ${dateStr}`;

      const { subfolder, rootFolderId } = await getOrCreateTrainerFeedbackFolder(
        studentProfile.displayName,
        sessionLabel,
        token,
        workspace?.id ? undefined : undefined, // future: cache rootFolderId on workspace
      );

      const mimeType = file.type || 'application/octet-stream';
      const uploaded = await uploadFileToDrive(
        file.name,
        mimeType,
        await file.arrayBuffer(),
        subfolder.id,
        token,
      );

      const newMedia: FeedbackMediaFile = {
        driveFileId: uploaded.id,
        driveFileUrl: uploaded.webViewLink,
        mediaType: file.type.startsWith('audio') ? 'audio' : 'video',
        fileName: file.name,
        sizeMB: file.size / 1_048_576,
      };

      setMediaMap((prev) => {
        const next = new Map(prev);
        next.set(target, [...(prev.get(target) ?? []), newMedia]);
        return next;
      });

      // Optionally save the root folder ID to workspace doc for reuse
      if (rootFolderId && workspace) {
        updateDoc(doc(db, 'workspaces', workspace.id), {
          feedbackFolderId: rootFolderId,
        }).catch(() => {/* non-fatal */});
      }
    } catch (err) {
      setSaveError(`Erro ao enviar mídia: ${String(err)}`);
    } finally {
      setUploadingMedia(null);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <Layout title="Feedback">
        <div className="flex justify-center py-20">
          <div className="h-7 w-7 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
        </div>
      </Layout>
    );
  }

  const dateLabel = session?.date instanceof Timestamp ? fmtDate(session.date) : '';

  return (
    <Layout title="Dar feedback">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
          {studentProfile?.displayName}
        </h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          {cycle?.title} · {session?.tabName} · {dateLabel}
        </p>
      </div>

      {/* Hidden media input */}
      <input
        ref={mediaInputRef}
        type="file"
        accept="audio/*,video/*"
        className="hidden"
        onChange={handleMediaFileSelected}
      />

      {/* Exercise blocks */}
      <div className="flex flex-col gap-6">
        {[...exerciseGroups.byExercise.entries()].map(([exerciseName, vids]) => (
          <ExerciseBlock
            key={exerciseName}
            exerciseName={exerciseName}
            videos={vids}
            feedbackText={feedbackMap.get(exerciseName) ?? ''}
            mediaFiles={mediaMap.get(exerciseName) ?? []}
            uploadingMedia={uploadingMedia === exerciseName}
            onFeedbackChange={(t) =>
              setFeedbackMap((m) => { const n = new Map(m); n.set(exerciseName, t); return n; })
            }
            onAddMedia={() => {
              activeMediaTarget.current = exerciseName;
              mediaInputRef.current?.click();
            }}
          />
        ))}

        {/* General videos (no exercise label) */}
        {exerciseGroups.general.length > 0 && (
          <ExerciseBlock
            exerciseName="Geral"
            videos={exerciseGroups.general}
            feedbackText={feedbackMap.get('Geral') ?? ''}
            mediaFiles={mediaMap.get('Geral') ?? []}
            uploadingMedia={uploadingMedia === 'Geral'}
            onFeedbackChange={(t) =>
              setFeedbackMap((m) => { const n = new Map(m); n.set('Geral', t); return n; })
            }
            onAddMedia={() => {
              activeMediaTarget.current = 'Geral';
              mediaInputRef.current?.click();
            }}
          />
        )}

        {/* General notes */}
        <div className="glass-premium rounded-2xl p-4">
          <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            📝 Observações gerais
          </h3>
          <textarea
            value={generalNotes}
            onChange={(e) => setGeneralNotes(e.target.value)}
            rows={4}
            placeholder="Observações gerais sobre a sessão…"
            className="w-full resize-none rounded-xl border border-slate-200 bg-white/70 px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
          />
        </div>

        {/* Error */}
        {saveError && (
          <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
            {saveError}
          </p>
        )}

        {saveSuccess && (
          <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
            ✅ Rascunho salvo!
          </p>
        )}

        {/* Action buttons */}
        <div className="flex gap-3 pb-6">
          <button
            onClick={handleSaveDraft}
            disabled={saving || completing}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-700 transition-all hover:bg-slate-50 active:scale-95 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <Save className="h-4 w-4" />
            {saving ? 'Salvando…' : 'Salvar rascunho'}
          </button>
          <button
            onClick={handleComplete}
            disabled={completing || saving}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-indigo-700 active:scale-95 disabled:opacity-60"
          >
            <Send className="h-4 w-4" />
            {completing ? 'Concluindo…' : '✅ Concluir'}
          </button>
        </div>
      </div>
    </Layout>
  );
}

// ── Sub-component: exercise block ─────────────────────────────────────────────

interface ExerciseBlockProps {
  exerciseName: string;
  videos: SessionVideo[];
  feedbackText: string;
  mediaFiles: FeedbackMediaFile[];
  uploadingMedia: boolean;
  onFeedbackChange: (text: string) => void;
  onAddMedia: () => void;
}

function ExerciseBlock({
  exerciseName,
  videos,
  feedbackText,
  mediaFiles,
  uploadingMedia,
  onFeedbackChange,
  onAddMedia,
}: ExerciseBlockProps) {
  return (
    <div className="glass-premium rounded-2xl p-4">
      <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        🎬 {exerciseName}
      </h3>

      {/* Videos */}
      <div className="mb-3 flex flex-col gap-2">
        {videos.map((v, i) => (
          <a
            key={v.id}
            href={v.driveFileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-xl bg-slate-100/60 px-3 py-2.5 text-sm font-medium text-indigo-700 transition-colors hover:bg-slate-100 dark:bg-slate-700/60 dark:text-indigo-300"
          >
            ▶ Vídeo {i + 1}
            <span className="ml-auto text-xs text-slate-400">
              {(v.compressedSizeMB).toFixed(1)} MB
            </span>
          </a>
        ))}
      </div>

      {/* Feedback text */}
      <textarea
        value={feedbackText}
        onChange={(e) => onFeedbackChange(e.target.value)}
        rows={3}
        placeholder={`Feedback para ${exerciseName}…`}
        className="mb-3 w-full resize-none rounded-xl border border-slate-200 bg-white/70 px-3 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-500"
      />

      {/* Media files already uploaded */}
      {mediaFiles.length > 0 && (
        <ul className="mb-3 flex flex-col gap-1.5">
          {mediaFiles.map((m) => (
            <li key={m.driveFileId}>
              <a
                href={m.driveFileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
              >
                {m.mediaType === 'audio' ? '🎤' : '🎬'} {m.fileName}
              </a>
            </li>
          ))}
        </ul>
      )}

      {/* Add media button */}
      <button
        onClick={onAddMedia}
        disabled={uploadingMedia}
        className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white/60 px-3 py-2 text-xs font-semibold text-slate-600 transition-all hover:bg-white active:scale-95 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300"
      >
        {uploadingMedia ? (
          <span className="animate-pulse">Enviando…</span>
        ) : (
          <>
            {exerciseName === 'Geral' ? <Upload className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
            Adicionar áudio/vídeo
          </>
        )}
      </button>
    </div>
  );
}
