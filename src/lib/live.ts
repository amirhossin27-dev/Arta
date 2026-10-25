import { useSyncExternalStore } from 'react';
import { todayKey } from './date';
import { LIVE_DB_URL } from './liveConfig';
import { heartBurst, showLove } from './love';
import { heartsOn } from './stats';
import { actions, commitData, getData, getDevice, subscribe, useDevice } from './store';
import { buildPayload, canCompress, checkPayload, fromB64Url, mergeData, pipe, toB64Url, type MergeStats, type SyncPayload } from './sync';
import { other, type LiveRoom } from './types';

/**
 * Live-Sync: Jedes Handy legt seinen Stand verschlüsselt in einem gemeinsamen „Raum“ der
 * Firebase Realtime Database ab und hört per Server-Sent Events auf die Stände der anderen.
 * Zusammengeführt wird wie beim Link-Sync per last-writer-wins. Raum-Adresse und Schlüssel
 * stecken nur im Einladungslink – die Datenbank sieht ausschließlich Zeichensalat.
 */

// ───── Verschlüsselung ─────

const enc = new TextEncoder();
const SALT = enc.encode('arta-live-v1');

export interface RoomKeys {
  /** Pfad des Raums in der Datenbank (verrät nichts über den Schlüssel). */
  id: string;
  key: CryptoKey;
}

export async function deriveRoom(secret: string): Promise<RoomKeys> {
  const base = await crypto.subtle.importKey('raw', fromB64Url(secret), 'HKDF', false, ['deriveBits', 'deriveKey']);
  const bits = await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: SALT, info: enc.encode('room') }, base, 128);
  const key = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: SALT, info: enc.encode('key') },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
  const id = Array.from(new Uint8Array(bits), (b) => b.toString(16).padStart(2, '0')).join('');
  return { id, key };
}

export function newRoom(): LiveRoom {
  return { secret: toB64Url(crypto.getRandomValues(new Uint8Array(32))), since: Date.now() };
}

/** So liegt der Stand eines Geräts in der Datenbank (siehe database.rules.json). */
export interface LiveNode {
  v: 1;
  at: number;
  iv: string;
  ct: string;
}

export async function seal(p: SyncPayload, key: CryptoKey): Promise<LiveNode> {
  const json = enc.encode(JSON.stringify(p));
  const zip = canCompress();
  const body = zip ? await pipe(json, new CompressionStream('deflate-raw')) : json;
  const plain = new Uint8Array(body.length + 1);
  plain[0] = zip ? 1 : 0;
  plain.set(body, 1);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
  return { v: 1, at: p.at, iv: toB64Url(iv), ct: toB64Url(new Uint8Array(ct)) };
}

export async function unseal(node: LiveNode, key: CryptoKey): Promise<SyncPayload> {
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64Url(node.iv) }, key, fromB64Url(node.ct)));
  const body = plain.subarray(1);
  const json = plain[0] === 1 ? await pipe(body, new DecompressionStream('deflate-raw')) : body;
  return checkPayload(JSON.parse(new TextDecoder().decode(json)));
}

function isNode(x: unknown): x is LiveNode {
  const n = x as LiveNode | null;
  return !!n && typeof n === 'object' && n.v === 1 && typeof n.at === 'number' && typeof n.iv === 'string' && typeof n.ct === 'string';
}

// ───── Raum: Einladung & Wechsel ─────

/** Live-Sync ist eingerichtet und der Browser kann ihn (https, EventSource). */
export const liveAvailable = () =>
  !!LIVE_DB_URL && typeof EventSource !== 'undefined' && typeof globalThis.crypto?.subtle !== 'undefined';

/** Raum für eine Einladung – wird beim ersten Link automatisch angelegt. */
export function ensureRoom(): LiveRoom | undefined {
  if (!liveAvailable()) return undefined;
  const cur = getDevice().live;
  if (cur) return { secret: cur.secret, since: cur.since };
  const room = newRoom();
  actions.setLive(room);
  return room;
}

