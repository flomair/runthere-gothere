/* Run There · Go There service worker: offline app shell, cached map tiles, push notifications.
   API responses are private and never cached here. */
const VERSION = 'v2';
const SHELL = `rtgt-shell-${VERSION}`;
const ASSETS = `rtgt-assets-${VERSION}`;
const TILES = `rtgt-tiles-${VERSION}`;
const MAX_TILES = 400;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(['/', '/manifest.webmanifest', '/logo.svg', '/favicon.svg', '/icons/icon-192.png']))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('rtgt-') && ![SHELL, ASSETS, TILES].includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // private data and auth: always straight to the network
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;
  if (/googleapis\.com|firebaseapp\.com|gstatic\.com\/firebasejs|strava\.com/.test(url.hostname) && !/fonts\./.test(url.hostname)) return;

  // app pages: network first (so new deploys show up at once), cached shell when offline
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL).then((c) => c.put('/', copy));
          return res;
        })
        .catch(() => caches.match('/', { cacheName: SHELL })),
    );
    return;
  }

  // hashed build files and fonts never change: cache first
  if ((url.origin === self.location.origin && url.pathname.startsWith('/assets/')) || /fonts\.(googleapis|gstatic)\.com/.test(url.hostname)) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok || res.type === 'opaque') {
              const copy = res.clone();
              caches.open(ASSETS).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // map tiles: serve cached tiles instantly, refresh in the background
  if (/basemaps\.cartocdn\.com|tile\.openstreetmap\.org|arcgisonline\.com|elevation-tiles-prod|opentopomap\.org/.test(url.hostname)) {
    event.respondWith(
      caches.open(TILES).then((cache) =>
        cache.match(req).then((hit) => {
          const net = fetch(req)
            .then((res) => {
              if (res.ok || res.type === 'opaque') {
                cache.put(req, res.clone()).then(() => trim(TILES, MAX_TILES));
              }
              return res;
            })
            .catch(() => hit);
          return hit || net;
        }),
      ),
    );
  }
});

// ---- push notifications (sent by the server through Firebase Cloud Messaging as data messages) ----
self.addEventListener('push', (event) => {
  let msg = {};
  try {
    msg = event.data ? event.data.json() : {};
  } catch {
    msg = { data: { title: 'Run There · Go There', body: event.data ? event.data.text() : '' } };
  }
  const d = msg.data || msg.notification || msg;
  const title = d.title || 'Run There · Go There';
  event.waitUntil(
    self.registration.showNotification(title, {
      body: d.body || '',
      icon: d.icon || '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      image: d.image || undefined,
      tag: d.tag || undefined,
      data: { url: d.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin) {
          w.focus();
          return w.navigate(target);
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});
