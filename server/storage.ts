import { randomBytes } from 'node:crypto';
import { storageBucket } from './firebase.js';
import { HttpError } from './http.js';

/** Where photos live. Firebase Cloud Storage in production, memory in tests. */
export interface BlobStore {
  save(path: string, bytes: Uint8Array, contentType: string): Promise<void>;
  /** A short-lived URL the browser can load directly (e.g. in an <img>). */
  signedUrl(path: string, ttlSeconds: number): Promise<string>;
  remove(path: string): Promise<void>;
}

const firebaseStore: BlobStore = {
  async save(path, bytes, contentType) {
    try {
      await storageBucket()
        .file(path)
        .save(Buffer.from(bytes), { contentType, resumable: false, metadata: { cacheControl: 'private, max-age=31536000' } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/bucket does not exist|notFound|404/i.test(msg)) {
        throw new HttpError(501, 'Photo storage is not set up yet: in the Firebase console open Storage and click "Get started" (or set FIREBASE_STORAGE_BUCKET).');
      }
      throw e;
    }
  },
  async signedUrl(path, ttlSeconds) {
    const [url] = await storageBucket().file(path).getSignedUrl({ version: 'v4', action: 'read', expires: Date.now() + ttlSeconds * 1000 });
    return url;
  },
  async remove(path) {
    await storageBucket().file(path).delete({ ignoreNotFound: true });
  },
};

let store: BlobStore = firebaseStore;
/** For tests. */
export const setBlobStore = (s: BlobStore | null) => {
  store = s ?? firebaseStore;
};
export const blobs = () => store;

export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

/** Store a photo in the user's own folder; returns its storage path. */
export async function savePhoto(uid: string, bytes: Uint8Array, contentType: string): Promise<string> {
  const ext = TYPES[contentType];
  if (!ext) throw new HttpError(415, 'Only JPEG, PNG or WebP photos are supported.');
  if (bytes.length === 0) throw new HttpError(400, 'empty upload');
  if (bytes.length > MAX_UPLOAD_BYTES) throw new HttpError(413, 'Photo too large (max 3 MB).');
  const path = `users/${uid}/photos/${new Date().toISOString().slice(0, 10)}-${randomBytes(8).toString('hex')}.${ext}`;
  await store.save(path, bytes, contentType);
  return path;
}

/** A photo path the user may see: only their own (group photos follow in later phases). */
export function assertOwnPhoto(uid: string, path: string): void {
  if (!path.startsWith(`users/${uid}/photos/`) || path.includes('..')) throw new HttpError(403, 'not your photo');
}

/** In-memory store for tests. */
export function memoryBlobStore(): BlobStore & { files: Map<string, { bytes: Uint8Array; contentType: string }> } {
  const files = new Map<string, { bytes: Uint8Array; contentType: string }>();
  return {
    files,
    async save(path, bytes, contentType) {
      files.set(path, { bytes, contentType });
    },
    async signedUrl(path) {
      if (!files.has(path)) throw new HttpError(404, 'no such photo');
      return `https://storage.test/${path}?sig=1`;
    },
    async remove(path) {
      files.delete(path);
    },
  };
}
