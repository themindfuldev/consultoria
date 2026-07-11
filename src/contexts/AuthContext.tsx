import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  GoogleAuthProvider,
  isSignInWithEmailLink,
  onAuthStateChanged,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  signInWithPopup,
  signOut as fbSignOut,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { doc, onSnapshot, serverTimestamp, updateDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { Trainer, UserProfile } from '../types';
import { AuthContext } from './AuthContextDef';

/** localStorage key holding the email a trainer requested a sign-in link for. */
const TRAINER_EMAIL_KEY = 'trainerEmailForSignIn';

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

/** True when the current Firebase user signed in via an email link (a trainer). */
function isEmailLinkUser(user: User | null): boolean {
  return !!user?.providerData.some((p) => p.providerId === 'password');
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

  // uid the current `userProfile` snapshot corresponds to — set only inside
  // the listener callbacks below (never synchronously in the effect body), so
  // "profile loading" can be derived as `currentUser.uid !== profileUid`.
  const [profileUid, setProfileUid] = useState<string | null>(null);
  // Same pattern for the trainer record — resolved by email, not uid.
  const [trainerResolvedUid, setTrainerResolvedUid] = useState<string | null>(null);

  // True (synchronously, on first render) while an email sign-in link is being
  // completed — keeps the app on a loading gate so a ProtectedRoute doesn't
  // redirect the still-signed-out trainer away before sign-in finishes.
  const [completingLink, setCompletingLink] = useState(() =>
    isSignInWithEmailLink(auth, window.location.href),
  );

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
        // Clear any cached token when the user signs out.
        accessTokenRef.current = null;
        tokenExpiryRef.current = 0;
        tokenClientRef.current = null;
        inFlightRef.current = null;
        clearStoredToken();
      } else if (!isEmailLinkUser(user)) {
        // A Google (student) user has no trainer record — resolve immediately so
        // trainer loading never blocks. The dedicated effect below handles the
        // email-link (trainer) case via a Firestore listener.
        setTrainerProfile(null);
        setTrainerResolvedUid(user.uid);
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

  // ── Trainer record listener (email-link users) ─────────────────────────────

  useEffect(() => {
    // Only email-link users are trainers; Google (student) users are resolved
    // synchronously in the auth listener above, so skip them here.
    if (!currentUser || !isEmailLinkUser(currentUser) || !currentUser.email) return;
    const uid = currentUser.uid;
    const emailKey = currentUser.email.toLowerCase();
    const ref = doc(db, 'trainers', emailKey);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const t = snap.data() as Trainer;
          setTrainerProfile(t);
          // First sign-in confirms the account (email ownership is now proven).
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

  // ── Complete an email sign-in link, if the URL is one ──────────────────────

  useEffect(() => {
    if (!isSignInWithEmailLink(auth, window.location.href)) return;
    let email = window.localStorage.getItem(TRAINER_EMAIL_KEY);
    if (!email) {
      // Opened on a different device/browser than the request — ask for it.
      email = window.prompt('Confirme seu e-mail para entrar:') ?? '';
    }

    const run = email
      ? signInWithEmailLink(auth, email, window.location.href).then(() => {
          window.localStorage.removeItem(TRAINER_EMAIL_KEY);
          // Drop the oobCode query params, keeping the path → the trainer lands
          // back on the feedback/dashboard page they originally opened.
          const url = new URL(window.location.href);
          window.history.replaceState({}, '', url.pathname + url.hash);
        })
      : Promise.resolve();

    run
      .catch(() => {/* invalid/expired link — the login page will let them retry */})
      .finally(() => setCompletingLink(false));
  }, []);

  // True between picking up a new `currentUser` and the first profile snapshot
  // for that uid arriving — derived so no synchronous setState is needed above.
  const profileLoading = !!currentUser && profileUid !== currentUser.uid;
  const trainerLoading = !!currentUser && trainerResolvedUid !== currentUser.uid;

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

  const sendTrainerMagicLink = useCallback(async (email: string, nextPath: string) => {
    const cleanEmail = email.trim().toLowerCase();
    const url = `${window.location.origin}${nextPath}`;
    window.localStorage.setItem(TRAINER_EMAIL_KEY, cleanEmail);
    await sendSignInLinkToEmail(auth, cleanEmail, { url, handleCodeInApp: true });
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

  const loading = authLoading || profileLoading || trainerLoading || completingLink;

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        trainerProfile,
        loading,
        signInWithGoogle,
        sendTrainerMagicLink,
        logOut,
        getAccessToken,
        isGoogleTokenValid,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
