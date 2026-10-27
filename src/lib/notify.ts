import { useSyncExternalStore } from 'react';
import { addDays, todayKey } from './date';
import {
  channelsLoaded,
  channelValue,
  deleteChannel,
  getLiveStatus,
  isLive,
  listChannels,
  onLiveStatus,
  PUSH_PREFIX,
  sendChannel,
  setKeepAliveHidden,
} from './live';
import { PUSH_RELAY_URL } from './liveConfig';
import { extraDays, freshEvents, nextStart, whenText } from './events';
import { heartsOn } from './stats';
import { actions, getData, getDevice, onSent, subscribe, type Sent } from './store';
import { fromB64Url, toB64Url } from './sync';
import { other, type AppData, type CalEvent, type Coupon, type LoveNote, type PersonId } from './types';
import { buildRelayRequest, generateVapidKeys, type PushMessage, type PushTarget, type VapidKeys } from './webpush';

/**
 * Mitteilungen aufs Handy, wenn der Schatz eine Botschaft, Herzen, einen Gutschein oder eine
 * Spiel-Einladung schickt.
 *
 * Zwei Wege:
 * 1. Solange Arta läuft (auch kurz im Hintergrund), zeigt die App die Mitteilung selbst an.
 * 2. Ist ein Push-Relay eingerichtet (siehe push-relay/), legt jedes Handy ein Push-Abo an und
 *    legt es verschlüsselt im Live-Raum ab (`push-<Geräte-ID>`). Das sendende Handy verschlüsselt
 *    die Mitteilung dann selbst für das andere Handy – sie kommt auch bei geschlossener App an.
 */

// ───── Texte ─────

export function noteMessage(n: LoveNote, from: string): PushMessage | null {
  // Überraschungen tauchen absichtlich zu einem zufälligen Zeitpunkt in der App auf – nicht verraten.
  if (n.surprise) return null;
  return n.kind === 'cheer'
    ? { title: `📣 ${from} feuert dich an!`, body: n.text, tag: `note-${n.id}`, tab: 'liebe' }
    : { title: `💌 Botschaft von ${from}`, body: n.text, tag: `note-${n.id}`, tab: 'liebe' };
}

export function couponMessage(c: Coupon, from: string): PushMessage {
  return { title: `🎟️ Gutschein von ${from}`, body: `${c.emoji} ${c.title}`, tag: `coupon-${c.id}`, tab: 'liebe' };
}

/** `count`: alle Herzen von heute – mehrere Mitteilungen hintereinander ersetzen einander. */
export function heartsMessage(count: number, from: string, date: string): PushMessage {
  return {
    title: count === 1 ? `❤️ Ein Herz von ${from}` : `❤️ ${count} Herzen von ${from}`,
    body: 'Da denkt jemand ganz fest an dich!',
    tag: `hearts-${date}`,
    tab: 'liebe',
  };
}

export function eventMessage(e: CalEvent, from: string, today = todayKey()): PushMessage {
  const start = nextStart(e, today) ?? e.date;
  const when = whenText({ event: e, start, end: addDays(start, extraDays(e)) }, today);
  return { title: `📅 Neuer Termin von ${from}`, body: `${e.emoji} ${e.title} · ${when}`, tag: `event-${e.id}`, tab: 'heute' };
}

export function inviteMessage(game: { name: string; emoji: string }, from: string, id: string): PushMessage {
  return { title: `${game.emoji} ${from} lädt dich zu ${game.name} ein!`, body: 'Tippe hier und spielt online – jeder an seinem Handy. 🎮', tag: `invite-${id}`, tab: 'spiele' };
}

/** Was ist seit `prev` Frisches von `from` dazugekommen? (Nichts Uraltes aus einem späten Sync.) */
export function freshFrom(prev: AppData, next: AppData, from: PersonId, today: string, maxAge: number, now = Date.now()) {
  const recent = (t: number) => now - t < maxAge;
  const notes = Object.values(next.notes).filter((n) => !prev.notes[n.id] && !n.deleted && !n.seen && n.from === from && recent(n.createdAt));
  const coupons = Object.values(next.coupons).filter((c) => !prev.coupons[c.id] && !c.deleted && !c.redeemedAt && c.from === from && recent(c.createdAt));
  const hearts = Math.max(0, heartsOn(next, today, from) - heartsOn(prev, today, from));
  return { notes, coupons, hearts };
}

// ───── Was kann dieses Handy? ─────

export type NotifySupport = 'ok' | 'install' | 'none';

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);

/** `install`: iPhone im Safari-Tab – Mitteilungen gehen erst, wenn Arta auf dem Home-Bildschirm liegt. */
export function notifySupport(): NotifySupport {
  if (typeof window === 'undefined') return 'none';
  if ('Notification' in window && 'serviceWorker' in navigator) return 'ok';
  return isIos() ? 'install' : 'none';
}

