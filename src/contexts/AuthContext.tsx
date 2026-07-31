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

/**
 * How long before a token's expiry we start trying to renew it. The GIS browser
 * flow has no refresh token, so a renewal is a round-trip to Google that is only
 * invisible when Google can satisfy it silently. Doing it while the page is
 * already open (and the Google session warm) is far more likely to succeed
 * silently than doing it from a cold page load, which is where an expired token
 * would otherwise always be discovered.
 */
const REFRESH_LEAD_MS = 10 * 60 * 1_000;

/** How often the background renewal check runs while the app is open. */
const REFRESH_CHECK_MS = 60 * 1_000;

/** Minimum gap between renewal attempts, so a failing refresh can't spin. */
const REFRESH_RETRY_MS = 5 * 60 * 1_000;

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

  // Whether this account's email is on the registration allowlist, and the uid
  // that answer was resolved for. New sign-ins stay on the loading gate until
  // this settles, so the app never briefly routes an unapproved user into
  // onboarding before bouncing them to the pending screen.
  const [approved, setApproved] = useState(false);
  const [approvalUid, setApprovalUid] = useState<string | null>(null);

  // GIS Token Client — all state kept in refs so it never triggers re-renders.
  // The access token / expiry hydrate from localStorage so a reload reuses a
  // still-valid token instead of re-prompting.
  const tokenClientRef = useRef<GISTokenClient | null>(null);
  // Hydrated through a lazy `useState` initialiser so the storage read +
  // JSON.parse happen once on mount, rather than on every render.
  const [initialToken] = useState(readStoredToken);
  const accessTokenRef = useRef<string | null>(initialToken.token);
  const tokenExpiryRef = useRef<number>(initialToken.expiry);
  // The signed-in Google address, mirrored into a ref so `getAccessToken` can
  // read it without becoming a new function identity on every sign-in (it is
  // depended on by effects across the app). Used as the GIS `hint` — see below.
  const userEmailRef = useRef<string | null>(null);
  const pendingResolveRef = useRef<((token: string) => void) | null>(null);
  const pendingRejectRef = useRef<((err: Error) => void) | null>(null);
  // Timestamp of the last renewal attempt, so a refresh that keeps failing
  // (popup blocked, offline) backs off instead of retrying every check.
  const lastRefreshAttemptRef = useRef(0);
  // The single in-flight token request, so concurrent callers (e.g. the
  // proactive warm-up plus a data load firing at the same time) share one
  // GIS request / popup instead of clobbering each other's resolvers.
  const inFlightRef = useRef<Promise<string> | null>(null);

  // ── Firebase Auth listener ──────────────────────────────────────────────────

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthLoading(false);
      userEmailRef.current = user?.email ?? null;
      if (!user) {
        setUserProfile(null);
        setProfileUid(null);
        setTrainerProfile(null);
        setTrainerResolvedUid(null);
        setModeState(null);
        setModeUid(null);
        setApproved(false);
        setApprovalUid(null);
        // Clear any cached token when the user signs out.
        accessTokenRef.current = null;
        tokenExpiryRef.current = 0;
        tokenClientRef.current = null;
        inFlightRef.current = null;
        lastRefreshAttemptRef.current = 0;
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

  // ── Registration allowlist listener (keyed by verified Google email) ───────

  useEffect(() => {
    if (!currentUser) return;
    const uid = currentUser.uid;
    const email = currentUser.email?.toLowerCase();
    // No email → can never be on the email allowlist. `approved` is already
    // false (reset on sign-out) and `approvalLoading` ignores email-less users,
    // so nothing to do — leave them not approved.
    if (!email) return;
    const unsubscribe = onSnapshot(
      doc(db, 'allowlist', email),
      (snap) => {
        setApproved(snap.exists());
        setApprovalUid(uid);
      },
      () => {
        // On permission error, fail closed (treat as not approved).
        setApproved(false);
        setApprovalUid(uid);
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
  // True until the allowlist status is resolved for the current account.
  // Email-less accounts can't be on the email allowlist, so their status never
  // resolves a uid — don't let that keep the app on the loading gate.
  const approvalLoading =
    !!currentUser && !!currentUser.email && approvalUid !== currentUser.uid;

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
    // Request the Drive scope during the sign-in popup itself, so the consent is
    // granted by the same user gesture. Otherwise the first page load has to open
    // a *second* (gesture-less, browser-blocked) GIS popup to get it — which is
    // what forced the manual "Tentar novamente".
    //
    // `drive.file` is per-file: the app only reaches spreadsheets the user picks
    // via the Google Picker (and files it creates, e.g. video folders). We do NOT
    // request the broad `spreadsheets` scope — that sensitive scope is avoided so
    // the app stays on non-sensitive scopes only.
    provider.addScope('https://www.googleapis.com/auth/drive.file');

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

  /**
   * Adopts a newer token written to localStorage by another tab (or by the
   * home-screen app running alongside the browser). Without this, a second tab
   * keeps its own stale in-memory copy and re-prompts Google even though a
   * perfectly good token was just obtained next door.
   */
  const syncTokenFromStorage = useCallback(() => {
    if (accessTokenRef.current && Date.now() < tokenExpiryRef.current) return;
    const stored = readStoredToken();
    if (stored.token) {
      accessTokenRef.current = stored.token;
      tokenExpiryRef.current = stored.expiry;
    }
  }, []);

  /** True when we hold a cached Google access token that hasn't expired yet. */
  const isGoogleTokenValid = useCallback(() => {
    syncTokenFromStorage();
    return !!accessTokenRef.current && Date.now() < tokenExpiryRef.current;
  }, [syncTokenFromStorage]);

  const getAccessToken = useCallback((): Promise<string> => {
    // Return cached token if still valid (expiry includes a 60-second buffer),
    // picking up one another tab may have refreshed since our last check.
    syncTokenFromStorage();
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
          scope: 'https://www.googleapis.com/auth/drive.file',
          // Tell Google which account this is for. Without a hint, `prompt: ''`
          // cannot auto-select when the browser has more than one Google session
          // signed in — Google falls back to the account chooser, so what should
          // be a silent renewal becomes a visible "pick your account" prompt on
          // every single refresh. We always know the address (it is the verified
          // email Firebase signed in with), so there is no reason to make Google
          // guess.
          hint: userEmailRef.current ?? undefined,
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
        // a silent refresh isn't possible). The hint is repeated here because
        // the client is initialised once but the account can change across a
        // sign-out/sign-in without the app reloading.
        tokenClientRef.current!.requestAccessToken({
          prompt: '',
          hint: userEmailRef.current ?? undefined,
        });
      });
    })();

    inFlightRef.current = request.finally(() => { inFlightRef.current = null; });
    return inFlightRef.current;
  }, [syncTokenFromStorage]);

  // ── Proactive renewal ───────────────────────────────────────────────────────
  // The token only lives ~1h and the GIS browser flow has no refresh token, so
  // it must be re-obtained from Google roughly hourly no matter what. The old
  // behaviour only noticed this once something already needed the token — which
  // in practice meant a cold page load with no user gesture, where the popup is
  // blocked and the student is left tapping "Tentar novamente" (or getting a
  // Google prompt on their first tap).
  //
  // Instead, renew *while the app is open and the Google session is warm*, a
  // few minutes before expiry. That request is normally satisfied silently, so
  // reopening the app later finds a valid token and shows nothing at all. If it
  // can't be satisfied silently the attempt just fails quietly and the existing
  // on-demand path still applies — this only ever removes prompts.

  useEffect(() => {
    if (!currentUser) return;

    const maybeRefresh = () => {
      // Only while the page is actually visible: a backgrounded tab can't get a
      // popup through anyway, and mobile throttles its timers regardless.
      if (document.visibilityState !== 'visible') return;
      syncTokenFromStorage();
      const expiry = tokenExpiryRef.current;
      // Still comfortably valid → nothing to do.
      if (accessTokenRef.current && Date.now() < expiry - REFRESH_LEAD_MS) return;
      if (Date.now() - lastRefreshAttemptRef.current < REFRESH_RETRY_MS) return;
      lastRefreshAttemptRef.current = Date.now();
      getAccessToken().catch(() => {/* silent renewal not possible right now */});
    };

    const id = setInterval(maybeRefresh, REFRESH_CHECK_MS);
    // Also check when the app comes back to the foreground — the interval is
    // unreliable in a backgrounded/frozen tab, which is exactly the case that
    // produced a stale token on return.
    document.addEventListener('visibilitychange', maybeRefresh);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', maybeRefresh);
    };
  }, [currentUser, getAccessToken, syncTokenFromStorage]);

  const loading =
    authLoading || profileLoading || trainerLoading || modeLoading || approvalLoading;

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        trainerProfile,
        trainerEligible: !!trainerProfile,
        approved,
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
