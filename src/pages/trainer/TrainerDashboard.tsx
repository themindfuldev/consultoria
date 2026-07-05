import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  collection,
  doc,
  getDocs,
  query,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  MessageSquare,
  Pencil,
  Video,
  X,
} from 'lucide-react';
import { db } from '../../firebase';
import { useAuth } from '../../hooks/useAuth';
import { Layout } from '../../components/Layout';
import { Avatar } from '../../components/Avatar';
import { WhatsAppIcon } from '../../components/icons/WhatsAppIcon';
import type { Session } from '../../types';

// ── Date helpers (local time, Sunday-start week) ──────────────────────────────

function startOfWeek(d: Date): Date {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - x.getDay()); // Sunday = 0
  return x;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtShort(d: Date): string {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}
function sessionDate(s: Session): Date | null {
  return s.date instanceof Timestamp ? s.date.toDate() : null;
}

type GroupBy = 'day' | 'student';

interface SessionGroup {
  key: string;
  label: string;
  items: Session[];
}

function groupSessions(list: Session[], mode: GroupBy): SessionGroup[] {
  const map = new Map<string, Session[]>();
  for (const s of list) {
    const d = sessionDate(s);
    const key = mode === 'day' ? (d ? dayKey(d) : 'sem-data') : (s.studentName || 'Aluno');
    (map.get(key) ?? map.set(key, []).get(key)!).push(s);
  }
  const groups = [...map.entries()].map(([key, items]) => {
    let label = key;
    if (mode === 'day') {
      const d = sessionDate(items[0]);
      label = d
        ? d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'short' })
        : 'Sem data';
    }
    return { key, label, items };
  });
  groups.sort((a, b) =>
    mode === 'day' ? b.key.localeCompare(a.key) : a.label.localeCompare(b.label),
  );
  return groups;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TrainerDashboard() {
  const { currentUser, trainerProfile } = useAuth();
  const navigate = useNavigate();

  const trainerEmail = trainerProfile?.email ?? currentUser?.email?.toLowerCase() ?? '';

  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  const [groupBy, setGroupBy] = useState<GroupBy>('day');
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());

  // WhatsApp edit
  const [editingPhone, setEditingPhone] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);

  // ── Load all the trainer's sessions ─────────────────────────────────────────

  useEffect(() => {
    const load = async () => {
      if (!trainerEmail) { setLoading(false); return; }
      try {
        const snap = await getDocs(query(
          collection(db, 'sessions'),
          where('trainerEmail', '==', trainerEmail),
        ));
        setSessions(snap.docs.map((d) => d.data() as Session));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [trainerEmail]);

  // ── Derived data ────────────────────────────────────────────────────────────

  const weekEnd = addDays(weekStart, 6);
  const weekEndExclusive = addDays(weekStart, 7);

  // Sessions the trainer cares about: has videos, or already has feedback.
  const relevant = useMemo(
    () => sessions.filter((s) => s.hasVideos || s.feedbackStatus === 'complete'),
    [sessions],
  );

  // Day keys that have any relevant session (for the calendar circles).
  const sessionDays = useMemo(() => {
    const set = new Set<string>();
    for (const s of relevant) {
      const d = sessionDate(s);
      if (d) set.add(dayKey(d));
    }
    return set;
  }, [relevant]);

  const inWeek = (s: Session) => {
    const d = sessionDate(s);
    return !!d && d >= weekStart && d < weekEndExclusive;
  };

  const awaiting = useMemo(
    () => relevant.filter((s) => s.feedbackStatus !== 'complete' && inWeek(s)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [relevant, weekStart],
  );
  const responded = useMemo(
    () => relevant.filter((s) => s.feedbackStatus === 'complete' && inWeek(s)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [relevant, weekStart],
  );

  const awaitingGroups = useMemo(() => groupSessions(awaiting, groupBy), [awaiting, groupBy]);
  const respondedGroups = useMemo(() => groupSessions(responded, groupBy), [responded, groupBy]);

  // ── WhatsApp save ───────────────────────────────────────────────────────────

  const startEditPhone = () => {
    setPhoneInput(trainerProfile?.whatsappPhone ?? '');
    setEditingPhone(true);
  };
  const savePhone = async () => {
    if (!trainerEmail) return;
    const cleaned = phoneInput.replace(/\D/g, '');
    if (cleaned.length < 11) return;
    setSavingPhone(true);
    try {
      await updateDoc(doc(db, 'trainers', trainerEmail), { whatsappPhone: cleaned });
      setEditingPhone(false);
    } finally {
      setSavingPhone(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  if (!trainerProfile && !loading) {
    return (
      <Layout title="Painel do Treinador">
        <div className="rounded-2xl border-2 border-dashed border-slate-200 px-4 py-12 text-center dark:border-slate-700">
          <p className="mb-1 text-sm font-semibold text-slate-700 dark:text-slate-300">
            Conta de treinador não encontrada.
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Peça ao seu aluno para cadastrar você no Consultoria com este e-mail.
          </p>
        </div>
      </Layout>
    );
  }

  const isCurrentWeek = weekStart.getTime() === startOfWeek(new Date()).getTime();

  return (
    <Layout title="Painel do Treinador">
      {/* Greeting + WhatsApp */}
      <div className="mb-5">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
          Olá{trainerProfile?.name ? `, ${trainerProfile.name.split(' ')[0]}` : ''} 👋
        </h1>
        <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{trainerEmail}</p>

        <div className="mt-3 flex items-center gap-2">
          <WhatsAppIcon className="h-4 w-4 text-slate-400" />
          {editingPhone ? (
            <>
              <input
                type="tel"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                placeholder="+55 11 99999-9999"
                className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white"
              />
              <button onClick={savePhone} disabled={savingPhone} aria-label="Salvar" className="rounded-lg bg-emerald-600 p-1.5 text-white hover:bg-emerald-700 disabled:opacity-60">
                <Check className="h-4 w-4" />
              </button>
              <button onClick={() => setEditingPhone(false)} aria-label="Cancelar" className="rounded-lg bg-slate-200 p-1.5 text-slate-600 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-200">
                <X className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <span className="text-sm text-slate-600 dark:text-slate-300">
                {trainerProfile?.whatsappPhone ? `+${trainerProfile.whatsappPhone}` : 'Sem WhatsApp'}
              </span>
              <button onClick={startEditPhone} aria-label="Editar WhatsApp" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800">
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Week widget */}
      <div className="mb-4 flex items-center gap-2 rounded-2xl bg-white/60 p-2 dark:bg-slate-800/50">
        <button
          onClick={() => setWeekStart((w) => addDays(w, -7))}
          aria-label="Semana anterior"
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            {isCurrentWeek ? 'Semana atual' : 'Semana'}
          </p>
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
            {fmtShort(weekStart)} – {fmtShort(weekEnd)}
          </p>
        </div>
        <button
          onClick={() => setWeekStart((w) => addDays(w, 7))}
          aria-label="Próxima semana"
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          onClick={() => { setCalendarMonth(new Date(weekStart)); setCalendarOpen(true); }}
          aria-label="Abrir calendário"
          className="rounded-lg bg-indigo-600 p-1.5 text-white hover:bg-indigo-700"
        >
          <CalendarDays className="h-4 w-4" />
        </button>
      </div>

      {/* Group-by toggle (shared) */}
      <div className="mb-5 flex items-center justify-end gap-2">
        <span className="text-xs text-slate-400">Agrupar por</span>
        <div className="inline-flex rounded-lg border border-slate-200 p-0.5 text-xs font-semibold dark:border-slate-700">
          {(['day', 'student'] as const).map((g) => (
            <button
              key={g}
              onClick={() => setGroupBy(g)}
              className={`rounded-md px-2.5 py-1 transition-colors ${
                groupBy === g
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              {g === 'day' ? 'Dia' : 'Aluno'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent" />
        </div>
      ) : (
        <>
          <Section
            title="Aguardando feedback"
            icon={<Video className="h-4 w-4 text-violet-500" />}
            count={awaiting.length}
            countClass="bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
            groups={awaitingGroups}
            groupBy={groupBy}
            emptyText="Nada aguardando feedback nesta semana."
            onOpen={(id) => navigate(`/trainer/sessions/${id}`)}
          />

          <Section
            title="Feedbacks respondidos"
            icon={<MessageSquare className="h-4 w-4 text-emerald-500" />}
            count={responded.length}
            countClass="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
            groups={respondedGroups}
            groupBy={groupBy}
            emptyText="Nenhum feedback respondido nesta semana."
            onOpen={(id) => navigate(`/trainer/sessions/${id}`)}
          />
        </>
      )}

      {calendarOpen && (
        <CalendarModal
          month={calendarMonth}
          setMonth={setCalendarMonth}
          weekStart={weekStart}
          sessionDays={sessionDays}
          onPickDay={(d) => { setWeekStart(startOfWeek(d)); setCalendarOpen(false); }}
          onClose={() => setCalendarOpen(false)}
        />
      )}
    </Layout>
  );
}

// ── Section ───────────────────────────────────────────────────────────────────

function Section({
  title, icon, count, countClass, groups, groupBy, emptyText, onOpen,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  countClass: string;
  groups: SessionGroup[];
  groupBy: GroupBy;
  emptyText: string;
  onOpen: (sessionId: string) => void;
}) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-center gap-2">
        {icon}
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {title}
        </h2>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-bold ${countClass}`}>
          {count}
        </span>
      </div>

      {groups.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 px-4 py-6 text-center dark:border-slate-700">
          <p className="text-sm text-slate-500 dark:text-slate-400">{emptyText}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group) => (
            <div key={group.key}>
              <div className="mb-2 flex items-center gap-2">
                {groupBy === 'student' && <Avatar displayName={group.label} size="sm" />}
                <p className="text-sm font-semibold capitalize text-slate-900 dark:text-white">
                  {group.label}
                </p>
                <span className="text-xs text-slate-400">{group.items.length}</span>
              </div>
              <ul className="flex flex-col gap-2">
                {group.items.map((s) => {
                  const d = sessionDate(s);
                  const dayLabel = d ? fmtShort(d) : '';
                  const primary = groupBy === 'day' ? (s.studentName || 'Aluno') : s.tabName;
                  const secondary = groupBy === 'day' ? s.tabName : dayLabel;
                  return (
                    <li key={s.id}>
                      <button
                        onClick={() => onOpen(s.id)}
                        className="glass flex w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-left transition-all active:scale-[0.99]"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                            {primary}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400">{secondary}</p>
                        </div>
                        <span className="flex-shrink-0 text-xs font-medium text-indigo-600 dark:text-indigo-400">
                          Ver →
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Calendar modal (month view; circles days with sessions) ───────────────────

function CalendarModal({
  month, setMonth, weekStart, sessionDays, onPickDay, onClose,
}: {
  month: Date;
  setMonth: (d: Date) => void;
  weekStart: Date;
  sessionDays: Set<string>;
  onPickDay: (d: Date) => void;
  onClose: () => void;
}) {
  const year = month.getFullYear();
  const m = month.getMonth();
  const first = new Date(year, m, 1);
  const daysInMonth = new Date(year, m + 1, 0).getDate();
  const leading = first.getDay(); // blanks before day 1
  const weekEndExclusive = addDays(weekStart, 7);

  const cells: (Date | null)[] = [];
  for (let i = 0; i < leading; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) cells.push(new Date(year, m, day));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="glass-premium w-full max-w-sm rounded-2xl p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <button onClick={() => setMonth(new Date(year, m - 1, 1))} aria-label="Mês anterior" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <p className="text-sm font-bold capitalize text-slate-800 dark:text-slate-100">
            {month.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
          </p>
          <button onClick={() => setMonth(new Date(year, m + 1, 1))} aria-label="Próximo mês" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-700">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((w, i) => (
            <span key={i} className="text-[10px] font-bold uppercase text-slate-400">{w}</span>
          ))}
          {cells.map((d, i) => {
            if (!d) return <span key={i} />;
            const has = sessionDays.has(dayKey(d));
            const inSelectedWeek = d >= weekStart && d < weekEndExclusive;
            return (
              <button
                key={i}
                onClick={() => onPickDay(d)}
                className={`relative flex h-9 items-center justify-center rounded-lg text-sm transition-colors ${
                  inSelectedWeek
                    ? 'bg-indigo-100 font-bold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                    : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-700'
                } ${has ? 'ring-2 ring-emerald-500 ring-inset' : ''}`}
              >
                {d.getDate()}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded ring-2 ring-emerald-500 ring-inset" />
            treinos enviados
          </span>
          <button onClick={onClose} className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
