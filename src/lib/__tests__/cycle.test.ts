import { describe, expect, it } from 'vitest';
import { FLOWS, INFO_TOPICS, PHASES, SYMPTOMS } from '../../data/cycle';
import { cycleStats, dayInfo, dueDate, fertilityFor, getCycle, periodsOf, phaseFor, phaseSegments, pregnancyWeek } from '../cycle';
import { emptyData } from '../store';
import { buildPayload, mergeData } from '../sync';
import type { AppData, Period } from '../types';

const SETTINGS = { personId: 'b' as const, cycleLength: 28, periodLength: 5 };

function withCycle(periods: Omit<Period, 'id' | 'updatedAt' | 'personId'>[]): AppData {
  const d = emptyData();
  d.couple = { ...d.couple, cycle: SETTINGS, updatedAt: 1 };
  d.periods = Object.fromEntries(periods.map((p, i) => [`p${i}`, { ...p, id: `p${i}`, personId: 'b', updatedAt: 1 }]));
  return d;
}

describe('Zyklus-Phasen', () => {
  it('teilt einen 28-Tage-Zyklus richtig ein', () => {
    expect(phaseFor(1, 28, 5)).toBe('menstruation');
    expect(phaseFor(5, 28, 5)).toBe('menstruation');
    expect(phaseFor(6, 28, 5)).toBe('follikel');
    expect(phaseFor(13, 28, 5)).toBe('eisprung');
    expect(phaseFor(14, 28, 5)).toBe('eisprung');
    expect(phaseFor(15, 28, 5)).toBe('eisprung');
    expect(phaseFor(16, 28, 5)).toBe('luteal');
    expect(phaseFor(28, 28, 5)).toBe('luteal');
    expect(phaseFor(29, 28, 5)).toBe('spaet');
  });

  it('legt den Eisprung 14 Tage vor die nächste Periode', () => {
    expect(phaseFor(18, 32, 5)).toBe('eisprung');
    expect(fertilityFor(18, 32)).toBe('hoch');
    expect(fertilityFor(13, 32)).toBe('mittel');
    expect(fertilityFor(12, 32)).toBe('niedrig');
    expect(fertilityFor(19, 32)).toBe('mittel');
    expect(fertilityFor(20, 32)).toBe('niedrig');
  });

  it('die Phasen-Leiste deckt den ganzen Zyklus ab', () => {
    for (const [L, P] of [
      [21, 7],
      [28, 5],
      [35, 4],
    ]) {
      const total = phaseSegments(L, P).reduce((a, [, n]) => a + n, 0);
      expect(total).toBe(L);
    }
  });
});

