export const USER_AGENT = `RunThereGoThere/0.1 (+https://github.com/flomair/runthere-gothere${
  process.env.CONTACT_EMAIL ? `; ${process.env.CONTACT_EMAIL}` : ''
})`;

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function json(data: unknown, init: ResponseInit & { cacheSeconds?: number } = {}): Response {
  const { cacheSeconds, ...rest } = init;
  const headers = new Headers(rest.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  if (cacheSeconds && !headers.has('Cache-Control')) {
    // private: responses are only served to signed-in users, so no shared CDN caching
    headers.set('Cache-Control', `private, max-age=${cacheSeconds}`);
  }
  return new Response(JSON.stringify(data), { ...rest, headers });
}

/** Wraps a handler so thrown errors become JSON responses. */
export function handle(fn: (req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    try {
      return await fn(req);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : 500;
      if (status >= 500) console.error(err);
      return json({ error: err instanceof Error ? err.message : String(err) }, { status });
    }
  };
}

export async function fetchJson<T>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const { timeoutMs = 15_000, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (!headers.has('User-Agent')) headers.set('User-Agent', USER_AGENT);
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  const res = await fetch(url, { ...rest, headers, signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new HttpError(res.status >= 500 ? 502 : res.status, `${new URL(url).host} responded ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export function numParam(url: URL, name: string, min: number, max: number): number {
  const v = Number(url.searchParams.get(name));
  if (url.searchParams.get(name) === null || !Number.isFinite(v) || v < min || v > max) {
    throw new HttpError(400, `invalid or missing "${name}"`);
  }
  return v;
}

export function latLonParams(url: URL): [number, number] {
  return [numParam(url, 'lat', -90, 90), numParam(url, 'lon', -180, 180)];
}

/** Strip HTML tags/entities from Wikimedia metadata strings. */
export function stripHtml(s: string | undefined): string {
  if (!s) return '';
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Public origin of the deployment, respecting Vercel's forwarding headers. */
export function originOf(req: Request): string {
  const url = new URL(req.url);
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? url.host;
  const proto = req.headers.get('x-forwarded-proto') ?? url.protocol.replace(':', '');
  return `${proto}://${host}`;
}

export async function readJson<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new HttpError(400, 'invalid JSON body');
  }
}
