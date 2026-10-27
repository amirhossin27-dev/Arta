import { describe, expect, it } from 'vitest';
import { FLOWS, INFO_TOPICS, PHASES, SYMPTOMS, TESTS, TTC_STAGES } from '../../data/cycle';
import {
  cycleStats,
  dayInfo,
  dueDate,
  fertilityFor,
  getCycle,
  loveHistory,
  loveOn,
  MAX_LOVE,
  periodsOf,
  phaseFor,
  phaseSegments,
  pregnancyWeek,
  ttcRound,
  ttcStatus,
} from '../cycle';
import { actions, commitData, emptyData, getData } from '../store';
import { buildPayload, mergeData } from '../sync';
import type { AppData, CycleDay, Period } from '../types';

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

function withTest(d: AppData, date: string, changes: Partial<CycleDay>): AppData {
  const id = `${date}-b`;
  return { ...d, cycleDays: { ...d.cycleDays, [id]: { id, date, personId: 'b', symptoms: [], updatedAt: 1, ...changes } } };
}

function withLove(d: AppData, dates: string[]): AppData {
  return { ...d, loveDays: Object.fromEntries(dates.map((date) => [date, { id: date, date, count: 1, updatedAt: 1 }])) };
}

function ttc(d: AppData, since?: string): AppData {
  return { ...d, couple: { ...d.couple, cycle: { ...SETTINGS, ttc: true, ttcSince: since } } };
}

describe('Ovulationstest', () => {
  it('verschiebt Eisprung, fruchtbares Fenster und nächste Periode', () => {
    const plain = getCycle(withCycle([{ start: '2026-10-01' }]), '2026-10-20')!;
    expect(plain.ovulation).toBe('2026-10-14');
    expect(plain.next).toBe('2026-10-29');

    // Positiv an Zyklustag 17 → Eisprung an Tag 18, Periode ca. 14 Tage später
    const d = withTest(withCycle([{ start: '2026-10-01' }]), '2026-10-17', { lh: 'pos' });
    const c = getCycle(d, '2026-10-20')!;
    expect(c.lhOvulation).toEqual({ '2026-10-01': 18 });
    expect(c.ovulation).toBe('2026-10-18');
    expect(c.length).toBe(32);
    expect(c.next).toBe('2026-11-02');
    expect(c.lateBy).toBe(0);
    expect(c.todayInfo).toMatchObject({ cycleDay: 20, phase: 'luteal', byTest: true });
    expect(dayInfo(c, '2026-10-18')).toMatchObject({ ovulation: true, fertility: 'hoch', byTest: true });
    expect(dayInfo(c, '2026-10-14')).toMatchObject({ ovulation: false, fertility: 'mittel' });
    expect(phaseSegments(c.length, 5, c.ovDay).reduce((a, [, n]) => a + n, 0)).toBe(32);
  });

  it('nimmt nur den ersten positiven Test und ignoriert negative oder unplausible', () => {
    let d = withCycle([{ start: '2026-10-01' }]);
    d = withTest(d, '2026-10-12', { lh: 'neg' });
    d = withTest(d, '2026-10-13', { lh: 'pos' });
    d = withTest(d, '2026-10-14', { lh: 'pos' });
    expect(getCycle(d, '2026-10-20')!.lhOvulation).toEqual({ '2026-10-01': 14 });

    const early = withTest(withCycle([{ start: '2026-10-01' }]), '2026-10-03', { lh: 'pos' });
    expect(getCycle(early, '2026-10-20')!.lhOvulation).toEqual({});
  });

  it('wirkt auch rückblickend auf vergangene Zyklen', () => {
    const d = withTest(
      withCycle([
        { start: '2026-09-01', end: '2026-09-05' },
        { start: '2026-09-30', end: '2026-10-04' },
      ]),
      '2026-09-11',
      { lh: 'pos' },
    );
    const c = getCycle(d, '2026-10-10')!;
    expect(dayInfo(c, '2026-09-12')).toMatchObject({ cycleDay: 12, ovulation: true, byTest: true });
    expect(dayInfo(c, '2026-09-16').ovulation).toBe(false);
  });
});

