import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from './worker.js';
import { buildFeedDoc, deriveCalKey, sealFeed } from '../src/lib/calendar';
import { emptyData } from '../src/lib/store';

const ORIGIN = 'https://amirhossin27-dev.github.io';

function post(body, origin = ORIGIN) {
  return new Request('https://arta-push.example.workers.dev/', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const valid = {
  endpoint: 'https://fcm.googleapis.com/fcm/send/abc:def',
  ttl: 86400,
  urgency: 'high',
  auth: 'vapid t=aaa.bbb.ccc, k=BAAA',
  body: 'AAECAw',
};

describe('Push-Relay (Cloudflare Worker)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('leitet an den Push-Dienst weiter – mit den richtigen Kopfzeilen', async () => {
    const calls = [];
    vi.stubGlobal('fetch', async (url, init) => {
      calls.push({ url, init });
      return new Response('', { status: 201 });
    });
    const res = await worker.fetch(post(valid));
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(await res.json()).toEqual({ status: 201, text: '' });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(valid.endpoint);
    expect(calls[0].init.headers).toMatchObject({ TTL: '86400', Urgency: 'high', 'Content-Encoding': 'aes128gcm', Authorization: valid.auth });
    expect(Array.from(calls[0].init.body)).toEqual([0, 1, 2, 3]);
  });

  it('meldet abgelaufene Abos ehrlich zurück', async () => {
    vi.stubGlobal('fetch', async () => new Response('push subscription has unsubscribed or expired.', { status: 410 }));
    const res = await worker.fetch(post({ ...valid, endpoint: 'https://web.push.apple.com/QGz' }));
    expect(await res.json()).toMatchObject({ status: 410 });
  });

  it('lässt sich nicht als offener Proxy missbrauchen', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    const bad = [
      post({ ...valid, endpoint: 'https://example.com/steal' }),
      post({ ...valid, endpoint: 'https://fcm.googleapis.com.evil.net/x' }),
      post({ ...valid, endpoint: 'http://fcm.googleapis.com/fcm/send/x' }),
      post({ ...valid, auth: 'Bearer xyz' }),
      post({ ...valid, body: 'kein base64!' }),
      post({ ...valid, ttl: -1 }),
      post(valid, 'https://evil.example'),
    ];
    for (const req of bad) expect((await worker.fetch(req)).status).toBeGreaterThanOrEqual(400);
    expect(spy).not.toHaveBeenCalled();
  });

  it('beantwortet die CORS-Vorabfrage und zeigt bei GET, dass er läuft', async () => {
    const pre = await worker.fetch(new Request('https://x.workers.dev/', { method: 'OPTIONS', headers: { Origin: 'http://localhost:4173' } }));
    expect(pre.status).toBe(204);
    expect(pre.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:4173');
    const get = await worker.fetch(new Request('https://x.workers.dev/'));
    expect(await get.text()).toContain('läuft');
  });
});

const HOST = 'arta-47-default-rtdb.europe-west1.firebasedatabase.app';
const ROOM = '0123456789abcdef0123456789abcdef';
const SECRET = 'B'.repeat(43);

function termin(id, extra = {}) {
  return { id, title: 'Kino', emoji: '🎬', date: '2026-10-30', time: '20:00', who: 'both', tz: 'Europe/Berlin', createdBy: 'a', createdAt: 1, updatedAt: 10, ...extra };
}

function data(events) {
  const d = emptyData();
  d.persons.a = { ...d.persons.a, name: 'Amir' };
  d.persons.b = { ...d.persons.b, name: 'Mila' };
  d.events = Object.fromEntries(events.map((e) => [e.id, e]));
  return d;
}

