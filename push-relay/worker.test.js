import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from './worker.js';

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
