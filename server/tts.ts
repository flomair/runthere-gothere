import { googleAccessToken, projectId } from './firebase.js';
import { HttpError } from './http.js';

/**
 * Natural-sounding read-aloud via Google Cloud Text-to-Speech ("Chirp 3: HD" voices), using the
 * app's Firebase service account – no extra key. Needs the Cloud Text-to-Speech API enabled in the
 * Google Cloud project (billing on; Google grants a monthly free allowance).
 */

/** Voices offered in the app (Chirp 3 HD voice names exist for every supported language). */
export const NATURAL_VOICES = ['Charon', 'Kore', 'Aoede', 'Fenrir', 'Leda', 'Puck'] as const;
export type NaturalVoice = (typeof NATURAL_VOICES)[number];

const LOCALES: Record<string, string> = {
  en: 'en-US', de: 'de-DE', fr: 'fr-FR', es: 'es-ES', it: 'it-IT', nl: 'nl-NL', pt: 'pt-BR', pl: 'pl-PL',
  sv: 'sv-SE', da: 'da-DK', nb: 'nb-NO', fi: 'fi-FI', cs: 'cs-CZ', ja: 'ja-JP', ko: 'ko-KR', tr: 'tr-TR',
};
export const localeFor = (lang: string) => LOCALES[lang.slice(0, 2).toLowerCase()] ?? 'en-US';

/** Plain text for speech: no markdown emphasis or headings, tidy whitespace. */
export function speechText(text: string): string {
  return text
    .replace(/^#+\s*/gm, '')
    .replace(/[*_]{1,3}([^*_]+)[*_]{1,3}/g, '$1')
    .replace(/[*_#>`]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Split into chunks under the API's 5000-byte limit, at paragraph, then sentence boundaries. */
export function chunks(text: string, maxBytes = 4200): string[] {
  const bytes = (s: string) => new TextEncoder().encode(s).length;
  const out: string[] = [];
  let cur = '';
  const push = (piece: string, sep: string) => {
    if (!cur) cur = piece;
    else if (bytes(cur + sep + piece) <= maxBytes) cur += sep + piece;
    else {
      out.push(cur);
      cur = piece;
    }
  };
  for (const para of text.split(/\n{2,}/)) {
    if (bytes(para) <= maxBytes) {
      push(para, '\n\n');
      continue;
    }
    for (const sentence of para.match(/[^.!?…]+[.!?…]*\s*/g) ?? [para]) {
      // a single monster sentence gets cut hard
      let rest = sentence.trim();
      while (bytes(rest) > maxBytes) {
        push(rest.slice(0, 1500), ' ');
        rest = rest.slice(1500);
      }
      if (rest) push(rest, ' ');
    }
  }
  if (cur) out.push(cur);
  return out;
}

interface SynthResponse {
  audioContent?: string;
}

/** MP3 audio for the text (MP3 frames of consecutive chunks can simply be concatenated). */
export async function synthesize(text: string, lang: string, voice: NaturalVoice): Promise<Uint8Array> {
  const locale = localeFor(lang);
  const token = await googleAccessToken();
  const parts: Uint8Array[] = [];
  for (const chunk of chunks(speechText(text))) {
    const res = await fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'x-goog-user-project': projectId() },
      body: JSON.stringify({
        input: { text: chunk },
        voice: { languageCode: locale, name: `${locale}-Chirp3-HD-${voice}` },
        audioConfig: { audioEncoding: 'MP3' },
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      if (res.status === 403 && /SERVICE_DISABLED|has not been used|is disabled/i.test(body)) {
        throw new HttpError(
          501,
          `Natural voices need the Cloud Text-to-Speech API. Enable it once at https://console.cloud.google.com/apis/library/texttospeech.googleapis.com?project=${projectId()} (the project needs billing turned on; Google includes a monthly free allowance). Until then the device voice is used.`,
        );
      }
      if (res.status === 403 && /billing/i.test(body)) {
        throw new HttpError(501, `Natural voices need billing enabled on the Google Cloud project ${projectId()}. Until then the device voice is used.`);
      }
      throw new HttpError(502, `Text-to-speech failed (${res.status}): ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as SynthResponse;
    if (!data.audioContent) throw new HttpError(502, 'Text-to-speech returned no audio');
    parts.push(Uint8Array.from(Buffer.from(data.audioContent, 'base64')));
  }
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
