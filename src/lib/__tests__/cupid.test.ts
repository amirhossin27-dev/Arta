import { describe, expect, it } from 'vitest';
import { aimAt, coverWidth, CUPID_SIZE, flightPose, heartOutline, insideHeart, planFlight, standOff } from '../cupid';

const seq = (...values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe('Amors Flug', () => {
  it('fliegt komplett von einer Seite zur anderen, zwischen oberer Leiste und Tabs', () => {
    for (const r of [0.1, 0.5, 0.9]) {
      const f = planFlight(390, 844, seq(r, 0.3, 0.8, 0.5, 0.5, 0.5));
      const start = flightPose(f, 0);
      const end = flightPose(f, f.duration);
      expect(Math.min(start.x, end.x)).toBeLessThan(-CUPID_SIZE / 2);
      expect(Math.max(start.x, end.x)).toBeGreaterThan(390 + CUPID_SIZE / 2);
      for (let t = 0; t <= f.duration; t += 250) {
        const p = flightPose(f, t);
        expect(p.y).toBeGreaterThan(80);
        expect(p.y).toBeLessThan(844 - 220);
        expect(Math.abs(p.tilt)).toBeLessThan(60);
      }
    }
  });

  it('lässt sich Zeit, damit man ihn erwischt', () => {
    const f = planFlight(390, 844);
    expect(f.duration).toBeGreaterThanOrEqual(9000);
    expect(f.duration).toBeLessThanOrEqual(16000);
  });

  it('dreht sich zum Herz um und hängt dabei nie kopfüber', () => {
    expect(aimAt({ x: 300, y: 200 }, { x: 100, y: 200 })).toEqual({ flip: true, angle: 0 });
    expect(aimAt({ x: 100, y: 200 }, { x: 300, y: 200 })).toEqual({ flip: false, angle: 0 });
    expect(aimAt({ x: 200, y: 100 }, { x: 201, y: 600 }).angle).toBe(50);
  });

  it('rückt vom Herz ab, wenn er zu nah dran ist', () => {
    const heart = { x: 195, y: 380 };
    const p = standOff({ x: 200, y: 380 }, heart, 220, 390, 844);
    expect(p.x).toBeLessThanOrEqual(390 - CUPID_SIZE / 2);
    expect(Math.hypot(p.x - heart.x, p.y - heart.y)).toBeGreaterThan(150);
    const far = { x: 60, y: 200 };
    expect(standOff(far, heart, 220, 390, 844)).toEqual(far);
  });
});

describe('Das Herz', () => {
  it('ist ein Herz: 1 breit, Mitte bei 0/0, Spitze unten', () => {
    const pts = heartOutline();
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(1, 2);
    expect(Math.max(...ys) + Math.min(...ys)).toBeCloseTo(0, 5);
    const tip = pts.reduce((a, b) => (b.y > a.y ? b : a));
    expect(Math.abs(tip.x)).toBeLessThan(0.01);
  });

  it('wird groß genug, um den ganzen Bildschirm zu bedecken', () => {
    for (const [w, h] of [
      [390, 844],
      [844, 390],
      [1280, 800],
    ]) {
      const c = { x: w / 2, y: h * 0.46 };
      const width = coverWidth(c, w, h);
      for (const p of [
        { x: 0, y: 0 },
        { x: w, y: 0 },
        { x: 0, y: h },
        { x: w, y: h },
        { x: w / 2, y: 0 },
      ]) {
        expect(insideHeart(p, c, width)).toBe(true);
      }
      // aber klein angefangen nicht
      expect(insideHeart({ x: 0, y: 0 }, c, 280)).toBe(false);
    }
  });
});
