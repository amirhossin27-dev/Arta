/**
 * Arta-Push-Relay – ein winziger Cloudflare Worker (kostenlos), der Mitteilungen von einem
 * Arta-Handy an den Push-Dienst des anderen Handys weiterreicht (Google, Apple, Mozilla, Microsoft).
 *
 * Warum überhaupt? Diese Push-Dienste nehmen keine Anfragen direkt aus dem Browser an.
 * Der Worker leitet nur weiter: Die Nachricht ist schon auf dem sendenden Handy für das
 * Empfänger-Handy verschlüsselt und unterschrieben. Hier gibt es keine Schlüssel, nichts wird
 * gespeichert, und lesen kann der Worker die Nachrichten nicht.
 *
 * Einrichten: siehe push-relay/README.md – einfach diesen Text im Cloudflare-Dashboard einfügen.
 */

/** Von diesen Seiten aus darf Arta den Worker benutzen. */
const ALLOWED_ORIGINS = ['https://amirhossin27-dev.github.io', 'http://localhost', 'http://127.0.0.1'];

/** Nur an diese Push-Dienste wird weitergeleitet. */
const PUSH_HOSTS = ['fcm.googleapis.com', 'android.googleapis.com', 'push.apple.com', 'push.services.mozilla.com', 'notify.windows.com'];

const URGENCY = ['very-low', 'low', 'normal', 'high'];

function originAllowed(origin) {
  return ALLOWED_ORIGINS.some((o) => origin === o || origin.startsWith(`${o}:`));
}

function hostAllowed(host) {
  return PUSH_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

function fromB64Url(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

function reply(body, status, cors) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': originAllowed(origin) ? origin : ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method === 'GET') {
      return new Response('Arta-Push-Relay läuft ✓', { headers: { ...cors, 'Content-Type': 'text/plain; charset=utf-8' } });
    }
    if (request.method !== 'POST') return reply({ error: 'Nur POST' }, 405, cors);
    if (!originAllowed(origin)) return reply({ error: 'Unbekannte Seite' }, 403, cors);

    let msg;
    try {
      msg = await request.json();
    } catch {
      return reply({ error: 'Kein JSON' }, 400, cors);
    }
    let url;
    try {
      url = new URL(msg.endpoint);
    } catch {
      return reply({ error: 'Ungültiger Empfänger' }, 400, cors);
    }
    const ttl = Number(msg.ttl);
    const urgency = URGENCY.includes(msg.urgency) ? msg.urgency : 'normal';
    if (url.protocol !== 'https:' || !hostAllowed(url.hostname)) return reply({ error: 'Kein bekannter Push-Dienst' }, 400, cors);
    if (typeof msg.auth !== 'string' || !msg.auth.startsWith('vapid t=') || msg.auth.length > 2000) return reply({ error: 'VAPID fehlt' }, 400, cors);
    if (typeof msg.body !== 'string' || msg.body.length > 6000 || !/^[A-Za-z0-9_-]+$/.test(msg.body)) return reply({ error: 'Ungültiger Inhalt' }, 400, cors);
    if (!Number.isInteger(ttl) || ttl < 0 || ttl > 2419200) return reply({ error: 'Ungültige TTL' }, 400, cors);

    try {
      const res = await fetch(url.href, {
        method: 'POST',
        headers: {
          TTL: String(ttl),
          Urgency: urgency,
          'Content-Encoding': 'aes128gcm',
          'Content-Type': 'application/octet-stream',
          Authorization: msg.auth,
        },
        body: fromB64Url(msg.body),
      });
      const text = (await res.text()).slice(0, 300);
      return reply({ status: res.status, text }, 200, cors);
    } catch (e) {
      return reply({ error: `Push-Dienst nicht erreichbar: ${e}` }, 502, cors);
    }
  },
};