describe('Kinderwunsch', () => {
  const base = () => ttc(withCycle([{ start: '2026-10-01' }]));

  it('kennt die Etappen eines Zyklus', () => {
    const at = (today: string, d = base()) => ttcStatus(d, getCycle(d, today)!)!;
    expect(at('2026-10-03')).toMatchObject({ stage: 'periode', days: 6 });
    expect(at('2026-10-06')).toMatchObject({ stage: 'vorher', days: 3, window: { start: '2026-10-09', end: '2026-10-15', ovulation: '2026-10-14' } });
    expect(at('2026-10-12')).toMatchObject({ stage: 'fenster', days: 4 });
    expect(at('2026-10-20')).toMatchObject({ stage: 'warten', days: 9, testDay: '2026-10-29' });
    expect(at('2026-10-29')).toMatchObject({ stage: 'test', testDay: '2026-10-29' });
    expect(at('2026-10-31')).toMatchObject({ stage: 'test' });
    expect(at('2026-10-31', withTest(base(), '2026-10-30', { hcg: 'pos' }))).toMatchObject({ stage: 'positiv', positive: '2026-10-30' });
    // Ein negativer Test ändert nichts
    expect(at('2026-10-31', withTest(base(), '2026-10-30', { hcg: 'neg' })).stage).toBe('test');
  });

  it('wartet nach positivem Ovulationstest länger auf den Test', () => {
    const d = withTest(base(), '2026-10-17', { lh: 'pos' });
    expect(ttcStatus(d, getCycle(d, '2026-10-20')!)).toMatchObject({ stage: 'warten', testDay: '2026-11-02', window: { ovulation: '2026-10-18' } });
  });

  it('zählt Liebe im fruchtbaren Fenster', () => {
    const d = withLove(base(), ['2026-10-05', '2026-10-10', '2026-10-13', '2026-10-20']);
    expect(ttcStatus(d, getCycle(d, '2026-10-11')!)!.loveInWindow).toBe(1);
    expect(ttcStatus(d, getCycle(d, '2026-10-20')!)!.loveInWindow).toBe(2);
  });

  it('zählt die Kinderwunsch-Zyklen ab dem Start', () => {
    const d = ttc(withCycle([{ start: '2026-08-05' }, { start: '2026-09-03' }, { start: '2026-10-01' }]), '2026-09-10');
    expect(ttcRound(getCycle(d, '2026-10-20')!)).toBe(2);
    expect(ttcRound(getCycle(ttc(withCycle([{ start: '2026-10-01' }])), '2026-10-20')!)).toBe(1);
    expect(ttcRound(getCycle(ttc(withCycle([{ start: '2026-10-01' }]), '2026-10-25'), '2026-10-20')!)).toBe(1);
  });

  it('zeigt im Rückblick, wie das Timing in jedem Zyklus lag', () => {
    const d = withLove(withCycle([{ start: '2026-09-03' }, { start: '2026-10-01' }]), ['2026-09-12', '2026-09-20', '2026-10-10', '2026-10-13', '2026-10-20']);
    const h = loveHistory(d, getCycle(d, '2026-10-25')!);
    expect(h).toHaveLength(2);
    expect(h[0]).toMatchObject({ start: '2026-10-01', end: '2026-10-25', running: true, days: 3, inWindow: 2, top: 1 });
    expect(h[1]).toMatchObject({ start: '2026-09-03', end: '2026-09-30', running: false, days: 2, inWindow: 1, window: { ovulation: '2026-09-16' } });
  });
});

describe('Zweisamkeit eintragen', () => {
  it('setzt, zählt und löscht einen Tag', () => {
    commitData(emptyData());
    actions.setLoveDay('2026-10-20', 1);
    expect(loveOn(getData(), '2026-10-20')).toBe(1);
    actions.setLoveDay('2026-10-20', 99);
    expect(loveOn(getData(), '2026-10-20')).toBe(MAX_LOVE);
    actions.setLoveDay('2026-10-20', 0);
    expect(loveOn(getData(), '2026-10-20')).toBe(0);
    expect(getData().loveDays['2026-10-20'].deleted).toBe(true);
    actions.setLoveDay('2026-10-20', 1);
    expect(loveOn(getData(), '2026-10-20')).toBe(1);
  });

  it('wird komplett synchronisiert und von beiden Handys zu einem Eintrag', () => {
    const mine = withLove(emptyData(), ['2025-01-14', '2026-10-20']);
    const theirs = withLove(emptyData(), ['2026-10-20', '2026-10-22']);
    const payload = buildPayload(mine, 'a', 'dev-a', '2026-10-25');
    expect(Object.keys(payload.data.loveDays)).toEqual(['2025-01-14', '2026-10-20']);
    const { data } = mergeData(theirs, payload.data, 'b');
    expect(Object.keys(data.loveDays).sort()).toEqual(['2025-01-14', '2026-10-20', '2026-10-22']);
  });

  it('ältere Stände ohne Liebestage stürzen nicht ab', () => {
    const old = emptyData() as Partial<AppData>;
    delete old.loveDays;
    const { data } = mergeData(emptyData(), old as AppData, 'a');
    expect(data.loveDays).toEqual({});
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

  it('hat für jede Kinderwunsch-Etappe Tipps für beide', () => {
    for (const st of Object.values(TTC_STAGES)) {
      expect(st.self.length).toBeGreaterThanOrEqual(3);
      expect(st.partner.length).toBeGreaterThanOrEqual(3);
    }
    expect(TESTS.map((t) => t.key)).toEqual(['lh', 'hcg']);
  });

  it('hat eindeutige Symptome und Themen', () => {
    expect(new Set(SYMPTOMS.map((s) => s.id)).size).toBe(SYMPTOMS.length);
    expect(new Set(INFO_TOPICS.map((t) => t.id)).size).toBe(INFO_TOPICS.length);
    expect(FLOWS).toHaveLength(4);
  });
});
