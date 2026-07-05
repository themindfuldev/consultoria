import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { Dumbbell, Send, Video } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../hooks/useAuth';
import { openWhatsApp } from '../../services/notifyService';
import { setKey } from '../../services/sheetsService';
import { Layout } from '../../components/Layout';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { WorkoutPlan } from '../../components/student/WorkoutPlan';
import type { ExerciseEntry } from '../../components/student/WorkoutPlan';
import type {
  Cycle,
  ExerciseFeedback,
  Feedback,
  FeedbackMediaFile,
  Session,
  SessionVideo,
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
  const { currentUser } = useAuth();
  const navigate = useNavigate();

  const [session, setSession] = useState<Session | null>(null);
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [videos, setVideos] = useState<SessionVideo[]>([]);
  const [loading, setLoading] = useState(true);

  // Feedback form state — keyed by exerciseName
  const [feedbackMap, setFeedbackMap] = useState<Map<string, string>>(new Map());
  const [generalNotes, setGeneralNotes] = useState('');
  const [mediaMap, setMediaMap] = useState<Map<string, FeedbackMediaFile[]>>(new Map());

  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [saveError, setSaveError] = useState('');
  // True once this feedback has been responded (status 'complete'): the button
  // is hidden, but edits keep auto-saving without downgrading it back to draft.
  const [responded, setResponded] = useState(false);

  // ── Load session + related data ─────────────────────────────────────────────

  useEffect(() => {
    if (!sessionId) return;

    const loadAll = async () => {
      try {
        const sessionSnap = await getDoc(doc(db, 'sessions', sessionId)).catch(() => null);
        if (!sessionSnap || !sessionSnap.exists()) return;
        const s = sessionSnap.data() as Session;
        setSession(s);

        // Each read is independent + tolerant: a single failure (e.g. Firestore
        // denies reading the not-yet-created feedback doc) must not blank the
        // cycle/videos too.
        //
        // The videos query is constrained to this trainer's email — the read
        // rule checks each doc's `trainerEmail`, so a list query filtered only by
        // sessionId is denied outright if *any* matching video has a different/
        // empty trainerEmail (e.g. an older upload). Filtering guarantees every
        // returned doc is readable. Sort client-side (no orderBy → no index).
        const trainerEmail = s.trainerEmail ?? '';
        const [cycleSnap, videosSnap, feedbackSnap] = await Promise.all([
          getDoc(doc(db, 'cycles', s.cycleId)).catch(() => null),
          getDocs(query(
            collection(db, 'videos'),
            where('sessionId', '==', sessionId),
            where('trainerEmail', '==', trainerEmail),
          )).catch(() => null),
          getDoc(doc(db, 'feedback', sessionId)).catch(() => null),
        ]);

        if (cycleSnap?.exists()) setCycle(cycleSnap.data() as Cycle);

        if (videosSnap) {
          const vids = videosSnap.docs.map((d) => d.data() as SessionVideo);
          vids.sort((a, b) => (a.uploadedAt?.seconds ?? Infinity) - (b.uploadedAt?.seconds ?? Infinity));
          setVideos(vids);
        }

        // Pre-fill form if draft exists
        if (feedbackSnap?.exists()) {
          const fb = feedbackSnap.data() as Feedback;
          if (fb.status === 'complete') setResponded(true);
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
    if (!currentUser || !session || completing) return;
    setSaving(true);
    setSaveError('');
    try {
      // An already-responded feedback keeps 'complete' on edit (don't downgrade).
      const status = responded ? 'complete' : 'draft';
      const exerciseFeedback = buildExerciseFeedbackArray();
      await setDoc(
        doc(db, 'feedback', sessionId!),
        {
          id: sessionId,
          sessionId,
          cycleId: session.cycleId,
          studentUid: session.studentUid,
          studentName: session.studentName ?? '',
          trainerEmail: session.trainerEmail ?? currentUser.email ?? '',
          status,
          exerciseFeedback,
          generalNotes,
          createdAt: serverTimestamp(),
        },
        { merge: true },
      );
      // Denormalise feedbackStatus on session
      await updateDoc(doc(db, 'sessions', sessionId!), { feedbackStatus: status });
    } catch {
      setSaveError('Não foi possível salvar o rascunho.');
    } finally {
      setSaving(false);
    }
  };

  // ── Auto-save the draft (debounced) — replaces the manual "Salvar rascunho" ──
  // `hydratedRef` guards against saving on the initial prefill from an existing
  // draft: it flips true one tick after loading finishes, so the prefill-driven
  // run of the effect below is skipped and only real edits trigger a save.
  const hydratedRef = useRef(false);
  useEffect(() => {
    if (loading) return;
    const t = setTimeout(() => { hydratedRef.current = true; }, 0);
    return () => clearTimeout(t);
  }, [loading]);
  useEffect(() => {
    if (!hydratedRef.current) return;
    const t = setTimeout(() => { handleSaveDraft(); }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedbackMap, generalNotes]);

  // ── Complete feedback + WhatsApp + feedbackStatus ────────────────────────────

  const handleComplete = async () => {
    if (!currentUser || !session || !cycle) return;
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
          studentName: session.studentName ?? '',
          trainerEmail: session.trainerEmail ?? currentUser.email ?? '',
          status: 'complete',
          exerciseFeedback,
          generalNotes,
          createdAt: serverTimestamp(),
          completedAt: serverTimestamp(),
        },
        { merge: true },
      );
      await updateDoc(doc(db, 'sessions', sessionId!), { feedbackStatus: 'complete' });

      // WhatsApp notification to student (number denormalised on the session).
      if (session.studentWhatsapp) {
        const appUrl = window.location.origin;
        const weekSuffix = session.weekNumber ? ` (Semana ${session.weekNumber}).` : '.';
        openWhatsApp(
          session.studentWhatsapp,
          'Feedback disponível',
          `Segue o feedback do seu treino *${session.tabName}*${weekSuffix}\n` +
          `${appUrl}/student/sessions/${sessionId}/feedback`,
        );
      }

      navigate('/trainer');
    } catch {
      setSaveError('Não foi possível concluir o feedback.');
    } finally {
      setCompleting(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <Layout title="Feedback" backTo="/trainer">
        <div className="flex justify-center py-20">
          <div className="h-7 w-7 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
        </div>
      </Layout>
    );
  }

  const dateLabel = session?.date instanceof Timestamp ? fmtDate(session.date) : '';

  // Seed every set from the plan (sheet Observações/RPE) overlaid with the
  // student's saved entries — identical to the student's finished view, so the
  // Observações render the same way (not the amber "reference" style).
  const planEntries: Record<string, ExerciseEntry> = {};
  if (session?.plan) {
    const saved = session.exerciseEntries ?? {};
    for (const ex of session.plan.exercises) {
      ex.setGroups.forEach((sg, i) => {
        const key = setKey(ex.exerciseName, i, sg.rowNumber);
        const savedEntry = saved[key];
        planEntries[key] = {
          observations: savedEntry?.observations ?? sg.observations ?? '',
          rpe: savedEntry?.rpe != null
            ? savedEntry.rpe
            : (typeof sg.rpe === 'number' ? sg.rpe : ''),
        };
      });
    }
  }

  return (
    <Layout title="Dar feedback" backTo="/trainer">
      <Breadcrumbs
        items={[
          { label: 'Painel', to: '/trainer' },
          { label: 'Feedback' },
        ]}
      />

      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
          {session?.studentName || 'Aluno'}
        </h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          {[
            cycle?.title,
            dateLabel,
            session?.weekNumber ? `Semana ${session.weekNumber}` : null,
            session?.tabName,
          ].filter(Boolean).join(' · ')}
        </p>
      </div>

      {/* Plano de treino — same read-only summary the student sees, if snapshotted */}
      {session?.plan && (
        <div className="mb-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            📋 Plano de treino
          </p>
          <WorkoutPlan tab={session.plan} entries={planEntries} />
        </div>
      )}

      {/* Exercise blocks */}
      <div className="flex flex-col gap-6">
        {videos.length === 0 && (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 px-4 py-6 text-center dark:border-slate-700">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              O aluno ainda não enviou vídeos para esta sessão. Você pode deixar
              observações gerais abaixo.
            </p>
          </div>
        )}

        {[...exerciseGroups.byExercise.entries()].map(([exerciseName, vids]) => (
          <ExerciseBlock
            key={exerciseName}
            exerciseName={exerciseName}
            videos={vids}
            feedbackText={feedbackMap.get(exerciseName) ?? ''}
            mediaFiles={mediaMap.get(exerciseName) ?? []}
            onFeedbackChange={(t) =>
              setFeedbackMap((m) => { const n = new Map(m); n.set(exerciseName, t); return n; })
            }
          />
        ))}

        {/* General videos (no exercise label) */}
        {exerciseGroups.general.length > 0 && (
          <ExerciseBlock
            exerciseName="Geral"
            videos={exerciseGroups.general}
            feedbackText={feedbackMap.get('Geral') ?? ''}
            mediaFiles={mediaMap.get('Geral') ?? []}
            onFeedbackChange={(t) =>
              setFeedbackMap((m) => { const n = new Map(m); n.set('Geral', t); return n; })
            }
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

        {/* Auto-save status */}
        <p className="text-center text-xs text-slate-400 dark:text-slate-500">
          {saving
            ? 'Salvando…'
            : responded
              ? 'Feedback respondido · as alterações são salvas automaticamente'
              : 'As alterações são salvas automaticamente'}
        </p>

        {/* Action button — hidden once the feedback has been responded */}
        {!responded && (
          <div className="pb-6">
            <button
              onClick={handleComplete}
              disabled={completing || saving}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-indigo-700 active:scale-95 disabled:opacity-60"
            >
              <Send className="h-4 w-4" />
              {completing ? 'Enviando…' : 'Responder feedback'}
            </button>
          </div>
        )}
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
  onFeedbackChange: (text: string) => void;
}

function ExerciseBlock({
  exerciseName,
  videos,
  feedbackText,
  mediaFiles,
  onFeedbackChange,
}: ExerciseBlockProps) {
  return (
    <div className="glass-premium rounded-2xl p-4">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        <Dumbbell className="h-4 w-4 text-indigo-500" />
        {exerciseName}
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
            <Video className="h-5 w-5 flex-shrink-0 text-indigo-500" />
            Vídeo {i + 1}
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
    </div>
  );
}
