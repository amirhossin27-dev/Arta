import { addDays, diffDays } from './date';
import { alive } from './stats';
import type { AppData, CycleDay, CycleSettings, Period, PersonId } from './types';

/**
 * Zyklus-Rechnung nach der Kalendermethode: Die zweite Zyklushälfte (Lutealphase) ist recht
 * konstant ~14 Tage lang, deshalb liegt der Eisprung etwa 14 Tage vor der nächsten Periode.
 * Alles hier ist eine Schätzung aus euren Einträgen – kein Verhütungsmittel.
 */

export type PhaseId = 'menstruation' | 'follikel' | 'eisprung' | 'luteal' | 'spaet';
export type Fertility = 'niedrig' | 'mittel' | 'hoch';

export const LUTEAL_DAYS = 14;
export const DEFAULT_CYCLE = 28;
export const DEFAULT_PERIOD = 5;
/** Abstände außerhalb dieses Bereichs gelten als vergessener Eintrag und zählen nicht zum Schnitt. */
const MIN_GAP = 18;
const MAX_GAP = 60;
const HISTORY = 6;
/** Zwei Periodenbeginne so dicht hintereinander gehören zur selben Periode. */
export const MERGE_DAYS = 10;
/** Wie lange nach Beginn man eine offene Periode noch beenden kann. */
const OPEN_DAYS = 14;

export interface CycleStats {
  cycleLength: number;
  periodLength: number;
  /** Anzahl gemessener Zyklen im Schnitt (0 = noch der eingestellte Standardwert). */
  measured: number;
  shortest?: number;
  longest?: number;
}

export interface DayInfo {
  cycleDay?: number;
  phase?: PhaseId;
  fertility?: Fertility;
  ovulation?: boolean;
  period?: 'logged' | 'predicted';
  /** Liegt in der Zukunft – also nur eine Prognose. */
  predicted: boolean;
}