describe('Kalender (Cloudflare Worker)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('meldet, dass er Kalender kann', async () => {
    const res = await worker.fetch(new Request('https://x.workers.dev/kalender'));
    expect(await res.text()).toContain('Kalender ✓');
  });

  it('führt die Termine beider Handys zum Abo zusammen und merkt sich den Abruf', async () => {
    const { raw, key } = await deriveCalKey(SECRET);
    // Handy a kennt die neue Uhrzeit von „k1“, Handy b hat „k2“ gelöscht und „k3“ neu.
    const nodeA = await sealFeed(buildFeedDoc(data([termin('k1', { time: '21:00', updatedAt: 20 }), termin('k2')]), 'a', 2026), key, 100);
    const nodeB = await sealFeed(buildFeedDoc(data([termin('k1'), termin('k2', { deleted: true, updatedAt: 30 }), termin('k3', { title: 'Brunch' })]), 'b', 2026), key, 200);
    const calls = [];
    vi.stubGlobal('fetch', async (url, init) => {
      calls.push({ url, init });
      if (url.endsWith('/cal-feed-a.json')) return Response.json(nodeA);
      if (url.endsWith('/cal-feed-b.json')) return Response.json(nodeB);
      return new Response('null');
    });
    const res = await worker.fetch(new Request(`https://x.workers.dev/kalender/${HOST}/${ROOM}/${raw}/b.ics`, { headers: { 'User-Agent': 'iOS/18.1 dataaccessd/1.0' } }));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/calendar; charset=utf-8');
    const ics = (await res.text()).replace(/\r\n /g, '');
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('X-WR-CALNAME:Arta 💞 Amir & Mila');
    expect(ics.match(/BEGIN:VTIMEZONE/g)).toHaveLength(1);
    expect(ics).toContain('UID:k1@arta');
    expect(ics).toContain('DTSTART;TZID=Europe/Berlin:20261030T210000');
    expect(ics).not.toContain('UID:k2@arta');
    expect(ics).toContain('SUMMARY:🎬 Brunch');
    expect(calls.map((c) => c.url)).toEqual([
      `https://${HOST}/rooms/${ROOM}/cal-feed-a.json`,
      `https://${HOST}/rooms/${ROOM}/cal-feed-b.json`,
      `https://${HOST}/rooms/${ROOM}/cal-seen-b.json?print=silent`,
    ]);
    expect(JSON.parse(calls[2].init.body)).toEqual({ v: 1, at: { '.sv': 'timestamp' }, iv: 'seen', ct: 'iOS/18.1 dataaccessd/1.0' });
  });

  it('liefert einen leeren Kalender, solange noch keine Termine da sind', async () => {
    const { raw } = await deriveCalKey(SECRET);
    vi.stubGlobal('fetch', async () => new Response('null'));
    const res = await worker.fetch(new Request(`https://x.workers.dev/kalender/${HOST}/${ROOM}/${raw}/a.ics`));
    expect(res.status).toBe(200);
    expect(await res.text()).toMatch(/^BEGIN:VCALENDAR[\s\S]*END:VCALENDAR\r\n$/);
  });

  it('verweigert falsche Schlüssel und fremde Server', async () => {
    const { key } = await deriveCalKey(SECRET);
    const { raw: wrong } = await deriveCalKey('C'.repeat(43));
    const node = await sealFeed(buildFeedDoc(data([termin('k1')]), 'a', 2026), key, 1);
    const spy = vi.fn(async () => Response.json(node));
    vi.stubGlobal('fetch', spy);
    expect((await worker.fetch(new Request(`https://x.workers.dev/kalender/${HOST}/${ROOM}/${wrong}/a.ics`))).status).toBe(403);
    spy.mockClear();
    for (const path of [`evil.example.com/${ROOM}/${wrong}/a.ics`, `${HOST}/nicht-hex/${wrong}/a.ics`, `${HOST}/${ROOM}/kurz/a.ics`, `${HOST}/${ROOM}/${wrong}/c.ics`]) {
      expect((await worker.fetch(new Request(`https://x.workers.dev/kalender/${path}`))).status).toBe(404);
    }
    expect(spy).not.toHaveBeenCalled();
  });

  it('schickt einen einzelnen Termin als .ics zurück (für „Zum Kalender hinzufügen“)', async () => {
    const ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nSUMMARY:💞 Date\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n';
    const d = Buffer.from(ics).toString('base64url');
    const res = await worker.fetch(new Request(`https://x.workers.dev/termin.ics?n=Date-Night&d=${d}`));
    expect(res.headers.get('Content-Type')).toBe('text/calendar; charset=utf-8');
    expect(res.headers.get('Content-Disposition')).toBe('inline; filename="Date-Night.ics"');
    expect(await res.text()).toBe(ics);
    const bad = Buffer.from('<script>alert(1)</script>').toString('base64url');
    expect((await worker.fetch(new Request(`https://x.workers.dev/termin.ics?d=${bad}`))).status).toBe(400);
    expect((await worker.fetch(new Request('https://x.workers.dev/termin.ics'))).status).toBe(400);
  });
});