const permission = (): NotificationPermission => (typeof Notification !== 'undefined' ? Notification.permission : 'denied');

/** Mitteilungen sind gewünscht und erlaubt. */
export const notifyActive = () => getDevice().notify !== false && notifySupport() === 'ok' && permission() === 'granted';

/** Push bei geschlossener App ist möglich (Relay eingerichtet, Browser kann Push). */
export const pushPossible = () => !!PUSH_RELAY_URL && typeof window !== 'undefined' && 'PushManager' in window;

// ───── Zustand für die Oberfläche ─────

export type PushState = 'off' | 'pending' | 'on' | 'error';

export interface NotifyState {
  permission: NotificationPermission;
  /** Push-Abo dieses Handys (für Mitteilungen bei geschlossener App). */
  push: PushState;
  /** Letzte Zustellung an den Schatz über das Relay. */
  lastSend?: { at: number; ok: boolean; detail?: string };
}

let state: NotifyState = { permission: typeof window === 'undefined' ? 'default' : permission(), push: 'off' };
const listeners = new Set<() => void>();

function setState(changes: Partial<NotifyState>) {
  state = { ...state, ...changes };
  listeners.forEach((l) => l());
}

const subscribeState = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export const getNotifyState = () => state;

export function useNotifyState(): NotifyState {
  return useSyncExternalStore(subscribeState, getNotifyState, getNotifyState);
}

function refreshPermission() {
  const p = permission();
  if (p !== state.permission) {
    setState({ permission: p });
    void syncPush();
  }
}

// ───── Schalter ─────

/** Muss aus einem Antippen heraus aufgerufen werden (sonst fragt der Browser nicht). */
export async function enableNotify(): Promise<boolean> {
  if (notifySupport() !== 'ok') return false;
  let p = permission();
  if (p === 'default') {
    try {
      p = await Notification.requestPermission();
    } catch {
      p = permission();
    }
  }
  refreshPermission();
  if (p !== 'granted') return false;
  actions.setNotify(true);
  return true;
}

export function disableNotify() {
  actions.setNotify(false);
}

// ───── Anzeigen ─────

const ICON = 'icons/icon-192.png';
const BADGE = 'icons/badge-96.png';

async function swRegistration(wait = 0): Promise<ServiceWorkerRegistration | undefined> {
  if (!('serviceWorker' in navigator)) return undefined;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (reg || !wait) return reg;
    return await Promise.race([navigator.serviceWorker.ready, new Promise<undefined>((r) => window.setTimeout(() => r(undefined), wait))]);
  } catch {
    return undefined;
  }
}

/** Mitteilung direkt von der App aus zeigen (Android braucht dafür den Service Worker). */
export async function showLocal(msg: PushMessage) {
  if (!notifyActive()) return;
  const options: NotificationOptions & { renotify?: boolean; vibrate?: number[] } = {
    body: msg.body,
    tag: msg.tag,
    icon: ICON,
    badge: BADGE,
    data: { tab: msg.tab },
    renotify: true,
    vibrate: [80, 50, 80],
  };
  try {
    const reg = await swRegistration();
    if (reg) await reg.showNotification(msg.title, options);
    else new Notification(msg.title, options);
  } catch {
    // Dann eben nur die Einblendung in der App.
  }
}

/**
 * Für Dinge, die gerade über den Live-Sync hereinkommen: Ist Arta im Hintergrund, eine Mitteilung
 * zeigen – außer das Push-Abo ist aktiv, dann kommt sie ohnehin über den Push-Dienst.
 */
export function notifyIfHidden(msg: PushMessage) {
  if (document.visibilityState === 'hidden' && state.push !== 'on') void showLocal(msg);
}

export function testNotify(partner: string) {
  void showLocal({ title: '💞 So sieht es aus', body: `Wenn ${partner} dir etwas schickt, meldet sich dein Handy genau so.`, tag: 'test' });
}

// ───── Push-Abo dieses Handys ─────

/** Wird im Raum abgelegt (verschlüsselt), damit das andere Handy Mitteilungen schicken kann. */
export interface PushDoc extends PushTarget {
  v: 1;
  person: PersonId;
  at: number;
}

const KEYS_KEY = 'arta.push.v1';
/** VAPID verlangt eine Kontaktadresse des Absenders – die App selbst. */
const SUBJECT = 'https://amirhossin27-dev.github.io/Arta/';

function loadKeys(): VapidKeys | undefined {
  try {
    const k = JSON.parse(localStorage.getItem(KEYS_KEY) ?? 'null') as VapidKeys | null;
    return k && typeof k.pub === 'string' && typeof k.d === 'string' ? k : undefined;
  } catch {
    return undefined;
  }
}

