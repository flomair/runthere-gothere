import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Milestone } from '../shared/types';
import { notify, notifyMilestones, setPushSender } from '../server/push';
import { setRepo } from '../server/repo';
import { memoryRepo } from '../server/repo-memory';
import { bearer, fakeVerify, req } from './helpers';

vi.mock('../server/firebase', () => ({
  verifyIdToken: async (t: string) => fakeVerify(t),
  db: () => {
    throw new Error('no Firestore in tests');
  },
  messaging: () => {
    throw new Error('no FCM in tests');
  },
}));

const TOKEN_A = 'a'.repeat(40);
const TOKEN_B = 'b'.repeat(40);
let store: ReturnType<typeof memoryRepo>;
let sent: { tokens: string[]; data: Record<string, string> }[];

beforeEach(() => {
  process.env.SESSION_SECRET = 'test-secret-that-is-long-enough';
  process.env.ADMIN_EMAILS = 'me@example.com';
  store = memoryRepo();
  setRepo(store);
  sent = [];
  setPushSender(async (tokens, data) => {
    sent.push({ tokens, data });
    return tokens.map((token) => (token === TOKEN_B ? { token, ok: false, code: 'messaging/registration-token-not-registered' } : { token, ok: true }));
  });
});
afterEach(() => setPushSender(null));

const ms = (kind: Milestone['kind'], title: string): Milestone => ({ id: `j1_${kind}_${title}`, journeyId: 'j1', kind, atM: 1000, title, lat: 50, lon: 10, reachedAt: '2026-09-20', createdAt: 'x', place: { name: 'Dresden', context: 'Saxony, Germany' } });

describe('push notifications', () => {
  it('registers a device and sends the test notification in the chosen language', async () => {
    const push = await import('../routes/push');
    const res = await push.POST(req('/api/push', { method: 'POST', headers: bearer('me', 'me@example.com'), json: { token: TOKEN_A, lang: 'de' } }));
    expect(res.status).toBe(200);
    expect((await store.getUser('me'))?.pushTokens).toEqual([TOKEN_A]);

    const test = await import('../routes/push/test');
    const r = await test.POST(req('/api/push/test', { method: 'POST', headers: bearer('me', 'me@example.com') }));
    expect(await r.json()).toEqual({ sent: 1 });
    expect(sent[0].data.title).toContain('Benachrichtigungen');

    const bad = await push.POST(req('/api/push', { method: 'POST', headers: bearer('me', 'me@example.com'), json: { token: 'x' } }));
    expect(bad.status).toBe(400);
  });

  it('forgets devices FCM no longer knows', async () => {
    await store.addPushToken('me', TOKEN_A);
    await store.addPushToken('me', TOKEN_B);
    expect(await notify('me', { title: 'Hi', body: 'there' })).toBe(1);
    expect((await store.getUser('me'))?.pushTokens).toEqual([TOKEN_A]);
  });

  it('groups several milestones into one notification linking to the diary', async () => {
    await store.addPushToken('me', TOKEN_A);
    await notifyMilestones('me', [ms('waypoint', 'Arrived in Dresden')]);
    expect(sent[0].data).toMatchObject({ title: '📍 Arrived in Dresden', body: 'Dresden, Saxony, Germany', url: '/#/j/j1/diary' });
    await notifyMilestones('me', [ms('distance', '100 km'), ms('border', 'Welcome to Czechia')]);
    expect(sent[1].data.title).toBe('🛂 2 new milestones in your diary');
    expect(sent[1].data.body).toBe('100 km · Welcome to Czechia');
  });

  it('does nothing without devices', async () => {
    await notifyMilestones('nobody', [ms('finish', 'Arrived in Prague')]);
    expect(sent).toEqual([]);
  });
});
