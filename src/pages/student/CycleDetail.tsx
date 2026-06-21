import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  CalendarDays,
  ExternalLink,
  MessageSquare,
  Pencil,
  Trash2,
  Video,
} from 'lucide-react';
import { db } from '../../firebase';
import { Layout } from '../../components/Layout';
import { useCycleWeek } from '../../hooks/useCycleWeek';
import { useGoogleTokenWarmup } from '../../hooks/useGoogleTokenWarmup';
import { CycleWeekPanel } from '../../components/student/CycleWeekPanel';
import type { Cycle, Session } from '../../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(ts: Timestamp): string {
  return ts.toDate().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** Extracts the spreadsheet ID from a Google Sheets URL. Returns null if invalid. */
function extractSheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CycleDetail() {
  const { cycleId } = useParams<{ cycleId: string }>();
  const navigate = useNavigate();

  // Re-authorize Google on open if the (daily-expiring) token is stale.
  useGoogleTokenWarmup();

  const [cycle, setCycle] = useState<Cycle | null>(null);

  const cycleWeek = useCycleWeek(cycle);
  const { sessions, sessionsLoading: loading } = cycleWeek;

  // Session deletion state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');

  // Replace spreadsheet
  const [showReplaceSheet, setShowReplaceSheet] = useState(false);
  const [replaceUrl, setReplaceUrl] = useState('');
  const [replaceError, setReplaceError] = useState('');
  const [replacing, setReplacing] = useState(false);

  // ── Load cycle doc ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!cycleId) return;
    getDoc(doc(db, 'cycles', cycleId)).then((snap) => {
      if (snap.exists()) setCycle(snap.data() as Cycle);
    });
  }, [cycleId]);

  // ── Replace spreadsheet ─────────────────────────────────────────────────────

  const handleReplaceSheet = async () => {
    if (!cycle) return;
    const trimmed = replaceUrl.trim();
    const sheetId = extractSheetId(trimmed);
    if (!sheetId) {
      setReplaceError('Cole um link válido do Google Sheets.');
      return;
    }
    setReplaceError('');
    setReplacing(true);
    try {
      await updateDoc(doc(db, 'cycles', cycle.id), {
        googleSheetId: sheetId,
        googleSheetUrl: trimmed,
      });
      setCycle((prev) => (prev ? { ...prev, googleSheetId: sheetId, googleSheetUrl: trimmed } : prev));
      setShowReplaceSheet(false);
      setReplaceUrl('');
    } catch {
      setReplaceError('Não foi possível atualizar a planilha. Tente novamente.');
    } finally {
      setReplacing(false);
    }
  };

  // ── Delete session ──────────────────────────────────────────────────────────

  const handleDeleteSession = async (session: Session) => {
    const confirmed = window.confirm(
      `Excluir a sessão "${session.tabName}" de ${fmtDate(session.date)}? Essa ação não pode ser desfeita. Os vídeos enviados ao Google Drive não serão apagados.`,
    );
    if (!confirmed) return;

    setDeleteError('');
    setDeletingId(session.id);
    try {
      // Clean up related Firestore docs so the session leaves no dangling references.
      const videosSnap = await getDocs(
        query(collection(db, 'videos'), where('sessionId', '==', session.id)),
      );
      await Promise.all(videosSnap.docs.map((d) => deleteDoc(d.ref)));
      await deleteDoc(doc(db, 'feedback', session.id)).catch(() => {/* may not exist */});
      await deleteDoc(doc(db, 'sessions', session.id));
    } catch {
      setDeleteError('Não foi possível excluir a sessão. Tente novamente.');
    } finally {
      setDeletingId(null);
    }
  };

  // ── Feedback badge ──────────────────────────────────────────────────────────

  const feedbackBadge = (s: Session) => {
    if (!s.hasVideos) return null;
    if (s.feedbackStatus === 'complete')
      return (
        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
          ✅ Feedback disponível
        </span>
      );
    if (s.feedbackStatus === 'draft')
      return (
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
          Rascunho
        </span>
      );
    return (
      <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
        📹 Aguardando
      </span>
    );
  };

  // Pending sessions are pre-created when a week starts and shown in the week
  // panel above with Iniciar/Pular actions — the history list only shows
  // sessions the student has actually engaged with (started, finished, skipped).
  const historySessions = sessions.filter((s) => s.status !== 'pending');

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Layout title={cycle?.title ?? 'Sessões'}>
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
          {cycle?.title ?? '…'}
        </h1>
        <div className="mt-1 flex items-center gap-3">
          {cycle?.trainerName && (
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Treinador: {cycle.trainerName}
            </p>
          )}
          {cycle?.googleSheetUrl && (
            <a
              href={cycle.googleSheetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              <ExternalLink className="h-3 w-3" /> Planilha
            </a>
          )}
          <button
            onClick={() => { setShowReplaceSheet(true); setReplaceUrl(cycle?.googleSheetUrl ?? ''); setReplaceError(''); }}
            className="flex items-center gap-1 text-xs font-medium text-slate-400 hover:text-indigo-600 hover:underline dark:text-slate-500 dark:hover:text-indigo-400"
          >
            <Pencil className="h-3 w-3" /> Trocar planilha
          </button>
        </div>
      </div>

      {/* ── Week control + this week's sessions ──────────────────────────── */}
      {cycle && (
        <div className="glass-premium mb-5 rounded-2xl p-4">
          <CycleWeekPanel cycleWeek={cycleWeek} />
        </div>
      )}

      {/* Session list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-7 w-7 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
        </div>
      ) : historySessions.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 px-4 py-12 text-center dark:border-slate-700">
          <div className="mb-3 text-4xl">🎬</div>
          <h2 className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
            Nenhuma sessão ainda
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Toque em um treino acima para iniciar uma sessão de vídeos.
          </p>
        </div>
      ) : (
        <>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Histórico de sessões
          </p>
          {deleteError && (
            <p className="mb-2 text-xs text-red-600 dark:text-red-400">{deleteError}</p>
          )}
          <ul className="flex flex-col gap-3">
            {historySessions.map((s) => (
              <li key={s.id} className="relative">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    navigate(
                      s.feedbackStatus === 'complete'
                        ? `/student/sessions/${s.id}/feedback`
                        : `/student/cycles/${cycleId}/sessions/${s.id}`,
                    )
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      navigate(
                        s.feedbackStatus === 'complete'
                          ? `/student/sessions/${s.id}/feedback`
                          : `/student/cycles/${cycleId}/sessions/${s.id}`,
                      );
                    }
                  }}
                  className="glass-premium w-full cursor-pointer rounded-2xl p-4 text-left transition-all active:scale-[0.99]"
                >
                  <div className="mb-1 flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {s.tabName}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                        <CalendarDays className="h-3 w-3" />
                        {fmtDate(s.date)}
                        {s.weekNumber ? ` · Semana ${s.weekNumber}` : ''}
                        {s.status === 'in_progress' && (
                          <span className="ml-1 rounded-full bg-indigo-100 px-1.5 py-0.5 font-semibold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                            Em andamento
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="flex flex-shrink-0 flex-col items-end gap-1.5 pr-7">
                      {s.hasVideos && (
                        <span className="flex items-center gap-1 text-xs text-slate-400">
                          <Video className="h-3 w-3" /> vídeos
                        </span>
                      )}
                      {feedbackBadge(s)}
                    </div>
                  </div>

                  {s.feedbackStatus === 'complete' && (
                    <div className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      <MessageSquare className="h-3.5 w-3.5" />
                      Ver feedback do treinador
                    </div>
                  )}
                </div>

                {/* Delete session */}
                <button
                  onClick={(e) => { e.stopPropagation(); handleDeleteSession(s); }}
                  disabled={deletingId === s.id}
                  aria-label="Excluir sessão"
                  title="Excluir sessão"
                  className="absolute right-3 top-3 rounded-full p-1.5 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:text-slate-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                >
                  {deletingId === s.id ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-400 border-t-transparent" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* ── Replace spreadsheet sheet ─────────────────────────────────── */}
      {showReplaceSheet && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 backdrop-blur-sm">
          <div className="glass-premium w-full rounded-t-2xl p-6 shadow-2xl">
            <h2 className="mb-1 text-lg font-bold text-slate-900 dark:text-white">
              Trocar planilha
            </h2>
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
              Cole o link da nova planilha do Google Sheets para este ciclo.
            </p>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Link da planilha
                </label>
                <input
                  type="text"
                  value={replaceUrl}
                  onChange={(e) => { setReplaceUrl(e.target.value); setReplaceError(''); }}
                  placeholder="https://docs.google.com/spreadsheets/d/…"
                  autoFocus
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                />
              </div>

              {replaceError && (
                <p className="text-xs text-red-600 dark:text-red-400">{replaceError}</p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => { setShowReplaceSheet(false); setReplaceUrl(''); setReplaceError(''); }}
                  className="flex-1 rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleReplaceSheet}
                  disabled={replacing}
                  className="flex-1 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-indigo-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {replacing ? 'Salvando…' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