function saveKeys(keys: VapidKeys) {
  try {
    localStorage.setItem(KEYS_KEY, JSON.stringify(keys));
  } catch {
    // ohne Speicher eben jedes Mal ein neues Abo
  }
}

export function isPushDoc(x: unknown): x is PushDoc {
  const d = x as PushDoc | null;
  return (
    !!d &&
    d.v === 1 &&
    (d.person === 'a' || d.person === 'b') &&
    typeof d.endpoint === 'string' &&
    d.endpoint.startsWith('https://') &&
    typeof d.p256dh === 'string' &&
    typeof d.auth === 'string' &&
    typeof d.vapid?.pub === 'string' &&
    typeof d.vapid?.d === 'string'
  );
}

const myChannel = () => `${PUSH_PREFIX}${getDevice().deviceId}`;

function sameDoc(a: unknown, b: PushDoc) {
  return isPushDoc(a) && a.person === b.person && a.endpoint === b.endpoint && a.p256dh === b.p256dh && a.auth === b.auth && a.vapid.pub === b.vapid.pub;
}

let syncing = false;
let syncAgain = false;

/** Push-Abo an die Einstellungen anpassen und im Raum veröffentlichen (oder zurückziehen). */
export async function syncPush() {
  if (syncing) {
    syncAgain = true;
    return;
  }
  syncing = true;
  try {
    await doSyncPush();
  } catch {
    setState({ push: 'error' });
  } finally {
    syncing = false;
    if (syncAgain) {
      syncAgain = false;
      void syncPush();
    }
  }
}

async function doSyncPush() {
  const reg = pushPossible() ? await swRegistration(10_000) : undefined;
  if (!reg?.pushManager) {
    setState({ push: 'off' });
    return;
  }
  if (!notifyActive()) {
    // Ausgeschaltet (oder nicht mehr erlaubt): Abo kündigen und aus dem Raum nehmen.
    const sub = await reg.pushManager.getSubscription();
    await sub?.unsubscribe().catch(() => false);
    if (isLive() && channelsLoaded() && channelValue(myChannel()) !== undefined) deleteChannel(myChannel());
    setState({ push: 'off' });
    return;
  }
  if (state.push !== 'on') setState({ push: 'pending' });
  let keys = loadKeys();
  let sub = await reg.pushManager.getSubscription();
  const subKey = sub?.options?.applicationServerKey;
  if (sub && (!keys || (subKey && toB64Url(new Uint8Array(subKey)) !== keys.pub))) {
    await sub.unsubscribe().catch(() => false);
    sub = null;
  }
  if (!sub) {
    if (!keys) {
      keys = await generateVapidKeys();
      saveKeys(keys);
    }
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: fromB64Url(keys.pub) });
  }
  const json = sub.toJSON();
  if (!json.keys?.p256dh || !json.keys.auth) throw new Error('Push-Abo ohne Schlüssel');
  const doc: PushDoc = { v: 1, person: getDevice().me, endpoint: sub.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, vapid: keys!, at: Date.now() };
  setState({ push: 'on' });
  // Ohne Antwort vom Raum wissen wir nicht, was dort liegt – wird nachgeholt, sobald er online ist.
  if (!isLive() || !channelsLoaded()) return;
  if (!sameDoc(channelValue(myChannel()), doc)) sendChannel(myChannel(), doc);
}

// ───── An den Schatz schicken ─────

function partnerTargets(): PushDoc[] {
  const partner = other(getDevice().me);
  const mine = myChannel();
  return listChannels(PUSH_PREFIX)
    .filter(([name, doc]) => name !== mine && isPushDoc(doc) && doc.person === partner)
    .map(([, doc]) => doc as PushDoc);
}

/** Kurz warten, bis der Raum geantwortet hat (direkt nach dem Öffnen der App). */
function roomReady(timeout = 15_000): Promise<boolean> {
  if (channelsLoaded()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = (ok: boolean) => {
      window.clearTimeout(timer);
      off();
      resolve(ok);
    };
    const off = onLiveStatus(() => {
      if (channelsLoaded()) done(true);
    });
    const timer = window.setTimeout(() => done(false), timeout);
  });
}

const HOUR = 3_600_000;

/** Mitteilung an alle Handys des Schatzes, die ein Push-Abo im Raum haben. */
export async function sendToPartner(msg: PushMessage, ttlMs = 24 * HOUR) {
  if (!PUSH_RELAY_URL || !isLive() || !(await roomReady())) return;
  for (const target of partnerTargets()) void deliver(target, msg, Math.round(ttlMs / 1000), Date.now(), 0);
}

