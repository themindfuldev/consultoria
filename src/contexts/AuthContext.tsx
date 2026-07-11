import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as fbSignOut,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { Trainer, UserProfile } from '../types';
import { AuthContext } from './AuthContextDef';
import type { Mode } from './AuthContextDef';

/** localStorage key (per-uid) persisting the account's last chosen mode. */
const modeKey = (uid: string) => `authMode:${uid}`;

function readStoredMode(uid: string): Mode | null {
  try {
    const v = localStorage.getItem(modeKey(uid));
    return v === 'student' || v === 'trainer' ? v : null;
  } catch {
    return null;
  }
}

/**
 * localStorage key caching the Google OAuth access token (+ expiry). Persisting
 * it in localStorage (not sessionStorage) means it survives closing the tab, so
 * a return visit within the token's ~1h lifetime reuses the still-valid token
 * instead of re-opening the Google authorization popup. Always guarded by the
 * stored expiry, and cleared on sign-out.
 */
const GOOGLE_TOKEN_KEY = 'googleAccessToken';

interface StoredToken { token: string | null; expiry: number; }

function readStoredToken(): StoredToken {
  try {
    const raw = localStorage.getItem(GOOGLE_TOKEN_KEY);
    if (!raw) return { token: null, expiry: 0 };
    const parsed = JSON.parse(raw) as StoredToken;
    // Ignore an already-expired cached token.
    if (!parsed.token || Date.now() >= parsed.expiry) return { token: null, expiry: 0 };
    return parsed;
  } catch {
    return { token: null, expiry: 0 };
  }
}

function storeToken(token: string, expiry: number): void {
  try { localStorage.setItem(GOOGLE_TOKEN_KEY, JSON.stringify({ token, expiry })); } catch { /* storage full/blocked — non-fatal */ }
}

function clearStoredToken(): void {
  try { localStorage.removeItem(GOOGLE_TOKEN_KEY); } catch { /* non-fatal */ }
}

/**
 * Resolves once the async-loaded GIS script (`accounts.google.com/gsi/client`)
 * has exposed its OAuth2 API, or rejects after `timeoutMs`. Avoids the race
 * where the first token request fires before the script finished loading.
 */
