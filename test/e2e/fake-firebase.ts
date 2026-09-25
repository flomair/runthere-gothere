// Test-only stand-in for src/lib/firebase.ts (used by vite.e2e.config.ts, never shipped).
import { useEffect, useState } from 'react';

type FakeUser = { uid: string; email: string };
const w = globalThis as unknown as { __fakeUser?: FakeUser | null };
const listeners = new Set<(u: FakeUser | null) => void>();

export const firebaseConfigured = true;
export async function signInWithGoogle() {
  w.__fakeUser = { uid: 'owner', email: 'owner@example.com' };
  listeners.forEach((l) => l(w.__fakeUser!));
}
export async function signOutUser() {
  w.__fakeUser = null;
  listeners.forEach((l) => l(null));
}
export async function idToken() {
  return w.__fakeUser ? `fake:${w.__fakeUser.uid}` : null;
}
export function useAuthUser() {
  const [u, setU] = useState<FakeUser | null | undefined>(w.__fakeUser ?? null);
  useEffect(() => {
    listeners.add(setU);
    return () => void listeners.delete(setU);
  }, []);
  return u;
}
