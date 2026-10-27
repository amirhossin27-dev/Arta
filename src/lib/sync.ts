import { addDays } from './date';
import { normalizeData, observeStamp } from './store';
import { COLLECTIONS, type AppData, type CollectionKey, type LiveRoom, type PersonId, type Rec } from './types';

/**
 * Paar-Sync ohne Server: Der Datenstand wird komprimiert in einen Link/Code gepackt,
 * per Messenger verschickt und auf dem anderen Handy zusammengeführt (last-writer-wins).
 */
export interface SyncPayload {
  app: 'arta';
  v: 1;
  from: PersonId;
  device: string;
  at: number;
  data: AppData;
  /** Einladung in den gemeinsamen Live-Sync-Raum (nur wenn Live-Sync verfügbar ist). */
  live?: LiveRoom;
}

const DATED: CollectionKey[] = ['plan', 'meals', 'moods', 'hearts', 'cycleDays', 'steps', 'routineDays'];

/** Nur relevante Daten mitschicken, damit der Link kurz bleibt. */
export function buildPayload(d: AppData, from: PersonId, deviceId: string, today: string): SyncPayload {
  const since = addDays(today, -45);
  const recentTs = Date.now() - 120 * 86_400_000;
  const out: AppData = { ...d };
  for (const key of COLLECTIONS) {
    const col = d[key] as Record<string, Rec & { date?: string; done?: boolean; seen?: boolean }>;
    const kept = Object.entries(col).filter(([, r]) => {
      if (DATED.includes(key)) return (r.date ?? '') >= since;
      if (key === 'shopping') return !r.deleted || r.updatedAt > Date.now() - 30 * 86_400_000;
      // Spielbilanzen sind winzig (eine Zeile pro Spiel und Gerät) – immer komplett mitschicken.
      // Dasselbe gilt für Perioden – die Vorhersage braucht die ganze Historie – und für die
      // Foto-Beschreibungen (die Bilder selbst reisen getrennt, siehe photoSync.ts).
      if (key === 'games' || key === 'periods' || key === 'photos') return true;
      return r.updatedAt > recentTs || (key === 'notes' && !r.seen);
    });
    (out as unknown as Record<string, unknown>)[key] = Object.fromEntries(kept);
  }
  return { app: 'arta', v: 1, from, device: deviceId, at: Date.now(), data: out };
}

export interface MergeStats {
  changed: number;
  newNotes: number;
  newSurprises: number;
  newCoupons: number;
  newShopping: number;
  newPlan: number;
  newPhotos: number;
}

function newer<T extends Rec>(local: T | undefined, remote: T): boolean {
  return !local || remote.updatedAt > local.updatedAt;
}

export function mergeData(local: AppData, remoteRaw: AppData, me: PersonId): { data: AppData; stats: MergeStats } {
  const remote = normalizeData(remoteRaw);
  const stats: MergeStats = { changed: 0, newNotes: 0, newSurprises: 0, newCoupons: 0, newShopping: 0, newPlan: 0, newPhotos: 0 };
  let maxTs = 0;
  const out: AppData = { ...local, persons: { ...local.persons } };

  for (const id of ['a', 'b'] as const) {
    const r = remote.persons[id];
    maxTs = Math.max(maxTs, r.updatedAt);
    if (newer(local.persons[id], r)) {
      out.persons[id] = r;
      stats.changed++;
    }
  }
  maxTs = Math.max(maxTs, remote.couple.updatedAt);
  if (newer(local.couple, remote.couple)) {
    out.couple = remote.couple;
    stats.changed++;
  }

  for (const key of COLLECTIONS) {
    const localCol = local[key] as Record<string, Rec>;
    const remoteCol = remote[key] as Record<string, Rec>;
    const merged: Record<string, Rec> = { ...localCol };
    for (const [id, rec] of Object.entries(remoteCol)) {
      maxTs = Math.max(maxTs, rec.updatedAt);
      if (!newer(localCol[id], rec)) continue;
      const isNew = !localCol[id];
      merged[id] = rec;
      stats.changed++;
      if (!isNew || rec.deleted) continue;
      if (key === 'notes') {
        const note = rec as unknown as { to: PersonId; surprise: boolean };
        if (note.to === me) {
          if (note.surprise) stats.newSurprises++;
          else stats.newNotes++;
        }
      }
      if (key === 'coupons' && (rec as unknown as { to: PersonId }).to === me) stats.newCoupons++;
      if (key === 'shopping') stats.newShopping++;
      if (key === 'plan') stats.newPlan++;
      if (key === 'photos' && (rec as unknown as { by: PersonId }).by !== me) stats.newPhotos++;
    }
    (out as unknown as Record<string, unknown>)[key] = merged;
  }
  observeStamp(maxTs);
  return { data: out, stats };
}

// ───── Kodierung ─────

export function toB64Url(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64Url(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function pipe(bytes: Uint8Array, transform: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export const canCompress = () => typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';

export async function encodePayload(p: SyncPayload): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(p));
  if (canCompress()) return 'z' + toB64Url(await pipe(bytes, new CompressionStream('deflate-raw')));
  return 'j' + toB64Url(bytes);
}

export class SyncError extends Error {}

export async function decodePayload(code: string): Promise<SyncPayload> {
  let json: string;
  try {
    const body = fromB64Url(code.slice(1));
    if (code[0] === 'z') {
      if (!canCompress()) throw new SyncError('Dieser Browser kann den Code nicht entpacken.');
      json = new TextDecoder().decode(await pipe(body, new DecompressionStream('deflate-raw')));
    } else if (code[0] === 'j') {
      json = new TextDecoder().decode(body);
    } else {
      throw new SyncError('Unbekanntes Code-Format.');
    }
  } catch (e) {
    if (e instanceof SyncError) throw e;
    throw new SyncError('Der Code ist unvollständig oder beschädigt.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new SyncError('Der Code ist beschädigt.');
  }
  return checkPayload(parsed);
}

/** Prüft einen entpackten Stand (aus Link oder Live-Sync) und ergänzt fehlende Felder. */
export function checkPayload(raw: unknown): SyncPayload {
  const p = raw as SyncPayload | null;
  if (p?.app !== 'arta' || p.v !== 1 || (p.from !== 'a' && p.from !== 'b')) {
    throw new SyncError('Das ist kein Arta-Code.');
  }
  const live = isRoom(p.live) ? { secret: p.live.secret, since: p.live.since } : undefined;
  return { ...p, live, data: normalizeData(p.data) };
}

function isRoom(x: unknown): x is LiveRoom {
  const r = x as LiveRoom | undefined;
  return typeof r?.secret === 'string' && /^[A-Za-z0-9_-]{43}$/.test(r.secret) && typeof r.since === 'number';
}

/** Findet den Code in einem Link oder einer eingefügten Nachricht. */
export function extractCode(text: string): string | null {
  const fromLink = text.match(/[#&?]sync=([A-Za-z0-9_-]+)/);
  if (fromLink) return fromLink[1];
  const tokens = text.match(/[zj][A-Za-z0-9_-]{24,}/g);
  if (!tokens) return null;
  return tokens.sort((a, b) => b.length - a.length)[0];
}

export function syncLink(code: string): string {
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#sync=${code}`;
}
