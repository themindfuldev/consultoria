import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, deleteField, Timestamp, updateDoc } from 'firebase/firestore';
import { Archive, ExternalLink, MoreVertical, RotateCcw, Video } from 'lucide-react';
import { db } from '../../firebase';
import type { Cycle, Modality } from '../../types';

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

  const isArchived = cycle.status === 'archived';

  const modalityLabel =
    cycle.modality === 'Outro' && cycle.modalityCustom
      ? cycle.modalityCustom
      : cycle.modality;

  const startedAt = cycle.startDate instanceof Timestamp
    ? cycle.startDate.toDate().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';

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
          <h3 className="truncate text-base font-bold text-slate-900 dark:text-white">
            {cycle.title}
          </h3>
          {cycle.trainerName && (
            <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
              Treinador: {cycle.trainerName}
            </p>
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
              {/* Backdrop */}
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

      {/* ── Action buttons ──────────────────────────────────────────────── */}
      <div className="flex gap-2">
        {/* Sessions / video feedback (active cycles only) */}
        {!isArchived && (
          <button
            onClick={() => navigate(`/student/cycles/${cycle.id}`)}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 active:scale-95"
          >
            <Video className="h-3.5 w-3.5" />
            Enviar vídeos
          </button>
        )}

        {/* Open spreadsheet */}
        <a
          href={cycle.googleSheetUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={`flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/60 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-white dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-200 dark:hover:bg-slate-700 ${isArchived ? 'flex-1' : 'px-3'}`}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {isArchived ? 'Abrir planilha' : ''}
        </a>
      </div>
    </div>
  );
}
