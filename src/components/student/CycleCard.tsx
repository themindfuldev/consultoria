import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, deleteField, getDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { Archive, ClipboardList, ExternalLink, Mail, MoreVertical, RotateCcw } from 'lucide-react';
import { db } from '../../firebase';
import { useCycleWeek } from '../../hooks/useCycleWeek';
import { Tooltip } from '../Tooltip';
import { WhatsAppIcon } from '../icons/WhatsAppIcon';
import { MODALITY_STYLE } from './modality';
import type { Cycle, Trainer } from '../../types';

// ── Component ─────────────────────────────────────────────────────────────────

interface CycleCardProps {
  cycle: Cycle;
  onError: (msg: string) => void;
}

export function CycleCard({ cycle, onError }: CycleCardProps) {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [trainerPhone, setTrainerPhone] = useState('');

  const isArchived = cycle.status === 'archived';

  // Weeks-only usage: the panel isn't rendered here — we just want the current
  // week number/status for the summary. (Archived cycles skip the listeners.)
  const { currentWeek } = useCycleWeek(isArchived ? null : cycle);

  const modalityLabel =
    cycle.modality === 'Outro' && cycle.modalityCustom
      ? cycle.modalityCustom
      : cycle.modality;

  const startedAt = cycle.startDate instanceof Timestamp
    ? cycle.startDate.toDate().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    : '—';

  // Trainer WhatsApp for the tooltip.
  useEffect(() => {
    if (!cycle.trainerEmail) return;
    getDoc(doc(db, 'trainers', cycle.trainerEmail))
      .then((s) => { if (s.exists()) setTrainerPhone((s.data() as Trainer).whatsappPhone ?? ''); })
      .catch(() => {/* non-fatal */});
  }, [cycle.trainerEmail]);

  const handleArchive = async () => {
    setMenuOpen(false);
    if (!window.confirm(`Arquivar o programa "${cycle.title}"?`)) return;
    setBusy(true);
    try {
      await updateDoc(doc(db, 'cycles', cycle.id), {
        status: 'archived',
        archivedAt: Timestamp.now(),
      });
    } catch {
      onError('Não foi possível arquivar o programa. Tente novamente.');
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async () => {
    setBusy(true);
    setMenuOpen(false);
    try {
      await updateDoc(doc(db, 'cycles', cycle.id), {
        status: 'active',
        archivedAt: deleteField(),
      });
    } catch {
      onError('Não foi possível restaurar o programa. Tente novamente.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`glass-premium relative rounded-2xl p-4 transition-opacity ${busy ? 'opacity-60' : ''} ${isArchived ? 'opacity-75' : ''}`}>
      {/* ── Header row ─────────────────────────────────────────────────── */}
      <div className="mb-2 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(`/student/cycles/${cycle.id}`)}
              className="min-w-0 text-left"
            >
              <h3 className="truncate text-base font-bold text-slate-900 hover:underline dark:text-white">
                {cycle.title}
              </h3>
            </button>
            <span className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${MODALITY_STYLE[cycle.modality]}`}>
              {modalityLabel}
            </span>
          </div>
          {cycle.trainerName && (
            <div className="mt-0.5">
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
                <span className="cursor-pointer border-b border-dotted border-slate-400 text-xs text-slate-500 dark:border-slate-500 dark:text-slate-400">
                  Treinador: {cycle.trainerName}
                </span>
              </Tooltip>
            </div>
          )}
        </div>

        {/* ⋯ menu */}
        <div className="relative flex-shrink-0">
          <button
            onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}
            disabled={busy}
            aria-label="Opções"
            className="rounded-full p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
          >
            <MoreVertical className="h-4 w-4" />
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-8 z-20 w-40 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
                {isArchived ? (
                  <button
                    onClick={handleRestore}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <RotateCcw className="h-4 w-4 text-emerald-600" />
                    Restaurar
                  </button>
                ) : (
                  <button
                    onClick={handleArchive}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-slate-700 transition-colors hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-700"
                  >
                    <Archive className="h-4 w-4 text-amber-600" />
                    Arquivar
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Current week + start date (same line) ────────────────────────── */}
      <div className="mb-3 flex items-center justify-between gap-2 text-xs">
        <div className="flex min-w-0 items-center gap-2">
          {isArchived ? (
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 font-semibold text-slate-500 dark:bg-slate-700 dark:text-slate-400">
              Arquivado
            </span>
          ) : (
            <>
              <span className="text-slate-400 dark:text-slate-500">Semana atual:</span>
              {currentWeek ? (
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  Semana {currentWeek.weekNumber}
                </span>
              ) : (
                <span className="text-slate-500 dark:text-slate-400">Ainda não iniciado</span>
              )}
            </>
          )}
        </div>
        <span className="flex-shrink-0 text-slate-400 dark:text-slate-500">
          Desde {startedAt}
        </span>
      </div>

      {/* ── Action buttons ──────────────────────────────────────────────── */}
      <div className="flex gap-2">
        <button
          onClick={() => navigate(`/student/cycles/${cycle.id}`)}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-700 active:scale-95"
        >
          <ClipboardList className="h-4 w-4" />
          Abrir programa
        </button>
        <a
          href={cycle.googleSheetUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/60 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-white dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-slate-700"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Abrir planilha
        </a>
      </div>
    </div>
  );
}
