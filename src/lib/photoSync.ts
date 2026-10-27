import { deriveRoom, getLiveStatus, isLive, onLiveStatus, type LiveNode, type RoomKeys } from './live';
import { LIVE_DB_URL } from './liveConfig';
import { deletePhoto, justSaved, loadPhotoIndex, localPhotoIds, makeThumb, readPhoto, savePhoto } from './photoStore';
import { planPhotoSync, requestSlide } from './photos';
import { actions, getData, getDevice, subscribe } from './store';
import { fromB64Url, toB64Url } from './sync';

/**
 * Fotos zum anderen Handy bringen: Jedes Bild liegt einmal verschlüsselt im Foto-Raum des
 * Live-Syncs (`rooms/<photos>/<Foto-ID>`, gleiche Datenbank-Regeln wie die Geräte-Stände).
 * Das andere Handy holt es sich genau einmal und speichert es selbst. Welche Fotos es gibt,
 * steht in der kleinen `photos`-Sammlung, die wie alles andere synchronisiert wird.
 */

/** Erstes Byte im Klartext: Art des Inhalts (für spätere Formate). */
const KIND_JPEG = 1;

export async function sealPhoto(bytes: Uint8Array, key: CryptoKey, at = Date.now()): Promise<LiveNode> {
  const plain = new Uint8Array(bytes.length + 1);
  plain[0] = KIND_JPEG;
  plain.set(bytes, 1);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain);
  return { v: 1, at, iv: toB64Url(iv), ct: toB64Url(new Uint8Array(ct)) };
}

export async function unsealPhoto(node: LiveNode, key: CryptoKey): Promise<Uint8Array<ArrayBuffer>> {
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64Url(node.iv) }, key, fromB64Url(node.ct)));
  if (plain[0] !== KIND_JPEG) throw new Error('Unbekanntes Bildformat');
  return plain.slice(1);
}

let keys: { secret: string; ready: Promise<RoomKeys> } | null = null;

function roomKeys(): Promise<RoomKeys> | undefined {
  const secret = getDevice().live?.secret;
  if (!secret) return undefined;
  if (keys?.secret !== secret) keys = { secret, ready: deriveRoom(secret) };
  return keys.ready;
}

const photoUrl = (room: string, id?: string) => `${LIVE_DB_URL}/rooms/${room}${id ? `/${id}` : ''}.json`;

// ───── Abgleich ─────

let timer: number | undefined;
let running = false;
let again = false;
let retries = 0;

function schedule(delay: number) {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void runSync(), delay);
}

/** Später nochmal schauen (Bild noch unterwegs oder Netz weg) – mit wachsenden Pausen. */
function retryLater() {
  const delay = Math.min(15 * 60_000, 30_000 * 2 ** retries);
  retries++;
  schedule(delay);
}

async function runSync() {
  if (running) {
    again = true;
    return;
  }
  running = true;
  try {
    const waiting = await syncOnce();
    if (waiting) retryLater();
    else retries = 0;
  } catch {
    retryLater();
  } finally {
    running = false;
    if (again) {
      again = false;
      schedule(0);
    }
  }
}

/** Ein Durchgang. Liefert `true`, wenn noch Bilder fehlen. */
async function syncOnce(): Promise<boolean> {
  await loadPhotoIndex();
  const me = getDevice().me;

  // Gelöschte (oder nach „Alles löschen“ verwaiste) Bilder auch hier wegräumen.
  for (const id of localPhotoIds()) {
    const p = getData().photos[id];
    if (p ? p.deleted : !justSaved(id)) await deletePhoto(id).catch(() => undefined);
  }

  const ready = roomKeys();
  if (!ready || !isLive() || navigator.onLine === false || document.visibilityState === 'hidden') return false;
  const { photos: room, key } = await ready;

  // Nur die Namen der Einträge – die Bilder selbst werden einzeln und nur bei Bedarf geladen.
  const res = await fetch(`${photoUrl(room)}?shallow=true`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const remote = new Set(Object.keys(((await res.json()) as Record<string, unknown> | null) ?? {}));
  const plan = planPhotoSync({ photos: getData().photos, local: localPhotoIds(), remote, me, now: Date.now() });
  let missing = plan.waiting;

  for (const id of plan.upload) {
    const bytes = await readPhoto(id, 'full');
    if (!bytes) continue;
    const node = await sealPhoto(new Uint8Array(bytes), key);
    const put = await fetch(`${photoUrl(room, id)}?print=silent`, { method: 'PUT', body: JSON.stringify(node) });
    if (!put.ok) throw new Error(`HTTP ${put.status}`);
    actions.markPhotoReady(id);
  }
  plan.markReady.forEach((id) => actions.markPhotoReady(id));

  const fresh: string[] = [];
  for (const id of plan.download) {
    const got = await fetch(photoUrl(room, id));
    if (!got.ok) throw new Error(`HTTP ${got.status}`);
    const node = (await got.json()) as LiveNode | null;
    if (!node?.ct) {
      missing++;
      continue;
    }
    let full: Blob;
    try {
      full = new Blob([await unsealPhoto(node, key)], { type: 'image/jpeg' });
    } catch {
      continue; // fremder oder beschädigter Eintrag
    }
    // Inzwischen gelöscht? Dann nicht mehr speichern.
    const p = getData().photos[id];
    if (!p || p.deleted) continue;
    await savePhoto(id, full, await makeThumb(full));
    fresh.push(id);
  }

  for (const id of plan.remove) {
    await fetch(photoUrl(room, id), { method: 'DELETE' }).catch(() => undefined);
  }

  // Ein frisch angekommenes Foto vom Schatz gleich einmal zeigen.
  const newest = fresh
    .map((id) => getData().photos[id])
    .filter((p) => p && p.by !== me && Date.now() - p.createdAt < 2 * 86_400_000)
    .sort((a, b) => b.createdAt - a.createdAt)[0];
  if (newest && (getDevice().photoFreq ?? 'normal') !== 'aus') {
    const name = getData().persons[newest.by].name;
    requestSlide({ id: newest.id, label: fresh.length > 1 ? `${fresh.length} neue Fotos von ${name} 💞` : `Neues Foto von ${name} 💞` });
  }
  return missing > 0;
}

// ───── Start ─────

/** Kurzer Fingerabdruck der Foto-Liste: Nur wenn sich daran etwas ändert, lohnt ein Abgleich. */
function fingerprint(): string {
  const d = getData();
  const parts = Object.values(d.photos).map((p) => `${p.id}:${p.updatedAt}`);
  return `${getDevice().live?.secret ?? ''}|${getDevice().me}|${parts.sort().join(',')}`;
}

let started = false;

/** Einmal beim App-Start aufrufen. */
export function startPhotos() {
  if (started || typeof indexedDB === 'undefined') return;
  started = true;
  let last = fingerprint();
  subscribe(() => {
    const next = fingerprint();
    if (next === last) return;
    last = next;
    retries = 0;
    schedule(800);
  });
  let wasOnline = false;
  onLiveStatus(() => {
    const online = getLiveStatus().state === 'online';
    if (online && !wasOnline) schedule(500);
    wasOnline = online;
  });
  window.addEventListener('online', () => schedule(0));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && retries > 0) schedule(1500);
  });
  schedule(1500);
}
