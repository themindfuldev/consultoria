import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
} from 'firebase/firestore';
import {
  CalendarDays,
  CheckCircle2,
  ExternalLink,
  MessageSquare,
  PlusCircle,
  RefreshCw,
  Trash2,
  Video,
} from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../hooks/useAuth';
import { Layout } from '../../components/Layout';
import { getTrainingTabs } from '../../services/sheetsService';
import type { Cycle, Session } from '../../types';

// ── Date helpers ──────────────────────────────────────────────────────────────

function fmtDate(ts: Timestamp): string {
  return ts.toDate().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CycleDetail() {
  const { cycleId } = useParams<{ cycleId: string }>();
  const { currentUser, getAccessToken } = useAuth();
  const navigate = useNavigate();

  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  // Sheet tabs (training days defined by trainer)
  const [sheetTabs, setSheetTabs] = useState<string[]>([]);
  const [sheetTabsLoading, setSheetTabsLoading] = useState(false);
  const [sheetTabsError, setSheetTabsError] = useState('');

  // Session creation modal state
  const [showModal, setShowModal] = useState(false);
  const [tabName, setTabName] = useState('');
  const [sessionDate, setSessionDate] = useState(
    () => new Date().toISOString().slice(0, 10),
  );
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Session deletion state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState('');

  // ── Load cycle doc ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!cycleId) return;
    getDoc(doc(db, 'cycles', cycleId)).then((snap) => {
      if (snap.exists()) setCycle(snap.data() as Cycle);
    });
  }, [cycleId]);

  // ── Load sheet tabs ─────────────────────────────────────────────────────────

  const loadSheetTabs = async (spreadsheetId: string) => {
    setSheetTabsLoading(true);
    setSheetTabsError('');
    try {
      const token = await getAccessToken();
      const tabs = await getTrainingTabs(spreadsheetId, token);
      setSheetTabs(tabs);
    } catch {
      setSheetTabsError('Não foi possível carregar as abas da planilha.');
    } finally {
      setSheetTabsLoading(false);
    }
  };

  useEffect(() => {
    if (!cycle?.googleSheetId) return;
    loadSheetTabs(cycle.googleSheetId);
  }, [cycle?.googleSheetId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Real-time sessions listener ─────────────────────────────────────────────

  useEffect(() => {
    if (!currentUser || !cycleId) return;
    setLoading(true);
    const q = query(
      collection(db, 'sessions'),
      where('cycleId', '==', cycleId),
      where('studentUid', '==', currentUser.uid),
      orderBy('date', 'desc'),
    );
    return onSnapshot(
      q,
      (snap) => {
        setSessions(snap.docs.map((d) => d.data() as Session));
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [currentUser, cycleId]);

  // ── Create session ──────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!currentUser || !cycle) return;
    const trimmedTabName = tabName.trim();
    if (!trimmedTabName) { setCreateError('Selecione ou informe o dia/treino.'); return; }

    // Max 1 session per spreadsheet training tab.
    if (sessions.some((s) => s.tabName === trimmedTabName)) {
      setCreateError('Já existe uma sessão para este treino. Veja o histórico abaixo.');
      return;
    }

    setCreateError('');
    setCreating(true);
    try {
      const sessionRef = doc(collection(db, 'sessions'));
      const [year, month, day] = sessionDate.split('-').map(Number);
      await setDoc(sessionRef, {
        id: sessionRef.id,
        cycleId: cycle.id,
        studentUid: currentUser.uid,
        workspaceId: cycle.workspaceId,
        tabName: trimmedTabName,
        status: 'in_progress',
        date: Timestamp.fromDate(new Date(year, month - 1, day)),
        startedAt: serverTimestamp(),
        hasVideos: false,
        feedbackStatus: 'none',
      });
      setShowModal(false);
      setTabName('');
      navigate(`/student/cycles/${cycle.id}/sessions/${sessionRef.id}`);
    } catch {
      setCreateError('Não foi possível criar a sessão. Tente novamente.');
    } finally {
      setCreating(false);
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

  // Names of training-sheet tabs that already have a session created — used to
  // grey-out / disable the "create session" buttons for tabs already in use
  // (max 1 session per spreadsheet training tab).
  const usedTabNames = new Set(sessions.map((s) => s.tabName));

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
        </div>
      </div>

      {/* Training days from the sheet */}
      {(sheetTabsLoading || sheetTabs.length > 0 || sheetTabsError) && (
        <div className="mb-5">
          <div className="mb-2 flex items-center gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Treinos da planilha
            </p>
            {sheetTabsError && (
              <button
                onClick={() => cycle?.googleSheetId && loadSheetTabs(cycle.googleSheetId)}
                className="ml-auto flex items-center gap-1 text-xs text-indigo-600 hover:underline dark:text-indigo-400"
              >
                <RefreshCw className="h-3 w-3" /> Tentar novamente
              </button>
            )}
          </div>

          {sheetTabsLoading ? (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
              Carregando abas da planilha…
            </div>
          ) : sheetTabsError ? (
            <p className="text-xs text-red-500 dark:text-red-400">{sheetTabsError}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {sheetTabs.map((tab) => {
                const alreadyUsed = usedTabNames.has(tab);
                return (
                  <button
                    key={tab}
                    disabled={alreadyUsed}
                    title={alreadyUsed ? 'Já existe uma sessão para este treino' : undefined}
                    onClick={() => {
                      if (alreadyUsed) return;
                      setTabName(tab);
                      setSessionDate(new Date().toISOString().slice(0, 10));
                      setShowModal(true);
                    }}
                    className={
                      alreadyUsed
                        ? 'flex cursor-not-allowed items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-400 dark:bg-slate-800 dark:text-slate-500'
                        : 'flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-indigo-700 active:scale-95'
                    }
                  >
                    {alreadyUsed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <PlusCircle className="h-3.5 w-3.5" />}
                    {tab}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Session list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-7 w-7 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
        </div>
      ) : sessions.length === 0 ? (
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
            {sessions.map((s) => (
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

      {/* ── New session modal ─────────────────────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 backdrop-blur-sm">
          <div className="glass-premium w-full rounded-t-2xl p-6 shadow-2xl">
            <h2 className="mb-1 text-lg font-bold text-slate-900 dark:text-white">
              Nova sessão
            </h2>
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
              {tabName}
            </p>

            <div className="flex flex-col gap-4">
              {/* If no tab pre-selected, show a text input */}
              {sheetTabs.length === 0 && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Dia de treino
                  </label>
                  <input
                    type="text"
                    value={tabName}
                    onChange={(e) => { setTabName(e.target.value); setCreateError(''); }}
                    placeholder="ex: Terça, Treino A, Peito e Tríceps…"
                    autoFocus
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                  />
                </div>
              )}

              {/* Date */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                  Data
                </label>
                <input
                  type="date"
                  value={sessionDate}
                  onChange={(e) => setSessionDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
              </div>

              {createError && (
                <p className="text-xs text-red-600 dark:text-red-400">{createError}</p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => { setShowModal(false); setTabName(''); setCreateError(''); }}
                  className="flex-1 rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCreate}
                  disabled={creating}
                  className="flex-1 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-indigo-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {creating ? 'Iniciando…' : 'Iniciar sessão'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
