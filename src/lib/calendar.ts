import { useSyncExternalStore } from 'react';
import { anniversaryEvent } from './events';
import { feedHead, validZone, vevent, vtimezone, type VeventNames } from './ics';
import { fromB64Url, toB64Url } from './sync';
import type { AppData, PersonId } from './types';

/**
 * Kalender-Abo fürs iPhone: Jedes Handy legt seine Sicht auf eure Termine als `cal-feed-a` bzw.
 * `cal-feed-b` in den Live-Raum – verschlüsselt mit einem eigenen Kalender-Schlüssel, der aus dem
 * Raum-Geheimnis abgeleitet wird. Der Push-Relay (push-relay/worker.js) bekommt diesen Schlüssel
 * nur über die Abo-Adresse im iPhone-Kalender, entschlüsselt beide Einträge, führt sie zusammen
 * (neuester Stand je Termin gewinnt) und liefert eine ganz normale .ics-Datei aus.
 *
 * Holt ein Kalender das Abo ab, hinterlässt der Relay `cal-seen-a` / `cal-seen-b`
 * ({ v: 1, at: Serverzeit, iv: "seen", ct: … }) – so sieht Arta, dass das Abo läuft.
 */
export const CAL_FEED_PREFIX = 'cal-feed-';
export const CAL_SEEN_PREFIX = 'cal-seen-';
export const isCal = (name: string) => name.startsWith('cal-');

export interface FeedEntry {
  id: string;
  /** Stand des Termins (updatedAt) – der Relay nimmt je Termin den neuesten. */
  t: number;
  del?: 1;
  ics?: string;
}

/** Inhalt eines `cal-feed-…`-Eintrags (verschlüsselt). */
export interface FeedDoc {
  v: 1;
  person: PersonId;
  head: string;
  zones: Record<string, string>;
  events: FeedEntry[];
}

/**
 * Baut den Abo-Inhalt aus den Daten. Gleiche Daten → gleiches Ergebnis, egal auf welchem Handy
 * (die Uhrzeiten hängen an der Zeitzone des Termins, nicht an der des Handys).
 */
export function buildFeedDoc(d: AppData, person: PersonId, year: number): FeedDoc {
  const names: VeventNames = { a: d.persons.a.name, b: d.persons.b.name };
  const zones: Record<string, string> = {};
  const events: FeedEntry[] = [];
  const all = Object.values(d.events);
  const ann = anniversaryEvent(d);
  if (ann) all.push(ann);
  else if (d.couple.updatedAt) events.push({ id: 'jahrestag', t: d.couple.updatedAt, del: 1 });
  for (const e of all.sort((x, y) => x.id.localeCompare(y.id))) {
    if (e.deleted) {
      events.push({ id: e.id, t: e.updatedAt, del: 1 });
      continue;
    }
    const tz = validZone(e.tz) ? e.tz : 'Europe/Berlin';
    if (e.time && !zones[tz]) zones[tz] = vtimezone(tz, year);
    events.push({ id: e.id, t: e.updatedAt, ics: vevent({ ...e, tz }, names) });
  }
  return { v: 1, person, head: feedHead(names), zones, events };
}

// ───── Schlüssel & Verpacken ─────

const enc = new TextEncoder();

/** Kalender-Schlüssel aus dem Raum-Geheimnis – taugt nur für das Abo, nicht für eure übrigen Daten. */
export async function deriveCalKey(secret: string): Promise<{ raw: string; key: CryptoKey }> {
  const base = await crypto.subtle.importKey('raw', fromB64Url(secret), 'HKDF', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('arta-live-v1'), info: enc.encode('calendar') }, base, 256));
  const key = await crypto.subtle.importKey('raw', bits, 'AES-GCM', false, ['encrypt', 'decrypt']);
  return { raw: toB64Url(bits), key };
}

export interface CalNode {
  v: 1;
  at: number;
  iv: string;
  ct: string;
}

/** Ohne Komprimieren, damit der Relay nur entschlüsseln muss. */
export async function sealFeed(doc: FeedDoc, key: CryptoKey, at = Date.now()): Promise<CalNode> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(doc)));
  return { v: 1, at, iv: toB64Url(iv), ct: toB64Url(new Uint8Array(ct)) };
}

export async function openFeed(node: CalNode, key: CryptoKey): Promise<FeedDoc> {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64Url(node.iv) }, key, fromB64Url(node.ct));
  return JSON.parse(new TextDecoder().decode(plain)) as FeedDoc;
}

// ───── Was liegt schon oben? ─────

const FP_KEY = 'arta.cal.v1';

/** Fingerabdruck des zuletzt hochgeladenen eigenen Eintrags (Raum, Person, Inhalt). */
export function loadFeedFp(): string | undefined {
  try {
    return globalThis.localStorage?.getItem(FP_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export function saveFeedFp(fp: string | undefined) {
  try {
    if (fp) globalThis.localStorage?.setItem(FP_KEY, fp);
    else globalThis.localStorage?.removeItem(FP_KEY);
  } catch {
    // dann eben beim nächsten Start noch einmal hochladen
  }
}

// ───── Hat ein Kalender schon abgeholt? ─────

let seen: Partial<Record<PersonId, number>> = {};
const listeners = new Set<() => void>();

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const getSeen = () => seen;

/** Wann der Kalender von a bzw. b das Abo zuletzt abgeholt hat. */
export function useCalSeen(): Partial<Record<PersonId, number>> {
  return useSyncExternalStore(subscribe, getSeen, getSeen);
}

function setSeen(next: Partial<Record<PersonId, number>>) {
  seen = next;
  listeners.forEach((l) => l());
}

/** Ein `cal-…`-Eintrag aus dem Live-Raum (die Feeds selbst liest nur der Relay). */
export function applyCalNode(name: string, node: unknown) {
  if (!name.startsWith(CAL_SEEN_PREFIX)) return;
  const person = name.slice(CAL_SEEN_PREFIX.length);
  if (person !== 'a' && person !== 'b') return;
  const at = (node as { at?: unknown } | null)?.at;
  if (typeof at === 'number') {
    if (seen[person] !== at) setSeen({ ...seen, [person]: at });
  } else if (seen[person] !== undefined) {
    const next = { ...seen };
    delete next[person];
    setSeen(next);
  }
}

export function clearCal() {
  if (Object.keys(seen).length) setSeen({});
}
