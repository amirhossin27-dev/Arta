/**
 * Arta-Push-Relay – ein winziger Cloudflare Worker (kostenlos), der Mitteilungen von einem
 * Arta-Handy an den Push-Dienst des anderen Handys weiterreicht (Google, Apple, Mozilla, Microsoft).
 *
 * Warum überhaupt? Diese Push-Dienste nehmen keine Anfragen direkt aus dem Browser an.
 * Der Worker leitet nur weiter: Die Nachricht ist schon auf dem sendenden Handy für das
 * Empfänger-Handy verschlüsselt und unterschrieben. Hier gibt es keine Schlüssel, nichts wird
 * gespeichert, und lesen kann der Worker die Nachrichten nicht.
 *
 * Außerdem liefert er eure gemeinsamen Termine an den iPhone-Kalender aus (Kalender-Abo):
 * - GET /kalender/<datenbank>/<raum>/<schlüssel>/<a|b>.ics – liest die beiden verschlüsselten
 *   Termin-Einträge `cal-feed-a` / `cal-feed-b` aus eurem Live-Raum, entschlüsselt sie mit dem
 *   Schlüssel aus der Adresse und gibt sie als eine .ics-Datei zurück. Der Schlüssel steckt nur in
 *   der Abo-Adresse im Kalender; gespeichert wird hier nichts.
 * - GET /termin.ics?d=<Text> – schickt eine einzelne .ics-Datei zurück, damit Safari auf dem
 *   iPhone „Zum Kalender hinzufügen“ anbietet (aus der App heraus geht das sonst nicht).
 *
 * Einrichten: siehe push-relay/README.md – einfach diesen Text im Cloudflare-Dashboard einfügen.
 */

/** Von diesen Seiten aus darf Arta den Worker benutzen. */
const ALLOWED_ORIGINS = ['https://amirhossin27-dev.github.io', 'http://localhost', 'http://127.0.0.1'];

/** Nur an diese Push-Dienste wird weitergeleitet. */
const PUSH_HOSTS = ['fcm.googleapis.com', 'android.googleapis.com', 'push.apple.com', 'push.services.mozilla.com', 'notify.windows.com'];

const URGENCY = ['very-low', 'low', 'normal', 'high'];

/** Kalender-Abos lesen nur aus Firebase-Datenbanken. */
const DB_HOST = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.(firebasedatabase\.app|firebaseio\.com)$/;

const ICS_BEGIN = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Arta//Termine//DE\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n';
const ICS_END = 'END:VCALENDAR\r\n';

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

function text(body, status, cors) {
  return new Response(body, { status, headers: { ...cors, 'Content-Type': 'text/plain; charset=utf-8' } });
}

function calendar(body, cors, name) {
  return new Response(body, {
    headers: {
      ...cors,
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `inline; filename="${name}.ics"`,
      'Cache-Control': 'no-store',
    },
  });
}

// ───── Einzelner Termin ─────

function serveSingle(url, cors) {
  const d = url.searchParams.get('d') || '';
  const name = (url.searchParams.get('n') || 'termin').replace(/[^A-Za-z0-9-]/g, '').slice(0, 40) || 'termin';
  if (!d || d.length > 16000 || !/^[A-Za-z0-9_-]+$/.test(d)) return text('Kein Termin', 400, cors);
  let ics;
  try {
    ics = new TextDecoder('utf-8', { fatal: true }).decode(fromB64Url(d));
  } catch {
    return text('Kein Termin', 400, cors);
  }
  if (!ics.startsWith('BEGIN:VCALENDAR') || !ics.trimEnd().endsWith('END:VCALENDAR')) return text('Kein Kalender', 400, cors);
  return calendar(ics, cors, name);
}

// ───── Kalender-Abo ─────

async function openFeed(node, key) {
  if (!node || typeof node.iv !== 'string' || typeof node.ct !== 'string') return null;
  try {
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64Url(node.iv) }, key, fromB64Url(node.ct));
    const doc = JSON.parse(new TextDecoder().decode(plain));
    if (!doc || doc.v !== 1 || !Array.isArray(doc.events)) return null;
    return { ...doc, at: typeof node.at === 'number' ? node.at : 0 };
  } catch {
    return null;
  }
}

