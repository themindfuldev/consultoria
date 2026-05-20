import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  deleteUser,
  GoogleAuthProvider,
  type User as FirebaseUser,
} from 'firebase/auth';
import { doc, getDoc, setDoc, deleteDoc, Timestamp } from 'firebase/firestore';
import { auth, db, googleProvider } from '../services/firebase';
import { setupTrainerWorkspace } from '../services/workspaceSetup';
import type { Language, UserProfile, UserRole, Workspace } from '../types';

// Re-export so existing imports from this file continue to work.
export type { UserProfile, UserRole };

interface AuthContextProps {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  login: () => Promise<UserProfile | null>;
  logout: () => Promise<void>;
  createProfile: (role: UserRole, preferredLanguage: Language) => Promise<UserProfile>;
  deleteAccount: () => Promise<void>;
  /** Returns a valid Google OAuth access token, refreshing via re-auth if expired. */
  getValidGoogleToken: () => Promise<string>;
}

const AuthContext = createContext<AuthContextProps | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  // Google OAuth token stored in memory only (never persisted to storage).
  // Token expires after 1 hour. refreshGoogleToken() re-auths silently
  // (no visible popup if the user's Google session is still active).
  const googleTokenRef = useRef<string | null>(null);
  const tokenExpiresAtRef = useRef<number>(0);

  const storeGoogleToken = (token: string) => {
    googleTokenRef.current = token;
    tokenExpiresAtRef.current = Date.now() + 3_600_000; // 1 hour
  };

  const refreshGoogleToken = async (): Promise<string> => {
    const result = await signInWithPopup(auth, googleProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const token = credential?.accessToken;
    if (!token) throw new Error('Could not obtain Google access token');
    storeGoogleToken(token);
    return token;
  };

  const getValidGoogleToken = async (): Promise<string> => {
    const fiveMinutes = 5 * 60 * 1000;
    if (googleTokenRef.current && Date.now() < tokenExpiresAtRef.current - fiveMinutes) {
      return googleTokenRef.current;
    }
    return refreshGoogleToken();
  };

  const fetchProfile = async (uid: string): Promise<UserProfile | null> => {
    try {
      const snap = await getDoc(doc(db, 'users', uid));
      return snap.exists() ? (snap.data() as UserProfile) : null;
    } catch (err) {
      console.error('Error fetching profile:', err);
      return null;
    }
  };

  // Restore auth state on app load
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setLoading(true);
      if (firebaseUser) {
        setUser(firebaseUser);
        const userProfile = await fetchProfile(firebaseUser.uid);
        setProfile(userProfile);
      } else {
        setUser(null);
        setProfile(null);
        googleTokenRef.current = null;
        tokenExpiresAtRef.current = 0;
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const login = async (): Promise<UserProfile | null> => {
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) storeGoogleToken(credential.accessToken);

      setUser(result.user);
      const userProfile = await fetchProfile(result.user.uid);
      setProfile(userProfile);
      return userProfile; // null signals new user → show role selection
    } catch (err) {
      console.error('Sign-in error:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const createProfile = async (
    role: UserRole,
    preferredLanguage: Language,
  ): Promise<UserProfile> => {
    if (!user) throw new Error('No authenticated user');

    const newProfile: UserProfile = {
      uid: user.uid,
      email: user.email ?? '',
      displayName: user.displayName ?? 'User',
      photoURL: user.photoURL ?? '',
      role,
      selectedLanguage: preferredLanguage,
      createdAt: Timestamp.now(),
    };

    await setDoc(doc(db, 'users', user.uid), newProfile);

    if (role === 'trainer') {
      const workspaceId = user.email ?? user.uid;
      const workspace: Workspace = {
        id: workspaceId,
        trainerUid: user.uid,
        trainerEmail: user.email ?? '',
        trainerName: user.displayName ?? 'Trainer',
        language: preferredLanguage,
        setupComplete: false,
        createdAt: Timestamp.now(),
      };
      await setDoc(doc(db, 'workspaces', workspaceId), workspace);

      // Fire-and-forget: creates Drive folders + Exercise Library sheet.
      // The dashboard polls setupComplete to show progress.
      if (googleTokenRef.current) {
        void setupTrainerWorkspace(workspaceId, preferredLanguage, googleTokenRef.current);
      }
    }

    setProfile(newProfile);
    return newProfile;
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setProfile(null);
      googleTokenRef.current = null;
      tokenExpiresAtRef.current = 0;
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const deleteAccount = async () => {
    if (!user || !profile) throw new Error('No authenticated user');

    if (profile.role === 'trainer') {
      // Workspace + student_workspaces cleanup is handled server-side by
      // Firestore rules / a future cleanup function. For now, delete the
      // workspace doc so no new logins can access it.
      const workspaceId = user.email ?? user.uid;
      await deleteDoc(doc(db, 'workspaces', workspaceId));
    }

    await deleteDoc(doc(db, 'users', user.uid));
    await deleteUser(user);
    setUser(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{ user, profile, loading, login, logout, createProfile, deleteAccount, getValidGoogleToken }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
};
