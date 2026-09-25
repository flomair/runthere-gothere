import { type App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { HttpError } from './http.js';

/**
 * Firebase Admin, configured from FIREBASE_SERVICE_ACCOUNT: the service-account JSON either
 * raw or base64-encoded (Firebase console → Project settings → Service accounts → Generate key).
 */
function app(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim();
  if (!raw) throw new HttpError(500, 'FIREBASE_SERVICE_ACCOUNT is not configured');
  let json: { project_id?: string; client_email?: string; private_key?: string };
  try {
    json = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
  } catch {
    throw new HttpError(500, 'FIREBASE_SERVICE_ACCOUNT is not valid JSON (raw or base64)');
  }
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

export interface VerifiedToken {
  uid: string;
  email?: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

export async function verifyIdToken(token: string): Promise<VerifiedToken> {
  const t = await getAuth(app()).verifyIdToken(token);
  return { uid: t.uid, email: t.email, emailVerified: t.email_verified === true, name: t.name, picture: t.picture };
}
