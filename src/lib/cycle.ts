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
/** Früher als an diesem Zyklustag gilt ein Eisprung als Tippfehler beim Ovulationstest. */
const MIN_OVULATION = 8;
/** Mehr pro Tag braucht keine Statistik. 😉 */
export const MAX_LOVE = 5;

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
  /** Der Eisprung dieses Zyklus stammt aus einem positiven Ovulationstest. */
  byTest?: boolean;
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
  fertile?: Window;
  /** Erwartete Länge des laufenden Zyklus – ein positiver Ovulationstest kann sie verschieben. */
  length: number;
  /** Eisprung im laufenden Zyklus (Zyklustag und Datum). */
  ovDay: number;
  ovulation?: string;
  /** Eisprung-Zyklustag je Periodenbeginn, wenn ihn ein positiver Ovulationstest verrät. */
  lhOvulation: Record<string, number>;
  todayInfo: DayInfo;
}

/** Fruchtbares Fenster: 5 Tage vor dem Eisprung bis 1 Tag danach. */
export interface Window {
  start: string;
  end: string;
  ovulation: string;
}

export function windowAround(ovulation: string): Window {
  return { start: addDays(ovulation, -5), end: addDays(ovulation, 1), ovulation };
}

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export function ovulationDay(cycleLength: number): number {
  return Math.max(cycleLength - LUTEAL_DAYS, 1);
}

export function phaseFor(day: number, cycleLength: number, periodLength: number, ov = ovulationDay(cycleLength)): PhaseId {
  if (day > cycleLength) return 'spaet';
  if (day <= periodLength) return 'menstruation';
  if (day >= ov - 1 && day <= ov + 1) return 'eisprung';
  return day < ov ? 'follikel' : 'luteal';
}

