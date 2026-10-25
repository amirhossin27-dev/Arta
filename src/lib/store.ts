import { useSyncExternalStore } from 'react';
import {
  COLLECTIONS,
  other,
  type AppData,
  type CollectionKey,
  type Couple,
  type CycleDay,
  type CycleSettings,
  type DeviceState,
  type MealEntry,
  type Person,
  type PersonId,
  type PopupFreq,
  type RecOf,
  type ShopCategory,
  type Slot,
} from './types';
import { uid } from './random';
import { MERGE_DAYS } from './cycle';
import { diffDays, todayKey } from './date';

const DATA_KEY = 'arta.data.v1';
const DEVICE_KEY = 'arta.device.v1';
const TOMBSTONE_TTL_DAYS = 90;

export function defaultPerson(id: PersonId): Person {
  return {
    id,
    name: id === 'a' ? 'Ich' : 'Schatz',
    emoji: id === 'a' ? '🦁' : '🦋',
    weightKg: 70,
    kcalGoal: 2000,
    favorites: [],
    updatedAt: 0,
  };
}

export function emptyData(): AppData {
  return {
    v: 1,
    persons: { a: defaultPerson('a'), b: defaultPerson('b') },
    couple: { id: 'couple', weeklyGoal: 10, updatedAt: 0 },
    plan: {},
    meals: {},
    shopping: {},
    notes: {},
    coupons: {},
    moods: {},
    hearts: {},
    games: {},
    periods: {},
    cycleDays: {},
  };
}

function defaultDevice(): DeviceState {
  return { deviceId: uid(), me: 'a', onboarded: false, popupFreq: 'normal' };
}

/** Ergänzt fehlende Felder, damit alte oder fremde Stände nicht abstürzen. */
export function normalizeData(raw: unknown): AppData {
  const base = emptyData();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<AppData>;
  const out: AppData = {
    ...base,
    persons: {
      a: { ...base.persons.a, ...(r.persons?.a ?? {}), id: 'a' },
      b: { ...base.persons.b, ...(r.persons?.b ?? {}), id: 'b' },
    },
    couple: { ...base.couple, ...(r.couple ?? {}), id: 'couple' },
  };
  for (const key of COLLECTIONS) {
    const col = r[key];
    if (col && typeof col === 'object') {
      const clean: Record<string, unknown> = {};
      for (const [id, rec] of Object.entries(col)) {
        if (rec && typeof rec === 'object' && typeof (rec as { updatedAt?: unknown }).updatedAt === 'number') {
          clean[id] = { ...rec, id };
        }
      }
      (out as unknown as Record<string, unknown>)[key] = clean;
    }
  }
  return out;
}

function pruneTombstones(d: AppData): AppData {
  const limit = Date.now() - TOMBSTONE_TTL_DAYS * 86_400_000;
  const out = { ...d } as AppData;
  for (const key of COLLECTIONS) {
    const col = d[key] as Record<string, { deleted?: boolean; updatedAt: number }>;
    const kept = Object.fromEntries(Object.entries(col).filter(([, r]) => !(r.deleted && r.updatedAt < limit)));
    (out as unknown as Record<string, unknown>)[key] = kept;
  }
  return out;
}

function read(key: string): unknown {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
}

function write(key: string, value: unknown) {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // Speicher voll oder privat – die App läuft trotzdem weiter.
  }
}

let data: AppData = pruneTombstones(normalizeData(read(DATA_KEY)));
let device: DeviceState = { ...defaultDevice(), ...((read(DEVICE_KEY) as Partial<DeviceState>) ?? {}) };
if (!read(DEVICE_KEY)) write(DEVICE_KEY, device);

const listeners = new Set<() => void>();
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const emit = () => listeners.forEach((l) => l());

export const getData = () => data;
export const getDevice = () => device;

export function useData(): AppData {
  return useSyncExternalStore(subscribe, getData, getData);
}

export function useDevice(): DeviceState {
  return useSyncExternalStore(subscribe, getDevice, getDevice);
}

