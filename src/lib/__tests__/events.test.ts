import { describe, expect, it } from 'vitest';
import { buildFeedDoc, deriveCalKey, openFeed, sealFeed } from '../calendar';
import { countdown, nextStart, past, timeText, upcoming, whenText } from '../events';
import { foldLine, singleEventIcs, vevent, vtimezone, zoneOffset } from '../ics';
import { deriveRoom } from '../live';
import { emptyData } from '../store';
import { buildPayload, mergeData } from '../sync';
import type { AppData, CalEvent } from '../types';

function ev(id: string, extra: Partial<CalEvent> = {}): CalEvent {
  return {
    id,
    title: 'Kino',
    emoji: '🎬',
    date: '2026-10-30',
    time: '20:00',
    who: 'both',
    tz: 'Europe/Berlin',
    createdBy: 'a',
    createdAt: 1_790_000_000_000,
    updatedAt: 1_790_000_000_000,
    ...extra,
  };
}

function withEvents(...events: CalEvent[]): AppData {
  const d = emptyData();
  d.persons.a = { ...d.persons.a, name: 'Amir' };
  d.persons.b = { ...d.persons.b, name: 'Mila' };
  d.events = Object.fromEntries(events.map((e) => [e.id, e]));
  return d;
}

const unfold = (ics: string) => ics.replace(/\r\n /g, '');

describe('Termine: Wiederholungen & Liste', () => {
  it('findet das nächste Vorkommen – auch laufende mehrtägige Termine', () => {
    expect(nextStart(ev('a'), '2026-10-30')).toBe('2026-10-30');
    expect(nextStart(ev('a'), '2026-10-31')).toBeUndefined();
    const urlaub = ev('u', { time: undefined, date: '2026-10-28', endDate: '2026-11-02' });
    expect(nextStart(urlaub, '2026-10-31')).toBe('2026-10-28');
    expect(nextStart(urlaub, '2026-11-03')).toBeUndefined();
  });

  it('wiederholt wöchentlich, monatlich und jährlich (ohne Phantom-Tage)', () => {
    expect(nextStart(ev('w', { repeat: 'woche', date: '2026-10-06' }), '2026-10-26')).toBe('2026-10-27');
    // Am 31. gibt es keinen November-Termin – der nächste ist im Dezember.
    expect(nextStart(ev('m', { repeat: 'monat', date: '2026-08-31' }), '2026-11-01')).toBe('2026-12-31');
    expect(nextStart(ev('j', { repeat: 'jahr', date: '1990-03-15', time: undefined }), '2026-10-26')).toBe('2027-03-15');
    expect(nextStart(ev('f', { repeat: 'jahr', date: '2024-02-29', time: undefined }), '2026-10-26')).toBe('2028-02-29');
  });

  it('sortiert nach Tag und Uhrzeit und zeigt den Jahrestag automatisch', () => {
    const d = withEvents(ev('spaet', { time: '21:00' }), ev('frueh', { time: '09:00' }), ev('alt', { date: '2026-01-01' }), ev('weg', { deleted: true }));
    d.couple = { ...d.couple, anniversary: '2023-11-05', updatedAt: 5 };
    const list = upcoming(d, '2026-10-26');
    expect(list.map((o) => o.event.id)).toEqual(['frueh', 'spaet', 'jahrestag']);
    expect(list[2]).toMatchObject({ start: '2026-11-05', virtual: true });
    expect(past(d, '2026-10-26').map((o) => o.event.id)).toEqual(['alt']);
  });

  it('beschreibt Zeit und Countdown auf Deutsch', () => {
    const o = { event: ev('a', { endTime: '22:30' }), start: '2026-10-30', end: '2026-10-30' };
    expect(whenText(o, '2026-10-29')).toBe('Morgen, 20:00–22:30 Uhr');
    expect(timeText(o, '2026-10-29')).toBe('20:00–22:30 Uhr');
    expect(countdown(o, '2026-10-29')).toBe('morgen');
    expect(countdown(o, '2026-10-20')).toBe('in 10 Tagen');
    const urlaub = { event: ev('u', { time: undefined, endDate: '2026-11-02' }), start: '2026-10-30', end: '2026-11-02' };
    expect(timeText(urlaub, '2026-10-26')).toBe('bis Mo, 2. Nov.');
    expect(countdown(urlaub, '2026-10-31')).toBe('läuft');
  });
});