/** Spermien überleben bis zu 5 Tage, die Eizelle 12–24 Stunden: fruchtbar sind ca. 5 Tage davor bis 1 Tag danach. */
export function fertilityFor(day: number, cycleLength: number, ov = ovulationDay(cycleLength)): Fertility {
  if (day > cycleLength) return 'niedrig';
  const rel = day - ov;
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

/**
 * Ein positiver Ovulationstest verrät den Eisprung: meist etwa einen Tag später. Wir nehmen
 * pro Zyklus den ersten positiven Test (Start → Zyklustag des Eisprungs).
 */
export function lhOvulations(d: AppData, person: PersonId, periods: Period[], today: string): Record<string, number> {
  const positives = alive(d.cycleDays)
    .filter((e) => e.personId === person && e.lh === 'pos' && e.date <= today)
    .map((e) => e.date)
    .sort();
  const out: Record<string, number> = {};
  periods.forEach((p, i) => {
    const until = periods[i + 1]?.start;
    const lh = positives.find((x) => x >= p.start && (!until || x < until));
    if (!lh) return;
    const ov = diffDays(p.start, lh) + 2;
    if (ov >= MIN_OVULATION && ov + LUTEAL_DAYS <= MAX_GAP) out[p.start] = ov;
  });
  return out;
}

/** Länge und Eisprung-Tag des Zyklus, der mit periods[i] beginnt. */
export function cycleShape(c: Pick<Cycle, 'periods' | 'stats' | 'lhOvulation'>, i: number): { len: number; ov: number; byTest: boolean } {
  const p = c.periods[i];
  const following = c.periods[i + 1]?.start;
  const L = c.stats.cycleLength;
  const lh = c.lhOvulation[p.start];
  // Ohne Folgeperiode: Nach einem positiven Test kommt die Periode etwa 14 Tage nach dem Eisprung.
  const gap = following ? diffDays(p.start, following) : lh ? lh + LUTEAL_DAYS : L;
  const len = gap >= MIN_GAP && gap <= MAX_GAP ? gap : L;
  return { len, ov: lh ?? ovulationDay(len), byTest: !!lh };
}

export function getCycle(d: AppData, today: string): Cycle | undefined {
  const settings = d.couple.cycle;
  if (!settings) return undefined;
  const periods = periodsOf(d, settings.personId).filter((p) => p.start <= today);
  const stats = cycleStats(periods, settings);
  const L = stats.cycleLength;
  const last = periods[periods.length - 1];
  const lhOvulation = lhOvulations(d, settings.personId, periods, today);
  const base: Cycle = {
    settings,
    owner: settings.personId,
    today,
    periods,
    stats,
    last,
    lateBy: 0,
    predictions: [],
    length: L,
    ovDay: ovulationDay(L),
    lhOvulation,
    todayInfo: { predicted: false },
  };
  if (!last) return base;

  const shape = cycleShape(base, periods.length - 1);
  const expected = addDays(last.start, shape.len);
  const lateBy = Math.max(0, diffDays(expected, today));
  // Ist sie überfällig, rechnen wir ab morgen mit ihr – die Prognose wandert mit.
  const next = lateBy > 0 ? addDays(today, 1) : expected;
  const predictions = [0, 1, 2].map((k) => addDays(next, k * L));
  const ovulation = addDays(last.start, shape.ov - 1);
  const cycle: Cycle = { ...base, next, lateBy, predictions, length: shape.len, ovDay: shape.ov, ovulation };

  const current = today <= periodEnd(last, stats.periodLength) ? last : undefined;
  const open = !last.end && diffDays(last.start, today) < OPEN_DAYS ? last : undefined;

  // Fruchtbares Fenster im laufenden Zyklus – oder, wenn schon vorbei, im nächsten.
  const fertile =
    lateBy > 0 || diffDays(ovulation, today) > 1 ? windowAround(addDays(next, ovulationDay(L) - 1)) : windowAround(ovulation);

  return { ...cycle, current, open, fertile, todayInfo: dayInfo(cycle, today) };
}

/** Wie sieht ein beliebiger Tag im Zyklus aus – rückblickend oder als Prognose? */
export function dayInfo(c: Pick<Cycle, 'periods' | 'stats' | 'next' | 'today' | 'lhOvulation'>, date: string): DayInfo {
  const { periods, stats } = c;
  const L = stats.cycleLength;
  const P = stats.periodLength;
  let i = -1;
  for (let k = 0; k < periods.length; k++) if (periods[k].start <= date) i = k;
  if (i < 0) return { predicted: false };
  const future = date > c.today;
  const p = periods[i];

  if (periods[i + 1] || !c.next || date < c.next) {
    const { len, ov, byTest } = cycleShape(c, i);
    const plen = p.end ? diffDays(p.start, p.end) + 1 : P;
    const day = diffDays(p.start, date) + 1;
    const bleeding = date <= periodEnd(p, P);
    return {
      cycleDay: day,
      phase: phaseFor(day, len, plen, ov),
      fertility: fertilityFor(day, len, ov),
      ovulation: day === ov,
      period: bleeding ? (future ? 'predicted' : 'logged') : undefined,
      predicted: future,
      ...(byTest && { byTest }),
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
export function phaseSegments(cycleLength: number, periodLength: number, ov = ovulationDay(cycleLength)): [PhaseId, number][] {
  const counts = new Map<PhaseId, number>();
  for (let day = 1; day <= cycleLength; day++) {
    const ph = phaseFor(day, cycleLength, periodLength, ov);
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

// ───────────────────────── Liebe & Kinderwunsch ─────────────────────────

/** Wie oft ihr euch an einem Tag geliebt habt (0 = kein Eintrag). */
export function loveOn(d: AppData, date: string): number {
  const e = d.loveDays[date];
  return e && !e.deleted ? e.count : 0;
}

/** Tage mit Liebe zwischen from und to (beide einschließlich). */
export function loveDaysBetween(d: AppData, from: string, to: string): number {
  return alive(d.loveDays).filter((e) => e.date >= from && e.date <= to && e.count > 0).length;
}

export interface CycleLove {
  start: string;
  /** Letzter Tag des Zyklus – beim laufenden Zyklus heute. */
  end: string;
  window: Window;
  byTest: boolean;
  /** Tage mit Liebe im ganzen Zyklus, im fruchtbaren Fenster und an den Top-Tagen (2 Tage vor bis Eisprung). */
  days: number;
  inWindow: number;
  top: number;
  running: boolean;
}

/** Rückblick: Wann habt ihr euch in den letzten Zyklen geliebt – und wie lag das zum Eisprung? Neueste zuerst. */
export function loveHistory(d: AppData, c: Cycle, count = HISTORY): CycleLove[] {
  const out: CycleLove[] = [];
  for (let i = c.periods.length - 1; i >= 0 && out.length < count; i--) {
    const p = c.periods[i];
    const following = c.periods[i + 1]?.start;
    const end = following ? addDays(following, -1) : c.today;
    const { ov, byTest } = cycleShape(c, i);
    const window = windowAround(addDays(p.start, ov - 1));
    out.push({
      start: p.start,
      end,
      window,
      byTest,
      days: loveDaysBetween(d, p.start, end),
      inWindow: loveDaysBetween(d, window.start, window.end < end ? window.end : end),
      top: loveDaysBetween(d, addDays(window.ovulation, -2), window.ovulation < end ? window.ovulation : end),
      running: !following,
    });
  }
  return out;
}

export type TtcStage = 'periode' | 'vorher' | 'fenster' | 'warten' | 'test' | 'positiv';

export interface TtcStatus {
  stage: TtcStage;
  /** Der wievielte Kinderwunsch-Zyklus gerade läuft (1 = der erste). */
  round: number;
  /** Fruchtbares Fenster des laufenden Zyklus. */
  window: Window;
  /** vorher: Tage bis zum Fenster · fenster: Tag im Fenster (1–7) · warten: Tage bis zum Testtag. */
  days: number;
  /** Ab diesem Tag ist ein Schwangerschaftstest aussagekräftig (= erwartete Periode). */
  testDay?: string;
  /** Tage mit Liebe im Fenster bis heute. */
  loveInWindow: number;
  /** Positiver Schwangerschaftstest in diesem Zyklus. */
  positive?: string;
}

/** Wie viele Kinderwunsch-Zyklen es schon gibt: der Zyklus, in dem ihr angefangen habt, ist Nr. 1. */
export function ttcRound(c: Pick<Cycle, 'periods' | 'settings' | 'today'>): number {
  const since = c.settings.ttcSince ?? c.today;
  const startedIn = [...c.periods].reverse().find((p) => p.start <= since)?.start ?? since;
  return Math.max(1, c.periods.filter((p) => p.start >= startedIn).length);
}

/** Wo steht ihr gerade auf dem Weg zum Baby? */
export function ttcStatus(d: AppData, c: Cycle): TtcStatus | undefined {
  if (!c.last || !c.ovulation) return undefined;
  const today = c.today;
  const window = windowAround(c.ovulation);
  const loveInWindow = today >= window.start ? loveDaysBetween(d, window.start, window.end < today ? window.end : today) : 0;
  const positive = alive(d.cycleDays)
    .filter((e) => e.personId === c.owner && e.hcg === 'pos' && e.date >= c.last!.start && e.date <= today)
    .map((e) => e.date)
    .sort()[0];
  const base = { round: ttcRound(c), window, loveInWindow, days: 0, positive };
  if (positive) return { ...base, stage: 'positiv' };
  if (c.current) return { ...base, stage: 'periode', days: diffDays(today, window.start) };
  if (c.lateBy > 0) return { ...base, stage: 'test', testDay: addDays(c.last.start, c.length) };
  if (today < window.start) return { ...base, stage: 'vorher', days: diffDays(today, window.start) };
  if (today <= window.end) return { ...base, stage: 'fenster', days: diffDays(window.start, today) + 1 };
  const testDay = c.next!;
  if (today >= testDay) return { ...base, stage: 'test', testDay };
  return { ...base, stage: 'warten', testDay, days: diffDays(today, testDay) };
}
