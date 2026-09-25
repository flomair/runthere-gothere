import { useSyncExternalStore } from 'react';
import { DE } from './i18n-de';

/** UI languages. Strings are written in English in the code; `t()` looks up the German text. */
export type UiLang = 'en' | 'de';
const KEY = 'rtgt.lang';

const browserLang = (): UiLang => (typeof navigator !== 'undefined' && /^de\b/i.test(navigator.language) ? 'de' : 'en');

function stored(): UiLang | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'de' || v === 'en' ? v : null;
  } catch {
    return null;
  }
}

let current: UiLang = stored() ?? browserLang();
const listeners = new Set<() => void>();

export const getLang = () => current;
/** True when the user picked the language in the app (not just inherited from the browser). */
export const langChosen = () => stored() !== null;

export function setLang(l: UiLang) {
  current = l;
  try {
    localStorage.setItem(KEY, l);
  } catch {
    /* private mode: keep it for this visit */
  }
  document.documentElement.lang = l;
  listeners.forEach((f) => f());
}

const subscribe = (f: () => void) => {
  listeners.add(f);
  return () => listeners.delete(f);
};

/** Translate an English UI string; `{name}` placeholders are filled from `vars`. */
export function t(en: string, vars?: Record<string, string | number>): string {
  let s = current === 'de' ? (DE[en] ?? en) : en;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** Re-render on language change and get the translator. */
export function useT() {
  useSyncExternalStore(subscribe, getLang, getLang);
  return t;
}

export function useLang(): UiLang {
  return useSyncExternalStore(subscribe, getLang, getLang);
}

/** Locale for dates and numbers. */
export const locale = () => (current === 'de' ? 'de-DE' : undefined);

if (typeof document !== 'undefined') document.documentElement.lang = current;
