import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import { Dumbbell, ExternalLink, FileText } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../hooks/useAuth';
import { Layout } from '../../components/Layout';
import { buildFeedbackHtml, createFeedbackDoc } from '../../services/docsService';
import type { Cycle, Feedback, Session, SessionVideo, UserProfile } from '../../types';

// ── Component ─────────────────────────────────────────────────────────────────

export function FeedbackView() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { getAccessToken } = useAuth();
  const navigate = useNavigate();

  const [session, setSession] = useState<Session | null>(null);
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [studentProfile, setStudentProfile] = useState<UserProfile | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [videos, setVideos] = useState<SessionVideo[]>([]);
  const [loading, setLoading] = useState(true);

  // Google Doc creation state
  const [creatingDoc, setCreatingDoc] = useState(false);
  const [docUrl, setDocUrl] = useState<string | null>(null);
  const [docError, setDocError] = useState('');

  // ── Load everything ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!sessionId) return;

    const loadAll = async () => {
      try {
        const [sessionSnap, feedbackSnap] = await Promise.all([
          getDoc(doc(db, 'sessions', sessionId)),
          getDoc(doc(db, 'feedback', sessionId)),
        ]);

        if (!sessionSnap.exists() || !feedbackSnap.exists()) {
          setLoading(false);
          return;
        }

        const s = sessionSnap.data() as Session;
        const fb = feedbackSnap.data() as Feedback;
        setSession(s);
        setFeedback(fb);

        // Pre-set doc URL if already created
        if (fb.feedbackDocUrl) setDocUrl(fb.feedbackDocUrl);

        const [cycleSnap, studentSnap, videosSnap] = await Promise.all([
          getDoc(doc(db, 'cycles', s.cycleId)),
          getDoc(doc(db, 'users', s.studentUid)),
          // Must filter by studentUid to satisfy the videos read rule (rules are
          // not filters). Sort client-side instead of orderBy.
          getDocs(query(
            collection(db, 'videos'),
            where('sessionId', '==', sessionId),
            where('studentUid', '==', s.studentUid),
          )),
        ]);

        if (cycleSnap.exists()) setCycle(cycleSnap.data() as Cycle);
        if (studentSnap.exists()) setStudentProfile(studentSnap.data() as UserProfile);
        const vids = videosSnap.docs.map((d) => d.data() as SessionVideo);
        vids.sort((a, b) => (a.uploadedAt?.seconds ?? Infinity) - (b.uploadedAt?.seconds ?? Infinity));
        setVideos(vids);
      } finally {
        setLoading(false);
      }
    };

    loadAll();
  }, [sessionId]);

  // ── Create Google Doc (on demand) ───────────────────────────────────────────

  const handleCreateDoc = async () => {
    if (!feedback || !session || !cycle || !studentProfile) return;
    if (!session.driveFolderId) {
      setDocError('Pasta do Drive não encontrada. Volte e tente novamente.');
      return;
    }
    setCreatingDoc(true);
    setDocError('');
    try {
      const token = await getAccessToken();
      const sessionLabel = session.date
        ? session.date.toDate().toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
          })
        : session.tabName;

      const html = buildFeedbackHtml(
        feedback,
        `${session.tabName} · ${sessionLabel}`,
        cycle.title,
        studentProfile.displayName,
        videos,
      );

      const created = await createFeedbackDoc(html, session.driveFolderId, token);

      // Persist the URL so we don't recreate on every visit
      await updateDoc(doc(db, 'feedback', sessionId!), {
        feedbackDocUrl: created.webViewLink,
      });

      setDocUrl(created.webViewLink);
      setFeedback((prev) => prev ? { ...prev, feedbackDocUrl: created.webViewLink } : prev);
    } catch (err) {
      setDocError(`Não foi possível criar o documento: ${String(err)}`);
    } finally {
      setCreatingDoc(false);
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

  if (!feedback) {
    return (
      <Layout title="Feedback">
        <div className="rounded-2xl border-2 border-dashed border-slate-200 px-4 py-12 text-center dark:border-slate-700">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Feedback ainda não disponível.
          </p>
        </div>
      </Layout>
    );
  }

  const dateLabel = session?.date
    ? session.date.toDate().toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : '';

  return (
    <Layout title="Meu Feedback">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
          Feedback do treinador
        </h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          {cycle?.title} · {session?.tabName} · {dateLabel}
        </p>
      </div>

      {/* Exercise feedback blocks */}
      <div className="flex flex-col gap-5">
        {feedback.exerciseFeedback.map((ef) => {
          const exerciseVideos = videos.filter((v) => v.exerciseName === ef.exerciseName);
          return (
            <div key={ef.exerciseName} className="glass-premium rounded-2xl p-4">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <Dumbbell className="h-4 w-4 text-indigo-500" />
                {ef.exerciseName}
              </h3>

              {/* Student's videos */}
              {exerciseVideos.length > 0 && (
                <div className="mb-3 flex flex-col gap-1.5">
                  {exerciseVideos.map((v, i) => (
                    <a
                      key={v.id}
                      href={v.driveFileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 rounded-xl bg-slate-100/60 px-3 py-2 text-xs font-medium text-indigo-700 hover:underline dark:bg-slate-700/60 dark:text-indigo-300"
                    >
                      ▶ Meu vídeo {i + 1}
                    </a>
                  ))}
                </div>
              )}

              {/* Trainer text */}
              {ef.textFeedback ? (
                <p className="mb-3 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
                  {ef.textFeedback}
                </p>
              ) : (
                <p className="mb-3 text-sm italic text-slate-400 dark:text-slate-500">
                  Sem comentários de texto.
                </p>
              )}

              {/* Trainer media replies */}
              {ef.mediaFiles.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Respostas do treinador:
                  </p>
                  {ef.mediaFiles.map((m) => (
                    <div key={m.driveFileId}>
                      {m.mediaType === 'audio' ? (
                        <audio
                          controls
                          src={m.driveFileUrl}
                          className="w-full"
                        />
                      ) : (
                        <video
                          controls
                          src={m.driveFileUrl}
                          className="w-full rounded-xl"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* General notes */}
        {feedback.generalNotes && (
          <div className="glass-premium rounded-2xl p-4">
            <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              📝 Observações gerais
            </h3>
            <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
              {feedback.generalNotes}
            </p>
          </div>
        )}

        {/* ── Actions (bottom) ─────────────────────────────────────────── */}
        <div className="flex flex-col gap-2 pb-2">
          {docUrl ? (
            <a
              href={docUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700 transition-all hover:bg-blue-100 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/30"
            >
              <FileText className="h-4 w-4" />
              Abrir no Google Docs
              <ExternalLink className="ml-auto h-3.5 w-3.5" />
            </a>
          ) : (
            <>
              <button
                onClick={handleCreateDoc}
                disabled={creatingDoc || !session?.driveFolderId}
                className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <FileText className="h-4 w-4" />
                {creatingDoc ? 'Criando documento…' : 'Salvar feedback no Google Docs'}
              </button>
              {docError && (
                <p className="text-xs text-red-600 dark:text-red-400">{docError}</p>
              )}
              {!session?.driveFolderId && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Para criar o Google Doc, primeiro envie vídeos nesta sessão.
                </p>
              )}
            </>
          )}

          <button
            onClick={() => session && navigate(`/student/cycles/${session.cycleId}/sessions/${sessionId}`)}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <Dumbbell className="h-4 w-4" />
            Ver treino
          </button>
        </div>
      </div>
    </Layout>
  );
}