function whenGisReady(timeoutMs = 8_000): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const id = setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        clearInterval(id);
        resolve();
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(id);
        reject(new Error('Google Identity Services não carregou. Recarregue a página.'));
      }
    }, 100);
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [trainerProfile, setTrainerProfile] = useState<Trainer | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  // The capability the user is currently acting as. Null until resolved on
  // sign-in (see the mode-resolution effect); reset to null on sign-out.
  const [mode, setModeState] = useState<Mode | null>(null);

  // uid the current `userProfile` snapshot corresponds to — set only inside
  // the listener callbacks below (never synchronously in the effect body), so
  // "profile loading" can be derived as `currentUser.uid !== profileUid`.
  const [profileUid, setProfileUid] = useState<string | null>(null);
  // Same pattern for the trainer record — resolved by email.
  const [trainerResolvedUid, setTrainerResolvedUid] = useState<string | null>(null);
  // uid the resolved `mode` corresponds to — lets us keep the app on the loading
  // gate until the mode is settled for the current account.
  const [modeUid, setModeUid] = useState<string | null>(null);

  // GIS Token Client — all state kept in refs so it never triggers re-renders.
  // The access token / expiry hydrate from sessionStorage so a refresh reuses a
  // still-valid token instead of re-prompting.
  const tokenClientRef = useRef<GISTokenClient | null>(null);
  const initialToken = readStoredToken();
  const accessTokenRef = useRef<string | null>(initialToken.token);
  const tokenExpiryRef = useRef<number>(initialToken.expiry);
  const pendingResolveRef = useRef<((token: string) => void) | null>(null);
  const pendingRejectRef = useRef<((err: Error) => void) | null>(null);
  // The single in-flight token request, so concurrent callers (e.g. the
  // proactive warm-up plus a data load firing at the same time) share one
  // GIS request / popup instead of clobbering each other's resolvers.
  const inFlightRef = useRef<Promise<string> | null>(null);

  // ── Firebase Auth listener ──────────────────────────────────────────────────

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthLoading(false);
      if (!user) {
        setUserProfile(null);
        setProfileUid(null);
        setTrainerProfile(null);
        setTrainerResolvedUid(null);
        setModeState(null);
        setModeUid(null);
        // Clear any cached token when the user signs out.
        accessTokenRef.current = null;
        tokenExpiryRef.current = 0;
        tokenClientRef.current = null;
        inFlightRef.current = null;
        clearStoredToken();
      }
    });
    return unsubscribe;
  }, []);

  // ── Firestore user profile listener ────────────────────────────────────────

  useEffect(() => {
    if (!currentUser) return;
    const uid = currentUser.uid;
    const unsubscribe = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        setUserProfile(snap.exists() ? (snap.data() as UserProfile) : null);
        setProfileUid(uid);
      },
      () => {
        // On permission error (e.g. rules not yet deployed), fall through gracefully.
        setUserProfile(null);
        setProfileUid(uid);
      },
    );
    return unsubscribe;
  }, [currentUser]);

  // ── Trainer record listener (keyed by verified Google email) ───────────────

  useEffect(() => {
    if (!currentUser) return;
    const uid = currentUser.uid;
    // No email → cannot be a trainer. `trainerProfile` is already null (reset on
    // sign-out) and `trainerLoading` ignores email-less users, so nothing to do.
    if (!currentUser.email) return;
    const emailKey = currentUser.email.toLowerCase();
    const ref = doc(db, 'trainers', emailKey);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const t = snap.data() as Trainer;
          setTrainerProfile(t);
          // First Google sign-in as this trainer confirms the account — the
          // verified Google email proves ownership of the invited address.
          if (t.status === 'pending') {
            updateDoc(ref, { status: 'confirmed', confirmedAt: serverTimestamp() })
              .catch(() => {/* best-effort — a stale status is non-fatal */});
          }
        } else {
          setTrainerProfile(null);
        }
        setTrainerResolvedUid(uid);
      },
      () => {
        setTrainerProfile(null);
        setTrainerResolvedUid(uid);
      },
    );
    return unsubscribe;
  }, [currentUser]);

  // ── Resolve the active mode once both profiles have settled ────────────────

  useEffect(() => {
    if (!currentUser) return;
    const uid = currentUser.uid;
    const email = currentUser.email;
    // Wait until both the student profile and the trainer record are resolved
    // for this uid — the default depends on both. Email-less users can't be
    // trainers, so their trainer record never "resolves" a uid; skip that gate.
    if (profileUid !== uid) return;
    if (email && trainerResolvedUid !== uid) return;
    // Already resolved for this account.
    if (modeUid === uid) return;

    // Resolution runs asynchronously (a cycle lookup is needed in one branch),
    // so every setState below lands in a promise callback rather than the
    // synchronous effect body.
    let cancelled = false;
    (async () => {
      let resolved: Mode;
      if (!trainerProfile) {
        // Not invited as a trainer → always student.
        resolved = 'student';
      } else {
        // Returning eligible user → honour their remembered choice; otherwise
        // default to student only if they are an established student (profile +
        // at least one cycle), else trainer. Persist whichever we resolve.
        const stored = readStoredMode(uid);
        if (stored) {
          resolved = stored;
        } else {
          let hasCycle = false;
          if (userProfile) {
            try {
              const snap = await getDocs(
                query(collection(db, 'cycles'), where('studentUid', '==', uid), limit(1)),
              );
              hasCycle = !snap.empty;
            } catch {
              hasCycle = false;
            }
          }
          resolved = userProfile && hasCycle ? 'student' : 'trainer';
          try { localStorage.setItem(modeKey(uid), resolved); } catch { /* non-fatal */ }
        }
      }
      if (cancelled) return;
      setModeState(resolved);
      setModeUid(uid);
    })();
    return () => { cancelled = true; };
  }, [currentUser, profileUid, trainerResolvedUid, trainerProfile, userProfile, modeUid]);

  // True between picking up a new `currentUser` and the first profile snapshot
  // for that uid arriving — derived so no synchronous setState is needed above.
  const profileLoading = !!currentUser && profileUid !== currentUser.uid;
  // Email-less users can't be trainers, so their trainer record never resolves a
  // uid — don't let that keep the app on the loading gate.
  const trainerLoading =
    !!currentUser && !!currentUser.email && trainerResolvedUid !== currentUser.uid;
  // True until the active mode is resolved for the current account.
  const modeLoading = !!currentUser && modeUid !== currentUser.uid;

  // Switch the active capability, persisting the choice for this account.
  const setMode = useCallback((next: Mode) => {
    const uid = currentUser?.uid;
    if (!uid) return;
    try { localStorage.setItem(modeKey(uid), next); } catch { /* non-fatal */ }
    setModeState(next);
    setModeUid(uid);
  }, [currentUser]);

  // ── Auth actions ────────────────────────────────────────────────────────────

  const signInWithGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    // Request the Sheets/Drive/Docs scopes during the sign-in popup itself, so
    // the consent is granted by the same user gesture. Otherwise the first page
    // load has to open a *second* (gesture-less, browser-blocked) GIS popup to
    // get these scopes — which is what forced the manual "Tentar novamente".
    provider.addScope('https://www.googleapis.com/auth/spreadsheets');
    provider.addScope('https://www.googleapis.com/auth/drive.file');
    provider.addScope('https://www.googleapis.com/auth/documents');

    const result = await signInWithPopup(auth, provider);

    // Cache the OAuth access token returned by the sign-in so the first
    // Sheets/Drive call reuses it instead of triggering another popup.
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) {
      accessTokenRef.current = credential.accessToken;
      // Google OAuth access tokens last ~1h; assume 55min to stay clear of expiry.
      tokenExpiryRef.current = Date.now() + 55 * 60 * 1_000;
      storeToken(accessTokenRef.current, tokenExpiryRef.current);
    }
    // Auth state propagates via onAuthStateChanged — no manual state update needed.
  }, []);

  const logOut = useCallback(async () => {
    await fbSignOut(auth);
    // Auth listener clears tokens.
  }, []);

  // ── GIS Token Client (lazy init) ────────────────────────────────────────────

  /** True when we hold a cached Google access token that hasn't expired yet. */
  const isGoogleTokenValid = useCallback(
    () => !!accessTokenRef.current && Date.now() < tokenExpiryRef.current,
    [],
  );

  const getAccessToken = useCallback((): Promise<string> => {
    // Return cached token if still valid (expiry includes a 60-second buffer).
    if (accessTokenRef.current && Date.now() < tokenExpiryRef.current) {
      return Promise.resolve(accessTokenRef.current);
    }

    // Coalesce concurrent callers onto a single GIS request / popup.
    if (inFlightRef.current) return inFlightRef.current;

    const request = (async () => {
      // Wait for the async-loaded GIS script rather than failing the first call.
      await whenGisReady();

      // Lazily initialise the GIS Token Client on first use.
      if (!tokenClientRef.current) {
        tokenClientRef.current = window.google!.accounts.oauth2.initTokenClient({
          client_id: import.meta.env.VITE_GOOGLE_CLIENT_ID as string,
          scope: [
            'https://www.googleapis.com/auth/spreadsheets',
            'https://www.googleapis.com/auth/drive.file',
            'https://www.googleapis.com/auth/documents',
          ].join(' '),
          callback: (response) => {
            if (response.access_token) {
              accessTokenRef.current = response.access_token;
              // Store expiry with a 60-second safety buffer.
              tokenExpiryRef.current = Date.now() + (response.expires_in - 60) * 1_000;
              storeToken(accessTokenRef.current, tokenExpiryRef.current);
              pendingResolveRef.current?.(response.access_token);
            } else {
              pendingRejectRef.current?.(
                new Error(response.error_description ?? 'Falha ao obter token de acesso'),
              );
            }
            pendingResolveRef.current = null;
            pendingRejectRef.current = null;
          },
          error_callback: (err) => {
            pendingRejectRef.current?.(new Error(err.type));
            pendingResolveRef.current = null;
            pendingRejectRef.current = null;
          },
        });
      }

      return await new Promise<string>((resolve, reject) => {
        pendingResolveRef.current = resolve;
        pendingRejectRef.current = reject;
        // prompt: '' → reuse the existing grant, showing Google's UI only when
        // a fresh authorization is actually needed (e.g. the token expired and
        // a silent refresh isn't possible).
        tokenClientRef.current!.requestAccessToken({ prompt: '' });
      });
    })();

    inFlightRef.current = request.finally(() => { inFlightRef.current = null; });
    return inFlightRef.current;
  }, []);

  const loading = authLoading || profileLoading || trainerLoading || modeLoading;

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        trainerProfile,
        trainerEligible: !!trainerProfile,
        mode,
        setMode,
        loading,
        signInWithGoogle,
        logOut,
        getAccessToken,
        isGoogleTokenValid,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
