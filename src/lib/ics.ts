import { useEffect, useState } from 'react';
import { addDays, diffDays } from './date';
import { ANNIVERSARY_ID } from './events';
import { PUSH_RELAY_URL } from './liveConfig';
import { toB64Url } from './sync';
import type { CalEvent } from './types';

/**
 * iCalendar-Bausteine (RFC 5545) für den iPhone-Kalender: einzelne Termine zum Importieren und
 * die Einträge im Kalender-Abo (siehe calendar.ts und push-relay/worker.js).
 *
 * Uhrzeiten stehen als Ortszeit mit TZID samt VTIMEZONE drin – so bleibt „jeden Dienstag 18 Uhr“
 * auch nach der Zeitumstellung 18 Uhr.
 */

const CRLF = '\r\n';

/** Text für SUMMARY, LOCATION, DESCRIPTION … */
export function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

const utf8Len = (cp: number) => (cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4);

/** Zeilen dürfen höchstens 75 Byte lang sein – längere werden umbrochen (ohne ein Zeichen zu zerteilen). */
export function foldLine(line: string): string {
  let out = '';
  let len = 0;
  for (const ch of line) {
    const b = utf8Len(ch.codePointAt(0)!);
    if (len + b > 75) {
      out += `${CRLF} `;
      len = 1;
    }
    out += ch;
    len += b;
  }
  return out;
}

const lines = (...ls: (string | false | undefined)[]) =>
  ls
    .filter((l): l is string => !!l)
    .map(foldLine)
    .join(CRLF) + CRLF;

const pad = (n: number, w = 2) => String(Math.abs(n)).padStart(w, '0');

/** 2026-10-30 → 20261030 */
export const icsDate = (key: string) => key.replace(/-/g, '');

/** 2026-10-30 + 18:30 → 20261030T183000 */
export const icsLocal = (key: string, time: string) => `${icsDate(key)}T${time.replace(':', '')}00`;

