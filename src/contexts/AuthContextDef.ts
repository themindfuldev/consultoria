import { createContext } from 'react';
import type { User } from 'firebase/auth';
import type { Trainer, UserProfile } from '../types';

/** Which capability the signed-in user is currently acting as. */
export type Mode = 'student' | 'trainer';

export interface AuthContextValue {
  currentUser: User | null;
  /** The signed-in user's student profile (`users/{uid}`). Null until onboarding. */
  userProfile: UserProfile | null;
  /**
   * The signed-in user's trainer record (`trainers/{email}`), matched by their
   * verified Google email. Present iff another student has invited this email as
   * a trainer. A single account may hold both this and `userProfile`.
   */
  trainerProfile: Trainer | null;
  /** True when a trainer record exists for this account (i.e. invited as a trainer). */
  trainerEligible: boolean;
  /**
   * The capability the user is currently acting as. Null only while still being
   * resolved on sign-in (the app stays on the loading gate until it settles).
   */
  mode: Mode | null;
  /** Switch the active capability. Persists the choice per-account (localStorage). */
  setMode: (mode: Mode) => void;
  /** True while the initial auth state, Firestore profiles, and/or mode are loading. */
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  logOut: () => Promise<void>;
  /**
   * Returns a valid Google OAuth access token for Sheets/Drive API calls.
   * Uses the cached token when still valid; otherwise performs a GIS token
   * refresh, showing Google's authorization UI only when one is needed.
   * Concurrent callers share a single in-flight request.
   */
  getAccessToken: () => Promise<string>;
  /**
   * Synchronously reports whether a non-expired Google access token is cached.
   * Lets a page decide, on open, whether it needs to proactively re-authorize
   * (see `useGoogleTokenWarmup`) instead of waiting for a data call to fail.
   */
  isGoogleTokenValid: () => boolean;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
