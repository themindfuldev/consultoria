import { useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as fbSignOut,
} from 'firebase/auth';
import type { User } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '../firebase';
import type { UserProfile } from '../types';
import { AuthContext } from './AuthContextDef';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // uid the current `userProfile` snapshot corresponds to — set only inside
  // the listener callbacks below (never synchronously in the effect body), so
  // "profile loading" can be derived as `currentUser.uid !== profileUid`.
  const [profileUid, setProfileUid] = useState<string | null>(null);

  // GIS Token Client — all state kept in refs so it never triggers re-renders.
  const tokenClientRef = useRef<GISTokenClient | null>(null);
  const accessTokenRef = useRef<string | null>(null);
  const tokenExpiryRef = useRef<number>(0);
  const pendingResolveRef = useRef<((token: string) => void) | null>(null);
  const pendingRejectRef = useRef<((err: Error) => void) | null>(null);

  // ── Firebase Auth listener ──────────────────────────────────────────────────

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      setAuthLoading(false);
      if (!user) {
        setUserProfile(null);
        setProfileUid(null);
        // Clear any cached token when the user signs out.
        accessTokenRef.current = null;
        tokenExpiryRef.current = 0;
        tokenClientRef.current = null;
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

  // True between picking up a new `currentUser` and the first profile snapshot
  // for that uid arriving — derived so no synchronous setState is needed above.
  const profileLoading = !!currentUser && profileUid !== currentUser.uid;

  // ── Auth actions ────────────────────────────────────────────────────────────

  const signInWithGoogle = useCallback(async () => {
    const provider = new GoogleAuthProvider();
    await signInWithPopup(auth, provider);
    // Auth state propagates via onAuthStateChanged — no manual state update needed.
  }, []);

  const logOut = useCallback(async () => {
    await fbSignOut(auth);
    // Auth listener clears tokens.
  }, []);

  // ── GIS Token Client (lazy init) ────────────────────────────────────────────

  const getAccessToken = useCallback((): Promise<string> => {
    // Return cached token if still valid (expiry includes a 60-second buffer).
    if (accessTokenRef.current && Date.now() < tokenExpiryRef.current) {
      return Promise.resolve(accessTokenRef.current);
    }

    // Lazily initialise the GIS Token Client on first use.
    if (!tokenClientRef.current) {
      if (!window.google?.accounts?.oauth2) {
        return Promise.reject(
          new Error('Google Identity Services não está disponível. Recarregue a página.'),
        );
      }
      tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
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

    return new Promise((resolve, reject) => {
      pendingResolveRef.current = resolve;
      pendingRejectRef.current = reject;
      // prompt: '' → silent refresh; no popup as long as consent was already given.
      tokenClientRef.current!.requestAccessToken({ prompt: '' });
    });
  }, []);

  const loading = authLoading || profileLoading;

  return (
    <AuthContext.Provider
      value={{ currentUser, userProfile, loading, signInWithGoogle, logOut, getAccessToken }}
    >
      {children}
    </AuthContext.Provider>
  );
}
