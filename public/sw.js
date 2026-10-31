// Arta Service Worker: App-Shell offline verfügbar machen und Mitteilungen anzeigen.
const CACHE = 'arta-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  // Seitenaufrufe: erst Netzwerk (für Updates), sonst die gespeicherte App.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            keepShell(res.clone()).catch(() => undefined);
            return res;
          }
          // Fehlerseite (z. B. GitHub kurz gestört): nicht merken und lieber die gespeicherte App zeigen.
          if (res.type === 'opaqueredirect') return res;
          return caches.match('./index.html').then((cached) => cached || res);
        })
        .catch(() => caches.match('./index.html')),
    );
    return;
  }

  // Dateien (JS, CSS, Icons): aus dem Cache, im Hintergrund aktualisieren.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});

/**
 * Neue Startseite für offline merken. Bringt sie eine neue App-Version mit, fliegen die Dateien der
 * alten Versionen aus dem Speicher – jede Version hat eigene Dateinamen, sonst wächst er ewig.
 */
async function keepShell(res) {
  const html = await res.clone().text();
  const cache = await caches.open(CACHE);
  const old = await cache.match('./index.html');
  const changed = !old || (await old.text()) !== html;
  await cache.put('./index.html', res);
  const keep = new Set(html.match(/assets\/[\w.-]+/g));
  if (!changed || !keep.size) return;
  for (const req of await cache.keys()) {
    const path = new URL(req.url).pathname;
    const at = path.lastIndexOf('/assets/');
    if (at >= 0 && !keep.has(path.slice(at + 1))) await cache.delete(req);
  }
}

// ───── Mitteilungen ─────

// Safari zeigt Push-Nachrichten nur zuverlässig, wenn jede auch als Mitteilung erscheint.
const APPLE = /iPhone|iPad|iPod|Macintosh/.test(self.navigator.userAgent) && !/Chrome|Chromium|Android|Firefox/.test(self.navigator.userAgent);

// Eine Mitteilung vom Handy des Schatzes (verschlüsselt verschickt, der Browser hat sie schon entschlüsselt).
self.addEventListener('push', (event) => {
  let msg = {};
  try {
    msg = event.data ? event.data.json() : {};
  } catch {
    msg = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(showMessage(msg));
});

async function showMessage(msg) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  // Ist Arta gerade offen, erscheint die Nachricht dort als Einblendung – keine doppelte Meldung.
  if (!APPLE && windows.some((w) => w.visibilityState === 'visible')) return;
  await self.registration.showNotification(msg.title || 'Arta 💞', {
    body: msg.body || 'Es gibt etwas Neues von deinem Schatz.',
    tag: msg.tag || 'arta',
    renotify: true,
    icon: 'icons/icon-192.png',
    badge: 'icons/badge-96.png',
    vibrate: [80, 50, 80],
    data: { tab: msg.tab },
  });
}

// Antippen: Arta öffnen (oder nach vorne holen) und gleich den passenden Bereich zeigen.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const tab = event.notification.data && event.notification.data.tab;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const win = windows.find((w) => w.visibilityState === 'visible') || windows[0];
      if (win) {
        // Klappt das Nach-vorne-Holen nicht (das Handy hat Arta oft schon selbst geöffnet), trotzdem den Bereich zeigen.
        await win.focus().catch(() => undefined);
        if (tab) win.postMessage({ arta: 'open', tab });
        return;
      }
      await self.clients.openWindow(tab ? `./#tab=${tab}` : './');
    })(),
  );
});
