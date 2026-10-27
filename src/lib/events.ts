import { addDays, diffDays, fromKey, relativeDay, toKey } from './date';
import { alive } from './stats';
import type { AppData, CalEvent, Repeat } from './types';

/** Schnellauswahl beim Eintragen – das Symbol steht später auch im iPhone-Kalender. */
export const EVENT_KINDS: { emoji: string; label: string }[] = [
  { emoji: '💞', label: 'Date' },
  { emoji: '🍽️', label: 'Essen gehen' },
  { emoji: '🎬', label: 'Kino' },
  { emoji: '🎉', label: 'Feier' },
  { emoji: '🎂', label: 'Geburtstag' },
  { emoji: '✈️', label: 'Reise' },
  { emoji: '👨‍👩‍👧', label: 'Familie' },
  { emoji: '🩺', label: 'Arzt' },
  { emoji: '💪', label: 'Sport' },
  { emoji: '🏠', label: 'Zuhause' },
  { emoji: '💼', label: 'Arbeit' },
  { emoji: '📌', label: 'Sonstiges' },
];

export const REPEAT_LABEL: Record<Repeat, string> = { woche: 'jede Woche', monat: 'jeden Monat', jahr: 'jedes Jahr' };

/** Erinnerung im Kalender, in Minuten vor Beginn (negativ: nach Tagesbeginn, für ganztägige Termine). */
export const ALARMS_TIMED: [number, string][] = [
  [0, 'Keine'],
  [15, '15 Min vorher'],
  [60, '1 Std vorher'],
  [180, '3 Std vorher'],
  [1440, '1 Tag vorher'],
];

export const ALARMS_ALLDAY: [number, string][] = [
  [0, 'Keine'],
  [-540, 'Am Tag um 9 Uhr'],
  [900, 'Am Vortag um 9 Uhr'],
  [9540, 'Eine Woche vorher'],
];

/** Der Jahrestag aus den Einstellungen erscheint automatisch – ändern lässt er sich nur dort. */
export const ANNIVERSARY_ID = 'jahrestag';

export function anniversaryEvent(d: AppData): CalEvent | undefined {
  const date = d.couple.anniversary;
  if (!date) return undefined;
  return {
    id: ANNIVERSARY_ID,
    title: 'Unser Jahrestag',
    emoji: '💞',
    date,
    who: 'both',
    repeat: 'jahr',
    alarm: -540,
    tz: 'Europe/Berlin',
    createdBy: 'a',
    createdAt: 0,
    updatedAt: d.couple.updatedAt,
  };
}

/** Wie viele Tage über den ersten hinaus der Termin dauert (Urlaub, oder bis nach Mitternacht). */
export function extraDays(e: CalEvent): number {
  if (e.time) return e.endTime && e.endTime < e.time ? 1 : 0;
  return e.endDate && e.endDate > e.date ? diffDays(e.date, e.endDate) : 0;
}

const daysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

/** Beginn der k-ten Wiederholung – `undefined`, wenn es den Tag in dem Monat/Jahr nicht gibt (31., 29. Feb.). */
export function nthStart(e: CalEvent, k: number): string | undefined {
  if (!e.repeat || k === 0) return e.date;
  if (e.repeat === 'woche') return addDays(e.date, 7 * k);
  const d = fromKey(e.date);
  const day = d.getDate();
  const y = e.repeat === 'jahr' ? d.getFullYear() + k : d.getFullYear() + Math.floor((d.getMonth() + k) / 12);
  const m = e.repeat === 'jahr' ? d.getMonth() : (d.getMonth() + k) % 12;
  if (day > daysInMonth(y, m)) return undefined;
  return toKey(new Date(y, m, day));
}