/**
 * Raum aus einer Einladung übernehmen. Haben beide Handys schon einen Raum, gewinnt der neuere –
 * so landen beide sicher im selben, auch wenn ihr euch gleichzeitig Links schickt.
 */
export function adoptRoom(incoming: LiveRoom | undefined, force = false): boolean {
  if (!incoming || !liveAvailable()) return false;
  const mine = getDevice().live;
  if (mine?.secret === incoming.secret) return false;
  if (mine && !force && mine.since >= incoming.since) return false;
  // Wer die Einladung geschickt hat, ist schon im Raum – also gleich als verbunden merken.
  actions.setLive({ secret: incoming.secret, since: incoming.since, linkedAt: Date.now() });
  return true;
}

/** Live-Sync auf diesem Handy beenden und den eigenen Stand aus dem Raum löschen. */
export async function leaveRoom() {
  const room = getDevice().live;
  if (!room) return;
  actions.setLive(undefined);
  try {
    const { id } = await deriveRoom(room.secret);
    await fetch(nodeUrl(id, getDevice().deviceId), { method: 'DELETE' });
  } catch {
    // offline – der alte Stand bleibt einfach liegen
  }
}

/** Für Texte wie „kommt sofort an“ vs. „beim nächsten Sync“. */
export function useLive(): boolean {
  const device = useDevice();
  return !!device.live && liveAvailable();
}

export const isLive = () => !!getDevice().live && liveAvailable();

// ───── Status für die Oberfläche ─────

export type LiveState = 'off' | 'connecting' | 'online' | 'offline' | 'error';

export interface LiveStatus {
  state: LiveState;
  message?: string;
  /** Wann der Partner zuletzt etwas geschickt hat. */
  partnerAt?: number;
  /** Eigene Änderungen warten noch auf den Upload. */
  pending: boolean;
  lastPushAt?: number;
}

let status: LiveStatus = { state: 'off', pending: false };
const statusListeners = new Set<() => void>();

function setStatus(changes: Partial<LiveStatus>) {
  status = { ...status, ...changes };
  statusListeners.forEach((l) => l());
}

const subscribeStatus = (fn: () => void) => {
  statusListeners.add(fn);
  return () => {
    statusListeners.delete(fn);
  };
};

export const getLiveStatus = () => status;

export function useLiveStatus(): LiveStatus {
  return useSyncExternalStore(subscribeStatus, getLiveStatus, getLiveStatus);
}

// ───── Firebase-Stream ─────

type Tree = Record<string, unknown>;

function setAt(obj: unknown, parts: string[], value: unknown): unknown {
  if (!parts.length) return value;
  const [head, ...rest] = parts;
  const base: Tree = obj && typeof obj === 'object' ? { ...(obj as Tree) } : {};
  const next = setAt(base[head], rest, value);
  if (next === null || next === undefined) delete base[head];
  else base[head] = next;
  return base;
}

function getAt(obj: unknown, parts: string[]): unknown {
  return parts.reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Tree)[k] : undefined), obj);
}

/**
 * Wendet ein `put`/`patch`-Ereignis der Firebase-REST-Schnittstelle auf unsere Kopie des Raums an
 * und meldet, welche Geräte-Einträge sich geändert haben.
 */
export function applyStreamEvent(room: Tree, type: 'put' | 'patch', path: string, data: unknown): { room: Tree; touched: string[] } {
  const parts = path.split('/').filter(Boolean);
  let next: unknown = room;
  if (type === 'put') {
    next = setAt(room, parts, data);
  } else if (data && typeof data === 'object') {
    for (const [k, v] of Object.entries(data as Tree)) next = setAt(next, [...parts, ...k.split('/').filter(Boolean)], v);
  }
  const out = (next && typeof next === 'object' ? next : {}) as Tree;
  let touched: string[];
  if (parts.length) touched = [parts[0]];
  else if (type === 'patch' && data && typeof data === 'object') touched = Object.keys(data as Tree).map((k) => k.split('/').filter(Boolean)[0]);
  else touched = [...new Set([...Object.keys(room), ...Object.keys(out)])];
  return { room: out, touched: touched.filter((d) => getAt(out, [d]) !== undefined) };
}

