import React, { useState, useEffect } from 'react';
import {
  collection, doc, onSnapshot, updateDoc, deleteDoc,
  query, where, getDoc, Timestamp,
} from 'firebase/firestore';
import {
  CheckCircle, XCircle, Loader2, Dumbbell,
  Lock, ChevronRight, Trash2, BellRing,
} from 'lucide-react';
import { db } from '../services/firebase';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import type { StudentWorkspace, Workspace } from '../types';

interface WorkspaceWithTrainer extends StudentWorkspace {
  trainerName: string;
  trainerEmail: string;
}

export const StudentDashboard: React.FC = () => {
  const { user, profile, deleteAccount } = useAuth();
  const { t } = useLanguage();

  const [memberships, setMemberships] = useState<WorkspaceWithTrainer[]>([]);
  const [loadingMemberships, setLoadingMemberships] = useState(true);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [deletingAccount, setDeletingAccount] = useState(false);

  // Load all student_workspaces for this user's email (catches pending + active)
  useEffect(() => {
    if (!user?.email) return;

    const q = query(
      collection(db, 'student_workspaces'),
      where('studentEmail', '==', user.email),
    );

    const unsub = onSnapshot(q, async snap => {
      const docs = snap.docs.map(d => ({ id: d.id, ...(d.data() as Omit<StudentWorkspace, 'id'>) }));

      // Enrich with trainer info from the workspace docs
      const enriched = await Promise.all(
        docs.map(async sw => {
          try {
            const wSnap = await getDoc(doc(db, 'workspaces', sw.workspaceId));
            const workspace = wSnap.exists() ? (wSnap.data() as Workspace) : null;
            return {
              ...sw,
              trainerName: workspace?.trainerName ?? sw.workspaceId,
              trainerEmail: workspace?.trainerEmail ?? sw.workspaceId,
            } as WorkspaceWithTrainer;
          } catch {
            return {
              ...sw,
              trainerName: sw.workspaceId,
              trainerEmail: sw.workspaceId,
            } as WorkspaceWithTrainer;
          }
        }),
      );

      setMemberships(enriched);
      setLoadingMemberships(false);
    });

    return unsub;
  }, [user?.email]);

  const handleAccept = async (sw: StudentWorkspace) => {
    if (!user || !profile) return;
    setAcceptingId(sw.id);
    try {
      await updateDoc(doc(db, 'student_workspaces', sw.id), {
        studentUid: user.uid,
        studentName: profile.displayName,
        status: 'active',
        joinedAt: Timestamp.now(),
      });
    } catch (err) {
      console.error('Accept invitation failed:', err);
    } finally {
      setAcceptingId(null);
    }
  };

  const handleDecline = async (sw: StudentWorkspace) => {
    if (!confirm(t('revokeInviteConfirm'))) return;
    await deleteDoc(doc(db, 'student_workspaces', sw.id));
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

  const pending = memberships.filter(m => m.status === 'pending');
  const active = memberships.filter(m => m.status === 'active');
  const readOnly = memberships.filter(m => m.status === 'read-only');

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="glass-premium rounded-3xl p-6 shadow-sm">
        <h1 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100">
          {t('studentDashboard')}
        </h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
          {profile?.displayName} · {profile?.email}
        </p>
      </div>

      {/* Pending invitations */}
      {pending.length > 0 && (
        <div className="rounded-3xl p-6 border-2 border-purple-200 dark:border-purple-800/50 bg-purple-50/60 dark:bg-purple-950/20">
          <div className="flex items-center gap-2 mb-4">
            <BellRing size={18} className="text-purple-500" />
            <h2 className="text-base font-bold text-purple-800 dark:text-purple-300">
              {t('pendingInvitationsBanner')}
            </h2>
          </div>
          <div className="space-y-3">
            {pending.map(sw => (
              <div
                key={sw.id}
                className="flex items-center justify-between gap-3 bg-white/70 dark:bg-slate-900/60 rounded-2xl px-4 py-3 flex-wrap gap-y-2"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {sw.trainerName}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{sw.trainerEmail}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleDecline(sw)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 px-3 py-1.5 rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition cursor-pointer"
                  >
                    <XCircle size={13} /> {t('declineInvitation')}
                  </button>
                  <button
                    onClick={() => handleAccept(sw)}
                    disabled={acceptingId === sw.id}
                    className="flex items-center gap-1.5 text-xs font-bold text-white bg-purple-600 hover:bg-purple-500 disabled:opacity-60 px-4 py-1.5 rounded-xl shadow shadow-purple-500/20 active:scale-95 transition-all cursor-pointer"
                  >
                    {acceptingId === sw.id
                      ? <Loader2 size={13} className="animate-spin" />
                      : <CheckCircle size={13} />}
                    {t('acceptInvitation')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Workspace list */}
      <div className="glass-premium rounded-3xl p-6 shadow-sm">
        <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-5 flex items-center gap-2">
          <Dumbbell size={18} className="text-purple-500" />
          {t('myWorkspaces')}
        </h2>

        {loadingMemberships ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 text-purple-500 animate-spin" />
          </div>
        ) : active.length === 0 && readOnly.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-8">
            {t('noWorkspacesYet')}
          </p>
        ) : (
          <div className="space-y-3">
            {[...active, ...readOnly].map(sw => (
              <WorkspaceCard key={sw.id} sw={sw} t={t} />
            ))}
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
          {deletingAccount ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
          {t('deleteAccount')}
        </button>
      </div>
    </div>
  );
};

// ── Sub-component ─────────────────────────────────────────────────────────────

interface WorkspaceCardProps {
  sw: WorkspaceWithTrainer;
  t: (key: string, vars?: Record<string, string>) => string;
}

const WorkspaceCard: React.FC<WorkspaceCardProps> = ({ sw, t }) => {
  const isReadOnly = sw.status === 'read-only';

  return (
    <div className={`flex items-center justify-between gap-3 rounded-2xl px-4 py-4 transition ${
      isReadOnly
        ? 'bg-slate-100/60 dark:bg-slate-800/40 opacity-70'
        : 'bg-white/60 dark:bg-slate-800/60 hover:bg-white/90 dark:hover:bg-slate-800 cursor-pointer'
    }`}>
      <div className="flex items-center gap-3 min-w-0">
        {/* Trainer avatar */}
        <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
          {sw.trainerName[0].toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
              {sw.trainerName}
            </p>
            {isReadOnly && (
              <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-semibold bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-full">
                <Lock size={10} /> {t('readOnlyTag')}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{sw.trainerEmail}</p>
          {/* Placeholder for active cycle — Phase 2 */}
          <p className="text-xs text-purple-500 dark:text-purple-400 mt-0.5">
            {t('comingSoon')}: {t('activeCycle')}
          </p>
        </div>
      </div>
      {!isReadOnly && (
        <ChevronRight size={16} className="text-slate-400 flex-shrink-0" />
      )}
    </div>
  );
};