async function deliver(target: PushTarget, msg: PushMessage, ttl: number, since: number, tries: number) {
  let retry = false;
  try {
    const req = await buildRelayRequest(target, msg, { ttl, subject: SUBJECT });
    // text/plain: keine CORS-Vorabfrage nötig, das Relay liest trotzdem JSON.
    const res = await fetch(PUSH_RELAY_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(req) });
    const out = (await res.json().catch(() => ({}))) as { status?: number; error?: string; text?: string };
    // `res`: Antwort des Relays, `pushStatus`: was der Push-Dienst (Google/Apple) dazu gesagt hat.
    const pushStatus = out.status ?? 0;
    const ok = res.ok && pushStatus >= 200 && pushStatus < 300;
    // 404/410: Das Abo gibt es nicht mehr – das andere Handy legt beim nächsten Öffnen ein neues an.
    retry = !ok && (res.status >= 500 || pushStatus === 429 || pushStatus >= 500);
    setState({ lastSend: { at: Date.now(), ok, detail: ok ? undefined : out.error ?? `${pushStatus || res.status} ${out.text ?? ''}`.trim() } });
  } catch (e) {
    retry = true;
    setState({ lastSend: { at: Date.now(), ok: false, detail: String(e) } });
  }
  if (retry && tries < 3 && Date.now() - since < 10 * 60_000) {
    window.setTimeout(() => void deliver(target, msg, ttl, since, tries + 1), 3000 * 3 ** tries);
  }
}

// Mehrere Herzen hintereinander → eine Mitteilung.
let heartTimer: number | undefined;

function onOutgoing(sent: Sent) {
  if (!PUSH_RELAY_URL) return;
  const d = getData();
  const me = d.persons[getDevice().me].name;
  if (sent.type === 'note') {
    const msg = noteMessage(sent.note, me);
    if (msg) void sendToPartner(msg, 2 * 24 * HOUR);
  } else if (sent.type === 'coupon') {
    void sendToPartner(couponMessage(sent.coupon, me), 2 * 24 * HOUR);
  } else if (sent.type === 'event') {
    void sendToPartner(eventMessage(sent.event, me), 2 * 24 * HOUR);
  } else {
    window.clearTimeout(heartTimer);
    heartTimer = window.setTimeout(() => {
      const count = heartsOn(getData(), sent.date, getDevice().me);
      if (count) void sendToPartner(heartsMessage(count, me, sent.date), 6 * HOUR);
    }, 2500);
  }
}

// ───── Eingang, solange die App im Hintergrund läuft ─────

let prevData: AppData | undefined;
let prevMe: PersonId | undefined;
let prevKey = '';

function onStoreChange() {
  const data = getData();
  const device = getDevice();
  if (prevData && data !== prevData && device.me === prevMe && document.visibilityState === 'hidden' && notifyActive()) {
    const partner = other(device.me);
    const name = data.persons[partner].name;
    const today = todayKey();
    const fresh = freshFrom(prevData, data, partner, today, 6 * HOUR);
    for (const n of fresh.notes) {
      const msg = n.to === device.me ? noteMessage(n, name) : null;
      if (msg) notifyIfHidden(msg);
    }
    for (const c of fresh.coupons) if (c.to === device.me) notifyIfHidden(couponMessage(c, name));
    if (fresh.hearts) notifyIfHidden(heartsMessage(heartsOn(data, today, partner), name, today));
    for (const e of freshEvents(prevData, data, partner, 6 * HOUR)) notifyIfHidden(eventMessage(e, name, today));
  }
  prevData = data;
  prevMe = device.me;
  // Push-Abo nur neu abgleichen, wenn sich etwas Wichtiges geändert hat.
  const key = `${device.notify}|${device.me}|${device.live?.secret ?? ''}|${device.onboarded}`;
  if (key !== prevKey) {
    prevKey = key;
    void syncPush();
  }
}

let started = false;
let lastCheck = 0;

/** Einmal beim App-Start aufrufen (nach startLive). */
export function startNotify() {
  if (started || typeof window === 'undefined') return;
  started = true;
  prevData = getData();
  prevMe = getDevice().me;
  // Mit Mitteilungen (aber ohne Push) bleibt die Live-Verbindung im Hintergrund offen.
  setKeepAliveHidden(() => notifyActive() && state.push !== 'on');
  subscribe(onStoreChange);
  onSent(onOutgoing);
  let wasOnline = false;
  onLiveStatus(() => {
    const online = getLiveStatus().state === 'online';
    if (online && !wasOnline) void syncPush();
    wasOnline = online;
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    refreshPermission();
    // Push-Abos können sich ändern (z. B. nach einem Browser-Update) – ab und zu nachsehen.
    if (Date.now() - lastCheck > HOUR) {
      lastCheck = Date.now();
      void syncPush();
    }
  });
  navigator.permissions
    ?.query({ name: 'notifications' })
    .then((st) => st.addEventListener('change', refreshPermission))
    .catch(() => undefined);
  onStoreChange();
}
