import { createContext } from 'react';
import type { User } from 'firebase/auth';
import type { Trainer, UserProfile } from '../types';

export interface AuthContextValue {
  currentUser: User | null;
  /** The signed-in student's profile (Google auth). Null for trainers/guests. */
  userProfile: UserProfile | null;
  /**
   * The signed-in trainer's record (email-link auth), matched by verified email.
   * Null for students/guests. Mutually exclusive with `userProfile` in practice.
   */
  trainerProfile: Trainer | null;
  /** True while the initial auth state and/or Firestore profile are loading. */
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  /**
   * Sends a passwordless Firebase sign-in link to a trainer's email. `nextPath`
   * is where the trainer lands (authenticated) after clicking the link.
   */
  sendTrainerMagicLink: (email: string, nextPath: string) => Promise<void>;
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
