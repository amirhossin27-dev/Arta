import { describe, expect, it } from 'vitest';
import { HEALTH_TIPS, PRESET_BY_ID, ROUTINE_NUDGES, ROUTINE_PRESETS, ROUTINE_REMINDERS, ROUTINES_ALL_DONE, TIP_CATEGORIES } from '../../data/health';
import { addDays, todayKey } from '../date';
import {
  allDone,
  dailyTip,
  dueRoutines,
  fillRoutine,
  foldLine,
  icsFileName,
  MAX_ROUTINES,
  routineIcs,
  routineId,
  routineStatus,
  slotOf,
  tipsForMonth,
  validTime,
} from '../routines';
import { points } from '../stats';
import { actions, emptyData, getData, getDevice, normalizeData } from '../store';
import { buildPayload, mergeData } from '../sync';
import type { AppData, Routine } from '../types';

const r = (id: string, time: string, remind = true): Routine => ({ id, emoji: '🌿', name: id, time, remind });

describe('Gesundheitstipps', () => {
  it('haben eindeutige IDs, bekannte Kategorien und passende Routinen', () => {
    expect(new Set(HEALTH_TIPS.map((t) => t.id)).size).toBe(HEALTH_TIPS.length);
    expect(new Set(ROUTINE_PRESETS.map((p) => p.id)).size).toBe(ROUTINE_PRESETS.length);
    const cats = new Set(TIP_CATEGORIES.map((c) => c.id));
    for (const t of HEALTH_TIPS) {
      expect(cats.has(t.category), t.id).toBe(true);
      if (t.routine) expect(PRESET_BY_ID[t.routine], t.id).toBeDefined();
      for (const m of t.months ?? []) expect(m >= 1 && m <= 12, t.id).toBe(true);
    }
    for (const c of TIP_CATEGORIES) expect(HEALTH_TIPS.filter((t) => t.category === c.id).length, c.id).toBeGreaterThanOrEqual(4);
    for (const p of ROUTINE_PRESETS) expect(validTime(p.time), p.id).toBe(true);
  });

  it('haben die gewünschten Klassiker: Vitamine und Schwarzkümmelöl am Abend', () => {
    expect(PRESET_BY_ID['schwarzkuemmel'].time >= '18:00').toBe(true);
    expect(PRESET_BY_ID['vitamin-d']).toBeDefined();
    expect(HEALTH_TIPS.some((t) => t.routine === 'schwarzkuemmel')).toBe(true);
  });

  it('zeigt jeden Tag einen Tipp – innerhalb eines Monats ohne Wiederholung', () => {
    for (let m = 1; m <= 12; m++) expect(tipsForMonth(m).length, `Monat ${m}`).toBeGreaterThanOrEqual(31);
    const start = '2026-01-01';
    const seen = new Set<string>();
    for (let i = 0; i < 31; i++) seen.add(dailyTip(addDays(start, i)).id);
    expect(seen.size).toBe(31);
    // Beide Handys sehen denselben Tipp, „Noch ein Tipp“ blättert weiter.
    expect(dailyTip('2026-10-26').id).toBe(dailyTip('2026-10-26').id);
    expect(dailyTip('2026-10-26', 1).id).not.toBe(dailyTip('2026-10-26').id);
  });

  it('richtet sich nach der Jahreszeit', () => {
    expect(tipsForMonth(1).some((t) => t.id === 'vitd-winter')).toBe(true);
    expect(tipsForMonth(7).some((t) => t.id === 'vitd-winter')).toBe(false);
    expect(tipsForMonth(7).some((t) => t.id === 'sonnenschutz')).toBe(true);
    expect(tipsForMonth(12).some((t) => t.id === 'sonnenschutz')).toBe(false);
  });

  it('füllt Texte mit Routine und Namen', () => {
    for (const t of [...ROUTINE_REMINDERS, ...ROUTINES_ALL_DONE, ...ROUTINE_NUDGES]) {
      const out = fillRoutine(t, { emoji: '🌿', name: 'Schwarzkümmelöl' }, { me: 'Amir', partner: 'Mila' });
      expect(out, t).not.toMatch(/\{\w+\}/);
    }
    expect(fillRoutine('Zeit für {routine}, {me}!', { emoji: '☀️', name: 'Vitamin D' }, { me: 'Amir', partner: 'Mila' })).toBe('Zeit für ☀️ Vitamin D, Amir!');
  });
});

