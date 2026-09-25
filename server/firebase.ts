import { type App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getMessaging } from 'firebase-admin/messaging';
import { HttpError } from './http.js';
import { verifyFirebaseIdToken } from './idtoken.js';

/** The app's Firebase project (matches the web config in src/lib/firebase.ts). */
const DEFAULT_PROJECT_ID = 'run-there-go-threre';

/**
 * Firebase Admin, configured from FIREBASE_SERVICE_ACCOUNT: the service-account JSON either
 * raw or base64-encoded (Firebase console → Project settings → Service accounts → Generate key).
 */
interface ServiceAccount {
  project_id?: string;
  client_email?: string;
  private_key?: string;
}

function serviceAccount(): ServiceAccount {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!raw) throw new HttpError(500, 'FIREBASE_SERVICE_ACCOUNT is not configured');
  try {
    return JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')) as ServiceAccount;
  } catch {
    throw new HttpError(500, 'FIREBASE_SERVICE_ACCOUNT is not valid JSON (raw or base64)');
  }
}

/** Project whose ID tokens we accept: FIREBASE_PROJECT_ID, else the service account's, else the default. */
export function projectId(): string {
  if (process.env.FIREBASE_PROJECT_ID?.trim()) return process.env.FIREBASE_PROJECT_ID.trim();
  try {
    return serviceAccount().project_id || DEFAULT_PROJECT_ID;
  } catch {
    return DEFAULT_PROJECT_ID;
  }
}

function app(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  const json = serviceAccount();
  return initializeApp({
    credential: cert({
      projectId: json.project_id,
      clientEmail: json.client_email,
      // env vars sometimes carry literal "\n"
      privateKey: json.private_key?.replace(/\\n/g, '\n'),
    }),
  });
}

let configured = false;
export const db = () => {
  const firestore = getFirestore(app());
  if (!configured) {
    // optional fields are simply left out instead of failing the write
    firestore.settings({ ignoreUndefinedProperties: true });
    configured = true;
  }
  return firestore;
};

/** Firebase Cloud Messaging, for push notifications. */
export const messaging = () => getMessaging(app());

export interface VerifiedToken {
  uid: string;
  email?: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

export async function verifyIdToken(token: string): Promise<VerifiedToken> {
  return verifyFirebaseIdToken(token, projectId());
}
