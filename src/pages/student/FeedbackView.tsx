import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { ArrowLeft, Dumbbell, ExternalLink, FileText, MessageSquare, StickyNote } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../hooks/useAuth';
import { useGoogleTokenWarmup } from '../../hooks/useGoogleTokenWarmup';
import { Layout } from '../../components/Layout';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import { ReadOnlyVideoCard } from '../../components/UploadedVideoCard';
import { buildWeeklyFeedbackHtml, createWeeklyDoc } from '../../services/docsService';
import type { WeeklySection } from '../../services/docsService';
import { deleteDriveFile, driveFileExists, getOrCreateWeekFolder } from '../../services/driveService';
import { isFeedbackDelivered } from '../../utils/feedback';
import { tokenizeLinks } from '../../utils/linkify';
import type { Cycle, CycleWeek, Feedback, Session, SessionVideo, UserProfile } from '../../types';
import { trimText } from '../../utils/text';

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

function millis(stamp?: Timestamp): number | null {
  return stamp instanceof Timestamp ? stamp.toMillis() : null;
}

/**
 * When the trainer last touched this feedback. `updatedAt` is bumped on every
 * write; the fallbacks cover feedbacks written before it was tracked.
 */
function feedbackTouchedAt(fb: Feedback): number | null {
  return millis(fb.updatedAt) ?? millis(fb.completedAt) ?? millis(fb.createdAt);
}

// ── Component ─────────────────────────────────────────────────────────────────

