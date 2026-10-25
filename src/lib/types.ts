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
}

export type CollectionKey = 'plan' | 'meals' | 'shopping' | 'notes' | 'coupons' | 'moods' | 'hearts';
export type RecOf<K extends CollectionKey> = AppData[K][string];

export const COLLECTIONS: CollectionKey[] = ['plan', 'meals', 'shopping', 'notes', 'coupons', 'moods', 'hearts'];

export type PopupFreq = 'oft' | 'normal' | 'selten' | 'aus';

/** Gerätebezogene Einstellungen – werden nicht synchronisiert. */
export interface DeviceState {
  deviceId: string;
  me: PersonId;
  onboarded: boolean;
  popupFreq: PopupFreq;
  lastDailyPopup?: string;
  lastSyncAt?: number;
}

export function other(p: PersonId): PersonId {
  return p === 'a' ? 'b' : 'a';
}
