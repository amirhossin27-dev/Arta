export type PersonId = 'a' | 'b';
export type MealType = 'fruehstueck' | 'mittag' | 'abend' | 'snack';
export type Place = 'zuhause' | 'draussen' | 'zusammen';
export type Slot = 'morgens' | 'mittags' | 'abends';
export type ShopCategory =
  | 'obst'
  | 'kuehl'
  | 'fleisch'
  | 'brot'
  | 'vorrat'
  | 'tk'
  | 'getraenke'
  | 'drogerie'
  | 'sonstiges';

/** Jeder synchronisierte Datensatz trägt eine ID und einen Zeitstempel (last-writer-wins). */
export interface Rec {
  id: string;
  updatedAt: number;
  deleted?: boolean;
}

export interface Person extends Rec {
  id: PersonId;
  name: string;
  emoji: string;
  weightKg: number;
  kcalGoal: number;
  favorites: string[];
}

export interface Couple extends Rec {
  id: 'couple';
  anniversary?: string;
  weeklyGoal: number;
}

export interface PlanItem extends Rec {
  date: string;
  personId: PersonId;
  exerciseId: string;
  slot: Slot;
  time?: string;
  /** Gemeinsame Einheiten teilen sich eine groupId (ein Eintrag pro Person). */
  groupId?: string;
  createdBy: PersonId;
  done: boolean;
  doneAt?: number;
}

export interface MealEntry extends Rec {
  date: string;
  personId: PersonId;
  meal: MealType;
  name: string;
  emoji: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  recipeId?: string;
  createdBy: PersonId;
}

export interface ShoppingItem extends Rec {
  name: string;
  qty?: number;
  unit?: string;
  category: ShopCategory;
  done: boolean;
  addedBy: PersonId;
  createdAt: number;
}

export interface LoveNote extends Rec {
  from: PersonId;
  to: PersonId;
  text: string;
  kind: 'note' | 'cheer';
  /** Überraschungen werden beim Gegenüber zu einem zufälligen Zeitpunkt eingeblendet. */
  surprise: boolean;
  createdAt: number;
  seen: boolean;
}

export interface Coupon extends Rec {
  from: PersonId;
  to: PersonId;
  title: string;
  emoji: string;
  createdAt: number;
  redeemedAt?: number;
}

export interface Mood extends Rec {
  date: string;
  personId: PersonId;
  mood: string;
}

export interface Hearts extends Rec {
  date: string;
  from: PersonId;
  count: number;
}

/**
 * Spielbilanz pro Spiel und Gerät (ID `${game}-${deviceId}`). Jedes Gerät schreibt nur seine
 * eigene Zeile, deshalb gehen beim last-writer-wins-Sync keine Siege verloren.
 */
export interface GameStat extends Rec {
  game: string;
  best: Partial<Record<PersonId, number>>;
  wins: Partial<Record<PersonId, number>>;
  draws: number;
  plays: number;
  lastAt: number;
}

export interface AppData {
  v: 1;
  persons: Record<PersonId, Person>;
  couple: Couple;
  plan: Record<string, PlanItem>;
  meals: Record<string, MealEntry>;
  shopping: Record<string, ShoppingItem>;
  notes: Record<string, LoveNote>;
  coupons: Record<string, Coupon>;
  moods: Record<string, Mood>;
  hearts: Record<string, Hearts>;
  games: Record<string, GameStat>;
}

export type CollectionKey = 'plan' | 'meals' | 'shopping' | 'notes' | 'coupons' | 'moods' | 'hearts' | 'games';
export type RecOf<K extends CollectionKey> = AppData[K][string];

export const COLLECTIONS: CollectionKey[] = ['plan', 'meals', 'shopping', 'notes', 'coupons', 'moods', 'hearts', 'games'];

export type PopupFreq = 'oft' | 'normal' | 'selten' | 'aus';

/** Gerätebezogene Einstellungen – werden nicht synchronisiert. */
export interface DeviceState {
  deviceId: string;
  me: PersonId;
  onboarded: boolean;
  popupFreq: PopupFreq;
  lastDailyPopup?: string;
  lastSyncAt?: number;
  /** Retro-Sounds in den Spielen (Standard: an). */
  sound?: boolean;
  /** Gemeinsamer Live-Sync-Raum (Echtzeit über das Internet). */
  live?: LiveRoom;
}

/**
 * Zugang zum Live-Sync-Raum. Aus `secret` werden Raum-Adresse und Schlüssel abgeleitet;
 * es reist nur in Einladungslinks. `since` entscheidet, welcher Raum gilt (der neuere gewinnt).
 */
export interface LiveRoom {
  secret: string;
  since: number;
  /** Nur auf dem Gerät: wann der Partner zum ersten Mal live aufgetaucht ist. */
  linkedAt?: number;
}

export function other(p: PersonId): PersonId {
  return p === 'a' ? 'b' : 'a';
}