export interface Cycle {
  settings: CycleSettings;
  owner: PersonId;
  today: string;
  /** Perioden der Person, älteste zuerst. */
  periods: Period[];
  stats: CycleStats;
  last?: Period;
  /** Heute ist ein (eingetragener oder angenommener) Periodentag. */
  current?: Period;
  /** Periode ohne eingetragenes Ende, die man noch beenden kann. */
  open?: Period;
  /** Erster vorhergesagter Periodenbeginn. */
  next?: string;
  /** Tage seit dem erwarteten Beginn (0 = nicht überfällig). */
  lateBy: number;
  /** Die nächsten drei erwarteten Periodenbeginne. */
  predictions: string[];
  /** Nächstes (oder laufendes) fruchtbares Fenster mit Eisprung. */
  fertile?: { start: string; end: string; ovulation: string };
  todayInfo: DayInfo;
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function ovulationDay(cycleLength: number): number {
  return Math.max(cycleLength - LUTEAL_DAYS, 1);
}

export function phaseFor(day: number, cycleLength: number, periodLength: number): PhaseId {
  if (day > cycleLength) return 'spaet';
  if (day <= periodLength) return 'menstruation';
  const ov = ovulationDay(cycleLength);
  if (day >= ov - 1 && day <= ov + 1) return 'eisprung';
  return day < ov ? 'follikel' : 'luteal';
}

/** Spermien überleben bis zu 5 Tage, die Eizelle 12–24 Stunden: fruchtbar sind ca. 5 Tage davor bis 1 Tag danach. */
export function fertilityFor(day: number, cycleLength: number): Fertility {
  if (day > cycleLength) return 'niedrig';
  const rel = day - ovulationDay(cycleLength);
  if (rel >= -2 && rel <= 0) return 'hoch';
  if (rel >= -5 && rel <= 1) return 'mittel';
  return 'niedrig';
}

/**
 * Perioden der Person, älteste zuerst. Haben beide Handys denselben Beginn an verschiedenen Tagen
 * eingetragen, landen nach dem Sync zwei Einträge kurz hintereinander – die fassen wir zusammen.
 */
export function periodsOf(d: AppData, person: PersonId): Period[] {
  const sorted = alive(d.periods)
    .filter((p) => p.personId === person)
    .sort((a, b) => a.start.localeCompare(b.start));
  const out: Period[] = [];
  for (const p of sorted) {
    const prev = out[out.length - 1];
    if (prev && diffDays(prev.start, p.start) < MERGE_DAYS) {
      const end = [prev.end, p.end].filter(Boolean).sort().pop();
      out[out.length - 1] = { ...prev, end };
    } else {
      out.push(p);
    }
  }
  return out;
}

export function cycleStats(periods: Period[], settings: CycleSettings): CycleStats {
  const gaps: number[] = [];
  for (let i = 1; i < periods.length; i++) {
    const g = diffDays(periods[i - 1].start, periods[i].start);
    if (g >= MIN_GAP && g <= MAX_GAP) gaps.push(g);
  }
  const recent = gaps.slice(-HISTORY);
  const lengths = periods
    .filter((p) => p.end)
    .map((p) => diffDays(p.start, p.end!) + 1)
    .filter((n) => n >= 1 && n <= 14)
    .slice(-HISTORY);
  return {
    cycleLength: recent.length ? Math.round(avg(recent)) : settings.cycleLength,
    periodLength: lengths.length ? Math.round(avg(lengths)) : settings.periodLength,
    measured: recent.length,
    shortest: recent.length ? Math.min(...recent) : undefined,
    longest: recent.length ? Math.max(...recent) : undefined,
  };
}

/** Letzter Blutungstag – eingetragen oder anhand der üblichen Dauer angenommen. */
export function periodEnd(p: Period, periodLength: number): string {
  return p.end ?? addDays(p.start, periodLength - 1);
}

export function getCycle(d: AppData, today: string): Cycle | undefined {
  const settings = d.couple.cycle;
  if (!settings) return undefined;
  const periods = periodsOf(d, settings.personId).filter((p) => p.start <= today);
  const stats = cycleStats(periods, settings);
  const L = stats.cycleLength;
  const last = periods[periods.length - 1];
  const base: Cycle = { settings, owner: settings.personId, today, periods, stats, last, lateBy: 0, predictions: [], todayInfo: { predicted: false } };
  if (!last) return base;

  const expected = addDays(last.start, L);
  const lateBy = Math.max(0, diffDays(expected, today));
  // Ist sie überfällig, rechnen wir ab morgen mit ihr – die Prognose wandert mit.
  const next = lateBy > 0 ? addDays(today, 1) : expected;
  const predictions = [0, 1, 2].map((k) => addDays(next, k * L));
  const cycle: Cycle = { ...base, next, lateBy, predictions };

  const current = today <= periodEnd(last, stats.periodLength) ? last : undefined;
  const open = !last.end && diffDays(last.start, today) < OPEN_DAYS ? last : undefined;

  // Fruchtbares Fenster im laufenden Zyklus – oder, wenn schon vorbei, im nächsten.
  const ov = ovulationDay(L) - 1;
  let ovulation = addDays(last.start, ov);
  if (lateBy > 0 || diffDays(ovulation, today) > 1) ovulation = addDays(next, ov);
  const fertile = { start: addDays(ovulation, -5), end: addDays(ovulation, 1), ovulation };

  return { ...cycle, current, open, fertile, todayInfo: dayInfo(cycle, today) };
}

/** Wie sieht ein beliebiger Tag im Zyklus aus – rückblickend oder als Prognose? */
export function dayInfo(c: Pick<Cycle, 'periods' | 'stats' | 'next' | 'today'>, date: string): DayInfo {
  const { periods, stats } = c;
  const L = stats.cycleLength;
  const P = stats.periodLength;
  let i = -1;
  for (let k = 0; k < periods.length; k++) if (periods[k].start <= date) i = k;
  if (i < 0) return { predicted: false };
  const future = date > c.today;
  const p = periods[i];
  const following = periods[i + 1]?.start;

  if (following || !c.next || date < c.next) {
    const gap = following ? diffDays(p.start, following) : L;
    const len = gap >= MIN_GAP && gap <= MAX_GAP ? gap : L;
    const plen = p.end ? diffDays(p.start, p.end) + 1 : P;
    const day = diffDays(p.start, date) + 1;
    const bleeding = date <= periodEnd(p, P);
    return {
      cycleDay: day,
      phase: phaseFor(day, len, plen),
      fertility: fertilityFor(day, len),
      ovulation: day === ovulationDay(len),
      period: bleeding ? (future ? 'predicted' : 'logged') : undefined,
      predicted: future,
    };
  }

  // Vorhergesagte Zyklen ab dem nächsten erwarteten Beginn
  const k = Math.floor(diffDays(c.next, date) / L);
  const day = diffDays(addDays(c.next, k * L), date) + 1;
  return {
    cycleDay: day,
    phase: phaseFor(day, L, P),
    fertility: fertilityFor(day, L),
    ovulation: day === ovulationDay(L),
    period: day <= P ? 'predicted' : undefined,
    predicted: true,
  };
}

/** Die eingetragene Periode, in die ein Tag fällt. */
export function periodAt(c: Pick<Cycle, 'periods' | 'stats'>, date: string): Period | undefined {
  return c.periods.find((p) => p.start <= date && date <= periodEnd(p, c.stats.periodLength));
}

export function cycleDayEntry(d: AppData, date: string, person: PersonId): CycleDay | undefined {
  const e = d.cycleDays[`${date}-${person}`];
  return e && !e.deleted ? e : undefined;
}

/** Abschnitte der Zyklus-Leiste: [Phase, Anzahl Tage]. */
export function phaseSegments(cycleLength: number, periodLength: number): [PhaseId, number][] {
  const counts = new Map<PhaseId, number>();
  for (let day = 1; day <= cycleLength; day++) {
    const ph = phaseFor(day, cycleLength, periodLength);
    counts.set(ph, (counts.get(ph) ?? 0) + 1);
  }
  return (['menstruation', 'follikel', 'eisprung', 'luteal'] as const).filter((ph) => counts.has(ph)).map((ph) => [ph, counts.get(ph)!]);
}

/** Errechneter Geburtstermin nach Naegele (+280 Tage), angepasst an die Zykluslänge. */
export function dueDate(lastPeriodStart: string, cycleLength = DEFAULT_CYCLE): string {
  return addDays(lastPeriodStart, 280 + (cycleLength - DEFAULT_CYCLE));
}

/** Schwangerschaftswoche im Format „SSW 6+2“ (vollendete Wochen + Tage), gezählt ab der letzten Periode. */
export function pregnancyWeek(lastPeriodStart: string, today: string): { weeks: number; days: number } {
  const total = diffDays(lastPeriodStart, today);
  return { weeks: Math.floor(total / 7), days: total % 7 };
}

export function fillCycle(text: string, names: { name: string; partner: string }): string {
  return text.replace(/\{name\}/g, names.name).replace(/\{partner\}/g, names.partner);
}
