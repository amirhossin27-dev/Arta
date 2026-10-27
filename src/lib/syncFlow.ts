import { todayKey } from './date';
import { adoptRoom, ensureRoom } from './live';
import { heartsOn } from './stats';
import { actions, emptyData, getData, getDevice, commitData } from './store';
import { buildPayload, decodePayload, encodePayload, extractCode, mergeData, syncLink, SyncError, type MergeStats, type SyncPayload } from './sync';
import { other } from './types';

export type ApplyResult =
  | { ok: true; stats: MergeStats; partnerName: string; newHearts: number; liveJoined: boolean }
  | { ok: false; reason: 'own' | 'same-person' | 'invalid'; message: string; payload?: SyncPayload };

export async function readCode(text: string): Promise<SyncPayload> {
  const code = extractCode(text);
  if (!code) throw new SyncError('Kein Arta-Code gefunden. Füge den ganzen Link oder die Nachricht ein.');
  return decodePayload(code);
}

export async function applySync(text: string): Promise<ApplyResult> {
  let payload: SyncPayload;
  try {
    payload = await readCode(text);
  } catch (e) {
    return { ok: false, reason: 'invalid', message: e instanceof Error ? e.message : 'Unbekannter Fehler' };
  }
  const device = getDevice();
  if (payload.device === device.deviceId) {
    return { ok: false, reason: 'own', message: 'Das ist dein eigener Link 😄 Schick ihn deinem Schatz!' };
  }
  if (payload.from === device.me) {
    const name = payload.data.persons[payload.from].name;
    return {
      ok: false,
      reason: 'same-person',
      payload,
      message: `Dieser Code kommt von „${name}“ – aber auf diesem Handy bist du auch als ${getData().persons[device.me].name} eingerichtet.`,
    };
  }
  const today = todayKey();
  const before = heartsOn(getData(), today, payload.from);
  const { data, stats } = mergeData(getData(), payload.data, device.me);
  commitData(data);
  actions.markSynced();
  const liveJoined = adoptRoom(payload.live);
  const newHearts = Math.max(0, heartsOn(data, today, payload.from) - before);
  return { ok: true, stats, partnerName: data.persons[payload.from].name, newHearts, liveJoined };
}

/** Neues Gerät: Stand des Partners übernehmen und selbst die andere Person werden. */
export function joinWith(payload: SyncPayload): { liveJoined: boolean } {
  const { data } = mergeData(emptyData(), payload.data, other(payload.from));
  actions.joinAs(other(payload.from), data);
  return { liveJoined: adoptRoom(payload.live, true) };
}

export async function createShareText(): Promise<{ text: string; link: string }> {
  const d = getData();
  const device = getDevice();
  // Mit Live-Sync lädt der Link gleich in den gemeinsamen Raum ein.
  const live = ensureRoom();
  const payload: SyncPayload = { ...buildPayload(d, device.me, device.deviceId, todayKey()), live };
  const link = syncLink(await encodePayload(payload));
  const me = d.persons[device.me];
  const text = live
    ? `💞 Arta-Update von ${me.name} ${me.emoji}\nTipp auf den Link, dann sind unsere Handys live verbunden – Pläne, Einkäufe & Liebesbotschaften kommen ab dann sofort an:\n${link}`
    : `💞 Arta-Update von ${me.name} ${me.emoji}\nTipp auf den Link, um unsere Pläne, Einkäufe & Liebesbotschaften zu synchronisieren:\n${link}`;
  return { text, link };
}

export function summarize(stats: MergeStats): string {
  const parts: string[] = [];
  if (stats.newNotes) parts.push(`${stats.newNotes} neue Botschaft${stats.newNotes === 1 ? '' : 'en'} 💌`);
  if (stats.newSurprises) parts.push('🎁 eine kleine Überraschung …');
  if (stats.newCoupons) parts.push(`${stats.newCoupons} Gutschein${stats.newCoupons === 1 ? '' : 'e'} 🎟️`);
  if (stats.newPlan) parts.push(`${stats.newPlan} geplante Einheit${stats.newPlan === 1 ? '' : 'en'} 💪`);
  if (stats.newShopping) parts.push(`${stats.newShopping} Einkaufsartikel 🛒`);
  if (stats.newEvents) parts.push(`${stats.newEvents} neue${stats.newEvents === 1 ? 'r' : ''} Termin${stats.newEvents === 1 ? '' : 'e'} 📅`);
  if (!parts.length) return stats.changed ? `${stats.changed} Änderungen übernommen.` : 'Ihr seid schon auf dem gleichen Stand. ✨';
  return parts.join(' · ');
}
