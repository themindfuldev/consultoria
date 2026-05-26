import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { ChevronDown, Link as LinkIcon } from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../hooks/useAuth';
import { Layout } from '../../components/Layout';
import { MODALITIES } from '../../types';
import type { Modality, StudentWorkspace, Workspace } from '../../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extracts the spreadsheet ID from a Google Sheets URL. Returns null if invalid. */
function extractSheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return match ? match[1] : null;
}

interface TrainerOption {
  workspaceId: string;
  trainerName: string;
  trainerEmail: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AddCycle() {
  const { currentUser, userProfile } = useAuth();
  const navigate = useNavigate();

  const [trainers, setTrainers] = useState<TrainerOption[]>([]);
  const [loadingTrainers, setLoadingTrainers] = useState(true);

  // Form fields
  const [selectedTrainerId, setSelectedTrainerId] = useState('');
  const [sheetUrl, setSheetUrl] = useState('');
  const [urlError, setUrlError] = useState('');
  const [title, setTitle] = useState('');
  const [modality, setModality] = useState<Modality | ''>('');
  const [modalityCustom, setModalityCustom] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // ── Load trainer options ────────────────────────────────────────────────────

  useEffect(() => {
    if (!currentUser) return;

    const loadTrainers = async () => {
      try {
        // Fetch the student's active connections.
        const swSnap = await getDocs(
          query(
            collection(db, 'student_workspaces'),
            where('studentUid', '==', currentUser.uid),
            where('status', '==', 'active'),
          ),
        );

        if (swSnap.empty) {
          setLoadingTrainers(false);
          return;
        }

        const workspaceIds = swSnap.docs.map((d) => (d.data() as StudentWorkspace).workspaceId);

        // Fetch the corresponding workspace docs for trainer names.
        const wsSnap = await getDocs(
          query(collection(db, 'workspaces'), where('id', 'in', workspaceIds)),
        );

        const options: TrainerOption[] = wsSnap.docs.map((d) => {
          const ws = d.data() as Workspace;
          return { workspaceId: ws.id, trainerName: ws.trainerName, trainerEmail: ws.trainerEmail };
        });

        setTrainers(options);

        // Auto-select if only one trainer.
        if (options.length === 1) setSelectedTrainerId(options[0].workspaceId);
      } catch {
        // Non-fatal — form will still work, just no trainer auto-fill.
      } finally {
        setLoadingTrainers(false);
      }
    };

    loadTrainers();
  }, [currentUser]);

  // ── URL validation ──────────────────────────────────────────────────────────

  const validateUrl = () => {
    const trimmed = sheetUrl.trim();
    if (!trimmed) {
      setUrlError('Cole o link da planilha do Google Sheets.');
      return false;
    }
    if (!extractSheetId(trimmed)) {
      setUrlError('Link inválido. Deve ser um link do Google Sheets (docs.google.com/spreadsheets/…).');
      return false;
    }
    setUrlError('');
    return true;
  };

  // ── Submit ──────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!currentUser || !userProfile) return;

    // Validate
    const urlOk = validateUrl();
    if (!urlOk) return;

    if (!selectedTrainerId) {
      setSubmitError('Selecione um treinador.');
      return;
    }
    if (!title.trim()) {
      setSubmitError('Dê um nome para este programa.');
      return;
    }
    if (!modality) {
      setSubmitError('Selecione a modalidade do treino.');
      return;
    }
    if (modality === 'Outro' && !modalityCustom.trim()) {
      setSubmitError('Descreva a modalidade.');
      return;
    }

    setSubmitError('');
    setSubmitting(true);

    const sheetId = extractSheetId(sheetUrl.trim())!;
    const trainer = trainers.find((t) => t.workspaceId === selectedTrainerId);
    const cycleRef = doc(collection(db, 'cycles'));

    try {
      await setDoc(cycleRef, {
        id: cycleRef.id,
        studentUid: currentUser.uid,
        workspaceId: selectedTrainerId,
        googleSheetId: sheetId,
        googleSheetUrl: sheetUrl.trim(),
        title: title.trim(),
        modality,
        ...(modality === 'Outro' && modalityCustom.trim()
          ? { modalityCustom: modalityCustom.trim() }
          : {}),
        status: 'active',
        startDate: serverTimestamp(),
        createdAt: serverTimestamp(),
        // Denormalize trainer info for display without extra queries.
        trainerName: trainer?.trainerName ?? '',
        trainerEmail: trainer?.trainerEmail ?? '',
      });

      navigate('/student', { replace: true });
    } catch {
      setSubmitError('Não foi possível salvar o programa. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <Layout title="Adicionar Programa">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">Novo programa de treino</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Cole o link da planilha que seu treinador compartilhou com você.
        </p>
      </div>

      <div className="flex flex-col gap-5">

        {/* ── Trainer selector (hidden when only 1 trainer) ─────────────── */}
        {!loadingTrainers && trainers.length > 1 && (
          <Field label="Treinador">
            <div className="relative">
              <select
                value={selectedTrainerId}
                onChange={(e) => setSelectedTrainerId(e.target.value)}
                className={selectCls}
              >
                <option value="">Selecione o treinador…</option>
                {trainers.map((t) => (
                  <option key={t.workspaceId} value={t.workspaceId}>
                    {t.trainerName} — {t.trainerEmail}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            </div>
          </Field>
        )}

        {/* ── Google Sheets URL ──────────────────────────────────────────── */}
        <Field label="Link da planilha do Google Sheets" error={urlError}>
          <div className="relative">
            <LinkIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="url"
              value={sheetUrl}
              onChange={(e) => { setSheetUrl(e.target.value); setUrlError(''); }}
              onBlur={validateUrl}
              placeholder="https://docs.google.com/spreadsheets/d/…"
              autoComplete="off"
              className={`${inputCls} pl-10`}
            />
          </div>
        </Field>

        {/* ── Program title ──────────────────────────────────────────────── */}
        <Field label="Nome do programa">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="ex: Força — Bloco 1"
            className={inputCls}
          />
        </Field>

        {/* ── Modality ───────────────────────────────────────────────────── */}
        <Field label="Modalidade">
          <div className="relative">
            <select
              value={modality}
              onChange={(e) => setModality(e.target.value as Modality | '')}
              className={selectCls}
            >
              <option value="">Selecione a modalidade…</option>
              {MODALITIES.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          </div>
        </Field>

        {/* ── Custom modality (only when "Outro") ────────────────────────── */}
        {modality === 'Outro' && (
          <Field label="Descreva a modalidade">
            <input
              type="text"
              value={modalityCustom}
              onChange={(e) => setModalityCustom(e.target.value)}
              placeholder="ex: Mobilidade, Calistenia…"
              className={inputCls}
            />
          </Field>
        )}

        {/* ── Error message ──────────────────────────────────────────────── */}
        {submitError && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-400">
            {submitError}
          </p>
        )}

        {/* ── Actions ────────────────────────────────────────────────────── */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={() => navigate('/student')}
            className="flex-1 rounded-xl border border-slate-200 bg-white py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="flex-1 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white shadow-md transition-all hover:bg-indigo-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? 'Salvando…' : 'Adicionar programa'}
          </button>
        </div>
      </div>
    </Layout>
  );
}

// ── Local sub-components ──────────────────────────────────────────────────────

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold text-slate-700 dark:text-slate-200">{label}</label>
      {children}
      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

// Shared class strings
const inputCls =
  'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500 dark:focus:border-indigo-400';

const selectCls =
  'w-full appearance-none rounded-xl border border-slate-200 bg-white px-4 py-3 pr-10 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:border-indigo-400';