const roomUrl = (id: string) => `${LIVE_DB_URL}/rooms/${id}.json`;
const nodeUrl = (id: string, device: string) => `${LIVE_DB_URL}/rooms/${id}/${device}.json`;

// ───── Verbindung ─────

interface Session {
  room: LiveRoom;
  keys?: RoomKeys;
  stream?: EventSource;
  mirror: Tree;
  /** Zuletzt übernommener Stand je Gerät (`at`), damit nichts doppelt zusammengeführt wird. */
  merged: Map<string, number>;
  queue: Promise<void>;
  pushTimer?: number;
  pushRetries: number;
  pushing: boolean;
  pushAgain: boolean;
  /** Erster Upload nach dem Start: immer senden, damit der Partner sieht, dass wir da sind. */
  greeted: boolean;
  lastPushed?: string;
  retryTimer?: number;
  streamRetries: number;
  closed: boolean;
}

let session: Session | null = null;
let lastData = getData();
let applyingRemote = false;

const PUSH_DELAY = 400;

function streamError(message: string) {
  setStatus({ state: 'error', message });
}

function connect(s: Session) {
  if (s.closed || !s.keys || s.stream || document.visibilityState === 'hidden') return;
  window.clearTimeout(s.retryTimer);
  setStatus({ state: navigator.onLine === false ? 'offline' : 'connecting', message: undefined });
  const es = new EventSource(roomUrl(s.keys.id));
  s.stream = es;
  const onData = (type: 'put' | 'patch') => (e: MessageEvent<string>) => {
    let msg: { path: string; data: unknown };
    try {
      msg = JSON.parse(e.data);
    } catch {
      return;
    }
    const first = status.state !== 'online';
    const { room, touched } = applyStreamEvent(s.mirror, type, msg.path ?? '/', msg.data);
    s.mirror = room;
    s.streamRetries = 0;
    if (first) setStatus({ state: 'online', message: undefined });
    const me = getDevice().deviceId;
    for (const dev of touched) if (dev !== me) s.queue = s.queue.then(() => mergeNode(s, dev, s.mirror[dev]));
    if (!s.greeted) s.queue = s.queue.then(() => schedulePush(0));
  };
  es.addEventListener('put', onData('put') as EventListener);
  es.addEventListener('patch', onData('patch') as EventListener);
  // „cancel“: Die Datenbank-Regeln verweigern das Lesen.
  es.addEventListener('cancel', () => {
    dropStream(s);
    streamError('Die Datenbank lässt Arta nicht hinein – sind die Regeln aus database.rules.json eingetragen?');
  });
  es.onerror = () => {
    if (es.readyState !== EventSource.CLOSED) {
      if (status.state === 'online') setStatus({ state: 'connecting' });
      return;
    }
    // Der Browser gibt auf (z. B. bei HTTP-Fehlern) – wir versuchen es selbst später erneut.
    dropStream(s);
    void diagnose(s);
    const delay = Math.min(30_000, 1000 * 2 ** s.streamRetries) + Math.random() * 500;
    s.streamRetries++;
    s.retryTimer = window.setTimeout(() => connect(s), delay);
  };
}

function dropStream(s: Session) {
  s.stream?.close();
  s.stream = undefined;
}

/** Warum klappt die Verbindung nicht? Gibt Amir beim Einrichten einen Hinweis. */
async function diagnose(s: Session) {
  if (navigator.onLine === false) return setStatus({ state: 'offline', message: undefined });
  try {
    const res = await fetch(`${roomUrl(s.keys!.id)}?shallow=true`);
    if (s.closed) return;
    if (res.status === 401 || res.status === 403) streamError('Die Datenbank lässt Arta nicht hinein – sind die Regeln aus database.rules.json eingetragen?');
    else if (res.status === 404) streamError('Die Live-Datenbank wurde nicht gefunden – stimmt die Adresse?');
    else setStatus({ state: 'offline', message: undefined });
  } catch {
    if (!s.closed) setStatus({ state: 'offline', message: undefined });
  }
}