let lastStamp = 0;
/** Streng monoton steigende Zeitstempel für last-writer-wins. */
export function stamp(): number {
  const now = Date.now();
  lastStamp = now > lastStamp ? now : lastStamp + 1;
  return lastStamp;
}

/** Nach einem Sync: eigene Änderungen sollen neuer sein als alles Gesehene. */
export function observeStamp(ts: number) {
  if (ts > lastStamp) lastStamp = ts;
}

export function commitData(next: AppData) {
  data = next;
  write(DATA_KEY, data);
  emit();
}

function commitDevice(changes: Partial<DeviceState>) {
  device = { ...device, ...changes };
  write(DEVICE_KEY, device);
  emit();
}

function withRec<K extends CollectionKey>(d: AppData, key: K, rec: RecOf<K>): AppData {
  return { ...d, [key]: { ...d[key], [rec.id]: { ...rec, updatedAt: stamp() } } } as AppData;
}

function patch<K extends CollectionKey>(key: K, id: string, changes: Partial<RecOf<K>>) {
  const cur = data[key][id] as RecOf<K> | undefined;
  if (!cur) return;
  commitData(withRec(data, key, { ...cur, ...changes }));
}

export type Who = 'me' | 'partner' | 'both';

function targets(who: Who): PersonId[] {
  const me = device.me;
  if (who === 'both') return [me, other(me)];
  return who === 'me' ? [me] : [other(me)];
}