describe('iCalendar', () => {
  it('kennt die Zeitzonen-Abstände', () => {
    expect(zoneOffset(Date.UTC(2026, 6, 1), 'Europe/Berlin')).toBe(120);
    expect(zoneOffset(Date.UTC(2026, 0, 1), 'Europe/Berlin')).toBe(60);
    expect(zoneOffset(Date.UTC(2026, 0, 1), 'America/New_York')).toBe(-300);
  });

  it('schreibt VTIMEZONE mit den Umstellungsregeln', () => {
    const berlin = unfold(vtimezone('Europe/Berlin', 2026));
    expect(berlin).toContain('BEGIN:DAYLIGHT\r\nDTSTART:19700329T020000\r\nRRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU\r\nTZOFFSETFROM:+0100\r\nTZOFFSETTO:+0200');
    expect(berlin).toContain('BEGIN:STANDARD\r\nDTSTART:19701025T030000\r\nRRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU\r\nTZOFFSETFROM:+0200\r\nTZOFFSETTO:+0100');
    const ny = vtimezone('America/New_York', 2026);
    expect(ny).toContain('BYMONTH=3;BYDAY=2SU');
    expect(ny).toContain('BYMONTH=11;BYDAY=1SU');
    expect(ny).toContain('TZOFFSETTO:-0400');
    const tokyo = vtimezone('Asia/Tokyo', 2026);
    expect(tokyo).toContain('TZOFFSETTO:+0900');
    expect(tokyo).not.toContain('DAYLIGHT');
  });

  it('baut einen Termin mit Ortszeit, Ende, Wiederholung und Erinnerung', () => {
    const names = { a: 'Amir', b: 'Mila' };
    const text = unfold(vevent(ev('k1', { who: 'b', place: 'Kino, Saal 3', note: 'Popcorn!\nTickets hat Amir', repeat: 'woche', alarm: 60 }), names));
    expect(text).toContain('UID:k1@arta');
    expect(text).toContain('DTSTART;TZID=Europe/Berlin:20261030T200000');
    expect(text).toContain('DTEND;TZID=Europe/Berlin:20261030T210000');
    expect(text).toContain('RRULE:FREQ=WEEKLY');
    expect(text).toContain('SUMMARY:🎬 Kino (Mila)');
    expect(text).toContain('LOCATION:Kino\\, Saal 3');
    expect(text).toContain('DESCRIPTION:Popcorn!\\nTickets hat Amir\\n\\n💞 Aus Arta · eingetragen von Amir');
    expect(text).toContain('BEGIN:VALARM\r\nACTION:DISPLAY');
    expect(text).toContain('TRIGGER:-PT60M');
    // Über Mitternacht und ganztägig über mehrere Tage
    expect(vevent(ev('n', { time: '23:00', endTime: '01:00' }), names)).toContain('DTEND;TZID=Europe/Berlin:20261031T010000');
    const urlaub = vevent(ev('u', { time: undefined, date: '2026-12-27', endDate: '2027-01-02', alarm: -540 }), names);
    expect(urlaub).toContain('DTSTART;VALUE=DATE:20261227');
    expect(urlaub).toContain('DTEND;VALUE=DATE:20270103');
    expect(urlaub).toContain('TRIGGER:PT540M');
  });

  it('bricht lange Zeilen nach höchstens 75 Byte um, ohne Emojis zu zerteilen', () => {
    const line = `SUMMARY:${'💞'.repeat(40)}`;
    const folded = foldLine(line);
    for (const part of folded.split('\r\n')) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, '')).toBe(line);
  });

  it('liefert eine vollständige Datei für einen einzelnen Termin', () => {
    const ics = singleEventIcs(ev('k1'), { a: 'Amir', b: 'Mila' }, 2026);
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0')).toBe(true);
    expect(ics).toContain('BEGIN:VTIMEZONE\r\nTZID:Europe/Berlin');
    expect(ics.endsWith('END:VEVENT\r\nEND:VCALENDAR\r\n')).toBe(true);
  });
});

describe('Kalender-Abo', () => {
  it('ist auf beiden Handys gleich und kennt gelöschte Termine', () => {
    const d = withEvents(ev('b2'), ev('a1', { time: undefined }), ev('x', { deleted: true, updatedAt: 9 }));
    const one = buildFeedDoc(d, 'a', 2026);
    const two = buildFeedDoc(structuredClone(d), 'a', 2026);
    expect(JSON.stringify(one)).toBe(JSON.stringify(two));
    expect(one.events.map((e) => e.id)).toEqual(['a1', 'b2', 'x']);
    expect(one.events[2]).toEqual({ id: 'x', t: 9, del: 1 });
    expect(Object.keys(one.zones)).toEqual(['Europe/Berlin']);
    expect(one.head).toContain('X-WR-CALNAME:Arta 💞 Amir & Mila');
  });

  it('verschlüsselt mit eigenem Schlüssel, der nicht der Raum-Schlüssel ist', async () => {
    const secret = 'A'.repeat(43);
    const { raw, key } = await deriveCalKey(secret);
    expect(raw).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const doc = buildFeedDoc(withEvents(ev('k1')), 'b', 2026);
    const node = await sealFeed(doc, key, 42);
    expect(node).toMatchObject({ v: 1, at: 42 });
    expect(await openFeed(node, key)).toEqual(doc);
    const room = await deriveRoom(secret);
    await expect(openFeed(node, room.key)).rejects.toThrow();
  });
});

describe('Termine im Paar-Sync', () => {
  it('kommen vollständig mit und zählen als neu', () => {
    const local = emptyData();
    const remote = withEvents(ev('k1', { date: '2020-01-01' }));
    const payload = buildPayload(remote, 'b', 'dev', '2026-10-26');
    expect(Object.keys(payload.data.events)).toEqual(['k1']);
    const { data, stats } = mergeData(local, payload.data, 'a');
    expect(data.events.k1.title).toBe('Kino');
    expect(stats.newEvents).toBe(1);
  });

  it('übersteht Stände von Handys ohne Termine', () => {
    const old = emptyData() as unknown as Record<string, unknown>;
    delete old.events;
    const { data } = mergeData(withEvents(ev('k1')), old as unknown as AppData, 'a');
    expect(data.events.k1).toBeDefined();
  });
});
