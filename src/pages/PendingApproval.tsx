import { useEffect, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Clock, LogOut, Moon, Sun } from 'lucide-react';
import { db } from '../firebase';
import { useAuth } from '../hooks/useAuth';
import { useDarkMode } from '../hooks/useDarkMode';

/** Where new-registration alert emails are sent (via the Trigger Email
 * extension). Optional — when unset, the queue still records requests but no
 * email is sent. */
const NOTIFY_EMAIL = import.meta.env.VITE_NOTIFY_EMAIL as string | undefined;

/**
 * Shown to a signed-in account whose email has not been approved for
 * registration yet. Google authentication succeeds for anyone, but a new
 * student can only create a profile once their email is added to the
 * `allowlist` collection (done manually in the Firebase console). Until then
 * they land here — they can see nothing else and hold no data.
 *
 * On first arrival the account is recorded in `access_requests/{uid}` (the
 * review queue) and, if `VITE_NOTIFY_EMAIL` is configured, a one-off
 * notification email is queued for delivery by the "Trigger Email from
 * Firestore" extension. Both writes are guarded by the request doc's existence,
 * so revisiting or reloading this screen never re-notifies.
 */
export function PendingApproval() {
  const { currentUser, userProfile, trainerEligible, approved, logOut } = useAuth();
  const { isDark, toggle } = useDarkMode();

  // Guards the one-time request/notification write against React re-runs.
  const recordedRef = useRef(false);

  const pending = !!currentUser && !userProfile && !trainerEligible && !approved;

  useEffect(() => {
    if (!pending || !currentUser || recordedRef.current) return;
    recordedRef.current = true;
    const uid = currentUser.uid;
    void (async () => {
      try {
        const reqRef = doc(db, 'access_requests', uid);
        // Already queued (and already notified) on a previous visit — do nothing.
        if ((await getDoc(reqRef)).exists()) return;

        await setDoc(reqRef, {
          uid,
          email: currentUser.email ?? '',
          displayName: currentUser.displayName ?? '',
          photoURL: currentUser.photoURL ?? '',
          requestedAt: serverTimestamp(),
        });

        // Queue a single alert email for the admin. Best-effort: a delivery
        // failure must never affect the pending user.
        if (NOTIFY_EMAIL) {
          const who = currentUser.displayName
            ? `${currentUser.displayName} (${currentUser.email ?? 'sem email'})`
            : currentUser.email ?? 'conta sem email';
          await setDoc(doc(db, 'mail', uid), {
            to: [NOTIFY_EMAIL],
            message: {
              subject: 'Novo cadastro aguardando aprovação — Consultoria',
              text:
                `Um novo acesso está aguardando aprovação:\n\n` +
                `${who}\n\n` +
                `Para liberar, adicione o email (em minúsculas) como ID de um ` +
                `documento na coleção "allowlist" no console do Firestore.`,
              html:
                `<p>Um novo acesso está aguardando aprovação:</p>` +
                `<p><strong>${who}</strong></p>` +
                `<p>Para liberar, adicione o email (em minúsculas) como ID de um ` +
                `documento na coleção <code>allowlist</code> no console do Firestore.</p>`,
            },
          });
        }
      } catch {
        // Best-effort — allow a retry on the next visit if it failed.
        recordedRef.current = false;
      }
    })();
  }, [pending, currentUser]);

  // Signed out → back to the landing page.
  if (!currentUser) return <Navigate to="/" replace />;
  // Already has access (approved, onboarded, or a trainer) → don't strand them
  // here; let the landing redirect route them to their section.
  if (userProfile || trainerEligible || approved) return <Navigate to="/" replace />;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950">
      {/* Minimal header */}
      <div className="flex items-center justify-between px-4 py-4">
        <span className="inline-flex items-center gap-1.5 text-base font-black text-slate-900 dark:text-white">
          <img src="/app-icon.png" alt="" className="h-6 w-6" /> Consultoria
        </span>
        <button
          onClick={toggle}
          aria-label="Alternar tema"
          className="rounded-full p-2 text-slate-500 transition-colors hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-4 pb-12">
        <div className="w-full max-w-sm text-center">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-500/15">
            <Clock className="h-8 w-8 text-amber-600 dark:text-amber-400" />
          </div>

          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Conta aguardando aprovação
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
            Seu acesso ainda não foi liberado. Novos cadastros passam por aprovação
            manual — assim que sua conta for autorizada, você poderá entrar
            normalmente.
          </p>

          {currentUser.email && (
            <p className="mt-4 rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {currentUser.email}
            </p>
          )}

          <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
            Já foi aprovado? Saia e entre novamente para atualizar o acesso.
          </p>

          <button
            onClick={logOut}
            className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:bg-slate-50 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            <LogOut className="h-4 w-4" /> Sair
          </button>
        </div>
      </div>
    </div>
  );
}