/** Nächster Beginn, der heute noch läuft oder noch kommt. */
export function nextStart(e: CalEvent, today: string): string | undefined {
  const span = extraDays(e);
  if (!e.repeat) return addDays(e.date, span) >= today ? e.date : undefined;
  const behind = Math.max(0, diffDays(e.date, today) - span);
  const per = e.repeat === 'woche' ? 7 : e.repeat === 'monat' ? 31 : 366;
  const k0 = Math.max(0, Math.floor(behind / per) - 1);
  for (let k = k0; k < k0 + 120; k++) {
    const start = nthStart(e, k);
    if (start && addDays(start, span) >= today) return start;
  }
  return undefined;
}

export interface Occurrence {
  event: CalEvent;
  /** Erster Tag dieses Vorkommens. */
  start: string;
  /** Letzter Tag (gleich `start` bei eintägigen Terminen). */
  end: string;
  virtual?: boolean;
}

const sortKey = (o: Occurrence) => `${o.start} ${o.event.time ?? '00:00'} ${o.event.title}`;

/** Was steht an? Jeder Termin mit seinem nächsten Vorkommen (Wiederholungen nur einmal), sortiert. */
export function upcoming(d: AppData, today: string, withinDays = 400): Occurrence[] {
  const limit = addDays(today, withinDays);
  const out: Occurrence[] = [];
  const add = (e: CalEvent, virtual?: boolean) => {
    const start = nextStart(e, today);
    if (start && start <= limit) out.push({ event: e, start, end: addDays(start, extraDays(e)), virtual });
  };
  for (const e of alive(d.events)) add(e);
  const ann = anniversaryEvent(d);
  if (ann) add(ann, true);
  return out.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
}

/** Vorbei und ohne Wiederholung – das Neueste zuerst. */
export function past(d: AppData, today: string, max = 30): Occurrence[] {
  return alive(d.events)
    .filter((e) => !e.repeat && addDays(e.date, extraDays(e)) < today)
    .map((e) => ({ event: e, start: e.date, end: addDays(e.date, extraDays(e)) }))
    .sort((a, b) => sortKey(b).localeCompare(sortKey(a)))
    .slice(0, max);
}

/** „Heute, 18:00–20:00 Uhr“, „Fr, 30. Okt. · ganztägig“, „Fr, 30. Okt. – So, 1. Nov.“ */
export function whenText(o: Occurrence, today: string): string {
  const e = o.event;
  const day = relativeDay(o.start, today);
  if (e.time) return `${day}, ${e.time}${e.endTime && e.endTime !== e.time ? `–${e.endTime}` : ''} Uhr`;
  if (o.end > o.start) return `${day} – ${relativeDay(o.end, today)}`;
  return `${day} · ganztägig`;
}

/** Ohne Tag – für die Liste, in der das Datum schon links steht. */
export function timeText(o: Occurrence, today: string): string {
  const e = o.event;
  if (e.time) return `${e.time}${e.endTime && e.endTime !== e.time ? `–${e.endTime}` : ''} Uhr`;
  if (o.end > o.start) return `bis ${relativeDay(o.end, today)}`;
  return 'ganztägig';
}

/** Kurzer Countdown für die Liste. */
export function countdown(o: Occurrence, today: string): string {
  if (o.start <= today && o.end >= today) return o.end > o.start && o.start < today ? 'läuft' : 'heute';
  const n = diffDays(today, o.start);
  if (n === 1) return 'morgen';
  if (n < 0) return n === -1 ? 'gestern' : `vor ${-n} Tagen`;
  return n < 60 ? `in ${n} Tagen` : n < 365 ? `in ${Math.round(n / 30.4)} Mon.` : `in ${Math.round(n / 365)} J.`;
}

/** Wie oft feiert ihr diesen Jahrestag? */
export function anniversaryYears(o: Occurrence): number {
  return fromKey(o.start).getFullYear() - fromKey(o.event.date).getFullYear();
}

/** Neue Termine vom Schatz zwischen zwei Ständen (für die Mitteilungen). */
export function freshEvents(prev: AppData, next: AppData, from: CalEvent['createdBy'], maxAge: number, now = Date.now()): CalEvent[] {
  return Object.values(next.events ?? {}).filter((e) => !prev.events?.[e.id] && !e.deleted && e.createdBy === from && now - e.createdAt < maxAge);
}
