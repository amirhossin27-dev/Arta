import { describe, expect, it } from 'vitest';
import { StepDetector } from '../stepDetector';
import { formatSteps, goalReached, stepDuel, stepsKm, stepsOn, weekSteps } from '../steps';
import { buildPayload, mergeData } from '../sync';
import { emptyData, normalizeData } from '../store';
import { points } from '../stats';
import type { AppData, StepDay } from '../types';

let seed = 42;
const noise = (amp: number) => {
  seed = (seed * 16807) % 2147483647;
  return ((seed / 2147483647) * 2 - 1) * amp;
};

interface Sim {
  hz?: number;
  seconds: number;
  /** Schritte pro Sekunde (0 = keine). */
  cadence?: number;
  /** Stärke des Fersenstoßes in m/s². */
  amp?: number;
  /** Zeitpunkte (s) von Tipp-Stößen auf dem Bildschirm. */
  taps?: number[];
  /** Tipps als solche melden (wie die App es mit pointerdown tut). */
  reportTaps?: boolean;
  start?: number;
}

/** Simuliert Sensorwerte beim Gehen: Fersenstoß, Nachfedern, Abrollen – plus Rauschen und Tippen. */
function simulate(det: StepDetector, { hz = 60, seconds, cadence = 0, amp = 3, taps = [], reportTaps = false, start = 0 }: Sim) {
  const times: number[] = [];
  for (let t = 0.3; cadence && t < seconds; t += (1 / cadence) * (1 + noise(0.06))) times.push(t);
  let counted = 0;
  for (let i = 0; i <= seconds * hz; i++) {
    const t = i / hz;
    let s = 0;
    for (const st of times) {
      const d = t - st;
      if (d < -0.15 || d > 0.45) continue;
      s += amp * Math.exp(-((d / 0.07) ** 2)) + 0.6 * amp * Math.exp(-(((d - 0.16) / 0.04) ** 2)) - 0.5 * amp * Math.exp(-(((d - 0.3) / 0.08) ** 2));
    }
    let touching = false;
    for (const h of taps) {
      const d = t - h;
      if (d > -0.05 && d < 0.1) s += 2.5 * Math.exp(-((d / 0.02) ** 2));
      if (d > -0.05 && d < 0.25) touching = reportTaps;
    }
    // Handy schräg in der Hand: Schwerkraft und Bewegung verteilen sich auf alle Achsen.
    const a = 9.81 + s + noise(0.3);
    counted += det.push(start + (i * 1000) / hz, a * 0.1 + noise(0.2), a * 0.6, a * 0.79, touching);
  }
  return { counted, steps: times.length };
}

/** Unregelmäßiges Tippen, z. B. beim Spielen. */
function tapTimes(seconds: number, min: number, spread: number): number[] {
  const out: number[] = [];
  for (let t = 0.5; t < seconds; t += min + Math.abs(noise(spread))) out.push(t);
  return out;
}

describe('Schrittzähler', () => {
  it.each([
    ['normales Gehen, 60 Hz', { cadence: 1.8, amp: 3, hz: 60 }],
    ['Handy ruhig in der Hand', { cadence: 1.8, amp: 1.5, hz: 60 }],
    ['gemütliches Schlendern, 30 Hz', { cadence: 1.3, amp: 1.6, hz: 30 }],
    ['zügiges Gehen, 100 Hz', { cadence: 2, amp: 4, hz: 100 }],
    ['Joggen', { cadence: 2.8, amp: 8, hz: 60 }],
  ])('zählt %s', (_, sim) => {
    const { counted, steps } = simulate(new StepDetector(), { seconds: 30, ...sim });
    expect(Math.abs(counted - steps)).toBeLessThanOrEqual(1);
  });

  it('zählt nichts, wenn das Handy ruhig liegt oder leicht wackelt', () => {
    expect(simulate(new StepDetector(), { seconds: 60 }).counted).toBe(0);
  });

  it('zählt kurzes Schütteln oder Aufheben nicht', () => {
    const det = new StepDetector();
    expect(simulate(det, { seconds: 1.8, cadence: 2, amp: 6 }).counted).toBe(0);
    expect(simulate(det, { seconds: 10, start: 1800 }).counted).toBe(0);
  });

  it('zählt unregelmäßiges Tippen nicht', () => {
    expect(simulate(new StepDetector(), { seconds: 60, taps: tapTimes(60, 0.3, 1.2) }).counted).toBe(0);
  });

  it('ignoriert gemeldete Tipps, auch wenn sie fast im Takt kommen', () => {
    expect(simulate(new StepDetector(), { seconds: 60, taps: tapTimes(60, 0.4, 0.5), reportTaps: true }).counted).toBe(0);
  });

  it('zählt beim Gehen trotz Tippen weiter', () => {
    const { counted, steps } = simulate(new StepDetector(), { seconds: 30, cadence: 1.8, amp: 2, taps: tapTimes(30, 0.3, 1.2) });
    expect(Math.abs(counted - steps)).toBeLessThanOrEqual(1);
  });

  it('zählt nach einer Pause erst wieder, wenn man wirklich geht', () => {
    const det = new StepDetector();
    const first = simulate(det, { seconds: 5, cadence: 2 });
    const pause = simulate(det, { seconds: 5, start: 5000 });
    const second = simulate(det, { seconds: 5, cadence: 2, start: 10_000 });
    expect(Math.abs(first.counted - first.steps)).toBeLessThanOrEqual(1);
    expect(pause.counted).toBe(0);
    expect(Math.abs(second.counted - second.steps)).toBeLessThanOrEqual(1);
  });
});

