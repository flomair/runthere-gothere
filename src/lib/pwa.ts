import { useSyncExternalStore } from 'react';

/** Chrome/Edge/Samsung fire this when the app can be installed; we keep it for our own install button. */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

export const isStandalone = () =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);

export const isIos = () => typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

/** Register the service worker (production builds only) and listen for install events. */
export function initPwa() {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    emit();
  });
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('service worker registration failed', e));
    });
  }
}

export type InstallState =
  /** Already running as an installed app. */
  | 'installed'
  /** The browser offered installation: call `install()`. */
  | 'prompt'
  /** iPhone / iPad Safari: Share → Add to Home Screen. */
  | 'ios'
  /** Nothing to offer (desktop Firefox, already dismissed by the browser …). */
  | 'none';

const state = (): InstallState => (installed || isStandalone() ? 'installed' : deferred ? 'prompt' : isIos() ? 'ios' : 'none');

export function useInstall() {
  const s = useSyncExternalStore(
    (f) => {
      listeners.add(f);
      return () => listeners.delete(f);
    },
    state,
    state,
  );
  return {
    state: s,
    install: async () => {
      if (!deferred) return false;
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null;
      emit();
      return outcome === 'accepted';
    },
  };
}
