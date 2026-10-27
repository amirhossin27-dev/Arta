import { useEffect, useState } from 'react';
import { buildFeedDoc, CAL_FEED_PREFIX, deriveCalKey, loadFeedFp, saveFeedFp, sealFeed } from './calendar';
import { deriveRoom, liveAvailable } from './live';
import { LIVE_DB_URL, PUSH_RELAY_URL } from './liveConfig';
import { hashString } from './random';
import { getData, getDevice, subscribe, useDevice } from './store';
import type { PersonId } from './types';

/**
 * Hält den eigenen Eintrag fürs Kalender-Abo (`cal-feed-<a|b>`, siehe calendar.ts) aktuell:
 * Ändert sich ein Termin – hier oder über den Live-Sync vom Schatz –, wird er neu hochgeladen.
 * Was zuletzt oben liegt, merkt sich das Handy als Fingerabdruck, damit beim Öffnen nicht jedes
 * Mal neu geschrieben wird.
 */

/** Zwei 32-bit-Hashes – genug, um „hat sich etwas geändert?“ zu beantworten. */
const fingerprint = (s: string) => `${hashString(s).toString(36)}${hashString(`${s.length}:${s}`).toString(36)}`;

let timer: number | undefined;
let writing = false;
let again = false;
let retries = 0;
let lastInput: unknown[] = [];

function schedule(delay = 1500) {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void write(), delay);
}

async function write() {
  if (writing) {
    again = true;
    return;
  }
  const device = getDevice();
  const secret = device.live?.secret;
  if (!device.onboarded || !secret || !liveAvailable()) return;
  writing = true;
  try {
    const doc = buildFeedDoc(getData(), device.me, new Date().getFullYear());
    const [{ id }, { key }] = await Promise.all([deriveRoom(secret), deriveCalKey(secret)]);
    const fp = `${id}|${device.me}|${fingerprint(JSON.stringify(doc))}`;
    if (fp === loadFeedFp()) return;
    const node = await sealFeed(doc, key);
    const res = await fetch(`${LIVE_DB_URL}/rooms/${id}/${CAL_FEED_PREFIX}${device.me}.json?print=silent`, { method: 'PUT', body: JSON.stringify(node) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    saveFeedFp(fp);
    retries = 0;
  } catch {
    // offline oder Datenbank hakt – später noch einmal
    schedule(Math.min(120_000, 5000 * 2 ** retries++));
  } finally {
    writing = false;
    if (again) {
      again = false;
      schedule(200);
    }
  }
}

function onStoreChange() {
  const d = getData();
  const device = getDevice();
  // Nur was im Kalender landet: Termine, Namen, Jahrestag – und in welchem Raum wir sind.
  const input = [d.events, d.persons.a.name, d.persons.b.name, d.couple.anniversary, d.couple.updatedAt, device.live?.secret, device.me, device.onboarded];
  if (input.every((v, i) => v === lastInput[i])) return;
  lastInput = input;
  schedule();
}

let started = false;

/** Einmal beim App-Start aufrufen (nach startLive). */
export function startCalendarFeed() {
  if (started || typeof window === 'undefined' || !liveAvailable()) return;
  started = true;
  subscribe(onStoreChange);
  window.addEventListener('online', () => schedule(500));
  onStoreChange();
}

// ───── Abo-Adresse ─────

export interface CalendarUrls {
  /** Zum Antippen auf dem iPhone: öffnet „Kalender abonnieren?“. */
  webcal: string;
  /** Zum Kopieren (Einstellungen → Kalender → Accounts, Google Kalender …). */
  https: string;
}

/** Abo-Adresse für `person`. Steckt den Kalender-Schlüssel – also nicht weitergeben. */
export async function calendarUrls(secret: string, person: PersonId): Promise<CalendarUrls | undefined> {
  if (!PUSH_RELAY_URL || !LIVE_DB_URL) return undefined;
  const [{ id }, { raw }] = await Promise.all([deriveRoom(secret), deriveCalKey(secret)]);
  const host = new URL(LIVE_DB_URL).host;
  const https = `${PUSH_RELAY_URL}/kalender/${host}/${id}/${raw}/${person}.ics`;
  return { https, webcal: https.replace(/^https?:/, 'webcal:') };
}

export function useCalendarUrls(): CalendarUrls | undefined {
  const device = useDevice();
  const [urls, setUrls] = useState<CalendarUrls>();
  const secret = device.live?.secret;
  useEffect(() => {
    setUrls(undefined);
    if (!secret || !liveAvailable()) return;
    let alive = true;
    calendarUrls(secret, device.me)
      .then((u) => alive && setUrls(u))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [secret, device.me]);
  return urls;
}
