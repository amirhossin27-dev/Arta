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
  /** Kinderwunsch-Modus: Die fruchtbaren Tage werden zur Chance statt zur Warnung. */
  ttc?: boolean;
  /** Seit wann ihr „übt“ – daraus zählt Arta eure Kinderwunsch-Zyklen. */
  ttcSince?: string;
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
  /** Aus der Lebensmittel-Liste eingetragen: welches und wie viel (g bzw. ml). */
  foodId?: string;
  grams?: number;
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
export type TestResult = 'neg' | 'pos';

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
  /** Ovulationstest (LH). Positiv heißt: Der Eisprung kommt meist in den nächsten 12–36 Stunden. */
  lh?: TestResult;
  /** Schwangerschaftstest (hCG). */
  hcg?: TestResult;
}

/**
 * Ein Tag, an dem ihr euch geliebt habt (ID = Datum). Der Eintrag gehört euch beiden, deshalb
 * darf jedes Handy ihn setzen – tragen beide denselben Tag ein, wird beim Sync einer daraus.
 */
export interface LoveDay extends Rec {
  date: string;
  /** Wie oft an diesem Tag. */
  count: number;
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
  /** Zeitpunkt des Apple-Health-Stands, der in `count` steckt (siehe lib/health.ts). */
  healthAt?: number;
  /** Von Hand dazugezählt („+1.000“ für einen Gang ohne Handy) – das kennt Apple Health nicht. */
  extra?: number;
}

export type Repeat = 'woche' | 'monat' | 'jahr';

/**
 * Ein gemeinsamer Termin. Beide Handys dürfen ihn anlegen und ändern – er gehört euch beiden.
 * Ohne `time` ist er ganztägig. Er landet auch im iPhone-Kalender (Kalender-Abo, siehe calendarFeed.ts).
 */
export interface CalEvent extends Rec {
  title: string;
  emoji: string;
  /** Erster Tag (YYYY-MM-DD). */
  date: string;
  /** Beginn (HH:MM) – ohne Uhrzeit ganztägig. */
  time?: string;
  /** Ende (HH:MM); liegt es vor dem Beginn, endet der Termin am nächsten Tag. */
  endTime?: string;
  /** Letzter Tag bei ganztägigen Terminen über mehrere Tage (z. B. Urlaub). */
  endDate?: string;
  place?: string;
  note?: string;
  /** Wen betrifft der Termin? Eingetragen sehen ihn immer beide. */
  who: 'both' | PersonId;
  repeat?: Repeat;
  /** Erinnerung im Kalender: so viele Minuten vorher. */
  alarm?: number;
  /** Zeitzone beim Anlegen – damit 18:00 auf beiden Handys dieselbe Uhrzeit ist. */
  tz: string;
  createdBy: PersonId;
  createdAt: number;
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

/**
 * Ein gemeinsames Foto. Synchronisiert wird nur diese kleine Beschreibung; das Bild selbst liegt
 * auf jedem Handy in der IndexedDB und reist einmalig verschlüsselt über den Live-Raum (lib/photoSync.ts).
 */
export interface Photo extends Rec {
  /** Wer das Foto hinzugefügt hat – nur dieses Handy darf Bildunterschrift ändern oder löschen. */
  by: PersonId;
  createdAt: number;
  /** Seitenverhältnis für Platzhalter, solange das Bild noch unterwegs ist. */
  w: number;
  h: number;
  caption?: string;
  /** Das Bild liegt im Live-Raum bereit – das andere Handy kann es jetzt holen. */
  ready?: boolean;
}

export type MemoColor = 'gelb' | 'rosa' | 'mint' | 'himmel' | 'lila' | 'pfirsich';

/**
 * Eine gemeinsame Notiz (Packliste, Geschenkideen, To-dos …). Sie gehört euch beiden – jedes
 * Handy darf sie ändern. Die Punkte einer Checkliste sind eigene Datensätze (`memoItems`), damit
 * beim Sync keiner verloren geht, wenn ihr gleichzeitig etwas abhakt oder hinzufügt.
 */
export interface Memo extends Rec {
  title: string;
  text: string;
  emoji: string;
  color: MemoColor;
  /** Angepinnte Notizen stehen oben. */
  pinned?: boolean;
  createdBy: PersonId;
  createdAt: number;
  /** Wer Titel, Text, Farbe oder Pin zuletzt geändert hat. */
  editedBy: PersonId;
}

/** Ein Punkt auf der Checkliste einer Notiz. */
export interface MemoItem extends Rec {
  memoId: string;
  text: string;
  done: boolean;
  /** Reihenfolge – neue Punkte kommen ans Ende. */
  pos: number;
  /** Wer den Punkt zuletzt geändert (angelegt, abgehakt, umbenannt) hat. */
  by: PersonId;
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
  loveDays: Record<string, LoveDay>;
  steps: Record<string, StepDay>;
  events: Record<string, CalEvent>;
  routineDays: Record<string, RoutineDay>;
  photos: Record<string, Photo>;
  memos: Record<string, Memo>;
  memoItems: Record<string, MemoItem>;
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
  | 'loveDays'
  | 'steps'
  | 'routineDays'
  | 'events'
  | 'photos'
  | 'memos'
  | 'memoItems';
export type RecOf<K extends CollectionKey> = AppData[K][string];

export const COLLECTIONS: CollectionKey[] = ['plan', 'meals', 'shopping', 'notes', 'coupons', 'moods', 'hearts', 'games', 'periods', 'cycleDays', 'loveDays', 'steps', 'routineDays', 'events', 'photos', 'memos', 'memoItems'];

export type PopupFreq = 'oft' | 'normal' | 'selten' | 'aus';
/** Wie oft Amor mit einem gemeinsamen Foto vorbeifliegt. */
export type PhotoFreq = PopupFreq;

/** Gerätebezogene Einstellungen – werden nicht synchronisiert. */
export interface DeviceState {
  deviceId: string;
  me: PersonId;
  onboarded: boolean;
  popupFreq: PopupFreq;
  /** Wie oft Amor mit Fotos vorbeifliegt (`undefined` = „normal“, alle 5 Minuten). */
  photoFreq?: PhotoFreq;
  /** So oft wurde Amor schon angetippt – bis dahin zeigt er „Tipp mich an!“. */
  cupidTaps?: number;
  lastDailyPopup?: string;
  lastSyncAt?: number;
  /** Retro-Sounds in den Spielen (Standard: an). */
  sound?: boolean;
  /** Mitteilungen aufs Handy, wenn der Schatz etwas schickt (`undefined` = noch nicht gefragt). */
  notify?: boolean;
  /** Gemeinsamer Live-Sync-Raum (Echtzeit über das Internet). */
  live?: LiveRoom;
  /** Notizen: bis zu welcher Änderung (Zeitstempel) hast du sie gesehen? Für das „neu“ bei Änderungen vom Schatz. */
  memosSeen?: Record<string, number>;
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
