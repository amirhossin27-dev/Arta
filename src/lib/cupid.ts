/**
 * Amor fliegt ab und zu über „Heute“ und „Liebe“. Hier steckt die Geometrie dazu: seine Flugbahn,
 * wohin er zielt und das Herz, aus dem sich das Foto öffnet.
 */

/** Kantenlänge von Amor in px. */
export const CUPID_SIZE = 92;

export interface Point {
  x: number;
  y: number;
}

export interface FlightPlan {
  /** 1 = von links nach rechts, -1 = von rechts nach links. */
  dir: 1 | -1;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** Auf und ab beim Flattern. */
  amp: number;
  period: number;
  phase: number;
  duration: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Eine Flugbahn quer über den Bildschirm – gemütlich, damit man ihn gut antippen kann. */
export function planFlight(w: number, h: number, rnd: () => number = Math.random): FlightPlan {
  const dir = rnd() < 0.5 ? 1 : -1;
  const out = CUPID_SIZE;
  // Zwischen der oberen Leiste und der unteren Hälfte, nie hinter den Tabs.
  const top = Math.max(120, h * 0.2);
  const bottom = Math.max(top + 40, h * 0.56);
  const y0 = top + (bottom - top) * rnd();
  const y1 = top + (bottom - top) * rnd();
  const duration = clamp(((w + 2 * out) / 46) * 1000, 9000, 16000);
  return {
    dir,
    x0: dir > 0 ? -out : w + out,
    x1: dir > 0 ? w + out : -out,
    y0,
    y1,
    amp: 16 + rnd() * 20,
    period: 2600 + rnd() * 1400,
    phase: rnd() * Math.PI * 2,
    duration,
  };
}

export interface Pose extends Point {
  /** Neigung in Grad (positiv = Nase nach unten). */
  tilt: number;
}

/** Wo Amor `t` ms nach dem Start ist. */
export function flightPose(f: FlightPlan, t: number): Pose {
  const p = clamp(t / f.duration, 0, 1);
  const w = (2 * Math.PI) / f.period;
  const x = f.x0 + (f.x1 - f.x0) * p;
  const y = f.y0 + (f.y1 - f.y0) * p + f.amp * Math.sin(w * t + f.phase);
  const vx = Math.abs(f.x1 - f.x0) / f.duration;
  const vy = (f.y1 - f.y0) / f.duration + f.amp * w * Math.cos(w * t + f.phase);
  return { x, y, tilt: ((Math.atan2(vy, vx) * 180) / Math.PI) * 0.6 };
}

/**
 * Amor schaut nach rechts. Zum Zielen dreht er sich um (`flip`), wenn das Herz links liegt, und
 * neigt sich höchstens so weit, dass er nicht kopfüber hängt.
 */
export function aimAt(from: Point, to: Point): { flip: boolean; angle: number } {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const angle = (Math.atan2(dy, Math.abs(dx)) * 180) / Math.PI;
  return { flip: dx < 0, angle: clamp(angle, -50, 50) };
}

/**
 * Steht Amor zu dicht am Herz, rückt er zum Schießen ein Stück davon weg – auf dem kürzesten Weg,
 * der auf dem Bildschirm genug Abstand lässt (auf schmalen Handys meist nach oben).
 */
export function standOff(from: Point, heart: Point, minDist: number, w: number, h: number): Point {
  const here = keepInside(from, w, h);
  const dist = (p: Point) => Math.hypot(p.x - heart.x, p.y - heart.y);
  if (dist(here) >= minDist) return here;
  let best: Point | undefined;
  let fallback = here;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * 2 * Math.PI;
    const p = keepInside({ x: heart.x + Math.cos(a) * minDist, y: heart.y + Math.sin(a) * minDist }, w, h);
    if (dist(p) >= minDist - 1) {
      if (!best || Math.hypot(p.x - from.x, p.y - from.y) < Math.hypot(best.x - from.x, best.y - from.y)) best = p;
    } else if (dist(p) > dist(fallback)) fallback = p;
  }
  return best ?? fallback;
}

function keepInside(p: Point, w: number, h: number): Point {
  const m = CUPID_SIZE / 2 + 6;
  return { x: clamp(p.x, m, w - m), y: clamp(p.y, m + 50, h - m - 70) };
}

// ───── Das Herz ─────

/**
 * Umriss eines Herzens als Punkte, Mitte des Rahmens bei 0/0 und 1 breit (Höhe ≈ 0,9) – für das
 * gemalte Herz und für den Ausschnitt, durch den sich das Foto öffnet.
 */
export function heartOutline(n = 96): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) {
    const t = (2 * Math.PI * i) / n;
    const x = 16 * Math.sin(t) ** 3;
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    pts.push({ x, y });
  }
  const minY = Math.min(...pts.map((p) => p.y));
  const maxY = Math.max(...pts.map((p) => p.y));
  const mid = (minY + maxY) / 2;
  return pts.map((p) => ({ x: p.x / 32, y: (p.y - mid) / 32 }));
}

const HEART = heartOutline();

function segDist(p: Point, a: Point, b: Point): number {
  const vx = b.x - a.x;
  const vy = b.y - a.y;
  const len = vx * vx + vy * vy;
  const t = len ? clamp(((p.x - a.x) * vx + (p.y - a.y) * vy) / len, 0, 1) : 0;
  return Math.hypot(p.x - a.x - t * vx, p.y - a.y - t * vy);
}

/** Kleinster Abstand von der Herzmitte zum Rand (in Herzbreiten). */
const HEART_INNER = HEART.reduce((m, a, i) => Math.min(m, segDist({ x: 0, y: 0 }, a, HEART[(i + 1) % HEART.length])), Infinity);

/** So breit muss das Herz um `c` werden, damit es den ganzen Bildschirm bedeckt. */
export function coverWidth(c: Point, w: number, h: number): number {
  const r = Math.max(Math.hypot(c.x, c.y), Math.hypot(w - c.x, c.y), Math.hypot(c.x, h - c.y), Math.hypot(w - c.x, h - c.y));
  return (r / HEART_INNER) * 1.04;
}

/** Herz um `c` mit Breite `width` als CSS-`clip-path` (immer gleich viele Punkte, damit es sich animieren lässt). */
export function heartClip(c: Point, width: number): string {
  const r = (v: number) => Math.round(v * 10) / 10;
  return `polygon(${HEART.map((p) => `${r(c.x + p.x * width)}px ${r(c.y + p.y * width)}px`).join(', ')})`;
}

/** Herz im Rahmen −0,5 … 0,5 für ein SVG-`<polygon>`. */
export const HEART_POINTS = HEART.map((p) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`).join(' ');

/** Liegt `p` im Herz um `c` mit Breite `width`? (zum Testen) */
export function insideHeart(p: Point, c: Point, width: number): boolean {
  let inside = false;
  for (let i = 0, j = HEART.length - 1; i < HEART.length; j = i++) {
    const a = { x: c.x + HEART[i].x * width, y: c.y + HEART[i].y * width };
    const b = { x: c.x + HEART[j].x * width, y: c.y + HEART[j].y * width };
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
