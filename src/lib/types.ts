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
  /** Tägliches Schrittziel. */
  stepGoal: number;
  favorites: string[];
  /** Tägliche Gesundheits-Routinen (z. B. Vitamin D, Schwarzkümmelöl) – pflegt nur das eigene Handy. */
  routines?: Routine[];
}

/** Eine tägliche Gesundheits-Routine. Die ID ist die der Vorlage oder eine zufällige. */
export interface Routine {
  id: string;
  emoji: string;
  name: string;
  /** Uhrzeit (HH:MM) – ordnet die Routine dem Tag zu und ist der Zeitpunkt der Erinnerung. */
  time: string;
  /** Zur Uhrzeit erinnern (Einblendung bzw. Mitteilung). */
  remind: boolean;
}

/** Grundeinstellungen für den Periodenkalender: wessen Zyklus und die üblichen Längen. */
export interface CycleSettings {
  personId: PersonId;
  /** Übliche Zykluslänge in Tagen – gilt, bis genug Perioden eingetragen sind. */
  cycleLength: number;
  /** Übliche Periodendauer in Tagen. */
  periodLength: number;
}

export interface Couple extends Rec {
  id: 'couple';
  anniversary?: string;
  /** Gemeinsames Wochenziel: so viele Sport-Einheiten wollt ihr zusammen pro Woche (Mo–So) abhaken. */
  weeklyGoal: number;
  /** Paar-Serie: zählt ein Tag mit erreichtem Schrittziel auch als aktiver Tag? */
  streakSteps?: boolean;
  cycle?: CycleSettings;
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

export type Flow = 'schmier' | 'leicht' | 'mittel' | 'stark';

/** Eine Periode. Ohne `end` läuft sie noch (oder das Ende wurde nicht eingetragen). */
export interface Period extends Rec {
  personId: PersonId;
  start: string;
  end?: string;
}

/** Tagebuch-Eintrag zum Zyklus (ID `${date}-${personId}`). */
export interface CycleDay extends Rec {
  date: string;
  personId: PersonId;
  flow?: Flow;
  symptoms: string[];
  note?: string;
}

/**
 * Schritte einer Person an einem Tag (ID `${date}-${personId}`). Nur das eigene Handy schreibt
 * diese Zeile – gezählt mit dem Bewegungssensor oder von Hand aus der Health-App übernommen.
 */
export interface StepDay extends Rec {
  date: string;
  personId: PersonId;
  count: number;
  /** Schrittziel an diesem Tag – spätere Zieländerungen schreiben die Vergangenheit nicht um. */
  goal: number;
}

/**
 * Abgehakte Routinen einer Person an einem Tag (ID `${date}-${personId}`), nur das eigene Handy
 * schreibt sie. `total` hält fest, wie viele Routinen es an dem Tag gab.
 */
export interface RoutineDay extends Rec {
  date: string;
  personId: PersonId;
  done: string[];
  total: number;
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
  periods: Record<string, Period>;
  cycleDays: Record<string, CycleDay>;
  steps: Record<string, StepDay>;
  routineDays: Record<string, RoutineDay>;
}

export type CollectionKey =
  | 'plan'
  | 'meals'
  | 'shopping'
  | 'notes'
  | 'coupons'
  | 'moods'
  | 'hearts'
  | 'games'
  | 'periods'
  | 'cycleDays'
  | 'steps'
  | 'routineDays';
export type RecOf<K extends CollectionKey> = AppData[K][string];

export const COLLECTIONS: CollectionKey[] = ['plan', 'meals', 'shopping', 'notes', 'coupons', 'moods', 'hearts', 'games', 'periods', 'cycleDays', 'steps', 'routineDays'];

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
  /** Mitteilungen aufs Handy, wenn der Schatz etwas schickt (`undefined` = noch nicht gefragt). */
  notify?: boolean;
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
