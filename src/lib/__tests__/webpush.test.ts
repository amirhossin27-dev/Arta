import { describe, expect, it } from 'vitest';
import { buildRelayRequest, clip, encryptPush, generateVapidKeys, vapidAuth } from '../webpush';
import { fromB64Url, toB64Url } from '../sync';

const enc = new TextEncoder();
const cat = (...p: Uint8Array[]) => {
  const out = new Uint8Array(p.reduce((n, x) => n + x.length, 0));
  p.reduce((at, x) => (out.set(x, at), at + x.length), 0);
  return out;
};

async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, bytes: number) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

/** Ein „Browser“ als Empfänger: entschlüsselt so, wie es Chrome/Safari nach RFC 8291 tun. */
async function fakeBrowser() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const uaPub = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const auth = crypto.getRandomValues(new Uint8Array(16));
  const target = { p256dh: toB64Url(uaPub), auth: toB64Url(auth) };
  const decrypt = async (body: Uint8Array) => {
    const salt = body.slice(0, 16);
    const rs = new DataView(body.buffer, body.byteOffset).getUint32(16);
    const idLen = body[20];
    const asPub = body.slice(21, 21 + idLen);
    const ct = body.slice(21 + idLen);
    const asKey = await crypto.subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, pair.privateKey, 256));
    const ikm = await hkdf(auth, shared, cat(enc.encode('WebPush: info\0'), uaPub, asPub), 32);
    const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
    const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
    const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']);
    const padded = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ct));
    let end = padded.length - 1;
    while (end > 0 && padded[end] === 0) end--;
    expect(padded[end]).toBe(2);
    return { rs, idLen, text: new TextDecoder().decode(padded.subarray(0, end)) };
  };
  return { target, decrypt };
}

const json = (part: string) => JSON.parse(new TextDecoder().decode(fromB64Url(part)));

async function checkJwt(header: string, endpoint: string) {
  const m = header.match(/^vapid t=([^,]+), k=([A-Za-z0-9_-]+)$/);
  expect(m).toBeTruthy();
  const [h, c, s] = m![1].split('.');
  const pub = fromB64Url(m![2]);
  expect(pub.length).toBe(65);
  const key = await crypto.subtle.importKey('raw', pub, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, fromB64Url(s), enc.encode(`${h}.${c}`));
  expect(ok).toBe(true);
  expect(json(h)).toEqual({ typ: 'JWT', alg: 'ES256' });
  const claims = json(c);
  expect(claims.aud).toBe(new URL(endpoint).origin);
  return { claims, pub: m![2] };
}

describe('Web Push', () => {
  it('verschlüsselt so, dass der Browser es lesen kann (aes128gcm)', async () => {
    const browser = await fakeBrowser();
    const body = await encryptPush(browser.target, enc.encode('Ich liebe dich 💞'));
    const out = await browser.decrypt(body);
    expect(out).toEqual({ rs: 4096, idLen: 65, text: 'Ich liebe dich 💞' });
    // Jede Nachricht bekommt frische Schlüssel.
    expect(toB64Url(await encryptPush(browser.target, enc.encode('Ich liebe dich 💞')))).not.toBe(toB64Url(body));
  });

  it('unterschreibt mit VAPID (ES256), passend zum Push-Dienst', async () => {
    const keys = await generateVapidKeys();
    expect(fromB64Url(keys.pub)[0]).toBe(4);
    const endpoint = 'https://fcm.googleapis.com/fcm/send/abc:def';
    const now = Date.UTC(2026, 9, 26, 12);
    const { claims, pub } = await checkJwt(await vapidAuth(endpoint, keys, 'https://amirhossin27-dev.github.io/Arta/', now), endpoint);
    expect(pub).toBe(keys.pub);
    expect(claims.sub).toBe('https://amirhossin27-dev.github.io/Arta/');
    expect(claims.exp).toBe(now / 1000 + 12 * 3600);
  });

  it('baut die komplette Anfrage für den Weiterleitungs-Server', async () => {
    const browser = await fakeBrowser();
    const vapid = await generateVapidKeys();
    const endpoint = 'https://web.push.apple.com/QGz-abc';
    const long = 'x'.repeat(600);
    const req = await buildRelayRequest(
      { endpoint, ...browser.target, vapid },
      { title: '💌 Botschaft von Sara', body: long, tag: 'note-1', tab: 'liebe' },
      { ttl: 86400, subject: 'https://amirhossin27-dev.github.io/Arta/' },
    );
    expect(req).toMatchObject({ endpoint, ttl: 86400, urgency: 'high' });
    await checkJwt(req.auth, endpoint);
    const msg = JSON.parse((await browser.decrypt(fromB64Url(req.body))).text);
    expect(msg).toMatchObject({ title: '💌 Botschaft von Sara', tag: 'note-1', tab: 'liebe' });
    expect(Array.from(msg.body as string)).toHaveLength(280);
    expect(fromB64Url(req.body).length).toBeLessThan(4096);
  });

  it('kürzt Texte, ohne Emojis zu zerreißen', () => {
    expect(clip('  hallo  ')).toBe('hallo');
    expect(clip('😘😘😘😘', 3)).toBe('😘😘…');
  });
});