export const actions = {
  // ───── Profil & Paar ─────
  updatePerson(id: PersonId, changes: Partial<Omit<Person, 'id' | 'updatedAt'>>) {
    commitData({ ...data, persons: { ...data.persons, [id]: { ...data.persons[id], ...changes, updatedAt: stamp() } } });
  },

  updateCouple(changes: Partial<Omit<Couple, 'id' | 'updatedAt'>>) {
    commitData({ ...data, couple: { ...data.couple, ...changes, updatedAt: stamp() } });
  },

  toggleFavorite(recipeId: string): boolean {
    const me = data.persons[device.me];
    const isFav = me.favorites.includes(recipeId);
    actions.updatePerson(me.id, {
      favorites: isFav ? me.favorites.filter((f) => f !== recipeId) : [...me.favorites, recipeId],
    });
    return !isFav;
  },

  setupCouple(input: { meName: string; meEmoji: string; partnerName: string; partnerEmoji: string; anniversary?: string }) {
    const t = stamp();
    commitData({
      ...data,
      persons: {
        a: { ...data.persons.a, name: input.meName, emoji: input.meEmoji, updatedAt: t },
        b: { ...data.persons.b, name: input.partnerName, emoji: input.partnerEmoji, updatedAt: t },
      },
      couple: { ...data.couple, anniversary: input.anniversary || undefined, updatedAt: t },
    });
    commitDevice({ me: 'a', onboarded: true });
  },

  // ───── Sport ─────
  addPlan(input: { date: string; exerciseId: string; slot: Slot; time?: string; who: Who }) {
    const groupId = input.who === 'both' ? uid() : undefined;
    let d = data;
    for (const personId of targets(input.who)) {
      d = withRec(d, 'plan', {
        id: uid(),
        date: input.date,
        personId,
        exerciseId: input.exerciseId,
        slot: input.slot,
        time: input.time || undefined,
        groupId,
        createdBy: device.me,
        done: false,
        updatedAt: 0,
      });
    }
    commitData(d);
  },

  setPlanDone(id: string, done: boolean) {
    patch('plan', id, { done, doneAt: done ? Date.now() : undefined });
  },

  removePlan(id: string) {
    patch('plan', id, { deleted: true });
  },

  // ───── Essen ─────
  addMeal(input: Omit<MealEntry, 'id' | 'updatedAt' | 'createdBy' | 'personId'> & { who: Who }) {
    const { who, ...entry } = input;
    let d = data;
    for (const personId of targets(who)) {
      d = withRec(d, 'meals', { ...entry, id: uid(), personId, createdBy: device.me, updatedAt: 0 });
    }
    commitData(d);
  },

  removeMeal(id: string) {
    patch('meals', id, { deleted: true });
  },

  // ───── Einkauf ─────
  /** Fügt Artikel hinzu; gleiche offene Artikel mit gleicher Einheit werden zusammengezählt. */
  addShopping(items: { name: string; qty?: number; unit?: string; category: ShopCategory }[]): number {
    let d = data;
    let added = 0;
    for (const item of items) {
      const existing = Object.values(d.shopping).find(
        (s) => !s.deleted && !s.done && s.name.toLowerCase() === item.name.toLowerCase() && s.unit === item.unit,
      );
      if (existing) {
        d = withRec(d, 'shopping', {
          ...existing,
          qty: existing.qty !== undefined && item.qty !== undefined ? round2(existing.qty + item.qty) : existing.qty ?? item.qty,
        });
      } else {
        d = withRec(d, 'shopping', {
          id: uid(),
          name: item.name,
          qty: item.qty,
          unit: item.unit,
          category: item.category,
          done: false,
          addedBy: device.me,
          createdAt: Date.now(),
          updatedAt: 0,
        });
        added++;
      }
    }
    commitData(d);
    return added;
  },

  setShoppingDone(id: string, done: boolean) {
    patch('shopping', id, { done });
  },

  setShoppingCategory(id: string, category: ShopCategory) {
    patch('shopping', id, { category });
  },

  removeShopping(id: string) {
    patch('shopping', id, { deleted: true });
  },

  clearDoneShopping() {
    let d = data;
    for (const s of Object.values(data.shopping)) {
      if (s.done && !s.deleted) d = withRec(d, 'shopping', { ...s, deleted: true });
    }
    commitData(d);
  },

  // ───── Liebe ─────
  sendNote(text: string, opts: { kind?: 'note' | 'cheer'; surprise?: boolean } = {}) {
    const me = device.me;
    commitData(
      withRec(data, 'notes', {
        id: uid(),
        from: me,
        to: other(me),
        text: text.trim(),
        kind: opts.kind ?? 'note',
        surprise: opts.surprise ?? false,
        createdAt: Date.now(),
        seen: false,
        updatedAt: 0,
      }),
    );
  },

  markNotesSeen(ids: string[]) {
    let d = data;
    for (const id of ids) {
      const n = d.notes[id];
      if (n && !n.seen) d = withRec(d, 'notes', { ...n, seen: true });
    }
    if (d !== data) commitData(d);
  },

  deleteNote(id: string) {
    patch('notes', id, { deleted: true });
  },

  sendHeart(): number {
    const date = todayKey();
    const id = `${date}-${device.me}`;
    const cur = data.hearts[id];
    const count = (cur && !cur.deleted ? cur.count : 0) + 1;
    commitData(withRec(data, 'hearts', { id, date, from: device.me, count, updatedAt: 0 }));
    return count;
  },

  /** Standardmäßig schenkst du; nach einem Spiel-Einsatz schenkt der Verlierer (`from`). */
  addCoupon(title: string, emoji: string, from: PersonId = device.me) {
    commitData(
      withRec(data, 'coupons', { id: uid(), from, to: other(from), title, emoji, createdAt: Date.now(), updatedAt: 0 }),
    );
  },

  redeemCoupon(id: string) {
    patch('coupons', id, { redeemedAt: Date.now() });
  },

  deleteCoupon(id: string) {
    patch('coupons', id, { deleted: true });
  },

  setMood(mood: string) {
    const date = todayKey();
    const id = `${date}-${device.me}`;
    commitData(withRec(data, 'moods', { id, date, personId: device.me, mood, updatedAt: 0 }));
  },

  // ───── Zyklus ─────
  setupCycle(settings: CycleSettings, lastStart?: string) {
    actions.updateCouple({ cycle: settings });
    if (lastStart) actions.startPeriod(lastStart);
  },

  updateCycle(changes: Partial<CycleSettings>) {
    const cur = data.couple.cycle;
    if (cur) actions.updateCouple({ cycle: { ...cur, ...changes } });
  },

  /** Kalender ausschalten – die Einträge bleiben erhalten, falls ihr ihn wieder einrichtet. */
  disableCycle() {
    actions.updateCouple({ cycle: undefined });
  },

  /** Trägt einen Periodenbeginn ein. Liegt schon einer in der Nähe, wird keiner doppelt angelegt. */
  startPeriod(date: string): string | undefined {
    const owner = data.couple.cycle?.personId;
    if (!owner) return;
    const near = Object.values(data.periods).find((p) => !p.deleted && p.personId === owner && Math.abs(diffDays(p.start, date)) < MERGE_DAYS);
    if (near) {
      if (near.start !== date) patch('periods', near.id, { start: date, end: near.end && near.end >= date ? near.end : undefined });
      return near.id;
    }
    // Feste ID: Tragen beide Handys denselben Beginn ein, wird beim Sync daraus ein Eintrag.
    const id = `${owner}-${date}`;
    commitData(withRec(data, 'periods', { id, personId: owner, start: date, updatedAt: 0 }));
    return id;
  },

  /** Setzt den letzten Periodentag – ohne Datum gilt die Periode wieder als offen. */
  endPeriod(id: string, date?: string) {
    const p = data.periods[id];
    if (p && (!date || date >= p.start)) patch('periods', id, { end: date });
  },

  removePeriod(id: string) {
    patch('periods', id, { deleted: true });
  },

  logCycleDay(date: string, changes: Partial<Pick<CycleDay, 'flow' | 'symptoms' | 'note'>>) {
    const personId = data.couple.cycle?.personId;
    if (!personId) return;
    const id = `${date}-${personId}`;
    const cur = data.cycleDays[id];
    const base: CycleDay = cur && !cur.deleted ? cur : { id, date, personId, symptoms: [], updatedAt: 0 };
    commitData(withRec(data, 'cycleDays', { ...base, ...changes, deleted: undefined }));
  },

  // ───── Spiele ─────
  /** Trägt eine Runde in die Bilanz dieses Geräts ein (Sieg, Unentschieden und/oder Punktzahl). */
  recordGame(game: string, outcome: { winner?: PersonId | 'draw'; score?: number; player?: PersonId; lowerIsBetter?: boolean }) {
    const id = `${game}-${device.deviceId}`;
    const cur = data.games[id];
    const base = cur && !cur.deleted ? cur : { id, game, best: {}, wins: {}, draws: 0, plays: 0, lastAt: 0, updatedAt: 0 };
    const best = { ...base.best };
    const wins = { ...base.wins };
    let draws = base.draws;
    if (outcome.winner === 'draw') draws++;
    else if (outcome.winner) wins[outcome.winner] = (wins[outcome.winner] ?? 0) + 1;
    // 0 Punkte sind kein Rekord – beim Memory (wenig Züge = gut) zählt jede Runde.
    if (outcome.score !== undefined && (outcome.score > 0 || outcome.lowerIsBetter)) {
      const p = outcome.player ?? device.me;
      const prev = best[p];
      const better = prev === undefined || (outcome.lowerIsBetter ? outcome.score < prev : outcome.score > prev);
      if (better) best[p] = outcome.score;
    }
    commitData(withRec(data, 'games', { ...base, best, wins, draws, plays: base.plays + 1, lastAt: Date.now() }));
  },

  // ───── Gerät ─────
  setMe(me: PersonId) {
    commitDevice({ me });
  },

  setPopupFreq(popupFreq: PopupFreq) {
    commitDevice({ popupFreq });
  },

  setSound(sound: boolean) {
    commitDevice({ sound });
  },

  markDailyPopup(date: string) {
    commitDevice({ lastDailyPopup: date });
  },

  markSynced() {
    commitDevice({ lastSyncAt: Date.now() });
  },

  /** Zweites Handy: Daten des Partners übernehmen und selbst die andere Person sein. */
  joinAs(me: PersonId, next: AppData) {
    commitData(next);
    commitDevice({ me, onboarded: true, lastSyncAt: Date.now() });
  },

  resetAll() {
    commitData(emptyData());
    commitDevice({ ...defaultDevice(), deviceId: device.deviceId });
  },
};

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