async function mergeNode(s: Session, dev: string, node: unknown) {
  if (s.closed || !s.keys || !isNode(node) || s.merged.get(dev) === node.at) return;
  let payload: SyncPayload;
  try {
    payload = await unseal(node, s.keys.key);
  } catch {
    return; // fremder oder beschädigter Eintrag
  }
  if (s.closed) return;
  s.merged.set(dev, node.at);
  const device = getDevice();
  const partnerId = other(device.me);
  const today = todayKey();
  const before = heartsOn(getData(), today, payload.from);
  const { data, stats } = mergeData(getData(), payload.data, device.me);
  if (stats.changed) {
    applyingRemote = true;
    try {
      commitData(data);
    } finally {
      applyingRemote = false;
    }
    actions.markSynced();
  }
  if (payload.from !== partnerId) return;
  const firstContact = !status.partnerAt;
  setStatus({ partnerAt: Math.max(status.partnerAt ?? 0, payload.at) });
  const name = data.persons[partnerId].name;
  if (firstContact && payload.at > s.room.since && getDevice().live && !getDevice().live?.linkedAt) {
    actions.setLive({ ...getDevice().live!, linkedAt: Date.now() });
    showLove({ emoji: '⚡', title: `Live verbunden mit ${name}!`, text: 'Ab jetzt kommt alles sofort auf dem anderen Handy an. 💞', big: true, tone: 'party' });
  }
  const newHearts = Math.max(0, heartsOn(data, today, payload.from) - before);
  if (stats.changed || newHearts) announce(name, stats, newHearts);
}

// Mehrere Änderungen kurz hintereinander (z. B. fünf Einkaufsartikel) → eine Einblendung.
let announced: { name: string; stats: MergeStats; hearts: number } | null = null;
let announceTimer: number | undefined;

function announce(name: string, stats: MergeStats, hearts: number) {
  if (hearts) heartBurst(undefined, '❤️', Math.min(hearts * 4, 20));
  const acc = announced ?? { name, hearts: 0, stats: { changed: 0, newNotes: 0, newSurprises: 0, newCoupons: 0, newShopping: 0, newPlan: 0 } };
  for (const k of Object.keys(acc.stats) as (keyof MergeStats)[]) acc.stats[k] += stats[k];
  acc.hearts += hearts;
  announced = acc;
  window.clearTimeout(announceTimer);
  announceTimer = window.setTimeout(() => {
    announced = null;
    if (acc.hearts) showLove({ emoji: '❤️', title: `${acc.hearts}× Herz von ${acc.name}`, text: 'Da denkt jemand ganz fest an dich!', tone: 'love' });
    const text = liveSummary(acc.stats);
    if (text) showLove({ emoji: '⚡', title: `Neu von ${acc.name}`, text, tone: 'love' });
  }, 2500);
}

/** Wie `summarize`, aber ohne Botschaften – die erscheinen ohnehin als eigene Einblendung. */
export function liveSummary(stats: MergeStats): string {
  const parts: string[] = [];
  if (stats.newSurprises) parts.push('🎁 eine kleine Überraschung …');
  if (stats.newCoupons) parts.push(`${stats.newCoupons} Gutschein${stats.newCoupons === 1 ? '' : 'e'} 🎟️`);
  if (stats.newPlan) parts.push(`${stats.newPlan} geplante Einheit${stats.newPlan === 1 ? '' : 'en'} 💪`);
  if (stats.newShopping) parts.push(`${stats.newShopping} Einkaufsartikel 🛒`);
  return parts.join(' · ');
}

// ───── Hochladen ─────

function schedulePush(delay = PUSH_DELAY) {
  const s = session;
  if (!s || s.closed) return;
  setStatus({ pending: true });
  window.clearTimeout(s.pushTimer);
  s.pushTimer = window.setTimeout(() => void push(s), delay);
}

