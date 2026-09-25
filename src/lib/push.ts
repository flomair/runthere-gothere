import { useEffect, useState } from 'react';
import { api } from './api';
import { firebaseApp, vapidKey } from './firebase';
import { getLang, t } from './i18n';
import { isIos, isStandalone } from './pwa';

const KEY = 'rtgt.pushToken';

export type PushStatus =
  /** Push isn't configured on the server side (no VAPID key) or the browser can't do it. */
  | 'unsupported'
  /** iPhone/iPad: only an app installed to the home screen can receive push. */
  | 'needs-install'
  /** The user blocked notifications in the browser settings. */
  | 'denied'
  | 'off'
  | 'on';

const savedToken = () => {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
};

function currentStatus(): PushStatus {
  if (typeof window === 'undefined') return 'unsupported';
  if (isIos() && !isStandalone()) return 'needs-install';
  if (!vapidKey || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return Notification.permission === 'granted' && savedToken() ? 'on' : 'off';
}

async function registration() {
  return (await navigator.serviceWorker.getRegistration('/')) ?? navigator.serviceWorker.register('/sw.js');
}

async function enable(): Promise<void> {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(perm === 'denied' ? t('Notifications are blocked in the browser settings.') : t('Permission was not granted.'));
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const { getMessaging, getToken } = await import('firebase/messaging');
  const token = await getToken(getMessaging(firebaseApp()), { vapidKey, serviceWorkerRegistration: reg });
  if (!token) throw new Error(t('The browser did not return a push token.'));
  await api('/api/push', { method: 'POST', json: { token, lang: getLang() } });
  localStorage.setItem(KEY, token);
}

async function disable(): Promise<void> {
  const token = savedToken();
  try {
    const { getMessaging, deleteToken } = await import('firebase/messaging');
    await deleteToken(getMessaging(firebaseApp()));
  } catch {
    /* already gone */
  }
  if (token) await api('/api/push', { method: 'DELETE', json: { token } }).catch(() => undefined);
  localStorage.removeItem(KEY);
}

/** Notification switch for this device. */
export function usePush() {
  const [status, setStatus] = useState<PushStatus>(currentStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // keep the server's language for notifications in step with the UI
  useEffect(() => {
    const token = savedToken();
    if (status === 'on' && token) void api('/api/push', { method: 'POST', json: { token, lang: getLang() } }).catch(() => undefined);
  }, [status]);
  return {
    status,
    busy,
    error,
    toggle: async () => {
      setBusy(true);
      setError(null);
      try {
        if (status === 'on') await disable();
        else await enable();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setStatus(currentStatus());
        setBusy(false);
      }
    },
    test: () => api<{ sent: number }>('/api/push/test', { method: 'POST' }),
  };
}
