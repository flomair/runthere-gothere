import { type FirebaseApp, initializeApp } from 'firebase/app';
import {
  type Auth,
  GoogleAuthProvider,
  type User,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from 'firebase/auth';
import { useEffect, useState } from 'react';

/**
 * Firebase web config. These values are public identifiers (they ship to every browser); access is
 * protected by Google sign-in and the server-side allowlist. VITE_FIREBASE_* env vars override them.
 */
const config = {
  apiKey: (import.meta.env.VITE_FIREBASE_API_KEY as string | undefined) || 'AIzaSyDqDxbZ_KD3Ur4nb2s-40sSy4-sfYPGveM',
  authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined) || 'run-there-go-threre.firebaseapp.com',
  projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined) || 'run-there-go-threre',
  appId: (import.meta.env.VITE_FIREBASE_APP_ID as string | undefined) || '1:788921664587:web:3fdedfdbe593066ed279ce',
};

export const firebaseConfigured = Boolean(config.apiKey && config.authDomain && config.projectId);

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
function authInstance(): Auth {
  if (!firebaseConfigured) throw new Error('Firebase is not configured');
  if (!auth) {
    app = initializeApp(config);
    auth = getAuth(app);
  }
  return auth;
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await signInWithPopup(authInstance(), provider);
  } catch (e) {
    const code = (e as { code?: string }).code;
    // popups are often blocked on mobile: fall back to a full-page redirect
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(authInstance(), provider);
    } else if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') {
      throw e;
    }
  }
}

export const signOutUser = () => signOut(authInstance());

/** Current Firebase ID token (refreshed automatically when close to expiry). */
export async function idToken(): Promise<string | null> {
  if (!firebaseConfigured) return null;
  const u = authInstance().currentUser;
  return u ? u.getIdToken() : null;
}

/** undefined = still loading, null = signed out. */
export function useAuthUser(): User | null | undefined {
  const [user, setUser] = useState<User | null | undefined>(firebaseConfigured ? undefined : null);
  useEffect(() => {
    if (!firebaseConfigured) return;
    return onAuthStateChanged(authInstance(), setUser);
  }, []);
  return user;
}