describe('Zyklus-Vorhersage', () => {
  it('rechnet mit den echten Abständen statt dem Standardwert', () => {
    const d = withCycle([
      { start: '2026-07-01', end: '2026-07-04' },
      { start: '2026-07-31', end: '2026-08-03' },
      { start: '2026-08-30', end: '2026-09-02' },
      { start: '2026-09-29', end: '2026-10-02' },
    ]);
    const stats = cycleStats(periodsOf(d, 'b'), SETTINGS);
    expect(stats).toMatchObject({ cycleLength: 30, periodLength: 4, measured: 3, shortest: 30, longest: 30 });
  });

  it('ignoriert unplausible Lücken (vergessene Einträge)', () => {
    const d = withCycle([{ start: '2026-05-01' }, { start: '2026-08-01' }, { start: '2026-08-29' }]);
    const stats = cycleStats(periodsOf(d, 'b'), SETTINGS);
    expect(stats.cycleLength).toBe(28);
    expect(stats.measured).toBe(1);
  });

  it('zeigt den aktuellen Zyklustag, die Phase und die nächste Periode', () => {
    const d = withCycle([{ start: '2026-10-14' }]);
    const c = getCycle(d, '2026-10-25')!;
    expect(c.todayInfo.cycleDay).toBe(12);
    expect(c.todayInfo.phase).toBe('follikel');
    expect(c.next).toBe('2026-11-11');
    expect(c.lateBy).toBe(0);
    expect(c.predictions).toEqual(['2026-11-11', '2026-12-09', '2027-01-06']);
    expect(c.fertile).toEqual({ start: '2026-10-22', end: '2026-10-28', ovulation: '2026-10-27' });
    expect(c.current).toBeUndefined();
  });

  it('erkennt eine laufende Periode und eine überfällige', () => {
    const running = getCycle(withCycle([{ start: '2026-10-23' }]), '2026-10-25')!;
    expect(running.current?.start).toBe('2026-10-23');
    expect(running.todayInfo.period).toBe('logged');
    expect(running.open?.start).toBe('2026-10-23');

    const late = getCycle(withCycle([{ start: '2026-09-20', end: '2026-09-24' }]), '2026-10-25')!;
    expect(late.lateBy).toBe(7);
    expect(late.todayInfo.phase).toBe('spaet');
    expect(late.next).toBe('2026-10-26');
    // Der nächste fruchtbare Zeitraum wird ab der verschobenen Prognose gerechnet.
    expect(late.fertile?.ovulation).toBe('2026-11-08');
  });

  it('markiert Kalendertage rückblickend und als Prognose', () => {
    const d = withCycle([
      { start: '2026-09-15', end: '2026-09-19' },
      { start: '2026-10-14', end: '2026-10-18' },
    ]);
    const c = getCycle(d, '2026-10-25')!;
    // Vergangener Zyklus war 29 Tage lang → Eisprung an Tag 15
    expect(dayInfo(c, '2026-09-29')).toMatchObject({ cycleDay: 15, ovulation: true, predicted: false });
    expect(dayInfo(c, '2026-10-16').period).toBe('logged');
    expect(dayInfo(c, '2026-10-20').period).toBeUndefined();
    // Prognose: nächster Beginn 14.10. + 29
    expect(c.next).toBe('2026-11-12');
    expect(dayInfo(c, '2026-11-12')).toMatchObject({ cycleDay: 1, period: 'predicted', predicted: true });
    expect(dayInfo(c, '2026-12-11')).toMatchObject({ cycleDay: 1, period: 'predicted' });
    expect(dayInfo(c, '2026-09-01')).toEqual({ predicted: false });
  });

  it('fasst doppelt eingetragene Perioden zusammen', () => {
    const d = withCycle([{ start: '2026-10-14' }, { start: '2026-10-15', end: '2026-10-19' }]);
    const list = periodsOf(d, 'b');
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ start: '2026-10-14', end: '2026-10-19' });
  });

  it('ohne Einrichtung gibt es keinen Zyklus', () => {
    expect(getCycle(emptyData(), '2026-10-25')).toBeUndefined();
  });
});

describe('Schwangerschaft', () => {
  it('rechnet den Geburtstermin nach Naegele', () => {
    expect(dueDate('2026-10-01')).toBe('2027-07-08');
    expect(dueDate('2026-10-01', 30)).toBe('2027-07-10');
  });

  it('zählt Schwangerschaftswochen', () => {
    expect(pregnancyWeek('2026-09-01', '2026-10-15')).toEqual({ weeks: 6, days: 2 });
  });
});

describe('Zyklus-Sync', () => {
  it('schickt alle Perioden mit und führt sie zusammen', () => {
    const d = withCycle([{ start: '2025-01-01' }, { start: '2026-10-14' }]);
    const payload = buildPayload(d, 'b', 'dev', '2026-10-25');
    expect(Object.keys(payload.data.periods)).toHaveLength(2);
    const { data } = mergeData(emptyData(), payload.data, 'a');
    expect(data.couple.cycle?.personId).toBe('b');
    expect(Object.keys(data.periods)).toHaveLength(2);
  });
});

describe('Zyklus-Inhalte', () => {
  it('hat für jede Phase Tipps für beide', () => {
    for (const ph of Object.values(PHASES)) {
      expect(ph.self.length).toBeGreaterThanOrEqual(3);
      expect(ph.partner.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('hat eindeutige Symptome und Themen', () => {
    expect(new Set(SYMPTOMS.map((s) => s.id)).size).toBe(SYMPTOMS.length);
    expect(new Set(INFO_TOPICS.map((t) => t.id)).size).toBe(INFO_TOPICS.length);
    expect(FLOWS).toHaveLength(4);
  });
});
