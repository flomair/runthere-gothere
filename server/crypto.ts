import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import { HttpError } from './http.js';

/**
 * AES-256-GCM encryption for secrets stored in Firestore (Strava tokens, users' Anthropic keys)
 * and for signed OAuth state. The key is derived from SESSION_SECRET per purpose, so a value
 * sealed for one purpose can't be replayed as another.
 *
 * Changing SESSION_SECRET makes stored secrets unreadable: users would have to reconnect Strava
 * and re-enter their AI key.
 */
export type Purpose = 'strava-tokens' | 'ai-key' | 'oauth-state';

function key(purpose: Purpose): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) throw new HttpError(500, 'SESSION_SECRET is not configured (min. 16 chars)');
  return createHmac('sha256', secret).update(`rtgt:${purpose}`).digest();
}

export function seal(purpose: Purpose, data: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(purpose), iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64url');
}

export function unseal<T>(purpose: Purpose, token: string): T | null {
  try {
    const buf = Buffer.from(token, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', key(purpose), buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    const dec = Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]);
    return JSON.parse(dec.toString('utf8')) as T;
  } catch {
    return null;
  }
}

/** Deterministic token derived from the secret (e.g. Strava's webhook verify_token). */
export function derivedToken(label: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new HttpError(500, 'SESSION_SECRET is not configured');
  return createHmac('sha256', secret).update(`rtgt:${label}`).digest('base64url').slice(0, 32);
}