export function FeedbackView() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const { getAccessToken, isGoogleTokenValid } = useAuth();
  const navigate = useNavigate();

  // Video playback here needs a Drive token; warm it on open like the other
  // student pages so a stale token doesn't surface as a failed load.
  useGoogleTokenWarmup();

  const [session, setSession] = useState<Session | null>(null);
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [studentProfile, setStudentProfile] = useState<UserProfile | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [videos, setVideos] = useState<SessionVideo[]>([]);
  const [loading, setLoading] = useState(true);

  // Weekly Google Doc state. The doc belongs to the cycle *week*, so its
  // id/url/generation time are read from (and written back to) the `weeks` doc.
  const [creatingDoc, setCreatingDoc] = useState(false);
  const [docUrl, setDocUrl] = useState<string | null>(null);
  const [docError, setDocError] = useState('');
  /** When the weekly doc was last generated (ms), or null if it never was. */
  const [docGeneratedAt, setDocGeneratedAt] = useState<number | null>(null);
  /** Sessions the stored doc was built from, or null when it doesn't say. */
  const [docSessionIds, setDocSessionIds] = useState<string[] | null>(null);
  /** True once Drive has told us the stored doc is gone (deleted or trashed). */
  const [docMissing, setDocMissing] = useState(false);

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

        // This page is usually the first thing the student opens after the
        // trainer's WhatsApp message, so it is also the earliest chance to repair
        // a session whose denormalised copy was left behind by the reply. Until
        // it matches, the session page and the weekly Doc both act as if no
        // feedback had arrived.
        if (isFeedbackDelivered(fb) && s.feedbackStatus !== 'complete') {
          updateDoc(doc(db, 'sessions', sessionId), { feedbackStatus: 'complete' })
            .catch(() => {/* best-effort — this page renders from the doc itself */});
        }

        const [cycleSnap, studentSnap, videosSnap, weekSnap] = await Promise.all([
          getDoc(doc(db, 'cycles', s.cycleId)),
          getDoc(doc(db, 'users', s.studentUid)),
          // Must filter by studentUid to satisfy the videos read rule (rules are
          // not filters). Sort client-side instead of orderBy.
          getDocs(query(
            collection(db, 'videos'),
            where('sessionId', '==', sessionId),
            where('studentUid', '==', s.studentUid),
          )),
          // The week carries the weekly doc — awaited with the rest so the
          // action below renders in its final state instead of flipping.
          getDocs(query(
            collection(db, 'cycles', s.cycleId, 'weeks'),
            where('weekNumber', '==', s.weekNumber ?? 1),
          )).catch(() => null),
        ]);

        const week = weekSnap?.docs[0]?.data() as CycleWeek | undefined;
        if (week?.feedbackDocUrl) {
          setDocUrl(week.feedbackDocUrl);
          setDocGeneratedAt(millis(week.feedbackDocGeneratedAt));
          setDocSessionIds(week.feedbackDocSessionIds ?? null);
          // A doc that was deleted in Drive (or lost to a half-failed update)
          // must not be offered as "Abrir" — check, and fall back to
          // "Atualizar" when it's really gone. Skipped without a live token so
          // a page load never triggers the Google popup.
          if (week.feedbackDocId && isGoogleTokenValid()) {
            getAccessToken()
              .then((token) => driveFileExists(week.feedbackDocId!, token))
              .then((exists) => { if (exists === false) setDocMissing(true); })
              .catch(() => {/* couldn't tell — leave the link as is */});
          }
        }

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
  }, [sessionId, getAccessToken, isGoogleTokenValid]);

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

      // 1) Every session of this cycle-week the trainer has written something for.
      //    The session's `feedbackStatus` only narrows the set — whether the reply
      //    actually went out is decided below, off the feedback doc itself, so a
      //    stale copy can't drop an answered session out of the week's document.
      const sessSnap = await getDocs(query(
        collection(db, 'sessions'),
        where('cycleId', '==', session.cycleId),
        where('studentUid', '==', session.studentUid),
      ));
      const weekSessions = sessSnap.docs
        .map((d) => d.data() as Session)
        .filter((s) => (s.weekNumber ?? 1) === weekNumber
          && (s.feedbackStatus === 'complete' || s.feedbackStatus === 'draft'))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

      // 2) One section per session (its feedback + videos).
      const sections: WeeklySection[] = [];
      // Recorded on the week alongside the doc, so the freshness check below can
      // tell a doc that predates a session's feedback from one that simply left
      // it out — the timestamp on its own cannot.
      const includedSessionIds: string[] = [];
      for (const s of weekSessions) {
        const [fbSnap, vidSnap] = await Promise.all([
          getDoc(doc(db, 'feedback', s.id)).catch(() => null),
          getDocs(query(
            collection(db, 'videos'),
            where('sessionId', '==', s.id),
            where('studentUid', '==', s.studentUid),
          )),
        ]);
        if (!fbSnap?.exists()) continue;
        const fb = fbSnap.data() as Feedback;
        // A draft the trainer is still working on is not part of the week's
        // feedbacks; a reply that went out is, whatever the session says.
        if (!isFeedbackDelivered(fb)) continue;
        const vids = vidSnap.docs.map((d) => d.data() as SessionVideo);
        vids.sort((a, b) => (a.uploadedAt?.seconds ?? Infinity) - (b.uploadedAt?.seconds ?? Infinity));
        const dateLbl = s.date instanceof Timestamp
          ? s.date.toDate().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
          : '';
        sections.push({
          sessionLabel: `${trimText(s.tabName)}${dateLbl ? ` · ${dateLbl}` : ''}`,
          exerciseFeedback: fb.exerciseFeedback,
          videos: vids,
          generalNotes: fb.generalNotes,
        });
        includedSessionIds.push(s.id);
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
      const created = await createWeeklyDoc(
        `Feedbacks - ${weekLabel}`, html, weekFolder.id, token,
      );

      // 4) Point the week at the new doc *before* dropping the old one, so a
      //    failure anywhere in here leaves the stored link on a file that still
      //    exists rather than on a deleted one.
      let pointerMoved = false;
      if (weekDoc) {
        try {
          await updateDoc(doc(db, 'cycles', session.cycleId, 'weeks', weekDoc.id), {
            feedbackDocId: created.id,
            feedbackDocUrl: created.webViewLink,
            feedbackDocGeneratedAt: serverTimestamp(),
            feedbackDocSessionIds: includedSessionIds,
          });
          pointerMoved = true;
        } catch {/* non-fatal: the new doc is usable, only the pointer is stale */}
      }
      if (pointerMoved && prevDocId && prevDocId !== created.id) {
        deleteDriveFile(prevDocId, token).catch(() => {/* may already be gone */});
      }

      setDocUrl(created.webViewLink);
      setDocGeneratedAt(Date.now());
      setDocSessionIds(includedSessionIds);
      setDocMissing(false);
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

  // The weekly doc is current only if it exists in Drive, was generated after
  // the trainer's last write to this feedback, *and* actually contains this
  // session. The last part matters on its own: a doc generated at a moment when
  // this session was left out is still newer than the feedback, so on the
  // timestamp alone it would read as current forever and "Atualizar" would never
  // come back. A doc from before either field was tracked counts as stale — one
  // "Atualizar" tap brings it (and the bookkeeping) up to date.
  const feedbackAt = feedback ? feedbackTouchedAt(feedback) : null;
  const docCoversThisSession =
    !isFeedbackDelivered(feedback) || (!!sessionId && (docSessionIds?.includes(sessionId) ?? false));
  const docUpToDate =
    !!docUrl
    && !docMissing
    && docGeneratedAt !== null
    && docCoversThisSession
    && (feedbackAt === null || docGeneratedAt >= feedbackAt);

  const dateLabel = session?.date
    ? session.date.toDate().toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    : '';

  return (
    <Layout title="Meu feedback">
      <Breadcrumbs
        items={[
          { label: 'Meus Treinos', to: '/student' },
          { label: cycle?.title ?? 'Programa', to: session ? `/student/cycles/${session.cycleId}` : undefined },
          { label: trimText(session?.tabName) || 'Treino', to: session ? `/student/cycles/${session.cycleId}/sessions/${sessionId}` : undefined },
          { label: 'Feedback' },
        ]}
      />

      {/* Header */}
      <div className="mb-5">
        <h1 className="flex items-center gap-2 text-xl font-bold text-slate-900 dark:text-white">
          <MessageSquare className="h-5 w-5 flex-shrink-0 text-emerald-500" />
          <span>{session?.weekNumber ? `Semana ${session.weekNumber} · ` : ''}{trimText(session?.tabName)} · Feedback</span>
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
                {trimText(ef.exerciseName)}
              </h3>

              {/* Student's videos */}
              {exerciseVideos.length > 0 && (
                <div className="mb-3 flex flex-col gap-2">
                  {exerciseVideos.map((v, i) => (
                    <ReadOnlyVideoCard
                      key={v.id}
                      video={v}
                      title={`Meu vídeo ${i + 1}`}
                    />
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
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <StickyNote className="h-4 w-4" /> Observações gerais
            </h3>
            <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200">
              <LinkifiedText text={feedback.generalNotes} />
            </p>
          </div>
        )}

        {/* ── Actions (bottom) ─────────────────────────────────────────────
            "Abrir" only when the weekly doc is known to exist and to already
            include this feedback; anything else — never generated, generated
            before the trainer's latest reply, or gone from Drive — offers
            "Atualizar" instead, so newly answered exercises can always be
            rolled into the doc. */}
        <div className="flex flex-col gap-2 pb-2">
          {docUpToDate ? (
            <a
              href={docUrl!}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 active:scale-95"
            >
              <FileText className="h-4 w-4" />
              Abrir feedbacks da semana
              <ExternalLink className="ml-auto h-3.5 w-3.5" />
            </a>
          ) : (
            <button
              onClick={handleCreateDoc}
              disabled={creatingDoc}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-blue-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <FileText className="h-4 w-4" />
              {creatingDoc ? 'Gerando documento…' : 'Atualizar feedbacks da semana'}
            </button>
          )}
          {docError && (
            <p className="text-xs text-red-600 dark:text-red-400">{docError}</p>
          )}

          <button
            onClick={() => session && navigate(`/student/cycles/${session.cycleId}/sessions/${sessionId}`)}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Ver treino
          </button>
        </div>
      </div>
    </Layout>
  );
}
