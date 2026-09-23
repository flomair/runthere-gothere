import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { HttpError } from './http.js';
import type { Athlete } from '../shared/types.js';

/** Strava tokens, stored AES-GCM encrypted in an httpOnly cookie (no database needed). */
export interface StravaSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch seconds
  athlete: Athlete;
}

export const SESSION_COOKIE = 'rtgt_session';
export const STATE_COOKIE = 'rtgt_oauth_state';
const MAX_AGE = 60 * 60 * 24 * 180;

function key(): Buffer {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 16) throw new HttpError(500, 'SESSION_SECRET is not configured (min. 16 chars)');
  return createHash('sha256').update(secret).digest();
}

export function seal(data: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), enc]).toString('base64url');
}

export function unseal<T>(token: string): T | null {
  try {
    const buf = Buffer.from(token, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', key(), buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    const dec = Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]);
    return JSON.parse(dec.toString('utf8')) as T;
  } catch {
    return null;
  }
}

export function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function isSecure(req: Request): boolean {
  return new URL(req.url).protocol === 'https:' || req.headers.get('x-forwarded-proto') === 'https';
}

export function cookie(req: Request, name: string, value: string, maxAge = MAX_AGE): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
    isSecure(req) ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
}

export function clearCookie(req: Request, name: string): string {
  return cookie(req, name, '', 0);
}

export function readSession(req: Request): StravaSession | null {
  const raw = readCookie(req, SESSION_COOKIE);
  return raw ? unseal<StravaSession>(raw) : null;
}

export function sessionCookie(req: Request, s: StravaSession): string {
  return cookie(req, SESSION_COOKIE, seal(s));
}

/** Public origin of the deployment, respecting Vercel's forwarding headers. */
export function originOf(req: Request): string {
  const url = new URL(req.url);
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? url.host;
  const proto = req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  return `${proto}://${host}`;
}