/** `urgent`: Die App geht gerade in den Hintergrund – Upload soll das überleben. */
async function push(s: Session, urgent = false) {
  if (s.closed || !s.keys) return;
  window.clearTimeout(s.pushTimer);
  s.pushTimer = undefined;
  if (s.pushing) {
    s.pushAgain = true;
    return;
  }
  s.pushing = true;
  try {
    const device = getDevice();
    const payload = buildPayload(getData(), device.me, device.deviceId, todayKey());
    const fingerprint = JSON.stringify([device.me, payload.data]);
    if (s.greeted && fingerprint === s.lastPushed) {
      setStatus({ pending: false });
      return;
    }
    const body = JSON.stringify(await seal(payload, s.keys.key));
    // keepalive: Upload läuft weiter, auch wenn die App gerade geschlossen wird (max. 64 KB).
    // Nur dann, weil nicht jeder Browser keepalive mit CORS-Preflight kann – ein Fehlschlag wird normal wiederholt.
    const keepalive = urgent && body.length < 60_000;
    const res = await fetch(`${nodeUrl(s.keys.id, device.deviceId)}?print=silent`, { method: 'PUT', body, keepalive });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    s.lastPushed = fingerprint;
    s.greeted = true;
    s.pushRetries = 0;
    if (!s.closed) setStatus({ pending: false, lastPushAt: Date.now() });
  } catch {
    if (s.closed) return;
    const delay = Math.min(60_000, 2000 * 2 ** s.pushRetries);
    s.pushRetries++;
    setStatus({ pending: true });
    s.pushTimer = window.setTimeout(() => void push(s), delay);
  } finally {
    s.pushing = false;
    if (s.pushAgain && !s.closed) {
      s.pushAgain = false;
      void push(s);
    }
  }
}

// ───── Start & Lebenszyklus ─────

function stopSession() {
  const s = session;
  if (!s) return;
  s.closed = true;
  dropStream(s);
  window.clearTimeout(s.pushTimer);
  window.clearTimeout(s.retryTimer);
  session = null;
  setStatus({ state: 'off', message: undefined, partnerAt: undefined, pending: false, lastPushAt: undefined });
}

function startSession(room: LiveRoom) {
  const s: Session = {
    room,
    mirror: {},
    merged: new Map(),
    queue: Promise.resolve(),
    pushRetries: 0,
    pushing: false,
    pushAgain: false,
    greeted: false,
    streamRetries: 0,
    closed: false,
  };
  session = s;
  setStatus({ state: 'connecting', message: undefined, pending: true });
  deriveRoom(room.secret)
    .then((keys) => {
      if (s.closed) return;
      s.keys = keys;
      connect(s);
      // Auch ohne Antwort vom Server (offline) den eigenen Stand bereithalten.
      schedulePush(3000);
    })
    .catch(() => streamError('Der Live-Sync konnte nicht gestartet werden.'));
}

function onStoreChange() {
  const device = getDevice();
  const wanted = device.onboarded && device.live && liveAvailable() ? device.live : undefined;
  if (session && session.room.secret !== wanted?.secret) stopSession();
  if (wanted && !session) startSession(wanted);
  const data = getData();
  if (data !== lastData) {
    lastData = data;
    // Zusammengeführte Partnerdaten nicht gleich zurückschicken – das nächste eigene Update enthält sie.
    if (!applyingRemote) schedulePush();
  }
}

let started = false;

/** Einmal beim App-Start aufrufen. */
export function startLive() {
  if (started || !liveAvailable()) return;
  started = true;
  subscribe(onStoreChange);
  onStoreChange();
  document.addEventListener('visibilitychange', () => {
    const s = session;
    if (!s) return;
    if (document.visibilityState === 'hidden') {
      // Im Hintergrund schläft die Verbindung ohnehin – offene Änderungen sofort losschicken.
      if (s.pushTimer !== undefined) void push(s, true);
      dropStream(s);
    } else {
      s.streamRetries = 0;
      connect(s);
    }
  });
  window.addEventListener('online', () => {
    const s = session;
    if (!s) return;
    s.streamRetries = 0;
    connect(s);
    if (status.pending) void push(s);
  });
  window.addEventListener('offline', () => {
    if (session) setStatus({ state: 'offline', message: undefined });
  });
  window.addEventListener('pagehide', () => {
    if (session?.pushTimer !== undefined) void push(session, true);
  });
}
