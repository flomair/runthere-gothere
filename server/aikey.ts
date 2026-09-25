import { seal, unseal } from './crypto.js';
import { HttpError } from './http.js';
import { type ResolvedKey, checkKey, maskKey, resolveKey } from './narrate.js';
import { repo } from './repo.js';

/**
 * Each user's own Anthropic key, stored AES-GCM encrypted in secrets/{uid}. There is deliberately
 * no shared server key: every user pays for their own stories.
 */
export async function saveAiKey(uid: string, rawKey: string, rawWorkspace?: string) {
  const k = resolveKey(rawKey, rawWorkspace);
  if (!k) throw new HttpError(400, 'Please enter an API key');
  const check = await checkKey(k);
  if (!check.ok) return check;
  await repo.updateSecrets(uid, { ai: seal('ai-key', { key: k.key, workspaceId: k.workspaceId }) });
  await repo.updateUser(uid, {
    ai: { masked: maskKey(k.key), workspaceId: k.workspaceId, updatedAt: new Date().toISOString() },
  });
  return check;
}

export async function deleteAiKey(uid: string) {
  await repo.updateSecrets(uid, { ai: null });
  await repo.updateUser(uid, { ai: null });
}

export async function aiKeyFor(uid: string): Promise<ResolvedKey | null> {
  const sealed = (await repo.getSecrets(uid)).ai;
  if (!sealed) return null;
  const v = unseal<{ key: string; workspaceId?: string }>('ai-key', sealed);
  return v ? resolveKey(v.key, v.workspaceId) : null;
}
