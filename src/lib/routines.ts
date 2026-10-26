import { HEALTH_TIPS, type HealthTip } from '../data/health';
import { fromKey } from './date';
import { seededShuffle } from './random';
import { fill, type Names } from './text';
import type { AppData, PersonId, Routine, Slot } from './types';

/**
 * Gesundheit: Tipp des Tages und tägliche Routinen (Vitamine, Schwarzkümmelöl, Zahnseide …),
 * die jede Person für sich abhakt. Erinnert wird in der App, per Mitteilung und auf Wunsch über
 * einen sich täglich wiederholenden Termin im Handy-Kalender.
 */

/** Herzpunkte für einen Tag, an dem alle Routinen abgehakt sind. */
export const ROUTINE_DAY_POINTS = 3;
export const MAX_ROUTINES = 12;

export const routineLabel = (r: Pick<Routine, 'emoji' | 'name'>) => `${r.emoji} ${r.name}`;

/** Text mit {routine}, {me} und {partner} füllen. */
export function fillRoutine(template: string, r: Pick<Routine, 'emoji' | 'name'>, names: Names): string {
  return fill(template.replace(/\{routine\}/g, routineLabel(r)), names);
}

export function slotOf(time: string): Slot {
  const h = Number(time.slice(0, 2));
  return h < 11 ? 'morgens' : h < 17 ? 'mittags' : 'abends';
}

export function validTime(t: string | undefined): t is string {
  return !!t && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
}

export function routinesOf(d: AppData, person: PersonId): Routine[] {
  return [...(d.persons[person].routines ?? [])].sort((a, b) => a.time.localeCompare(b.time) || a.name.localeCompare(b.name));
}

export interface RoutineStatus {
  routines: Routine[];
  done: Set<string>;
}

/** Routinen einer Person und was davon an `date` schon abgehakt ist. */
export function routineStatus(d: AppData, date: string, person: PersonId): RoutineStatus {
  const routines = routinesOf(d, person);
  const rec = d.routineDays[`${date}-${person}`];
  const ids = new Set(routines.map((r) => r.id));
  const done = new Set(rec && !rec.deleted ? rec.done.filter((id) => ids.has(id)) : []);
  return { routines, done };
}

export const allDone = (s: RoutineStatus) => s.routines.length > 0 && s.routines.every((r) => s.done.has(r.id));

/** Freie ID für eine neue Routine – Vorlagen behalten ihre ID, damit Tipps sie wiedererkennen. */
export function routineId(existing: Routine[], wish: string): string {
  const ids = new Set(existing.map((r) => r.id));
  if (!ids.has(wish)) return wish;
  let i = 2;
  while (ids.has(`${wish}-${i}`)) i++;
  return `${wish}-${i}`;
}

// ───── Tipp des Tages ─────

/** Tipps, die in diesem Monat passen (Vitamin D im Winter, Sonnenschutz im Sommer …). */
export function tipsForMonth(month: number): HealthTip[] {
  return HEALTH_TIPS.filter((t) => !t.months || t.months.includes(month));
}

/**
 * Tipp des Tages – auf beiden Handys gleich. Innerhalb eines Monats wiederholt sich keiner,
 * `offset` blättert zum nächsten („Noch ein Tipp“).
 */
export function dailyTip(dateKey: string, offset = 0): HealthTip {
  const d = fromKey(dateKey);
  const month = d.getMonth() + 1;
  const list = seededShuffle(tipsForMonth(month), `tips-${d.getFullYear()}-${month}`);
  return list[(d.getDate() - 1 + offset) % list.length];
}

// ───── Erinnerungen ─────

const pad = (n: number) => String(n).padStart(2, '0');

export function clockTime(date = new Date()): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Routinen, deren Uhrzeit erreicht ist, die noch offen sind und an die heute noch nicht erinnert wurde. */
export function dueRoutines(s: RoutineStatus, now: string, reminded: ReadonlySet<string>): Routine[] {
  return s.routines.filter((r) => r.remind && r.time <= now && !s.done.has(r.id) && !reminded.has(r.id));
}

const REMIND_KEY = 'arta.routines.v1';

/** Woran dieses Handy heute schon erinnert hat (nur auf dem Gerät, nicht synchronisiert). */
export function remindedOn(date: string): Set<string> {
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(REMIND_KEY) ?? 'null') as { date?: string; ids?: string[] } | null;
    return new Set(raw?.date === date && Array.isArray(raw.ids) ? raw.ids : []);
  } catch {
    return new Set();
  }
}

export function markReminded(date: string, ids: string[]) {
  const all = remindedOn(date);
  for (const id of ids) all.add(id);
  try {
    globalThis.localStorage?.setItem(REMIND_KEY, JSON.stringify({ date, ids: [...all] }));
  } catch {
    // Dann wird eben ein zweites Mal erinnert.
  }
}

// ───── Kalender ─────

/** Text für iCalendar maskieren (RFC 5545, 3.3.11). */
function icsText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Zeilen über 75 Byte umbrechen, ohne ein Zeichen (Umlaut, Emoji) zu zerteilen. */
export function foldLine(line: string): string {
  const enc = new TextEncoder();
  const parts: string[] = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = parts.length ? 74 : 75; // Folgezeilen beginnen mit einem Leerzeichen
    if (bytes + n > limit) {
      parts.push(cur);
      cur = '';
      bytes = 0;
    }
    cur += ch;
    bytes += n;
  }
  parts.push(cur);
  return parts.join('\r\n ');
}

const icsDate = (key: string) => key.replace(/-/g, '');
const icsUtc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/**
 * Täglich wiederkehrender Termin mit Erinnerung zur Uhrzeit der Routine – so meldet sich das Handy
 * auch, wenn Arta geschlossen ist. Ohne Zeitzone: Der Termin gilt in der Ortszeit des Handys.
 */
export function routineIcs(r: Routine, person: PersonId, startDate: string, url: string, now = new Date()): string {
  const time = r.time.replace(':', '') + '00';
  const summary = icsText(routineLabel(r));
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Arta//Gesundheit//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:arta-routine-${person}-${r.id}@arta`,
    `DTSTAMP:${icsUtc(now)}`,
    `DTSTART:${icsDate(startDate)}T${time}`,
    'DURATION:PT5M',
    'RRULE:FREQ=DAILY',
    `SUMMARY:${summary}`,
    `DESCRIPTION:${icsText(`Deine tägliche Routine aus Arta 💚 Abhaken: ${url}`)}`,
    `URL:${url}`,
    'TRANSP:TRANSPARENT',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${summary}`,
    'TRIGGER:PT0S',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/** Dateiname ohne Sonderzeichen, z. B. „arta-schwarzkuemmeloel.ics“. */
export function icsFileName(r: Pick<Routine, 'name'>): string {
  const slug = r.name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `arta-${slug || 'routine'}.ics`;
}