/**
 * Führt die Sichten beider Handys zusammen: Je Termin gewinnt der neueste Stand (`t`),
 * bei Gleichstand der jüngere Eintrag. Gelöschte Termine fallen heraus.
 */
function mergeFeeds(docs) {
  const sorted = [...docs].sort((x, y) => x.at - y.at);
  const best = new Map();
  const zones = {};
  let head = 'X-WR-CALNAME:Arta\r\n';
  for (const doc of sorted) {
    if (typeof doc.head === 'string') head = doc.head;
    for (const [id, z] of Object.entries(doc.zones || {})) if (typeof z === 'string') zones[id] = z;
    for (const ev of doc.events) {
      if (!ev || typeof ev.id !== 'string' || typeof ev.t !== 'number') continue;
      const cur = best.get(ev.id);
      if (!cur || ev.t >= cur.t) best.set(ev.id, ev);
    }
  }
  const events = [...best.values()].filter((ev) => !ev.del && typeof ev.ics === 'string').map((ev) => ev.ics);
  return ICS_BEGIN + head + Object.values(zones).join('') + events.join('') + ICS_END;
}

async function serveFeed(url, request, cors, ctx) {
  // /kalender/<datenbank>/<raum>/<schlüssel>/<a|b>.ics
  const [, host, room, rawKey, file] = url.pathname.split('/').filter(Boolean);
  const person = (file || '').replace(/\.ics$/, '');
  if (!DB_HOST.test(host || '') || !/^[0-9a-f]{32}$/.test(room || '') || !/^[A-Za-z0-9_-]{43}$/.test(rawKey || '') || !['a', 'b'].includes(person)) {
    return text('Unbekannte Kalender-Adresse', 404, cors);
  }
  const key = await crypto.subtle.importKey('raw', fromB64Url(rawKey), 'AES-GCM', false, ['decrypt']);
  const base = `https://${host}/rooms/${room}`;
  let nodes;
  try {
    nodes = await Promise.all(
      ['a', 'b'].map(async (p) => {
        const res = await fetch(`${base}/cal-feed-${p}.json`);
        if (!res.ok) throw new Error(`Datenbank: ${res.status}`);
        return res.json();
      }),
    );
  } catch (e) {
    return text(`Datenbank nicht erreichbar: ${e}`, 502, cors);
  }
  const docs = (await Promise.all(nodes.map((n) => openFeed(n, key)))).filter(Boolean);
  if (!docs.length && nodes.some(Boolean)) return text('Schlüssel passt nicht', 403, cors);
  // Merken, dass dieser Kalender abgeholt hat – Arta zeigt dann „✓ Abo läuft“.
  const seen = fetch(`${base}/cal-seen-${person}.json?print=silent`, {
    method: 'PUT',
    body: JSON.stringify({ v: 1, at: { '.sv': 'timestamp' }, iv: 'seen', ct: (request.headers.get('User-Agent') || 'Kalender').slice(0, 120) }),
  }).catch(() => undefined);
  if (ctx && typeof ctx.waitUntil === 'function') ctx.waitUntil(seen);
  else await seen;
  return calendar(mergeFeeds(docs), cors, 'arta');
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const cors = {
      'Access-Control-Allow-Origin': originAllowed(origin) ? origin : ALLOWED_ORIGINS[0],
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      Vary: 'Origin',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method === 'GET' || request.method === 'HEAD') {
      const url = new URL(request.url);
      if (url.pathname === '/termin.ics') return serveSingle(url, cors);
      if (url.pathname.startsWith('/kalender/')) return serveFeed(url, request, cors, ctx);
      // Daran erkennt Arta, dass dieser Relay schon Kalender kann.
      if (url.pathname === '/kalender') return text('Arta-Kalender ✓', 200, cors);
      return text('Arta-Push-Relay läuft ✓ · mit Kalender ✓', 200, cors);
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
