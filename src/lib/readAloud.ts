import { authHeaders, lang } from './api';

/** Natural Google Cloud voices offered in the app (see server/tts.ts). */
export const NATURAL_VOICES = [
  { id: 'Charon', label: 'Charon', hint: 'warm, male' },
  { id: 'Kore', label: 'Kore', hint: 'calm, female' },
  { id: 'Aoede', label: 'Aoede', hint: 'bright, female' },
  { id: 'Fenrir', label: 'Fenrir', hint: 'deep, male' },
  { id: 'Leda', label: 'Leda', hint: 'soft, female' },
  { id: 'Puck', label: 'Puck', hint: 'lively, male' },
] as const;

export interface ReadAloudOptions {
  reader: 'natural' | 'device';
  naturalVoice: string;
  voiceURI: string | null;
  rate: number;
}

export interface Playback {
  /** Resolves when reading finished or was stopped. */
  done: Promise<void>;
  stop(): void;
  /** Set when natural voices were requested but the device voice had to be used. */
  notice?: string;
}

// natural audio per (voice, language, text), so replaying a story costs nothing
const audioCache = new Map<string, string>();
let naturalUnavailable: string | null = null;

const clean = (text: string) => text.replace(/[*_#>`]/g, '').replace(/\n{3,}/g, '\n\n').trim();

/** The best-sounding voice the device offers for the language (premium/enhanced/natural voices first). */
export function bestDeviceVoice(voices: SpeechSynthesisVoice[], language = lang()): SpeechSynthesisVoice | undefined {
  const score = (v: SpeechSynthesisVoice) =>
    (v.lang.toLowerCase().startsWith(language) ? 100 : 0) +
    (/premium|enhanced|natural|neural|verbessert|siri/i.test(v.name) ? 20 : 0) +
    (/google/i.test(v.name) ? 10 : 0) +
    (v.localService ? 1 : 0);
  return [...voices].sort((a, b) => score(b) - score(a))[0];
}

function deviceRead(text: string, o: ReadAloudOptions, notice?: string): Playback {
  if (!('speechSynthesis' in window)) return { done: Promise.resolve(), stop() {}, notice: notice ?? 'Reading aloud is not supported in this browser.' };
  const synth = window.speechSynthesis;
  const voices = synth.getVoices();
  const u = new SpeechSynthesisUtterance(clean(text));
  const v = voices.find((x) => x.voiceURI === o.voiceURI) ?? bestDeviceVoice(voices);
  if (v) {
    u.voice = v;
    u.lang = v.lang;
  } else u.lang = navigator.language;
  u.rate = o.rate;
  const done = new Promise<void>((resolve) => {
    u.onend = u.onerror = () => resolve();
  });
  synth.cancel();
  synth.speak(u);
  return { done, stop: () => synth.cancel(), notice };
}

async function naturalAudioUrl(text: string, voice: string): Promise<string> {
  const language = lang();
  const key = `${voice}|${language}|${text}`;
  const hit = audioCache.get(key);
  if (hit) return hit;
  const res = await fetch('/api/tts', {
    method: 'POST',
    headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: clean(text), lang: language, voice }),
  });
  if (!res.ok) {
    const msg = ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `Natural voice failed (${res.status})`;
    // 501 = not set up on this deployment: stop asking for the rest of the visit
    if (res.status === 501) naturalUnavailable = msg;
    throw new Error(msg);
  }
  const url = URL.createObjectURL(await res.blob());
  audioCache.set(key, url);
  return url;
}

/** Read text aloud with a natural Google voice, falling back to the best device voice. */
export async function readAloud(text: string, o: ReadAloudOptions): Promise<Playback> {
  if (o.reader === 'device') return deviceRead(text, o);
  if (naturalUnavailable) return deviceRead(text, o, naturalUnavailable);
  let url: string;
  try {
    url = await naturalAudioUrl(text, o.naturalVoice);
  } catch (e) {
    return deviceRead(text, o, e instanceof Error ? e.message : String(e));
  }
  const audio = new Audio(url);
  audio.playbackRate = o.rate;
  const done = new Promise<void>((resolve) => {
    audio.onended = audio.onerror = audio.onpause = () => resolve();
  });
  await audio.play();
  return {
    done,
    stop: () => {
      audio.pause();
      audio.currentTime = 0;
    },
  };
}
