import React, { useState, useEffect } from 'react';
import {
  collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc,
  query, where,
} from 'firebase/firestore';
import {
  UserPlus, Users, Loader2, CheckCircle, AlertTriangle,
  Trash2, ExternalLink, RefreshCw, BookOpen, XCircle,
} from 'lucide-react';
import { db } from '../services/firebase';
import { setupTrainerWorkspace } from '../services/workspaceSetup';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import type { Workspace, StudentWorkspace } from '../types';

export const TrainerDashboard: React.FC = () => {
  const { profile, deleteAccount, getValidGoogleToken } = useAuth();
  const { t } = useLanguage();

  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [students, setStudents] = useState<StudentWorkspace[]>([]);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const workspaceId = profile?.email ?? '';

  // Real-time workspace listener
  useEffect(() => {
    if (!workspaceId) return;
    return onSnapshot(doc(db, 'workspaces', workspaceId), snap => {
      if (snap.exists()) setWorkspace({ id: snap.id, ...(snap.data() as Omit<Workspace, 'id'>) });
    });
  }, [workspaceId]);

  // Real-time student list
  useEffect(() => {
    if (!workspaceId) return;
    const q = query(collection(db, 'student_workspaces'), where('workspaceId', '==', workspaceId));
    return onSnapshot(q, snap => {
      setStudents(snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<StudentWorkspace, 'id'>) })));
    });
  }, [workspaceId]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = inviteEmail.trim().toLowerCase();
    setInviteError(null);

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setInviteError('Please enter a valid email address.');
      return;
    }
    if (email === profile?.email) {
      setInviteError("You can't invite yourself.");
      return;
    }
    if (students.some(s => s.studentEmail === email && s.status !== 'read-only')) {
      setInviteError('This student is already invited or active.');
      return;
    }

    setInviting(true);
    try {
      await addDoc(collection(db, 'student_workspaces'), {
        studentUid: '',
        studentEmail: email,
        studentName: '',
        workspaceId,
        status: 'pending',
        emailPreferences: { morningEmailEnabled: false, sessionDays: {} },
      } satisfies Omit<StudentWorkspace, 'id'>);
      setInviteEmail('');
    } catch (err) {
      setInviteError('Failed to send invitation. Please try again.');
      console.error(err);
    } finally {
      setInviting(false);
    }
  };

  const handleRemove = async (studentDoc: StudentWorkspace) => {
    const msg = studentDoc.status === 'pending'
      ? t('revokeInviteConfirm')
      : t('removeStudentConfirm');
    if (!confirm(msg)) return;
    if (studentDoc.status === 'pending') {
      await deleteDoc(doc(db, 'student_workspaces', studentDoc.id));
    } else {
      await updateDoc(doc(db, 'student_workspaces', studentDoc.id), { status: 'read-only' });
    }
  };

  const handleRetrySetup = async () => {
    setRetrying(true);
    try {
      const token = await getValidGoogleToken();
      await setupTrainerWorkspace(workspaceId, profile!.selectedLanguage, token);
    } catch (err) {
      console.error('Retry setup failed:', err);
    } finally {
      setRetrying(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!confirm(t('deleteAccountConfirm'))) return;
    setDeletingAccount(true);
    try {
      await deleteAccount();
    } catch (err) {
      console.error('Delete account failed:', err);
      setDeletingAccount(false);
    }
  };

  const active = students.filter(s => s.status === 'active');
  const pending = students.filter(s => s.status === 'pending');
  const readOnly = students.filter(s => s.status === 'read-only');

  const setupDone = workspace?.setupComplete === true;
  const setupInProgress = workspace && !workspace.setupComplete;

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="glass-premium rounded-3xl p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">
              {t('trainerDashboard')}
            </h1>
            <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
              {profile?.displayName} · {profile?.email}
            </p>
          </div>
          {/* Workspace setup status badge */}
          {setupDone ? (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 px-3 py-1.5 rounded-full">
              <CheckCircle size={13} /> Workspace Ready
            </span>
          ) : setupInProgress ? (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 px-3 py-1.5 rounded-full">
              <Loader2 size={13} className="animate-spin" /> {t('workspaceSetupInProgress')}
            </span>
          ) : null}
        </div>

        {/* Setup failed: show retry */}
        {setupInProgress && !retrying && (
          <div className="mt-4 flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800/50">
            <AlertTriangle size={16} className="text-amber-500 flex-shrink-0" />
            <p className="text-sm text-amber-700 dark:text-amber-300 flex-1">
              {t('workspaceSetupFailed')}
            </p>
            <button
              onClick={handleRetrySetup}
              className="flex items-center gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 transition cursor-pointer"
            >
              <RefreshCw size={13} /> {t('retrySetup')}
            </button>
          </div>
        )}

        {/* Exercise Library link */}
        {workspace?.exerciseLibrarySheetId && (
          <div className="mt-4">
            <a
              href={`https://docs.google.com/spreadsheets/d/${workspace.exerciseLibrarySheetId}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-200 transition"
            >
              <BookOpen size={15} />
              {t('openExerciseLibrary')}
              <ExternalLink size={12} />
            </a>
          </div>
        )}
      </div>

      {/* Invite form */}
      <div className="glass-premium rounded-3xl p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4 flex items-center gap-2">
          <UserPlus size={18} className="text-purple-500" />
          {t('inviteStudent')}
        </h2>
        <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-3">
          <input
            type="email"
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            placeholder={t('inviteStudentPlaceholder')}
            className="flex-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 placeholder-slate-400 rounded-2xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/50"
          />
          <button
            type="submit"
            disabled={inviting}
            className="flex items-center justify-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 disabled:opacity-60 text-white font-bold px-5 py-2.5 rounded-2xl shadow hover:shadow-purple-500/20 active:scale-95 transition-all cursor-pointer text-sm"
          >
            {inviting ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}
            {t('sendInvite')}
          </button>
        </form>
        {inviteError && (
          <p className="mt-2 text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
            <XCircle size={12} /> {inviteError}
          </p>
        )}
      </div>

      {/* Student list */}
      <div className="glass-premium rounded-3xl p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-5 flex items-center gap-2">
          <Users size={18} className="text-purple-500" />
          {t('activeStudents')} · {active.length + pending.length + readOnly.length}
        </h2>

        {students.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-6">
            {t('noStudentsYet')}
          </p>
        ) : (
          <div className="space-y-6">
            <StudentSection
              title={t('activeStudents')}
              students={active}
              actionLabel={t('removeStudent')}
              actionVariant="danger"
              onAction={handleRemove}
              statusColor="emerald"
            />
            <StudentSection
              title={t('pendingInvitations')}
              students={pending}
              actionLabel={t('revokeInvite')}
              actionVariant="warning"
              onAction={handleRemove}
              statusColor="amber"
            />
            <StudentSection
              title={t('readOnlyStudents')}
              students={readOnly}
              statusColor="slate"
            />
          </div>
        )}
      </div>

      {/* Danger zone */}
      <div className="rounded-3xl p-6 border-2 border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20">
        <h2 className="text-base font-bold text-red-700 dark:text-red-400 mb-3">
          {t('dangerZone')}
        </h2>
        <button
          onClick={handleDeleteAccount}
          disabled={deletingAccount}
          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-bold px-4 py-2.5 rounded-xl shadow-sm active:scale-95 transition-all cursor-pointer text-sm"
        >
          {deletingAccount
            ? <Loader2 size={15} className="animate-spin" />
            : <Trash2 size={15} />}
          {t('deleteAccount')}
        </button>
      </div>
    </div>
  );
};

// ── Sub-component ─────────────────────────────────────────────────────────────

type StatusColor = 'emerald' | 'amber' | 'slate';

interface StudentSectionProps {
  title: string;
  students: StudentWorkspace[];
  actionLabel?: string;
  actionVariant?: 'danger' | 'warning';
  onAction?: (s: StudentWorkspace) => void;
  statusColor: StatusColor;
}

const statusBadgeClass: Record<StatusColor, string> = {
  emerald: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
  amber:   'bg-amber-100  dark:bg-amber-900/40  text-amber-700  dark:text-amber-300',
  slate:   'bg-slate-100  dark:bg-slate-800      text-slate-500  dark:text-slate-400',
};

const StudentSection: React.FC<StudentSectionProps> = ({
  title, students, actionLabel, actionVariant, onAction, statusColor,
}) => {
  if (students.length === 0) return null;

  return (
    <div>
      <h3 className="text-xs font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-3">
        {title} ({students.length})
      </h3>
      <div className="space-y-2">
        {students.map(s => (
          <div
            key={s.id}
            className="flex items-center justify-between gap-3 bg-white/60 dark:bg-slate-800/60 rounded-2xl px-4 py-3"
          >
            {/* Avatar + info */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-400 to-indigo-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {(s.studentName || s.studentEmail)[0].toUpperCase()}
              </div>
              <div className="min-w-0">
                {s.studentName ? (
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                    {s.studentName}
                  </p>
                ) : null}
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {s.studentEmail}
                </p>
              </div>
            </div>

            {/* Status + action */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={`hidden sm:inline-block px-2 py-0.5 text-xs font-semibold rounded-full ${statusBadgeClass[statusColor]}`}>
                {s.status}
              </span>
              {actionLabel && onAction && (
                <button
                  onClick={() => onAction(s)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-xl transition cursor-pointer ${
                    actionVariant === 'danger'
                      ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
                      : 'text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                  }`}
                >
                  {actionLabel}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
