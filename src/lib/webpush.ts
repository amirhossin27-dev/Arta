import { fromB64Url, toB64Url } from './sync';

/**
 * Web Push ohne Bibliothek und ohne eigenen Schlüssel-Server: Das sendende Handy verschlüsselt
 * die Mitteilung selbst für den Browser des Empfängers (RFC 8291, „aes128gcm“) und unterschreibt
 * die Anfrage mit VAPID (RFC 8292). Unterwegs – beim Weiterleitungs-Server und beim Push-Dienst
 * von Google/Apple – ist nur Zeichensalat zu sehen.
 */

/** VAPID-Schlüsselpaar (P-256): `pub` unkomprimiert (65 Bytes), `d` der private Teil, beides base64url. */
export interface VapidKeys {
  pub: string;
  d: string;
}

/** Wohin eine Mitteilung für ein bestimmtes Handy geht (aus dessen Push-Abo). */
export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
  /** Mit diesem Schlüssel hat der Empfänger sein Abo angelegt – nur damit darf man ihm schicken. */
  vapid: VapidKeys;
}

/** Inhalt einer Mitteilung, so wie der Service Worker sie anzeigt. */
export interface PushMessage {
  title: string;
  body: string;
  /** Gleiches Tag ersetzt die vorige Mitteilung (z. B. mehrere Herzen hintereinander). */
  tag: string;
  /** Bereich, der beim Antippen geöffnet wird. */
  tab?: string;
}

/** Fertige Anfrage für den Weiterleitungs-Server (siehe push-relay/worker.js). */
export interface RelayRequest {
  endpoint: string;
  ttl: number;
  urgency: 'very-low' | 'low' | 'normal' | 'high';
  auth: string;
  body: string;
}

const enc = new TextEncoder();
const RECORD_SIZE = 4096;

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

async function hkdf(salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, bytes: number) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, bytes * 8));
}

export async function generateVapidKeys(): Promise<VapidKeys> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const pub = concat(new Uint8Array([4]), fromB64Url(jwk.x!), fromB64Url(jwk.y!));
  return { pub: toB64Url(pub), d: jwk.d! };
}

function vapidJwk(keys: VapidKeys): JsonWebKey {
  const pub = fromB64Url(keys.pub);
  return { kty: 'EC', crv: 'P-256', x: toB64Url(pub.subarray(1, 33)), y: toB64Url(pub.subarray(33, 65)), d: keys.d, ext: true };
}

const b64Json = (v: unknown) => toB64Url(enc.encode(JSON.stringify(v)));

/** `Authorization`-Kopfzeile nach RFC 8292 – gilt 12 Stunden. */
export async function vapidAuth(endpoint: string, keys: VapidKeys, subject: string, now = Date.now()): Promise<string> {
  const key = await crypto.subtle.importKey('jwk', vapidJwk(keys), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const unsigned = `${b64Json({ typ: 'JWT', alg: 'ES256' })}.${b64Json({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })}`;
  // WebCrypto liefert die Signatur schon im JWS-Format (r‖s, je 32 Bytes).
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(unsigned)));
  return `vapid t=${unsigned}.${toB64Url(sig)}, k=${keys.pub}`;
}

/** Verschlüsselt `plain` für den Browser hinter `target` (ein einziger Datensatz, RFC 8188/8291). */
export async function encryptPush(target: Pick<PushTarget, 'p256dh' | 'auth'>, plain: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  const uaPub = fromB64Url(target.p256dh);
  const authSecret = fromB64Url(target.auth);
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));
  const ikm = await hkdf(authSecret, shared, concat(enc.encode('WebPush: info\0'), uaPub, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  // 0x02 markiert den letzten (und einzigen) Datensatz.
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(plain, new Uint8Array([2]))));
  const header = new Uint8Array(21);
  header.set(salt);
  new DataView(header.buffer).setUint32(16, RECORD_SIZE);
  header[20] = asPub.length;
  return concat(header, asPub, ct);
}

/** Längere Texte kürzen – eine Push-Nachricht darf höchstens 4 KB groß sein. */
export function clip(text: string, max = 280): string {
  const chars = Array.from(text.trim());
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : chars.join('');
}

export async function buildRelayRequest(
  target: PushTarget,
  msg: PushMessage,
  opts: { ttl: number; subject: string; urgency?: RelayRequest['urgency']; now?: number },
): Promise<RelayRequest> {
  const plain = enc.encode(JSON.stringify({ ...msg, title: clip(msg.title, 80), body: clip(msg.body) }));
  return {
    endpoint: target.endpoint,
    ttl: opts.ttl,
    urgency: opts.urgency ?? 'high',
    auth: await vapidAuth(target.endpoint, target.vapid, opts.subject, opts.now),
    body: toB64Url(await encryptPush(target, plain)),
  };
}
