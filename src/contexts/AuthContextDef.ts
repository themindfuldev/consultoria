import { createContext } from 'react';
import type { User } from 'firebase/auth';
import type { UserProfile } from '../types';

export interface AuthContextValue {
  currentUser: User | null;
  userProfile: UserProfile | null;
  /** True while the initial auth state and/or Firestore profile are loading. */
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  logOut: () => Promise<void>;
  /**
   * Returns a valid Google OAuth access token for Sheets/Drive API calls.
   * Uses the cached token when still valid; otherwise performs a silent GIS
   * token refresh (no popup as long as the user's Google session is active).
   */
  getAccessToken: () => Promise<string>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);
