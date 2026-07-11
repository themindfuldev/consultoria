import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { collection, doc, getDoc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { FileSpreadsheet, Mail, Pencil, User } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../hooks/useAuth';
import { getSpreadsheetTitle } from '../../services/sheetsService';
import { Layout } from '../../components/Layout';
import { useCycleWeek } from '../../hooks/useCycleWeek';
import { useGoogleTokenWarmup } from '../../hooks/useGoogleTokenWarmup';
import { CycleWeekPanel } from '../../components/student/CycleWeekPanel';
import { MODALITY_STYLE } from '../../components/student/modality';
import { WhatsAppIcon } from '../../components/icons/WhatsAppIcon';
import { Tooltip } from '../../components/Tooltip';
import { Breadcrumbs } from '../../components/Breadcrumbs';
import type { Cycle, StudentTrainer, Trainer } from '../../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extracts the spreadsheet ID from a Google Sheets URL. Returns null if invalid. */
function extractSheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CycleDetail() {
  const { cycleId } = useParams<{ cycleId: string }>();

  // Re-authorize Google on open if the (daily-expiring) token is stale.
  useGoogleTokenWarmup();

  const { currentUser, getAccessToken } = useAuth();
  const [cycle, setCycle] = useState<Cycle | null>(null);
  const [sheetTitle, setSheetTitle] = useState('');
  const [trainerPhone, setTrainerPhone] = useState('');
  const cycleWeek = useCycleWeek(cycle);

  // Replace spreadsheet
  const [showReplaceSheet, setShowReplaceSheet] = useState(false);
  const [replaceUrl, setReplaceUrl] = useState('');
  const [replaceError, setReplaceError] = useState('');
  const [replacing, setReplacing] = useState(false);

  // Select / switch trainer
  const [trainerOptions, setTrainerOptions] = useState<{ email: string; name: string }[]>([]);
  const [showTrainerModal, setShowTrainerModal] = useState(false);
  const [trainerChoice, setTrainerChoice] = useState('');
  const [savingTrainer, setSavingTrainer] = useState(false);
  const [trainerError, setTrainerError] = useState('');

  // ── Load cycle doc ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!cycleId) return;
    getDoc(doc(db, 'cycles', cycleId)).then((snap) => {
      if (snap.exists()) setCycle(snap.data() as Cycle);
    });
  }, [cycleId]);

  // Fetch the spreadsheet's file name for the header link (best-effort).
  useEffect(() => {
    if (!cycle?.googleSheetId) return;
    getAccessToken()
      .then((token) => getSpreadsheetTitle(cycle.googleSheetId, token))
      .then((t) => { if (t) setSheetTitle(t); })
      .catch(() => {/* non-fatal — falls back to a generic label */});
  }, [cycle?.googleSheetId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch the trainer's WhatsApp for the trainer-name tooltip.
  useEffect(() => {
    if (!cycle?.trainerEmail) return;
    getDoc(doc(db, 'trainers', cycle.trainerEmail))
      .then((snap) => { if (snap.exists()) setTrainerPhone((snap.data() as Trainer).whatsappPhone ?? ''); })
      .catch(() => {/* non-fatal */});
  }, [cycle?.trainerEmail]);

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

  // ── Load the student's registered trainers (for the selector) ───────────────

  useEffect(() => {
    if (!currentUser) return;
    getDocs(query(collection(db, 'student_trainers'), where('studentUid', '==', currentUser.uid)))
      .then((snap) => {
        setTrainerOptions(
          snap.docs.map((d) => {
            const link = d.data() as StudentTrainer;
            return { email: link.trainerEmail, name: link.trainerName ?? link.trainerEmail };
          }),
        );
      })
      .catch(() => {/* non-fatal — selector just shows an empty state */});
  }, [currentUser]);

  const openTrainerModal = () => {
    setTrainerChoice(cycle?.trainerEmail ?? '');
    setTrainerError('');
    setShowTrainerModal(true);
  };

  const handleSaveTrainer = async () => {
    if (!cycle || !trainerChoice) return;
    const opt = trainerOptions.find((t) => t.email === trainerChoice);
    if (!opt) return;
    setTrainerError('');
    setSavingTrainer(true);
    try {
      await updateDoc(doc(db, 'cycles', cycle.id), { trainerEmail: opt.email, trainerName: opt.name });
      setCycle((prev) => (prev ? { ...prev, trainerEmail: opt.email, trainerName: opt.name } : prev));
      setShowTrainerModal(false);
    } catch {
      setTrainerError('Não foi possível salvar o treinador. Tente novamente.');
    } finally {
      setSavingTrainer(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Layout title={cycle?.title ?? 'Sessões'} backTo="/student">
      <Breadcrumbs
        items={[
          { label: 'Meus Treinos', to: '/student' },
          { label: cycle?.title ?? 'Programa' },
        ]}
      />

      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center gap-2">
          <h1 className="min-w-0 truncate text-xl font-bold text-slate-900 dark:text-white">
            {cycle?.title ?? '…'}
          </h1>
          {cycle && (
            <span className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${MODALITY_STYLE[cycle.modality]}`}>
              {cycle.modality === 'Outro' && cycle.modalityCustom ? cycle.modalityCustom : cycle.modality}
            </span>
          )}
        </div>
        <div className="mt-2 flex flex-col gap-1.5">
          {/* Spreadsheet: sheet icon + file name (link) + edit */}
          <div className="flex min-w-0 items-center gap-1.5">
            {cycle?.googleSheetUrl ? (
              <a
                href={cycle.googleSheetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-w-0 items-center gap-1.5 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
              >
                <FileSpreadsheet className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">{sheetTitle || 'Planilha do treino'}</span>
              </a>
            ) : (
              <span className="flex items-center gap-1.5 text-sm text-slate-400 dark:text-slate-500">
                <FileSpreadsheet className="h-4 w-4 flex-shrink-0" /> Planilha do treino
              </span>
            )}
            <button
              onClick={() => { setShowReplaceSheet(true); setReplaceUrl(cycle?.googleSheetUrl ?? ''); setReplaceError(''); }}
              aria-label="Trocar planilha"
              className="flex-shrink-0 rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-slate-800 dark:hover:text-indigo-400"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Trainer: name (link + tooltip) + switch */}
          {cycle?.trainerName ? (
            <div className="flex items-center gap-1.5">
              <Tooltip
                content={
                  <>
                    <span className="flex items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                      {cycle.trainerEmail ?? '—'}
                    </span>
                    {trainerPhone && (
                      <span className="mt-0.5 flex items-center gap-1.5">
                        <WhatsAppIcon className="h-3.5 w-3.5 flex-shrink-0" />
                        +{trainerPhone}
                      </span>
                    )}
                  </>
                }
              >
                <span className="flex cursor-pointer items-center gap-1.5 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                  <User className="h-3.5 w-3.5 flex-shrink-0" />
                  {cycle.trainerName}
                </span>
              </Tooltip>
              <button
                onClick={openTrainerModal}
                aria-label="Trocar treinador"
                className="flex-shrink-0 rounded-full p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-indigo-600 dark:hover:bg-slate-800 dark:hover:text-indigo-400"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={openTrainerModal}
              className="flex w-fit items-center gap-1.5 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400"
            >
              <User className="h-3.5 w-3.5 flex-shrink-0" /> Selecionar treinador
            </button>
          )}
        </div>
      </div>

      {/* ── Week control + sessions (current + past weeks) ────────────────── */}
      {cycle && (
        <div className="glass-premium mb-5 rounded-2xl p-4">
          <CycleWeekPanel cycleWeek={cycleWeek} />
        </div>
      )}

      {/* ── Select / switch trainer ───────────────────────────────────── */}
      {showTrainerModal && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 backdrop-blur-sm">
          <div className="glass-premium w-full rounded-t-2xl p-6 shadow-2xl">
            <h2 className="mb-1 text-lg font-bold text-slate-900 dark:text-white">
              Selecionar treinador
            </h2>
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
              Escolha o treinador responsável por este programa.
            </p>

            {trainerOptions.length === 0 ? (
              <>
                <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
                  Você ainda não cadastrou treinadores.{' '}
                  <Link
                    to="/student/trainers"
                    className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
                  >
                    Cadastrar em Meus Treinadores
                  </Link>
                </p>
                <button
                  onClick={() => setShowTrainerModal(false)}
                  className="w-full rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  Fechar
                </button>
              </>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                    Treinador
                  </label>
                  <select
                    value={trainerChoice}
                    onChange={(e) => { setTrainerChoice(e.target.value); setTrainerError(''); }}
                    className="w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                  >
                    <option value="">Selecione um treinador…</option>
                    {trainerOptions.map((t) => (
                      <option key={t.email} value={t.email}>{t.name}</option>
                    ))}
                  </select>
                </div>

                {trainerError && (
                  <p className="text-xs text-red-600 dark:text-red-400">{trainerError}</p>
                )}

                <div className="flex gap-3 pt-1">
                  <button
                    onClick={handleSaveTrainer}
                    disabled={!trainerChoice || savingTrainer}
                    className="flex-1 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-indigo-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {savingTrainer ? 'Salvando…' : 'Salvar'}
                  </button>
                  <button
                    onClick={() => setShowTrainerModal(false)}
                    className="flex-1 rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
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
                  onClick={handleReplaceSheet}
                  disabled={replacing}
                  className="flex-1 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-indigo-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {replacing ? 'Salvando…' : 'Salvar'}
                </button>
                <button
                  onClick={() => { setShowReplaceSheet(false); setReplaceUrl(''); setReplaceError(''); }}
                  className="flex-1 rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