export function icsUtc(ts: number): string {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

// ───── Zeitzonen ─────

const formatters = new Map<string, Intl.DateTimeFormat>();

/** Abstand der Zeitzone zu UTC in Minuten zum Zeitpunkt `ts` (Berlin im Sommer: +120). */
export function zoneOffset(ts: number, tz: string): number {
  let f = formatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' });
    formatters.set(tz, f);
  }
  const p = Object.fromEntries(f.formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return Math.round((asUtc - Math.floor(ts / 1000) * 1000) / 60_000);
}

export function validZone(tz: string): boolean {
  try {
    zoneOffset(Date.now(), tz);
    return true;
  } catch {
    return false;
  }
}

const offsetText = (min: number) => `${min < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(min) / 60))}${pad(Math.abs(min) % 60)}`;
const WD = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

/** Tag im Monat für „n-ter Wochentag“ (n = -1: der letzte). Monat 0-basiert. */
function nthWeekday(year: number, month: number, nth: number, wd: number): number {
  if (nth > 0) {
    const first = new Date(Date.UTC(year, month, 1)).getUTCDay();
    return 1 + ((wd - first + 7) % 7) + (nth - 1) * 7;
  }
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const lastWd = new Date(Date.UTC(year, month, last)).getUTCDay();
  return last - ((lastWd - wd + 7) % 7);
}

/**
 * VTIMEZONE für eine IANA-Zeitzone. Die Umstellungen werden im Jahr `year` ertastet und als
 * Jahresregel („letzter Sonntag im März“) geschrieben – genau so, wie Kalender-Apps es erwarten.
 */
export function vtimezone(tz: string, year: number): string {
  const start = Date.UTC(year, 0, 1);
  const changes: { at: number; from: number; to: number }[] = [];
  let prev = zoneOffset(start, tz);
  for (let day = 1; day <= 366; day++) {
    const t = start + day * 86_400_000;
    const off = zoneOffset(t, tz);
    if (off === prev) continue;
    // Auf die Minute genau eingrenzen.
    let lo = t - 86_400_000;
    let hi = t;
    while (hi - lo > 60_000) {
      const mid = lo + Math.floor((hi - lo) / 120_000) * 60_000;
      if (zoneOffset(mid, tz) === prev) lo = mid;
      else hi = mid;
    }
    changes.push({ at: hi, from: prev, to: off });
    prev = off;
  }
  const head = ['BEGIN:VTIMEZONE', `TZID:${tz}`];
  if (changes.length < 2) {
    const off = zoneOffset(start, tz);
    return lines(...head, 'BEGIN:STANDARD', 'DTSTART:19700101T000000', `TZOFFSETFROM:${offsetText(off)}`, `TZOFFSETTO:${offsetText(off)}`, 'END:STANDARD', 'END:VTIMEZONE');
  }
  const parts = changes.slice(0, 2).map((c) => {
    // DTSTART ist die Ortszeit vor der Umstellung (z. B. 02:00 im März).
    const local = new Date(c.at + c.from * 60_000);
    const month = local.getUTCMonth();
    const day = local.getUTCDate();
    const wd = local.getUTCDay();
    const daysInMonth = new Date(Date.UTC(local.getUTCFullYear(), month + 1, 0)).getUTCDate();
    const nth = day + 7 > daysInMonth ? -1 : Math.ceil(day / 7);
    const d1970 = nthWeekday(1970, month, nth, wd);
    const kind = c.to > c.from ? 'DAYLIGHT' : 'STANDARD';
    return [
      `BEGIN:${kind}`,
      `DTSTART:1970${pad(month + 1)}${pad(d1970)}T${pad(local.getUTCHours())}${pad(local.getUTCMinutes())}00`,
      `RRULE:FREQ=YEARLY;BYMONTH=${month + 1};BYDAY=${nth}${WD[wd]}`,
      `TZOFFSETFROM:${offsetText(c.from)}`,
      `TZOFFSETTO:${offsetText(c.to)}`,
      `END:${kind}`,
    ];
  });
  return lines(...head, ...parts.flat(), 'END:VTIMEZONE');
}

// ───── Termine ─────

const RRULE: Record<NonNullable<CalEvent['repeat']>, string> = { woche: 'WEEKLY', monat: 'MONTHLY', jahr: 'YEARLY' };

function addMinutes(time: string, min: number): { time: string; days: number } {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + min;
  return { time: `${pad(Math.floor((total % 1440) / 60))}:${pad(total % 60)}`, days: Math.floor(total / 1440) };
}

function trigger(minutesBefore: number): string {
  // Positive Werte: so viele Minuten vor Beginn; negative: danach (ganztägig „am Tag um 9 Uhr“).
  return minutesBefore >= 0 ? `TRIGGER:-PT${minutesBefore}M` : `TRIGGER:PT${-minutesBefore}M`;
}

export interface VeventNames {
  /** Wer ist a, wer ist b – für „(nur Mila)“ und „eingetragen von …“. */
  a: string;
  b: string;
}

/** Ein Termin als VEVENT. Gleiche Eingabe → gleicher Text (wichtig fürs Kalender-Abo). */
export function vevent(e: CalEvent, names: VeventNames): string {
  const who = e.who === 'both' ? '' : ` (${names[e.who]})`;
  const summary = `${e.emoji} ${e.title}${who}`.trim();
  const from = e.id === ANNIVERSARY_ID ? '💞 Aus Arta' : `💞 Aus Arta · eingetragen von ${names[e.createdBy]}`;
  const description = e.note ? `${e.note}\n\n${from}` : from;
  let start: string;
  let end: string;
  if (e.time) {
    const stop = e.endTime && e.endTime !== e.time ? { time: e.endTime, days: e.endTime < e.time ? 1 : 0 } : addMinutes(e.time, 60);
    start = `DTSTART;TZID=${e.tz}:${icsLocal(e.date, e.time)}`;
    end = `DTEND;TZID=${e.tz}:${icsLocal(addDays(e.date, stop.days), stop.time)}`;
  } else {
    const span = e.endDate && e.endDate > e.date ? diffDays(e.date, e.endDate) : 0;
    start = `DTSTART;VALUE=DATE:${icsDate(e.date)}`;
    end = `DTEND;VALUE=DATE:${icsDate(addDays(e.date, span + 1))}`;
  }
  return lines(
    'BEGIN:VEVENT',
    `UID:${e.id}@arta`,
    `DTSTAMP:${icsUtc(e.updatedAt)}`,
    `LAST-MODIFIED:${icsUtc(e.updatedAt)}`,
    start,
    end,
    e.repeat && `RRULE:FREQ=${RRULE[e.repeat]}`,
    `SUMMARY:${escapeText(summary)}`,
    e.place && `LOCATION:${escapeText(e.place)}`,
    `DESCRIPTION:${escapeText(description)}`,
    e.alarm !== undefined && 'BEGIN:VALARM',
    e.alarm !== undefined && 'ACTION:DISPLAY',
    e.alarm !== undefined && `DESCRIPTION:${escapeText(summary)}`,
    e.alarm !== undefined && trigger(e.alarm),
    e.alarm !== undefined && 'END:VALARM',
    'END:VEVENT',
  );
}

export const ICS_BEGIN = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Arta//Termine//DE\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n';
export const ICS_END = 'END:VCALENDAR\r\n';

/** Eine fertige .ics-Datei mit einem Termin – zum einzelnen Importieren. */
export function singleEventIcs(e: CalEvent, names: VeventNames, year = new Date().getFullYear()): string {
  return ICS_BEGIN + (e.time ? vtimezone(e.tz, year) : '') + vevent(e, names) + ICS_END;
}

/** Kalender-Kopf fürs Abo: Name und Farbe im iPhone-Kalender, Abruf-Intervall als Wunsch. */
export function feedHead(names: VeventNames): string {
  return lines(
    `X-WR-CALNAME:${escapeText(`Arta 💞 ${names.a} & ${names.b}`)}`,
    `X-WR-CALDESC:${escapeText('Eure gemeinsamen Termine aus Arta')}`,
    'X-APPLE-CALENDAR-COLOR:#FF4F81',
    'REFRESH-INTERVAL;VALUE=DURATION:PT15M',
    'X-PUBLISHED-TTL:PT15M',
  );
}

// ───── Öffnen auf dem Handy ─────

let relayCal: boolean | undefined;
let relayCheck: Promise<boolean> | undefined;

/**
 * Kann der Push-Relay schon Kalender (neuer worker.js)? Ein älterer antwortet auf jede Adresse
 * nur mit „Arta-Push-Relay läuft ✓“.
 */
export function checkRelayCalendar(): Promise<boolean> {
  if (relayCal !== undefined) return Promise.resolve(relayCal);
  if (!PUSH_RELAY_URL) return Promise.resolve((relayCal = false));
  relayCheck ??= fetch(`${PUSH_RELAY_URL}/kalender`)
    .then(async (res) => (relayCal = res.ok && (await res.text()).includes('Kalender')))
    .catch(() => false) // offline: beim nächsten Mal neu fragen
    .finally(() => (relayCheck = undefined));
  return relayCheck;
}

export function useRelayCalendar(): boolean | undefined {
  const [ok, setOk] = useState(relayCal);
  useEffect(() => {
    let alive = true;
    void checkRelayCalendar().then((v) => alive && setOk(v));
    return () => {
      alive = false;
    };
  }, []);
  return ok;
}

const fileName = (name: string) => name.normalize('NFKD').replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'termin';

/**
 * Öffnet eine .ics-Datei so, dass das Handy „Zum Kalender hinzufügen“ anbietet.
 * Auf dem iPhone klappt das zuverlässig nur, wenn Safari die Datei von einer echten Adresse lädt
 * (data:- und blob:-Links landen höchstens bei den Downloads) – dafür schickt der Push-Relay
 * den Text unter `/termin.ics` einfach zurück. Ohne Relay bleibt der Download.
 *
 * Muss direkt aus einem Antippen heraus aufgerufen werden (sonst blockt der Browser das Fenster).
 */
export function openIcs(ics: string, name: string): 'relay' | 'download' {
  const file = fileName(name);
  if (relayCal) {
    const d = toB64Url(new TextEncoder().encode(ics));
    window.open(`${PUSH_RELAY_URL}/termin.ics?n=${file}&d=${d}`, '_blank', 'noopener');
    return 'relay';
  }
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${file}.ics`;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'download';
}
