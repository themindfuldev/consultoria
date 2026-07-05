import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, deleteField, getDoc, Timestamp, updateDoc } from 'firebase/firestore';
import { Archive, Dumbbell, ExternalLink, MoreVertical, RotateCcw } from 'lucide-react';
import { db } from '../../firebase';
import { useCycleWeek } from '../../hooks/useCycleWeek';
import { Tooltip } from '../Tooltip';
import type { Cycle, Modality, Trainer } from '../../types';

// ── Modality badge colours ────────────────────────────────────────────────────

const MODALITY_STYLE: Record<Modality, string> = {
  'Força':      'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  'Mobilidade': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  'Cardio':     'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  'Competição': 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  'Outro':      'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
};

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
  const { currentWeek, currentWeekStatus } = useCycleWeek(isArchived ? null : cycle);

  const modalityLabel =
    cycle.modality === 'Outro' && cycle.modalityCustom
      ? cycle.modalityCustom
      : cycle.modality;

  const startedAt = cycle.startDate instanceof Timestamp
    ? cycle.startDate.toDate().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

  // Trainer WhatsApp for the tooltip.
  useEffect(() => {
    if (!cycle.trainerEmail) return;
    getDoc(doc(db, 'trainers', cycle.trainerEmail))
      .then((s) => { if (s.exists()) setTrainerPhone((s.data() as Trainer).whatsappPhone ?? ''); })
      .catch(() => {/* non-fatal */});
  }, [cycle.trainerEmail]);

  const handleArchive = async () => {
    setBusy(true);
    setMenuOpen(false);
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
          <button
            onClick={() => navigate(`/student/cycles/${cycle.id}`)}
            className="min-w-0 max-w-full text-left"
          >
            <h3 className="truncate text-base font-bold text-slate-900 hover:underline dark:text-white">
              {cycle.title}
            </h3>
          </button>
          {cycle.trainerName && (
            <div className="mt-0.5">
              <Tooltip
                content={
                  <>
                    <span className="block">E-mail: {cycle.trainerEmail ?? '—'}</span>
                    {trainerPhone && <span className="block">WhatsApp: +{trainerPhone}</span>}
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

      {/* ── Badges row ─────────────────────────────────────────────────── */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${MODALITY_STYLE[cycle.modality]}`}>
          {modalityLabel}
        </span>
        {isArchived && (
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-500 dark:bg-slate-700 dark:text-slate-400">
            Arquivado
          </span>
        )}
        <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">
          Desde {startedAt}
        </span>
      </div>

      {/* ── Current week (active cycles) ─────────────────────────────────── */}
      {!isArchived && (
        <div className="mb-3 flex items-center gap-2 text-xs">
          <span className="text-slate-400 dark:text-slate-500">Semana atual:</span>
          {currentWeek ? (
            <>
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                Semana {currentWeek.weekNumber}
              </span>
              {currentWeekStatus === 'in_progress' && (
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                  Em andamento
                </span>
              )}
              {currentWeekStatus === 'completed' && (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                  Concluída
                </span>
              )}
            </>
          ) : (
            <span className="text-slate-500 dark:text-slate-400">Ainda não iniciado</span>
          )}
        </div>
      )}

      {/* ── Action buttons ──────────────────────────────────────────────── */}
      <div className="flex gap-2">
        <button
          onClick={() => navigate(`/student/cycles/${cycle.id}`)}
          className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-700 active:scale-95"
        >
          <Dumbbell className="h-4 w-4" />
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
