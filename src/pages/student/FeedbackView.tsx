import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { ChevronLeft, Dumbbell, ExternalLink, FileText } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../hooks/useAuth';
import { Layout } from '../../components/Layout';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { buildWeeklyFeedbackHtml, replaceWeeklyDoc } from '../../services/docsService';
import type { WeeklySection } from '../../services/docsService';
import { getOrCreateWeekFolder } from '../../services/driveService';
import { tokenizeLinks } from '../../utils/linkify';
import type { Cycle, CycleWeek, Feedback, Session, SessionVideo, UserProfile } from '../../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Renders plain feedback text with any URLs turned into clickable links. */
function LinkifiedText({ text }: { text: string }) {
  return (
    <>
      {tokenizeLinks(text).map((t, i) =>
        t.type === 'url' ? (
          <a
            key={i}
            href={t.value}
            target="_blank"
            rel="noopener noreferrer"
            className="break-words text-indigo-600 underline hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300"
          >
            {t.value}
          </a>
        ) : (
          <span key={i}>{t.value}</span>
        ),
      )}
    </>
  );
}

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

        // Pre-set the weekly doc URL if this week already has one.
        getDocs(query(
          collection(db, 'cycles', s.cycleId, 'weeks'),
          where('weekNumber', '==', s.weekNumber ?? 1),
        ))
          .then((snap) => {
            const wd = snap.docs[0]?.data() as CycleWeek | undefined;
            if (wd?.feedbackDocUrl) setDocUrl(wd.feedbackDocUrl);
          })
          .catch(() => {/* non-fatal */});

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
    if (!session || !cycle || !studentProfile) return;
    setCreatingDoc(true);
    setDocError('');
    try {
      const token = await getAccessToken();
      const weekNumber = session.weekNumber ?? 1;
      const weekLabel = `Semana ${weekNumber}`;
      const modality = cycle.modality === 'Outro'
        ? (cycle.modalityCustom ?? 'Outro')
        : cycle.modality;

      // 1) All the student's completed-feedback sessions in this cycle-week.
      const sessSnap = await getDocs(query(
        collection(db, 'sessions'),
        where('cycleId', '==', session.cycleId),
        where('studentUid', '==', session.studentUid),
      ));
      const weekSessions = sessSnap.docs
        .map((d) => d.data() as Session)
        .filter((s) => (s.weekNumber ?? 1) === weekNumber && s.feedbackStatus === 'complete')
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

      // 2) One section per session (its feedback + videos).
      const sections: WeeklySection[] = [];
      for (const s of weekSessions) {
        const [fbSnap, vidSnap] = await Promise.all([
          getDoc(doc(db, 'feedback', s.id)),
          getDocs(query(
            collection(db, 'videos'),
            where('sessionId', '==', s.id),
            where('studentUid', '==', s.studentUid),
          )),
        ]);
        if (!fbSnap.exists()) continue;
        const fb = fbSnap.data() as Feedback;
        const vids = vidSnap.docs.map((d) => d.data() as SessionVideo);
        vids.sort((a, b) => (a.uploadedAt?.seconds ?? Infinity) - (b.uploadedAt?.seconds ?? Infinity));
        const dateLbl = s.date instanceof Timestamp
          ? s.date.toDate().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
          : '';
        sections.push({
          sessionLabel: `${s.tabName}${dateLbl ? ` · ${dateLbl}` : ''}`,
          exerciseFeedback: fb.exerciseFeedback,
          videos: vids,
          generalNotes: fb.generalNotes,
        });
      }

      // 3) Week folder + the single weekly doc (replace if it exists).
      const weekFolder = await getOrCreateWeekFolder(
        cycle.trainerName ?? 'Treinador',
        studentProfile.displayName,
        cycle.title,
        weekLabel,
        token,
      );

      const weekQ = await getDocs(query(
        collection(db, 'cycles', session.cycleId, 'weeks'),
        where('weekNumber', '==', weekNumber),
      ));
      const weekDoc = weekQ.docs[0];
      const prevDocId = (weekDoc?.data() as CycleWeek | undefined)?.feedbackDocId;

      const html = buildWeeklyFeedbackHtml(
        weekNumber, cycle.title, modality, studentProfile.displayName, sections,
      );
      const created = await replaceWeeklyDoc(
        prevDocId, `Feedbacks - ${weekLabel}`, html, weekFolder.id, token,
      );

      if (weekDoc) {
        await updateDoc(doc(db, 'cycles', session.cycleId, 'weeks', weekDoc.id), {
          feedbackDocId: created.id,
          feedbackDocUrl: created.webViewLink,
        }).catch(() => {/* non-fatal */});
      }

      setDocUrl(created.webViewLink);
    } catch (err) {
      console.error(err);
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
      <Breadcrumbs
        items={[
          { label: 'Meus Treinos', to: '/student' },
          { label: cycle?.title ?? 'Programa', to: session ? `/student/cycles/${session.cycleId}` : undefined },
          { label: session?.tabName ?? 'Treino', to: session ? `/student/cycles/${session.cycleId}/sessions/${sessionId}` : undefined },
          { label: 'Feedback' },
        ]}
      />

      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
          {session?.weekNumber ? `Semana ${session.weekNumber} · ` : ''}{session?.tabName} · Feedback do treinador
        </h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
          {cycle?.title} · {dateLabel}
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
                  <LinkifiedText text={ef.textFeedback} />
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
              <LinkifiedText text={feedback.generalNotes} />
            </p>
          </div>
        )}

        {/* ── Actions (bottom) ─────────────────────────────────────────── */}
        <div className="flex flex-col gap-2 pb-2">
          {docUrl && (
            <a
              href={docUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 active:scale-95"
            >
              <FileText className="h-4 w-4" />
              Abrir feedbacks da semana
              <ExternalLink className="ml-auto h-3.5 w-3.5" />
            </a>
          )}
          <button
            onClick={handleCreateDoc}
            disabled={creatingDoc}
            className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 ${
              docUrl
                ? 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                : 'bg-blue-600 text-white shadow-sm hover:bg-blue-700'
            }`}
          >
            <FileText className="h-4 w-4" />
            {creatingDoc
              ? 'Gerando documento…'
              : docUrl
                ? 'Atualizar documento da semana'
                : 'Salvar feedbacks da semana no Google Docs'}
          </button>
          {docError && (
            <p className="text-xs text-red-600 dark:text-red-400">{docError}</p>
          )}

          <button
            onClick={() => session && navigate(`/student/cycles/${session.cycleId}/sessions/${sessionId}`)}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <ChevronLeft className="h-4 w-4" />
            Ver treino
          </button>
        </div>
      </div>
    </Layout>
  );
}