describe('Routinen', () => {
  it('ordnet Uhrzeiten dem Tag zu', () => {
    expect(slotOf('07:30')).toBe('morgens');
    expect(slotOf('13:00')).toBe('mittags');
    expect(slotOf('21:00')).toBe('abends');
    expect(validTime('21:00')).toBe(true);
    expect(validTime('24:00')).toBe(false);
    expect(validTime('')).toBe(false);
  });

  it('vergibt freie IDs', () => {
    expect(routineId([], 'vitamin-d')).toBe('vitamin-d');
    expect(routineId([r('vitamin-d', '08:00')], 'vitamin-d')).toBe('vitamin-d-2');
    expect(routineId([r('vitamin-d', '08:00'), r('vitamin-d-2', '08:00')], 'vitamin-d')).toBe('vitamin-d-3');
  });

  it('erinnert nur an offene, fällige Routinen und jede nur einmal', () => {
    const s = { routines: [r('a', '08:00'), r('b', '21:00'), r('c', '07:00', false), r('d', '06:00')], done: new Set(['d']) };
    expect(dueRoutines(s, '07:59', new Set()).map((x) => x.id)).toEqual([]);
    expect(dueRoutines(s, '08:00', new Set()).map((x) => x.id)).toEqual(['a']);
    expect(dueRoutines(s, '22:15', new Set(['a'])).map((x) => x.id)).toEqual(['b']);
  });

  it('werden abgehakt, zählen Herzpunkte und reisen beim Sync mit', () => {
    const me = getDevice().me;
    const today = todayKey();
    const before = points(getData());
    actions.addRoutine({ id: 'vitamin-d', emoji: '☀️', name: 'Vitamin D', time: '08:00', remind: true });
    actions.addRoutine({ id: 'schwarzkuemmel', emoji: '🌿', name: 'Schwarzkümmelöl', time: '21:00', remind: true });
    expect(routineStatus(getData(), today, me).routines.map((x) => x.id)).toEqual(['vitamin-d', 'schwarzkuemmel']);

    actions.setRoutineDone(today, 'vitamin-d', true);
    let s = routineStatus(getData(), today, me);
    expect(s.done.has('vitamin-d')).toBe(true);
    expect(allDone(s)).toBe(false);
    expect(points(getData())).toBe(before);

    actions.setRoutineDone(today, 'schwarzkuemmel', true);
    s = routineStatus(getData(), today, me);
    expect(allDone(s)).toBe(true);
    expect(points(getData())).toBe(before + 3);

    // Wieder öffnen nimmt die Punkte zurück.
    actions.setRoutineDone(today, 'schwarzkuemmel', false);
    expect(points(getData())).toBe(before);

    // Fällt eine offene Routine weg, ist der Tag komplett.
    actions.removeRoutine('schwarzkuemmel');
    expect(allDone(routineStatus(getData(), today, me))).toBe(true);
    expect(getData().routineDays[`${today}-${me}`].total).toBe(1);

    // Das andere Handy übernimmt Routinen und Häkchen.
    const payload = buildPayload(getData(), me, 'dev-a', today);
    const other = mergeData(emptyData(), payload.data, me === 'a' ? 'b' : 'a').data;
    expect(other.persons[me].routines?.map((x) => x.id)).toEqual(['vitamin-d']);
    expect(routineStatus(other, today, me).done.has('vitamin-d')).toBe(true);
  });

  it('begrenzt die Anzahl', () => {
    const start = getData().persons[getDevice().me].routines?.length ?? 0;
    for (let i = start; i < MAX_ROUTINES; i++) expect(actions.addRoutine({ emoji: '💊', name: `R${i}`, time: '09:00', remind: false })).toBeDefined();
    expect(actions.addRoutine({ emoji: '💊', name: 'zu viel', time: '09:00', remind: false })).toBeUndefined();
  });

  it('übersteht alte Stände ohne Routinen', () => {
    const old = { ...emptyData() } as Partial<AppData>;
    delete old.routineDays;
    const d = normalizeData(old);
    expect(d.routineDays).toEqual({});
    expect(routineStatus(d, '2026-10-26', 'a').routines).toEqual([]);
  });
});

describe('Kalender-Erinnerung', () => {
  const ics = routineIcs(
    { id: 'schwarzkuemmel', emoji: '🌿', name: 'Schwarzkümmelöl, 1 TL; abends', time: '21:00', remind: true },
    'a',
    '2026-10-26',
    'https://amirhossin27-dev.github.io/Arta/#tab=heute',
    new Date(Date.UTC(2026, 9, 26, 20, 15, 0)),
  );

  it('wiederholt sich täglich zur Uhrzeit und erinnert dabei', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('\r\nDTSTART:20261026T210000\r\n');
    expect(ics).toContain('\r\nRRULE:FREQ=DAILY\r\n');
    expect(ics).toContain('\r\nDTSTAMP:20261026T201500Z\r\n');
    expect(ics).toContain('BEGIN:VALARM');
    expect(ics).toContain('UID:arta-routine-a-schwarzkuemmel@arta');
    expect(ics).toContain('SUMMARY:🌿 Schwarzkümmelöl\\, 1 TL\\; abends');
    expect(ics).not.toMatch(/[^\r]\n/);
  });

  it('bricht lange Zeilen nach 75 Byte um, ohne Zeichen zu zerteilen', () => {
    const enc = new TextEncoder();
    for (const line of ics.split('\r\n')) expect(enc.encode(line).length, line).toBeLessThanOrEqual(75);
    const long = 'DESCRIPTION:' + '💚ä'.repeat(40);
    const folded = foldLine(long);
    expect(folded.replace(/\r\n /g, '')).toBe(long);
    for (const line of folded.split('\r\n')) expect(enc.encode(line).length).toBeLessThanOrEqual(75);
  });

  it('hat einen lesbaren Dateinamen', () => {
    expect(icsFileName({ name: 'Schwarzkümmelöl' })).toBe('arta-schwarzkuemmeloel.ics');
    expect(icsFileName({ name: '💊' })).toBe('arta-routine.ics');
  });
});