function withSteps(d: AppData, recs: Omit<StepDay, 'id' | 'updatedAt'>[]): AppData {
  const steps = { ...d.steps };
  for (const r of recs) steps[`${r.date}-${r.personId}`] = { ...r, id: `${r.date}-${r.personId}`, updatedAt: 1 };
  return { ...d, steps };
}

describe('Schritte', () => {
  it('liest Tag und Woche pro Person', () => {
    const d = withSteps(emptyData(), [
      { date: '2026-10-26', personId: 'a', count: 6240, goal: 8000 },
      { date: '2026-10-27', personId: 'a', count: 11000, goal: 10000 },
      { date: '2026-10-26', personId: 'b', count: 9100, goal: 8000 },
    ]);
    expect(stepsOn(d, '2026-10-26', 'a')).toEqual({ date: '2026-10-26', count: 6240, goal: 8000 });
    expect(stepsOn(d, '2026-10-28', 'b')).toEqual({ date: '2026-10-28', count: 0, goal: 8000 });
    const week = weekSteps(d, '2026-10-28', 'a');
    expect(week.map((w) => w.date)).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
    expect(week.reduce((s, w) => s + w.count, 0)).toBe(17240);
  });

  it('gibt Herzpunkte für erreichte Schrittziele', () => {
    const base = points(emptyData());
    const d = withSteps(emptyData(), [
      { date: '2026-10-26', personId: 'a', count: 8000, goal: 8000 },
      { date: '2026-10-26', personId: 'b', count: 7999, goal: 8000 },
    ]);
    expect(points(d) - base).toBe(5);
  });

  it('formatiert deutsch', () => {
    expect(formatSteps(8432)).toBe('8.432');
    expect(formatSteps(12345678)).toBe('12.345.678');
    expect(formatSteps(950)).toBe('950');
    expect(stepsKm(6000)).toBe('4,5 km');
    expect(stepsKm(20000)).toBe('15 km');
    expect(goalReached(7900, 8100, 8000)).toBe(true);
    expect(goalReached(8000, 9000, 8000)).toBe(false);
    expect(stepDuel(5000, 3800, 'Lena')).toBe('Du liegst 1.200 Schritte vor Lena 😏');
    expect(stepDuel(1000, 3000, 'Lena')).toContain('Lena ist 2.000 Schritte vorne');
  });

  it('werden synchronisiert und alte Stände ohne Schritte bleiben lesbar', () => {
    const today = '2026-10-26';
    const mine = withSteps(emptyData(), [{ date: today, personId: 'a', count: 4200, goal: 8000 }]);
    const theirs = withSteps(emptyData(), [{ date: today, personId: 'b', count: 9100, goal: 10000 }]);
    const payload = buildPayload(theirs, 'b', 'dev-b', today);
    const { data } = mergeData(mine, payload.data, 'a');
    expect(stepsOn(data, today, 'a').count).toBe(4200);
    expect(stepsOn(data, today, 'b')).toEqual({ date: today, count: 9100, goal: 10000 });
    const old = normalizeData({ persons: { a: { name: 'Amir' } } });
    expect(old.steps).toEqual({});
    expect(old.persons.a.stepGoal).toBe(8000);
  });

  it('schickt nur die letzten Wochen mit', () => {
    const d = withSteps(emptyData(), [
      { date: '2026-10-25', personId: 'a', count: 100, goal: 8000 },
      { date: '2026-06-01', personId: 'a', count: 100, goal: 8000 },
    ]);
    expect(Object.keys(buildPayload(d, 'a', 'dev', '2026-10-26').data.steps)).toEqual(['2026-10-25-a']);
  });
});
