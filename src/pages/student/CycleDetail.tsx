import { useEffect, useState } from 'react';
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
  where,
} from 'firebase/firestore';
import { CalendarDays, ExternalLink, MessageSquare, PlusCircle, RefreshCw, Video } from 'lucide-react';
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
    if (!tabName.trim()) { setCreateError('Selecione ou informe o dia/treino.'); return; }

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
        tabName: tabName.trim(),
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
              {sheetTabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => {
                    setTabName(tab);
                    setSessionDate(new Date().toISOString().slice(0, 10));
                    setShowModal(true);
                  }}
                  className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:bg-indigo-700 active:scale-95"
                >
                  <PlusCircle className="h-3.5 w-3.5" />
                  {tab}
                </button>
              ))}
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
          <ul className="flex flex-col gap-3">
            {sessions.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() =>
                    navigate(
                      s.feedbackStatus === 'complete'
                        ? `/student/sessions/${s.id}/feedback`
                        : `/student/cycles/${cycleId}/sessions/${s.id}`,
                    )
                  }
                  className="glass-premium w-full rounded-2xl p-4 text-left transition-all active:scale-[0.99]"
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
                    <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
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
