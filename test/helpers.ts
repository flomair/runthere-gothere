import { vi } from 'vitest';

/** Tokens look like "t:<uid>:<email>[:unverified]" in tests. */
export function fakeVerify(token: string) {
  const [, uid, email, flag] = token.split(':');
  if (!uid) throw new Error('bad token');
  return { uid, email, emailVerified: flag !== 'unverified', name: uid, picture: undefined };
}

export const bearer = (uid: string, email: string, extra = '') => ({ authorization: `Bearer t:${uid}:${email}${extra}` });

type Handler = (url: string, init?: RequestInit) => unknown;

/** Stub global fetch; handlers return a body (JSON-encoded) or a Response. */
export function mockFetch(handler: Handler) {
  const fn = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    const body = await handler(url, init);
    if (body instanceof Response) return body;
    return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

/** Capture Vercel waitUntil() promises so tests can await background work. */
export function captureWaitUntil() {
  const pending: Promise<unknown>[] = [];
  (globalThis as Record<symbol, unknown>)[Symbol.for('@vercel/request-context')] = {
    get: () => ({ waitUntil: (p: Promise<unknown>) => pending.push(p) }),
  };
  return async () => {
    await Promise.all(pending.splice(0));
  };
}

export const req = (url: string, init: RequestInit & { json?: unknown } = {}) =>
  new Request(`https://app.example${url}`, {
    ...init,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    headers: { ...(init.json !== undefined ? { 'content-type': 'application/json' } : {}), ...(init.headers as Record<string, string>) },
  });
