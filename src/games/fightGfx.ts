import { FLASH_T, INTRO_T, POWER_MAX, RUSH_TIMES, STAGE_W, moveOf, type Fighter, type Fx, type MoveId, type World } from './fight';
import { lookOf, type FighterDef, type FighterLook } from './fighters';
import { otherSide, type Side } from './logic';

/**
 * Herz-Fighter: alles, was man sieht. Die Kämpfer sind Gliederpuppen aus Posen (Gelenkwinkeln),
 * gezeichnet mit Kontur, Randlicht und flatternden Haaren; dazu zwei vorgerenderte Arenen mit
 * Parallax-Ebenen, Spiegelung im Boden, Partikel, Kamera-Zoom und die Anzeige oben und unten.
 */

const D2R = Math.PI / 180;
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const ease = (t: number) => {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ───────────────────────── Farben ─────────────────────────

const shadeCache = new Map<string, string>();

function hexRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Heller (amt > 0) oder dunkler (amt < 0) */
export function shade(hex: string, amt: number): string {
  const key = `${hex}${amt}`;
  let v = shadeCache.get(key);
  if (!v) {
    const [r, g, b] = hexRgb(hex);
    const t = amt < 0 ? 0 : 255;
    const k = Math.abs(amt);
    v = `rgb(${Math.round(r + (t - r) * k)},${Math.round(g + (t - g) * k)},${Math.round(b + (t - b) * k)})`;
    shadeCache.set(key, v);
  }
  return v;
}

export function rgba(hex: string, a: number): string {
  const [r, g, b] = hexRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

// ───────────────────────── Posen ─────────────────────────

/**
 * Winkel in Grad, Blick nach rechts. Arme und Beine: 0 = gerade nach unten, positiv = nach vorn.
 * Ellbogen/Knie zählen relativ zum Ober-Arm/-Schenkel. Rumpf: 0 = aufrecht, positiv = vorgebeugt.
 * `rot` dreht den ganzen Körper um die Hüfte, `ground` 1 = Füße auf dem Boden (Hüfthöhe automatisch).
 */
export interface Pose {
  rot: number;
  lift: number;
  ground: number;
  tor: number;
  hd: number;
  fs: number;
  fe: number;
  bs: number;
  be: number;
  fh: number;
  fk: number;
  bh: number;
  bk: number;
}

export type PoseKey =
  | 'guard'
  | 'block'
  | 'jump'
  | 'fall'
  | 'jabWind'
  | 'jab'
  | 'crossWind'
  | 'cross'
  | 'upperWind'
  | 'upper'
  | 'kickWind'
  | 'kick'
  | 'airPunch'
  | 'airKick'
  | 'hit'
  | 'air'
  | 'down'
  | 'crouch'
  | 'win'
  | 'tired'
  | 'charge'
  | 'thrust'
  | 'dash'
  | 'rushA'
  | 'rushB'
  | 'rushUp';

const P0: Pose = { rot: 0, lift: 0, ground: 1, tor: 8, hd: -4, fs: 38, fe: 100, bs: 12, be: 118, fh: 34, fk: -40, bh: -20, bk: -8 };
const pose = (p: Partial<Pose>): Pose => ({ ...P0, ...p });

const BASE: Record<PoseKey, Pose> = {
  guard: P0,
  block: pose({ tor: -6, hd: 12, fs: 62, fe: 118, bs: 50, be: 126, fh: 36, fk: -52, bh: -24, bk: -18 }),
  jump: pose({ ground: 0, tor: 6, fs: 50, fe: 100, bs: 30, be: 110, fh: 72, fk: -112, bh: 12, bk: -100 }),
  fall: pose({ ground: 0, tor: 2, fs: 42, fe: 92, bs: 22, be: 102, fh: 30, fk: -40, bh: -12, bk: -34 }),
  jabWind: pose({ tor: 4, fs: 30, fe: 126, bs: 14, be: 118 }),
  jab: pose({ tor: 14, hd: -6, fs: 90, fe: 2, bs: 8, be: 128, fh: 40, fk: -44, bh: -26, bk: -6 }),
  crossWind: pose({ tor: 2, fs: 34, fe: 112, bs: -10, be: 122 }),
  cross: pose({ tor: 24, hd: -8, fs: 22, fe: 128, bs: 92, be: 0, fh: 42, fk: -48, bh: -32, bk: -4 }),
  upperWind: pose({ tor: 20, fs: 18, fe: 64, bs: 10, be: 120, fh: 52, fk: -84, bh: -26, bk: -36 }),
  upper: pose({ tor: -8, hd: -16, lift: 6, fs: 166, fe: 8, bs: 6, be: 112, fh: 22, fk: -10, bh: -18, bk: -6 }),
  kickWind: pose({ tor: -4, fs: 40, fe: 100, bs: -20, be: 110, fh: 86, fk: -122, bh: -6, bk: -4 }),
  kick: pose({ tor: -24, hd: 4, fs: 12, fe: 64, bs: -50, be: 62, fh: 96, fk: -4, bh: -10, bk: -2 }),
  airPunch: pose({ ground: 0, tor: 20, hd: -10, fs: 64, fe: 0, bs: 20, be: 122, fh: 60, fk: -100, bh: 0, bk: -82 }),
  airKick: pose({ ground: 0, tor: -14, fs: 60, fe: 92, bs: -30, be: 80, fh: 54, fk: 0, bh: -8, bk: -112 }),
  hit: pose({ tor: -22, hd: -20, fs: 8, fe: 62, bs: -16, be: 72, fh: 30, fk: -30, bh: -24, bk: -12 }),
  air: pose({ ground: 0, tor: -26, hd: -22, fs: -40, fe: 30, bs: -70, be: 40, fh: 42, fk: -54, bh: 10, bk: -40 }),
  down: pose({ ground: 0, rot: -88, lift: -72, tor: -4, hd: 14, fs: 160, fe: 10, bs: 140, be: 30, fh: 22, fk: -34, bh: 8, bk: -12 }),
  crouch: pose({ tor: 28, hd: -8, fs: 52, fe: 92, bs: 30, be: 102, fh: 70, fk: -120, bh: -10, bk: -110 }),
  win: pose({ tor: -4, hd: -12, fs: 172, fe: 4, bs: 30, be: 122, fh: 18, fk: -6, bh: -14, bk: -4 }),
  tired: pose({ tor: 52, hd: 22, fs: 8, fe: 22, bs: -4, be: 18, fh: 30, fk: -42, bh: -14, bk: -22 }),
  charge: pose({ tor: -6, hd: 0, fs: -32, fe: 102, bs: -42, be: 112, fh: 46, fk: -60, bh: -30, bk: -14 }),
  thrust: pose({ tor: 16, hd: -6, fs: 88, fe: 0, bs: 82, be: 4, fh: 46, fk: -52, bh: -34, bk: -4 }),
  dash: pose({ ground: 0, lift: -14, tor: 50, hd: -32, fs: -62, fe: 22, bs: -82, be: 22, fh: 62, fk: -100, bh: -40, bk: -64 }),
  rushA: pose({ tor: 30, hd: -10, fs: 20, fe: 128, bs: 94, be: 0, fh: 46, fk: -54, bh: -36, bk: -4 }),
  rushB: pose({ tor: -30, fs: 22, fe: 72, bs: -40, be: 62, fh: 122, fk: 0, bh: -6, bk: 0 }),
  rushUp: pose({ ground: 0, tor: -14, hd: -22, fs: 170, fe: 0, bs: 0, be: 92, fh: 150, fk: -20, bh: -10, bk: -40 }),
};

const POSE_KEYS = Object.keys(P0) as (keyof Pose)[];
const poseCache = new Map<string, Pose>();

function P(def: FighterDef, key: PoseKey): Pose {
  const own = def.poses?.[key];
  if (!own) return BASE[key];
  const id = `${def.id}:${key}`;
  let p = poseCache.get(id);
  if (!p) {
    p = { ...BASE[key], ...own };
    poseCache.set(id, p);
  }
  return p;
}

function mix(a: Pose, b: Pose, t: number): Pose {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const out = { ...a };
  for (const k of POSE_KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}

function add(p: Pose, d: Partial<Pose>): Pose {
  const out = { ...p };
  for (const k of Object.keys(d) as (keyof Pose)[]) out[k] += d[k]!;
  return out;
}

/** Drei Stufen: Ausholen → Treffen → zurück in die Grundstellung */
function strikePose(base: Pose, wind: Pose, hit: Pose, t: number, su: number, ac: number, rc: number): Pose {
  const w = su * 0.55;
  if (t < w) return mix(base, wind, ease(t / w));
  if (t < su) return mix(wind, hit, ease((t - w) / (su - w)));
  if (t < su + ac) return hit;
  return mix(hit, base, ease((t - su - ac) / rc));
}

const ATTACK_KEYS: Record<MoveId, [PoseKey, PoseKey]> = {
  p1: ['jabWind', 'jab'],
  p2: ['crossWind', 'cross'],
  p3: ['upperWind', 'upper'],
  k: ['kickWind', 'kick'],
  ap: ['jump', 'airPunch'],
  ak: ['jump', 'airKick'],
};

/** Welche Pose ein Kämpfer gerade hat – aus Zustand und Zeit */
export function poseOf(f: Fighter, time: number): Pose {
  const def = f.def;
  const g = P(def, 'guard');
  const t = f.t;
  switch (f.st) {
    case 'idle': {
      // Federnde Kampfstellung
      const sp = 3.4 + def.speed * 1.4;
      const b = Math.sin(time * sp + (f.side === 'p1' ? 0 : 1.7));
      const d = Math.abs(b);
      return add(g, { tor: b * 1.8, hd: -b, fs: b * 4, fe: -b * 3, bs: -b * 3, fh: d * 3, fk: -d * 9, bh: -d * 2, bk: -d * 7 });
    }
    case 'walk':
    case 'back': {
      // Schrittphase aus der Position: Die Füße rutschen nicht.
      const ph = f.x * 0.06 * f.face;
      const s = Math.sin(ph);
      const c = Math.cos(ph);
      return add(g, {
        tor: f.st === 'walk' ? 4 : -3,
        fh: -6 + s * 20,
        bh: 10 - s * 20,
        fk: 8 - 26 * Math.max(0, c),
        bk: -12 - 26 * Math.max(0, -c),
        fs: s * 4,
        bs: -s * 4,
      });
    }
    case 'block':
      return P(def, 'block');
    case 'bstun': {
      const k = clamp01(t / Math.max(0.1, f.dur));
      return mix(add(P(def, 'block'), { tor: -10, hd: 6 }), P(def, 'block'), ease(k));
    }
    case 'jump': {
      const up = clamp01((f.vy + 300) / 1100);
      let p = mix(P(def, 'fall'), P(def, 'jump'), up);
      if (Math.abs(f.vx) > 40) {
        const spin = ease((t - 0.08) / 0.46);
        if (spin > 0 && spin < 1) p = { ...mix(p, P(def, 'jump'), Math.sin(spin * Math.PI)), rot: spin * 360 * Math.sign(f.vx) * f.face };
      }
      return p;
    }
    case 'attack': {
      if (!f.mv) return g;
      const m = moveOf(def, f.mv);
      const [wk, hk] = ATTACK_KEYS[f.mv];
      const base = m.air ? P(def, 'fall') : g;
      return strikePose(base, P(def, wk), P(def, hk), t, m.startup, m.active, m.recovery);
    }
    case 'hit': {
      const heavy = f.dur > 0.4;
      const hit = heavy ? add(P(def, 'hit'), { tor: -12, hd: -8 }) : P(def, 'hit');
      const k = clamp01(t / Math.max(0.12, f.dur));
      const shake = Math.sin(t * 60) * 3 * (1 - k);
      return add(t < 0.04 ? mix(g, hit, t / 0.04) : mix(hit, g, ease((k - 0.35) / 0.65)), { tor: shake });
    }
    case 'held':
      return add(P(def, 'hit'), { tor: Math.sin(t * 50) * 6, hd: Math.cos(t * 40) * 6 });
    case 'air':
    case 'ko': {
      if (f.y < 1 && f.vy === 0) return P(def, 'down');
      return { ...P(def, 'air'), rot: -Math.min(92, 18 + t * 230) };
    }
    case 'down':
      return P(def, 'down');
    case 'rise': {
      const k = clamp01(t / Math.max(0.1, f.dur));
      return k < 0.5 ? mix(P(def, 'down'), P(def, 'crouch'), ease(k * 2)) : mix(P(def, 'crouch'), g, ease((k - 0.5) * 2));
    }
    case 'win': {
      const b = Math.sin(time * 5);
      return mix(g, add(P(def, 'win'), { fs: b * 4, lift: Math.max(0, b) * 2 }), ease(t / 0.3));
    }
    case 'tired': {
      const b = Math.sin(time * 4.5);
      return mix(g, add(P(def, 'tired'), { tor: b * 3, hd: b * 2 }), ease(t / 0.4));
    }
    case 'special':
      return specialPose(f, time);
  }
  return g;
}

function specialPose(f: Fighter, time: number): Pose {
  const def = f.def;
  const g = P(def, 'guard');
  const sp = f.sp;
  if (!sp) return g;
  const t = sp.t;
  const tremble = Math.sin(time * 70) * 1.5;
  if (def.special.kind === 'projectile') {
    if (sp.ph === 'flash') return add(mix(g, P(def, 'charge'), ease(t / 0.3)), { tor: tremble, fs: tremble });
    if (sp.ph === 'go') {
      if (t < 0.12) return mix(P(def, 'charge'), P(def, 'thrust'), ease(t / 0.12));
      if (t < 0.42) return P(def, 'thrust');
      return mix(P(def, 'thrust'), g, ease((t - 0.42) / 0.2));
    }
    return g;
  }
  // Ansturm
  if (sp.ph === 'flash') return add(mix(g, P(def, 'crouch'), ease(t / 0.25)), { tor: tremble, fs: 40, fe: -40 });
  if (sp.ph === 'go') return P(def, 'dash');
  if (sp.ph === 'lock') {
    if (sp.i >= RUSH_TIMES.length) return P(def, 'rushUp');
    return sp.i % 2 === 0 ? P(def, 'rushA') : P(def, 'rushB');
  }
  if (f.y > 0) return mix(P(def, 'rushUp'), P(def, 'fall'), ease(t / 0.3));
  return sp.miss ? mix(add(g, { tor: 30, hd: -10 }), g, ease(t / 0.5)) : mix(P(def, 'crouch'), g, ease(t / 0.3));
}

// ───────────────────────── Skelett ─────────────────────────

export interface Pt {
  x: number;
  y: number;
}

/** Gelenke in Weltkoordinaten (y nach oben) */
export interface Sk {
  face: 1 | -1;
  hip: Pt;
  mid: Pt;
  chest: Pt;
  head: Pt;
  fe: Pt;
  fh: Pt;
  be: Pt;
  bh: Pt;
  fk: Pt;
  fa: Pt;
  ft: Pt;
  bk: Pt;
  ba: Pt;
  bt: Pt;
  /** Kopfwinkel (Bogenmaß, 0 = aufrecht, positiv = nach vorn) */
  ha: number;
  /** Rumpfwinkel */
  ta: number;
}

export const BONE = { thigh: 39, shin: 39, torso: 50, neck: 6, head: 16.5, uarm: 29, farm: 27, foot: 12 };

export function skeleton(x: number, y: number, face: 1 | -1, p: Pose): Sk {
  const r = p.rot * D2R;
  const cr = Math.cos(r);
  const sr = Math.sin(r);
  const rot = (px: number, py: number): Pt => ({ x: px * cr + py * sr, y: -px * sr + py * cr });
  const t = p.tor * D2R;
  const ux = Math.sin(t);
  const uy = Math.cos(t);
  const mid = { x: ux * BONE.torso * 0.48, y: uy * BONE.torso * 0.48 };
  const chest = { x: ux * BONE.torso, y: uy * BONE.torso };
  const sh = { x: ux * (BONE.torso - 5), y: uy * (BONE.torso - 5) };
  const ha = t + p.hd * D2R * 0.7;
  const head = { x: chest.x + Math.sin(ha) * (BONE.neck + BONE.head), y: chest.y + Math.cos(ha) * (BONE.neck + BONE.head) };
  const limb = (o: Pt, a1: number, l1: number, a2: number, l2: number): [Pt, Pt] => {
    const A = a1 * D2R;
    const B = (a1 + a2) * D2R;
    const j = { x: o.x + Math.sin(A) * l1, y: o.y - Math.cos(A) * l1 };
    return [j, { x: j.x + Math.sin(B) * l2, y: j.y - Math.cos(B) * l2 }];
  };
  const [fe, fh] = limb(sh, p.fs, BONE.uarm, p.fe, BONE.farm);
  const [be, bh] = limb(sh, p.bs, BONE.uarm, p.be, BONE.farm);
  const [fk, fa] = limb({ x: 2, y: 0 }, p.fh, BONE.thigh, p.fk, BONE.shin);
  const [bk, ba] = limb({ x: -2, y: 0 }, p.bh, BONE.thigh, p.bk, BONE.shin);
  const toe = (a: Pt, shinDeg: number): Pt => {
    const s = shinDeg * D2R * 0.35;
    return { x: a.x + Math.cos(s) * BONE.foot, y: a.y + Math.sin(s) * BONE.foot };
  };
  const ft = toe(fa, p.fh + p.fk);
  const bt = toe(ba, p.bh + p.bk);
  const loc = { mid, chest, head, fe, fh, be, bh, fk, fa, ft, bk, ba, bt };
  const R = {} as Record<keyof typeof loc, Pt>;
  let low = Infinity;
  for (const k of Object.keys(loc) as (keyof typeof loc)[]) {
    R[k] = rot(loc[k].x, loc[k].y);
    if (k === 'fa' || k === 'ba' || k === 'ft' || k === 'bt') low = Math.min(low, R[k].y);
  }
  const hipY = lerp(88, -low + 4, p.ground) + p.lift;
  const W = (q: Pt): Pt => ({ x: x + face * q.x, y: y + hipY + q.y });
  return {
    face,
    hip: W({ x: 0, y: 0 }),
    mid: W(R.mid),
    chest: W(R.chest),
    head: W(R.head),
    fe: W(R.fe),
    fh: W(R.fh),
    be: W(R.be),
    bh: W(R.bh),
    fk: W(R.fk),
    fa: W(R.fa),
    ft: W(R.ft),
    bk: W(R.bk),
    ba: W(R.ba),
    bt: W(R.bt),
    ha: ha + r,
    ta: t + r,
  };
}

/** Punkt am Kopf: Winkel (Grad, 0 = oben, positiv = nach vorn) und Abstand in Kopfradien */
function headPt(sk: Sk, deg: number, rr: number): Pt {
  const a = sk.ha + deg * D2R;
  return { x: sk.head.x + sk.face * Math.sin(a) * BONE.head * rr, y: sk.head.y + Math.cos(a) * BONE.head * rr };
}

/** Punkt am Rumpf: entlang (along, Einheiten über der Hüfte) und quer (side, positiv = vorn) */
function bodyPt(sk: Sk, along: number, side: number): Pt {
  const ux = Math.sin(sk.ta);
  const uy = Math.cos(sk.ta);
  return { x: sk.hip.x + sk.face * (ux * along + uy * side), y: sk.hip.y + uy * along - ux * side };
}

// ───────────────────────── Haare und Bänder ─────────────────────────

interface Strand {
  pts: { x: number; y: number; px: number; py: number }[];
  len: number;
  w0: number;
  w1: number;
}

function newStrand(n: number, len: number, w0: number, w1: number): Strand {
  return { pts: Array.from({ length: n }, () => ({ x: NaN, y: NaN, px: NaN, py: NaN })), len, w0, w1 };
}

function stepStrand(s: Strand, a: Pt, dt: number, wind: number, face: number) {
  const first = s.pts[0];
  if (Number.isNaN(first.x)) {
    s.pts.forEach((p, i) => {
      p.x = p.px = a.x - face * s.len * i;
      p.y = p.py = a.y - i * 2;
    });
  }
  const d2 = dt * dt;
  first.x = first.px = a.x;
  first.y = first.py = a.y;
  for (let i = 1; i < s.pts.length; i++) {
    const p = s.pts[i];
    const vx = (p.x - p.px) * 0.9;
    const vy = (p.y - p.py) * 0.9;
    p.px = p.x;
    p.py = p.y;
    p.x += vx + (wind - face * 260) * d2;
    p.y += vy - 900 * d2;
  }
  for (let it = 0; it < 3; it++) {
    for (let i = 1; i < s.pts.length; i++) {
      const a0 = s.pts[i - 1];
      const p = s.pts[i];
      const dx = p.x - a0.x;
      const dy = p.y - a0.y;
      const d = Math.hypot(dx, dy) || 1;
      const k = s.len / d;
      p.x = a0.x + dx * k;
      p.y = a0.y + dy * k;
    }
  }
}

// ───────────────────────── Kamera ─────────────────────────

export interface Cam {
  W: number;
  H: number;
  cx: number;
  vw: number;
  s: number;
  /** Maßstab ganz herausgezoomt (für ferne Ebenen) */
  s0: number;
  gy: number;
  ox: number;
  oy: number;
  shake: number;
}

export function newCam(): Cam {
  return { W: 400, H: 400, cx: STAGE_W / 2, vw: 600, s: 1, s0: 1, gy: 340, ox: 0, oy: 0, shake: 0 };
}

const sx = (c: Cam, x: number) => c.W / 2 + (x - c.cx) * c.s + c.ox;
const sy = (c: Cam, y: number) => c.gy - y * c.s + c.oy;
const S = (c: Cam, p: Pt): Pt => ({ x: sx(c, p.x), y: sy(c, p.y) });

function fitCam(c: Cam) {
  c.s = Math.min(c.W / c.vw, c.H / 340);
  c.s0 = Math.min(c.W / 860, c.H / 340);
  const half = c.W / c.s / 2;
  c.cx = half * 2 >= STAGE_W ? STAGE_W / 2 : clamp(c.cx, half, STAGE_W - half);
  c.gy = c.H - Math.max(c.H * 0.13, 30);
}

export function updateCam(c: Cam, w: World, dt: number, u: number) {
  const a = w.f.p1;
  const b = w.f.p2;
  let tcx = (a.x + b.x) / 2;
  let tvw = clamp(Math.abs(a.x - b.x) + 310, 470, 860);
  let speed = 4;
  if (w.flash) {
    const f = w.f[w.flash.side];
    tcx = f.x + f.face * 40;
    tvw = 430;
    speed = 10;
  } else if (w.ph === 'ko' && w.phT < 1.3 && !w.timeUp && w.roundWin && w.roundWin !== 'draw') {
    tcx = w.f[otherSide(w.roundWin)].x;
    tvw = 470;
    speed = 6;
  }
  c.cx += (tcx - c.cx) * Math.min(1, dt * speed * 1.4);
  c.vw += (tvw - c.vw) * Math.min(1, dt * speed);
  fitCam(c);
  c.shake = Math.max(0, c.shake - dt * 1.6);
  const amp = Math.min(1, c.shake * 2.2) * 12 * u;
  c.ox = (Math.random() - 0.5) * amp;
  c.oy = (Math.random() - 0.5) * amp;
}

// ───────────────────────── Kämpfer zeichnen ─────────────────────────

const OUTLINE = '#170c1d';

interface DrawOpts {
  /** Einfarbig (Nachbild, Treffer-Blitz) */
  ghost?: string;
  /** Randlicht der Arena und seine Richtung (Pixel) */
  rim?: string;
  rx?: number;
  ry?: number;
  hurt?: boolean;
  ko?: boolean;
}

interface FighterLookExt extends FighterLook {
  outline: string;
}

function drawSk(ctx: CanvasRenderingContext2D, c: Cam, sk: Sk, look: FighterLook, strands: Strand[], o: DrawOpts) {
  const k = c.s;
  const ow = Math.max(1.5, 2.4 * k);
  const L: FighterLookExt = { ...look, outline: OUTLINE };
  const wide = look.pantsStyle === 'wide';
  const crop = look.topStyle === 'crop';
  const W = {
    thigh: (wide ? 18 : 14) * k,
    shin: (wide ? 16 : 11.5) * k,
    uarm: (crop ? 11 : 13.5) * k,
    farm: (crop ? 10 : 11.5) * k,
    waist: (crop ? 20 : 27) * k,
    chest: (crop ? 28 : 36) * k,
    neck: 10.5 * k,
    foot: 9 * k,
    fist: (crop ? 6.8 : 7.6) * k,
    head: BONE.head * k,
  };
  const p = {
    hip: S(c, sk.hip),
    mid: S(c, sk.mid),
    chest: S(c, sk.chest),
    head: S(c, sk.head),
    fe: S(c, sk.fe),
    fh: S(c, sk.fh),
    be: S(c, sk.be),
    bh: S(c, sk.bh),
    fk: S(c, sk.fk),
    fa: S(c, sk.fa),
    ft: S(c, sk.ft),
    bk: S(c, sk.bk),
    ba: S(c, sk.ba),
    bt: S(c, sk.bt),
  };
  const ghost = o.ghost;
  const seg = (a: Pt, b: Pt, w: number, color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  };
  const dot = (a: Pt, r: number, color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
    ctx.fill();
  };
  type Seg = [Pt, Pt, number, string];
  /** Erst die Kontur der ganzen Gliedmaße, dann die Farben – so trennt die Kontur Vorder- und Hinterteile. */
  const group = (segs: Seg[], dots: [Pt, number, string][] = [], hi = false) => {
    if (ghost) {
      for (const [a, b, w] of segs) seg(a, b, w, ghost);
      for (const [a, r] of dots) dot(a, r, ghost);
      return;
    }
    for (const [a, b, w] of segs) seg(a, b, w + ow * 2, L.outline);
    for (const [a, r] of dots) dot(a, r + ow, L.outline);
    for (const [a, b, w, col] of segs) seg(a, b, w, col);
    for (const [a, r, col] of dots) dot(a, r, col);
    if (hi) {
      // Glanzlicht oben – gibt den Gliedmaßen Rundung
      ctx.globalAlpha *= 0.32;
      for (const [a, b, w] of segs) seg({ x: a.x - w * 0.12, y: a.y - w * 0.18 }, { x: b.x - w * 0.12, y: b.y - w * 0.18 }, w * 0.32, '#ffffff');
      ctx.globalAlpha /= 0.32;
    }
  };
  const dark = (col: string) => (ghost ? ghost : shade(col, -0.2));

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const backArm: Seg[] = [
    [p.chest, p.be, W.uarm, dark(crop ? look.top : look.skin)],
    [p.be, p.bh, W.farm, dark(look.skin)],
  ];
  const backLeg: Seg[] = [
    [p.hip, p.bk, W.thigh, dark(look.pants)],
    [p.bk, p.ba, W.shin, dark(look.pants)],
    [p.ba, p.bt, W.foot, dark(look.shoes)],
  ];
  const frontLeg: Seg[] = [
    [p.hip, p.fk, W.thigh, look.pants],
    [p.fk, p.fa, W.shin, look.pants],
    [p.fa, p.ft, W.foot, look.shoes],
  ];
  const frontArm: Seg[] = [
    [p.chest, p.fe, W.uarm, crop ? look.top : look.skin],
    [p.fe, p.fh, W.farm, look.skin],
  ];
  const torso: Seg[] = [
    [p.chest, p.head, W.neck, look.skin],
    [p.hip, p.mid, W.waist, crop ? look.skin : look.top],
    [p.mid, p.chest, W.chest, look.top],
  ];

  // Randlicht: die ganze Figur einmal in Lichtfarbe, leicht versetzt
  if (o.rim && !ghost) {
    const all = [...backArm, ...backLeg, ...torso, ...frontLeg, ...frontArm];
    ctx.save();
    ctx.translate(o.rx ?? 1.5, o.ry ?? -0.6);
    for (const [a, b, w] of all) seg(a, b, w + ow * 2, o.rim);
    dot(p.head, W.head + ow, o.rim);
    dot(p.fh, W.fist + ow, o.rim);
    dot(p.bh, W.fist + ow, o.rim);
    ctx.restore();
  }

  group(backArm, [[p.bh, W.fist, dark(look.gloves)]]);
  group(backLeg);

  // Pferdeschwanz, Stirnband-Enden, Gürtel-Enden hinter dem Körper
  for (const s of strands) {
    const color = s === strands[0] && look.hairStyle === 'ponytail' ? look.hair : s.w0 > 4.6 ? look.belt : (look.band ?? look.hair);
    drawStrand(ctx, c, s, ghost ?? color, ghost ? 0 : ow);
  }

  group(torso, [[S(c, bodyPt(sk, BONE.torso - 8, 0)), (crop ? 11 : 13) * k, look.top]], true);
  if (!ghost) {
    // Kragen bzw. Saum
    const a = S(c, bodyPt(sk, BONE.torso - 3, -9));
    const b = S(c, bodyPt(sk, crop ? BONE.torso * 0.5 : BONE.torso * 0.28, 8));
    if (look.topStyle === 'gi') seg(a, b, 3.2 * k, look.trim);
    else {
      seg(S(c, bodyPt(sk, BONE.torso * 0.5, -10)), S(c, bodyPt(sk, BONE.torso * 0.5, 11)), 3 * k, look.trim);
      seg(S(c, bodyPt(sk, BONE.torso - 6, -4)), S(c, bodyPt(sk, BONE.torso * 0.62, 10)), 2.2 * k, look.trim);
    }
    // Gürtel
    const b0 = S(c, bodyPt(sk, crop ? 2 : 4, -12));
    const b1 = S(c, bodyPt(sk, crop ? 2 : 4, 12));
    seg(b0, b1, (crop ? 3.5 : 6) * k + ow, L.outline);
    seg(b0, b1, (crop ? 3.5 : 6) * k, look.belt);
  }

  group(frontLeg, [], true);
  if (!ghost && !wide) {
    // Seitenstreifen der Leggings
    ctx.globalAlpha *= 0.85;
    seg(p.hip, p.fk, 2 * k, look.trim);
    seg(p.fk, { x: lerp(p.fk.x, p.fa.x, 0.85), y: lerp(p.fk.y, p.fa.y, 0.85) }, 2 * k, look.trim);
    ctx.globalAlpha /= 0.85;
  }

  drawHead(ctx, c, sk, look, W.head, ow, o);

  group(frontArm, [[p.fh, W.fist, look.gloves]], true);
}

function drawStrand(ctx: CanvasRenderingContext2D, c: Cam, s: Strand, color: string, ow: number) {
  const pts = s.pts.map((q) => S(c, q));
  if (pts.some((q) => Number.isNaN(q.x))) return;
  const n = pts.length - 1;
  const pass = (extra: number, col: string) => {
    ctx.strokeStyle = col;
    for (let i = 0; i < n; i++) {
      ctx.lineWidth = lerp(s.w0, s.w1, i / n) * c.s + extra;
      ctx.beginPath();
      ctx.moveTo(pts[i].x, pts[i].y);
      ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
      ctx.stroke();
    }
  };
  if (ow) pass(ow * 2, OUTLINE);
  pass(0, color);
}

const HAIR: Record<FighterLook['hairStyle'], [number, number][]> = {
  spiky: [
    [62, 0.9],
    [48, 1.3],
    [32, 1.0],
    [18, 1.5],
    [2, 1.05],
    [-18, 1.62],
    [-34, 1.06],
    [-56, 1.68],
    [-72, 1.05],
    [-96, 1.55],
    [-110, 1.0],
    [-134, 1.3],
    [-152, 0.95],
    [-172, 0.85],
    [-176, 0.4],
    [70, 0.35],
  ],
  ponytail: [
    [74, 0.98],
    [88, 0.86],
    [70, 1.12],
    [40, 1.2],
    [8, 1.22],
    [-30, 1.2],
    [-70, 1.16],
    [-110, 1.08],
    [-148, 0.98],
    [-176, 0.86],
    [-178, 0.4],
    [72, 0.4],
  ],
};

function drawHead(ctx: CanvasRenderingContext2D, c: Cam, sk: Sk, look: FighterLook, r: number, ow: number, o: DrawOpts) {
  const h = S(c, sk.head);
  const ghost = o.ghost;
  ctx.fillStyle = ghost ?? OUTLINE;
  ctx.beginPath();
  ctx.arc(h.x, h.y, r + (ghost ? 0 : ow), 0, Math.PI * 2);
  ctx.fill();
  if (ghost) return;
  ctx.fillStyle = look.skin;
  ctx.beginPath();
  ctx.arc(h.x, h.y, r, 0, Math.PI * 2);
  ctx.fill();
  // Ohr
  const ear = S(c, headPt(sk, -100, 0.15));
  ctx.fillStyle = shade(look.skin, -0.12);
  ctx.beginPath();
  ctx.arc(ear.x, ear.y, r * 0.22, 0, Math.PI * 2);
  ctx.fill();

  // Gesicht
  const k = c.s;
  const line = (a: Pt, b: Pt, w: number, col: string) => {
    ctx.strokeStyle = col;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  };
  const e = S(c, headPt(sk, 98, 0.5));
  const e2 = S(c, headPt(sk, 104, 0.82));
  if (o.ko) {
    const m = 2.4 * k;
    line({ x: e.x - m, y: e.y - m }, { x: e.x + m, y: e.y + m }, 1.6 * k, OUTLINE);
    line({ x: e.x - m, y: e.y + m }, { x: e.x + m, y: e.y - m }, 1.6 * k, OUTLINE);
  } else if (o.hurt) {
    line(S(c, headPt(sk, 92, 0.45)), e2, 1.8 * k, OUTLINE);
  } else {
    line(e, e2, 2.6 * k, OUTLINE);
    line(S(c, headPt(sk, 99, 0.62)), S(c, headPt(sk, 101, 0.72)), 1 * k, '#ffffff');
  }
  // Augenbraue: grimmig
  line(S(c, headPt(sk, 76, 0.54)), S(c, headPt(sk, 92, 0.86)), 1.8 * k, look.hair);
  // Mund
  line(S(c, headPt(sk, 140, 0.62)), S(c, headPt(sk, o.hurt ? 136 : 146, 0.82)), 1.4 * k, shade(look.skin, -0.45));
  if (look.hairStyle === 'ponytail') {
    const ch = S(c, headPt(sk, 122, 0.55));
    ctx.fillStyle = 'rgba(255,110,140,0.35)';
    ctx.beginPath();
    ctx.arc(ch.x, ch.y, r * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // Haare
  const hp = HAIR[look.hairStyle].map(([a, rr]) => S(c, headPt(sk, a, rr)));
  ctx.beginPath();
  hp.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
  ctx.closePath();
  ctx.lineWidth = ow * 1.6;
  ctx.strokeStyle = OUTLINE;
  ctx.stroke();
  ctx.fillStyle = look.hair;
  ctx.fill();
  // Glanz im Haar
  ctx.strokeStyle = shade(look.hair, 0.35);
  ctx.lineWidth = 1.4 * k;
  ctx.beginPath();
  const g0 = S(c, headPt(sk, 10, 0.95));
  const g1 = S(c, headPt(sk, -40, 0.98));
  ctx.moveTo(g0.x, g0.y);
  ctx.lineTo(g1.x, g1.y);
  ctx.stroke();

  if (look.band) {
    const a = S(c, headPt(sk, 64, 1.0));
    const b = S(c, headPt(sk, -100, 0.98));
    line(a, b, 4.4 * k + ow * 2, OUTLINE);
    line(a, b, 4.4 * k, look.band);
  }
  if (look.hairStyle === 'ponytail') {
    const tie = S(c, headPt(sk, -64, 1.1));
    ctx.fillStyle = OUTLINE;
    ctx.beginPath();
    ctx.arc(tie.x, tie.y, 3.4 * k + ow, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = look.trim;
    ctx.beginPath();
    ctx.arc(tie.x, tie.y, 3.4 * k, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ───────────────────────── Effekte ─────────────────────────

type PartKind = 'spark' | 'ember' | 'dust' | 'ring' | 'flash' | 'petal' | 'bolt' | 'star' | 'fly';

interface Part {
  k: PartKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  g: number;
  drag: number;
  rot: number;
  vr: number;
  pts?: Pt[];
  /** Bildschirmfest (für Wetter, das nicht mit der Kamera mitgeht) */
  add: boolean;
}

function part(g: Gfx, p: Partial<Part> & Pick<Part, 'k' | 'x' | 'y' | 'life' | 'size' | 'color'>) {
  if (g.parts.length > 520) return;
  g.parts.push({ vx: 0, vy: 0, g: 0, drag: 0, rot: 0, vr: 0, add: true, ...p, max: p.life });
}

function bolt(x0: number, y0: number, x1: number, y1: number, rnd: () => number, jag = 14): Pt[] {
  const n = 7;
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const j = i === 0 || i === n ? 0 : (rnd() - 0.5) * jag;
    pts.push({ x: lerp(x0, x1, t) + j, y: lerp(y0, y1, t) + (rnd() - 0.5) * jag * 0.6 });
  }
  return pts;
}

function burst(g: Gfx, x: number, y: number, n: number, color: string, speed: number, size: number, life = 0.35, gravity = 900) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.4 + Math.random() * 0.8);
    part(g, { k: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.6 + Math.random() * 0.6), size, color, g: -gravity, drag: 3 });
  }
}

function dust(g: Gfx, x: number, y: number, n: number, spread: number, color = '#cdb9c9') {
  for (let i = 0; i < n; i++) {
    const d = (Math.random() - 0.5) * 2;
    part(g, { k: 'dust', x: x + d * spread * 0.4, y: y + 4, vx: d * spread * 2.4, vy: 20 + Math.random() * 50, life: 0.5 + Math.random() * 0.35, size: 7 + Math.random() * 7, color, drag: 4, add: false });
  }
}

/** Ereignisse der Spiellogik → Funken, Staub, Wackeln */
export function spawnFx(g: Gfx, w: World, e: Fx) {
  const f = w.f[e.side];
  const att = w.f[otherSide(e.side)];
  switch (e.k) {
    case 'hit': {
      const sp = e.p === 's';
      const heavy = e.p === 'h' || sp;
      const col = sp ? att.def.special.color2 : heavy ? '#ffb43a' : '#fff4c2';
      part(g, { k: 'flash', x: e.x, y: e.y, life: heavy ? 0.16 : 0.11, size: heavy ? 46 : 30, color: sp ? att.def.special.color : '#ffffff' });
      part(g, { k: 'ring', x: e.x, y: e.y, life: 0.22, size: heavy ? 18 : 12, color: col });
      burst(g, e.x, e.y, heavy ? 14 : 8, col, heavy ? 520 : 380, heavy ? 3 : 2.2, 0.3);
      if (sp && att.def.special.kind === 'rush') {
        const rnd = Math.random;
        for (let i = 0; i < 2; i++) {
          const a = rnd() * Math.PI * 2;
          part(g, { k: 'bolt', x: 0, y: 0, life: 0.14, size: 2.6, color: att.def.special.color2, pts: bolt(e.x + Math.cos(a) * 90, e.y + Math.sin(a) * 90, e.x, e.y, rnd, 22) });
        }
      }
      g.cam.shake = Math.max(g.cam.shake, heavy ? 0.22 : 0.08);
      g.rigs[e.side].white = heavy ? 0.09 : 0.06;
      break;
    }
    case 'block': {
      part(g, { k: 'ring', x: e.x, y: e.y, life: 0.2, size: 16, color: '#7fd4ff' });
      part(g, { k: 'flash', x: e.x, y: e.y, life: 0.1, size: 26, color: '#bfe9ff' });
      burst(g, e.x, e.y, 6, '#9fe3ff', 300, 2, 0.22);
      g.rigs[e.side].shield = 0.22;
      break;
    }
    case 'swing':
      break;
    case 'jump':
      dust(g, e.x, 0, 5, 20);
      break;
    case 'land':
      dust(g, e.x, 0, 6, 26);
      break;
    case 'down':
      dust(g, e.x, 0, e.p === 'h' ? 14 : 8, 50);
      g.cam.shake = Math.max(g.cam.shake, e.p === 'h' ? 0.2 : 0.1);
      break;
    case 'super': {
      part(g, { k: 'ring', x: e.x, y: e.y, life: 0.5, size: 40, color: f.def.aura });
      part(g, { k: 'flash', x: e.x, y: e.y, life: 0.35, size: 120, color: f.def.aura });
      burst(g, e.x, e.y, 26, f.def.aura, 420, 3, 0.6, 300);
      g.superT = 0;
      break;
    }
    case 'shoot':
      part(g, { k: 'flash', x: e.x, y: e.y, life: 0.2, size: 70, color: f.def.special.color });
      burst(g, e.x, e.y, 18, f.def.special.color2, 380, 3, 0.4, 200);
      g.cam.shake = Math.max(g.cam.shake, 0.12);
      break;
    case 'dash':
      dust(g, e.x, 0, 8, 40);
      part(g, { k: 'flash', x: e.x, y: e.y, life: 0.18, size: 70, color: f.def.special.color2 });
      break;
    case 'pop':
    case 'clash': {
      const col = e.k === 'clash' ? '#ffffff' : f.def.special.color2;
      part(g, { k: 'flash', x: e.x, y: e.y, life: 0.25, size: 90, color: f.def.special.color });
      part(g, { k: 'ring', x: e.x, y: e.y, life: 0.3, size: 30, color: col });
      burst(g, e.x, e.y, 24, col, 520, 3, 0.5, 300);
      g.cam.shake = Math.max(g.cam.shake, 0.18);
      break;
    }
    case 'ko':
      g.white = 0.85;
      g.cam.shake = 0.45;
      part(g, { k: 'ring', x: e.x, y: e.y, life: 0.5, size: 40, color: '#ffffff' });
      burst(g, e.x, e.y, 30, '#ffe58a', 640, 3.2, 0.7, 500);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        part(g, { k: 'star', x: e.x, y: e.y + 20, vx: Math.cos(a) * 120, vy: 160 + Math.sin(a) * 60, life: 1.1, size: 7, color: '#ffe14a', g: -260, drag: 1, vr: 6 });
      }
      break;
    case 'round':
    case 'fight':
    case 'time':
      break;
  }
}

// ───────────────────────── Arenen ─────────────────────────

export type StageId = 'dach' | 'tempel';

export const STAGES: Record<StageId, { name: string; emoji: string }> = {
  dach: { name: 'Dach bei Sonnenuntergang', emoji: '🌆' },
  tempel: { name: 'Kirschblüten-Tempel', emoji: '🌸' },
};

interface Layer {
  img: HTMLCanvasElement;
  /** Parallax: 0 steht still, 1 bewegt sich wie die Kämpfer */
  f: number;
  w: number;
  h: number;
  /** So weit reicht die Ebene unter die Bodenlinie */
  drop: number;
}

interface Stage {
  id: StageId;
  layers: Layer[];
  orb: HTMLCanvasElement;
  rim: string;
  rx: number;
  /** Spiegelung im Boden */
  mirror: number;
}

function layerCanvas(w: number, h: number, res: number) {
  const cv = document.createElement('canvas');
  cv.width = Math.round(w * res);
  cv.height = Math.round(h * res);
  const ctx = cv.getContext('2d')!;
  ctx.scale(res, res);
  return { cv, ctx };
}

function windows(ctx: CanvasRenderingContext2D, rnd: () => number, x: number, y: number, w: number, h: number, step: number, lit: string[], p: number) {
  for (let yy = y + step; yy < y + h - step; yy += step * 1.4) {
    for (let xx = x + step * 0.7; xx < x + w - step; xx += step) {
      if (rnd() > p) continue;
      ctx.globalAlpha = 0.35 + rnd() * 0.6;
      ctx.fillStyle = lit[Math.floor(rnd() * lit.length)];
      ctx.fillRect(xx, yy, step * 0.45, step * 0.6);
    }
  }
  ctx.globalAlpha = 1;
}

function neon(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string) {
  ctx.save();
  ctx.font = `900 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.shadowBlur = size * 0.9;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  ctx.shadowBlur = size * 0.3;
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.85;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function heartPath(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.35);
  ctx.bezierCurveTo(x - s * 1.1, y - s * 0.35, x - s * 0.45, y - s * 1.05, x, y - s * 0.45);
  ctx.bezierCurveTo(x + s * 0.45, y - s * 1.05, x + s * 1.1, y - s * 0.35, x, y + s * 0.35);
  ctx.closePath();
}

function paintDach(): Stage {
  const rnd = seeded(7);
  // Sonne im Synthwave-Stil: mit Streifen
  const orb = document.createElement('canvas');
  orb.width = orb.height = 256;
  {
    const o = orb.getContext('2d')!;
    const gr = o.createLinearGradient(0, 28, 0, 228);
    gr.addColorStop(0, '#fff3b8');
    gr.addColorStop(0.5, '#ffb04a');
    gr.addColorStop(1, '#ff4f8b');
    o.fillStyle = gr;
    o.beginPath();
    o.arc(128, 128, 100, 0, Math.PI * 2);
    o.fill();
    o.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 7; i++) {
      const y = 140 + i * 13;
      o.fillRect(0, y, 256, 2 + i * 1.3);
    }
  }

  // Ferne Skyline
  const far = layerCanvas(1800, 300, 1);
  {
    const c = far.ctx;
    let x = 0;
    while (x < 1800) {
      const w = 28 + rnd() * 64;
      const h = 50 + rnd() * 190 + (rnd() < 0.08 ? 70 : 0);
      c.fillStyle = rnd() < 0.5 ? '#4b1d55' : '#561f5c';
      c.fillRect(x, 300 - h, w, h);
      if (rnd() < 0.25) c.fillRect(x + w / 2 - 1, 300 - h - 18, 2, 18);
      windows(c, rnd, x, 300 - h, w, h, 6, ['#ffcf8a', '#ff9ec4'], 0.3);
      x += w + rnd() * 6;
    }
    const hz = c.createLinearGradient(0, 300, 0, 120);
    hz.addColorStop(0, 'rgba(255,128,140,0.55)');
    hz.addColorStop(1, 'rgba(255,128,140,0)');
    c.fillStyle = hz;
    c.fillRect(0, 120, 1800, 180);
  }

  // Stadt in der Mitte – mit Neon
  const mid = layerCanvas(1900, 440, 1.25);
  {
    const c = mid.ctx;
    let x = 0;
    let i = 0;
    while (x < 1900) {
      const w = 80 + rnd() * 90;
      const h = 130 + rnd() * 250;
      const top = 440 - h;
      c.fillStyle = i % 3 === 0 ? '#2b1136' : '#24102f';
      c.fillRect(x, top, w, h);
      // Dachkante im Gegenlicht
      c.fillStyle = 'rgba(255,140,120,0.35)';
      c.fillRect(x, top, w, 2);
      if (rnd() < 0.35) {
        // Wassertank
        c.fillStyle = '#1b0b24';
        c.fillRect(x + w * 0.2, top - 26, 22, 20);
        c.fillRect(x + w * 0.2 + 2, top - 6, 2, 6);
        c.fillRect(x + w * 0.2 + 18, top - 6, 2, 6);
        c.beginPath();
        c.moveTo(x + w * 0.2 - 2, top - 26);
        c.lineTo(x + w * 0.2 + 11, top - 36);
        c.lineTo(x + w * 0.2 + 24, top - 26);
        c.fill();
      }
      if (rnd() < 0.3) c.fillRect(x + w * 0.7, top - 40, 2, 40);
      windows(c, rnd, x, top, w, h, 9, ['#ffd38c', '#ffb36b', '#9fd8ff', '#ff8fc0'], 0.42);
      x += w + 4 + rnd() * 26;
      i++;
    }
    neon(c, 'ARTA', 1020, 150, 40, '#ff4fa3');
    c.save();
    c.shadowColor = '#ff4fa3';
    c.shadowBlur = 20;
    c.fillStyle = '#ff7ab8';
    heartPath(c, 1090, 152, 18);
    c.fill();
    c.restore();
    neon(c, '♥ 24/7', 560, 230, 22, '#43e0ff');
    neon(c, 'KAMPF', 1500, 200, 26, '#ffd94a');
    const hz = c.createLinearGradient(0, 440, 0, 260);
    hz.addColorStop(0, 'rgba(214,64,118,0.5)');
    hz.addColorStop(1, 'rgba(214,64,118,0)');
    c.fillStyle = hz;
    c.fillRect(0, 260, 1900, 180);
  }

  // Dachkante direkt hinter den Kämpfern
  const near = layerCanvas(1600, 170, 1.6);
  {
    const c = near.ctx;
    const base = 170 - 26;
    // Lichterkette
    c.strokeStyle = '#1a0c1f';
    c.lineWidth = 1.2;
    for (let x = 60; x < 1600; x += 260) {
      c.beginPath();
      c.moveTo(x, 40);
      c.quadraticCurveTo(x + 130, 80, x + 260, 40);
      c.stroke();
      for (let k = 1; k < 10; k++) {
        const t = k / 10;
        const bx = x + 260 * t;
        const by = (1 - t) * (1 - t) * 40 + 2 * (1 - t) * t * 80 + t * t * 40 + 4;
        const col = ['#ffd36b', '#ff7ab8', '#7fe3ff'][k % 3];
        const gr = c.createRadialGradient(bx, by, 0, bx, by, 10);
        gr.addColorStop(0, col);
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = gr;
        c.fillRect(bx - 10, by - 10, 20, 20);
        c.fillStyle = '#fff';
        c.fillRect(bx - 1, by - 1, 2, 2);
      }
      c.fillStyle = '#1e0f24';
      c.fillRect(x - 2, 36, 4, base - 36);
    }
    // Geländer
    c.fillStyle = '#1e0f24';
    c.fillRect(0, base - 34, 1600, 4);
    for (let x = 10; x < 1600; x += 36) c.fillRect(x, base - 34, 3, 34);
    // Klimageräte
    for (const ax of [180, 520, 1130, 1420]) {
      c.fillStyle = '#2f1c38';
      c.fillRect(ax, base - 30, 58, 30);
      c.fillStyle = '#21122a';
      c.beginPath();
      c.arc(ax + 18, base - 15, 10, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = 'rgba(255,150,120,0.35)';
      c.fillRect(ax, base - 30, 58, 2);
    }
    // Brüstung
    const gr = c.createLinearGradient(0, base, 0, 170);
    gr.addColorStop(0, '#3b2142');
    gr.addColorStop(1, '#25132b');
    c.fillStyle = gr;
    c.fillRect(0, base, 1600, 26);
    c.fillStyle = 'rgba(255,160,120,0.55)';
    c.fillRect(0, base, 1600, 2);
  }

  return {
    id: 'dach',
    orb,
    rim: 'rgba(255,148,102,0.9)',
    rx: 1,
    mirror: 0.2,
    layers: [
      { img: far.cv, f: 0.12, w: 1800, h: 300, drop: 8 },
      { img: mid.cv, f: 0.36, w: 1900, h: 440, drop: 18 },
      { img: near.cv, f: 0.74, w: 1600, h: 170, drop: 2 },
    ],
  };
}

function paintTempel(): Stage {
  const rnd = seeded(11);
  const orb = document.createElement('canvas');
  orb.width = orb.height = 256;
  {
    const o = orb.getContext('2d')!;
    const gr = o.createRadialGradient(110, 110, 10, 128, 128, 100);
    gr.addColorStop(0, '#fffaf0');
    gr.addColorStop(1, '#f3e2c2');
    o.fillStyle = gr;
    o.beginPath();
    o.arc(128, 128, 100, 0, Math.PI * 2);
    o.fill();
    o.fillStyle = 'rgba(190,170,140,0.25)';
    for (const [x, y, r] of [
      [96, 100, 18],
      [156, 150, 24],
      [130, 70, 10],
      [80, 160, 12],
    ]) {
      o.beginPath();
      o.arc(x, y, r, 0, Math.PI * 2);
      o.fill();
    }
  }

  // Berge im Nebel
  const far = layerCanvas(1800, 320, 0.9);
  {
    const c = far.ctx;
    const ridge = (base: number, amp: number, color: string, seed: number) => {
      const r = seeded(seed);
      c.fillStyle = color;
      c.beginPath();
      c.moveTo(0, 320);
      let y = base;
      for (let x = 0; x <= 1800; x += 30) {
        y = clamp(y + (r() - 0.5) * amp, base - amp * 2.2, base + amp * 0.6);
        c.lineTo(x, y);
      }
      c.lineTo(1800, 320);
      c.fill();
    };
    ridge(120, 40, '#27357a', 3);
    const mist = c.createLinearGradient(0, 320, 0, 120);
    mist.addColorStop(0, 'rgba(140,160,230,0.55)');
    mist.addColorStop(1, 'rgba(140,160,230,0)');
    c.fillStyle = mist;
    c.fillRect(0, 120, 1800, 200);
    ridge(210, 30, '#1c275e', 5);
    c.fillStyle = mist;
    c.fillRect(0, 200, 1800, 120);
  }

  // Tempel, Torii und Kirschbäume
  const mid = layerCanvas(1900, 440, 1.25);
  {
    const c = mid.ctx;
    const ground = 440;
    const tree = (x: number, s: number) => {
      c.strokeStyle = '#2a1626';
      c.lineCap = 'round';
      c.lineWidth = 12 * s;
      c.beginPath();
      c.moveTo(x, ground);
      c.quadraticCurveTo(x - 10 * s, ground - 90 * s, x + 6 * s, ground - 170 * s);
      c.stroke();
      c.lineWidth = 6 * s;
      c.beginPath();
      c.moveTo(x - 4 * s, ground - 110 * s);
      c.quadraticCurveTo(x - 50 * s, ground - 140 * s, x - 80 * s, ground - 170 * s);
      c.moveTo(x + 2 * s, ground - 130 * s);
      c.quadraticCurveTo(x + 50 * s, ground - 150 * s, x + 84 * s, ground - 190 * s);
      c.stroke();
      const pinks = ['#ff9fca', '#f57fb5', '#ffc4de', '#e866a4'];
      for (let i = 0; i < 46; i++) {
        const a = rnd() * Math.PI * 2;
        const d = Math.sqrt(rnd());
        const bx = x + Math.cos(a) * 110 * s * d;
        const by = ground - 185 * s + Math.sin(a) * 60 * s * d;
        c.fillStyle = pinks[Math.floor(rnd() * pinks.length)];
        c.globalAlpha = 0.75 + rnd() * 0.25;
        c.beginPath();
        c.arc(bx, by, (12 + rnd() * 22) * s, 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;
    };
    // Pagode
    const px = 1020;
    c.fillStyle = '#140f2c';
    c.fillRect(px - 6, ground - 360, 12, 60);
    for (let i = 0; i < 4; i++) {
      const y = ground - 70 - i * 70;
      const w = 170 - i * 30;
      c.fillStyle = '#16112f';
      c.fillRect(px - w * 0.36, y - 46, w * 0.72, 50);
      for (let k = -2; k <= 2; k++) {
        c.fillStyle = rnd() < 0.7 ? 'rgba(255,180,90,0.85)' : 'rgba(255,180,90,0.25)';
        c.fillRect(px + k * w * 0.12 - 4, y - 36, 8, 14);
      }
      c.fillStyle = '#0e0a22';
      c.beginPath();
      c.moveTo(px - w * 0.62, y - 40);
      c.quadraticCurveTo(px - w * 0.4, y - 48, px - w * 0.3, y - 62);
      c.lineTo(px + w * 0.3, y - 62);
      c.quadraticCurveTo(px + w * 0.4, y - 48, px + w * 0.62, y - 40);
      c.closePath();
      c.fill();
      c.fillStyle = '#a3303c';
      c.fillRect(px - w * 0.5, y - 44, w, 3);
    }
    // Torii
    const tx = 620;
    c.fillStyle = '#b3313d';
    c.fillRect(tx - 70, ground - 200, 14, 200);
    c.fillRect(tx + 56, ground - 200, 14, 200);
    c.fillRect(tx - 86, ground - 170, 172, 12);
    c.fillStyle = '#1a0f20';
    c.beginPath();
    c.moveTo(tx - 110, ground - 214);
    c.quadraticCurveTo(tx, ground - 200, tx + 110, ground - 214);
    c.lineTo(tx + 104, ground - 198);
    c.quadraticCurveTo(tx, ground - 188, tx - 104, ground - 198);
    c.closePath();
    c.fill();
    c.fillStyle = '#b3313d';
    c.fillRect(tx - 96, ground - 198, 192, 8);
    tree(330, 1.1);
    tree(1460, 1.25);
    tree(1760, 0.9);
    tree(110, 0.8);
    // Steinlaternen
    for (const lx of [800, 1240]) {
      c.fillStyle = '#2b2a45';
      c.fillRect(lx - 6, ground - 50, 12, 50);
      c.fillRect(lx - 16, ground - 70, 32, 20);
      c.fillStyle = 'rgba(255,190,110,0.9)';
      c.fillRect(lx - 7, ground - 66, 14, 12);
      c.fillStyle = '#2b2a45';
      c.beginPath();
      c.moveTo(lx - 22, ground - 70);
      c.lineTo(lx, ground - 86);
      c.lineTo(lx + 22, ground - 70);
      c.fill();
    }
    const hz = c.createLinearGradient(0, 440, 0, 280);
    hz.addColorStop(0, 'rgba(70,80,170,0.45)');
    hz.addColorStop(1, 'rgba(70,80,170,0)');
    c.fillStyle = hz;
    c.fillRect(0, 280, 1900, 160);
  }

  // Holzgeländer hinter den Kämpfern
  const near = layerCanvas(1600, 120, 1.6);
  {
    const c = near.ctx;
    const base = 120;
    c.fillStyle = '#24140f';
    c.fillRect(0, base - 46, 1600, 6);
    c.fillRect(0, base - 22, 1600, 4);
    for (let x = 0; x < 1600; x += 90) {
      c.fillStyle = '#2e1912';
      c.fillRect(x, base - 58, 9, 58);
      c.fillStyle = 'rgba(255,170,100,0.45)';
      c.fillRect(x, base - 58, 2, 58);
    }
    c.fillStyle = 'rgba(255,170,100,0.4)';
    c.fillRect(0, base - 46, 1600, 1.5);
  }

  return {
    id: 'tempel',
    orb,
    rim: 'rgba(150,180,255,0.85)',
    rx: -1,
    mirror: 0.26,
    layers: [
      { img: far.cv, f: 0.1, w: 1800, h: 320, drop: 8 },
      { img: mid.cv, f: 0.4, w: 1900, h: 440, drop: 16 },
      { img: near.cv, f: 0.8, w: 1600, h: 120, drop: 2 },
    ],
  };
}

const stageCache = new Map<StageId, Stage>();

function getStage(id: StageId): Stage {
  let s = stageCache.get(id);
  if (!s) {
    s = id === 'dach' ? paintDach() : paintTempel();
    stageCache.set(id, s);
  }
  return s;
}

function drawLayer(ctx: CanvasRenderingContext2D, c: Cam, L: Layer) {
  const sl = c.s0 + (c.s - c.s0) * L.f;
  const x0 = c.W / 2 + (-L.w / 2 - (c.cx - STAGE_W / 2) * L.f) * sl + c.ox * L.f;
  const y0 = c.gy + (L.drop - L.h) * sl + c.oy * L.f;
  ctx.drawImage(L.img, x0, y0, L.w * sl, L.h * sl);
}

/** Leuchtkugel (weicher Lichtschein) – additiv */
function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, a: number) {
  if (r <= 0 || a <= 0) return;
  const gr = ctx.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, rgba(color, a));
  gr.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = gr;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}

function drawSky(ctx: CanvasRenderingContext2D, c: Cam, st: Stage, time: number) {
  const { W, H } = c;
  const horizon = c.gy;
  if (st.id === 'dach') {
    const gr = ctx.createLinearGradient(0, 0, 0, horizon);
    gr.addColorStop(0, '#1d0b3b');
    gr.addColorStop(0.45, '#6b1d5c');
    gr.addColorStop(0.75, '#e2466f');
    gr.addColorStop(1, '#ffb35c');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, W, H);
    const s = c.s0;
    const ox = W / 2 + (180 - (c.cx - STAGE_W / 2) * 0.04) * s;
    const oy = horizon - 150 * s;
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, ox, oy, 260 * s, '#ff8a4a', 0.5);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(st.orb, ox - 100 * s, oy - 100 * s, 200 * s, 200 * s);
    // Lange Wolkenbänder
    ctx.fillStyle = 'rgba(255,170,200,0.18)';
    for (let i = 0; i < 4; i++) {
      const y = horizon - (210 + i * 34) * s;
      const x = ((i * 337 + time * (6 + i * 3)) % (W + 400)) - 200;
      ctx.beginPath();
      ctx.ellipse(x, y, 160 * s, 6 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    const gr = ctx.createLinearGradient(0, 0, 0, horizon);
    gr.addColorStop(0, '#05081d');
    gr.addColorStop(0.55, '#141f4f');
    gr.addColorStop(1, '#3b4d8e');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, W, H);
    const rnd = seeded(5);
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 70; i++) {
      const x = rnd() * W;
      const y = rnd() * horizon * 0.7;
      ctx.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(time * (0.6 + rnd() * 1.6) + i));
      ctx.fillRect(x, y, 1.4, 1.4);
    }
    ctx.globalAlpha = 1;
    const s = c.s0;
    const ox = W / 2 + (-230 - (c.cx - STAGE_W / 2) * 0.03) * s;
    const oy = horizon - 250 * s;
    ctx.globalCompositeOperation = 'lighter';
    glow(ctx, ox, oy, 200 * s, '#a8c0ff', 0.38);
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(st.orb, ox - 48 * s, oy - 48 * s, 96 * s, 96 * s);
  }
}

/** Was sich in der Arena bewegt: Papierlaternen, blinkende Antennen */
function drawStageLive(ctx: CanvasRenderingContext2D, c: Cam, st: Stage, time: number) {
  if (st.id === 'tempel') {
    const f = 0.86;
    const sl = c.s0 + (c.s - c.s0) * f;
    const X = (x: number) => c.W / 2 + (x - STAGE_W / 2 - (c.cx - STAGE_W / 2) * f) * sl + c.ox;
    const Y = (y: number) => c.gy - y * sl + c.oy;
    ctx.strokeStyle = '#1a0f12';
    ctx.lineWidth = Math.max(1, 1.4 * sl);
    for (let x = -100; x < STAGE_W + 100; x += 300) {
      ctx.beginPath();
      ctx.moveTo(X(x), Y(272));
      ctx.quadraticCurveTo(X(x + 150), Y(232), X(x + 300), Y(272));
      ctx.stroke();
      for (const t of [0.25, 0.5, 0.75]) {
        const lx = x + 300 * t;
        const ly = (1 - t) * (1 - t) * 272 + 2 * (1 - t) * t * 232 + t * t * 272 - 22;
        const fl = 0.85 + 0.15 * Math.sin(time * 9 + lx);
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, X(lx), Y(ly), 60 * sl, '#ff9c3d', 0.32 * fl);
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#ffb35a';
        ctx.beginPath();
        ctx.ellipse(X(lx), Y(ly), 11 * sl, 14 * sl, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,240,200,0.8)';
        ctx.beginPath();
        ctx.ellipse(X(lx), Y(ly), 5 * sl, 9 * sl, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#5a1a1a';
        ctx.fillRect(X(lx) - 7 * sl, Y(ly + 15), 14 * sl, 3 * sl);
        ctx.fillRect(X(lx) - 7 * sl, Y(ly - 12), 14 * sl, 3 * sl);
      }
    }
  } else {
    const blink = Math.sin(time * 3) > 0.2;
    if (blink) {
      const f = 0.36;
      const sl = c.s0 + (c.s - c.s0) * f;
      for (const [x, y] of [
        [-420, 330],
        [130, 300],
        [520, 360],
      ]) {
        const px = c.W / 2 + (x - (c.cx - STAGE_W / 2) * f) * sl;
        const py = c.gy - y * sl;
        ctx.globalCompositeOperation = 'lighter';
        glow(ctx, px, py, 10 * sl, '#ff3040', 0.9);
        ctx.globalCompositeOperation = 'source-over';
      }
    }
  }
}

function drawFloor(ctx: CanvasRenderingContext2D, c: Cam, st: Stage, time: number) {
  const { W, H, gy } = c;
  const fy = gy + c.oy;
  const gr = ctx.createLinearGradient(0, fy, 0, H);
  if (st.id === 'dach') {
    gr.addColorStop(0, '#4a2a4c');
    gr.addColorStop(1, '#1b0e22');
  } else {
    gr.addColorStop(0, '#4a2c20');
    gr.addColorStop(1, '#1c100c');
  }
  ctx.fillStyle = gr;
  ctx.fillRect(0, fy, W, H - fy);
  const depth = H - fy;
  ctx.lineWidth = 1;
  if (st.id === 'dach') {
    // Fliesenfugen mit Perspektive
    ctx.strokeStyle = 'rgba(255,170,200,0.12)';
    for (let x = -200; x <= STAGE_W + 200; x += 80) {
      const top = sx(c, x);
      const bottom = W / 2 + (x - c.cx) * c.s * 1.7 + c.ox;
      ctx.beginPath();
      ctx.moveTo(top, fy);
      ctx.lineTo(bottom, H);
      ctx.stroke();
    }
    for (const t of [0.22, 0.5, 0.85]) {
      ctx.beginPath();
      ctx.moveTo(0, fy + depth * t);
      ctx.lineTo(W, fy + depth * t);
      ctx.stroke();
    }
    // Sonnenspiegelung auf dem nassen Dach
    const ox = W / 2 + (180 - (c.cx - STAGE_W / 2) * 0.04) * c.s0;
    ctx.globalCompositeOperation = 'lighter';
    const sg = ctx.createLinearGradient(0, fy, 0, H);
    sg.addColorStop(0, 'rgba(255,160,90,0.4)');
    sg.addColorStop(1, 'rgba(255,90,140,0)');
    ctx.fillStyle = sg;
    const sw = 60 * c.s0 * (1 + 0.08 * Math.sin(time * 2));
    ctx.fillRect(ox - sw, fy, sw * 2, depth);
    ctx.globalCompositeOperation = 'source-over';
  } else {
    // Holzdielen
    ctx.strokeStyle = 'rgba(20,8,4,0.55)';
    let y = fy + 3;
    let gap = 5;
    let row = 0;
    while (y < H) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
      const off = (row * 137) % 240;
      for (let x = -off; x <= STAGE_W + 240; x += 240) {
        const px = W / 2 + (x - c.cx) * c.s * (1 + (y - fy) / depth) + c.ox;
        ctx.beginPath();
        ctx.moveTo(px, y);
        ctx.lineTo(px, y + gap);
        ctx.stroke();
      }
      y += gap;
      gap *= 1.35;
      row++;
    }
    ctx.globalCompositeOperation = 'lighter';
    for (let x = 75; x < STAGE_W + 100; x += 300) glow(ctx, sx(c, x), fy + depth * 0.25, 110 * c.s, '#ff9c3d', 0.12);
    ctx.globalCompositeOperation = 'source-over';
  }
  // Kante der Kampffläche
  ctx.fillStyle = st.id === 'dach' ? 'rgba(255,170,140,0.5)' : 'rgba(255,190,120,0.35)';
  ctx.fillRect(0, fy, W, Math.max(1, 1.5 * c.s));
}

// ───────────────────────── Geschosse ─────────────────────────

function drawProjectile(ctx: CanvasRenderingContext2D, c: Cam, x: number, y: number, dir: number, color: string, color2: string, time: number) {
  const px = sx(c, x);
  const py = sy(c, y);
  const s = c.s;
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, px, py, 95 * s, color2, 0.45);
  // Flügel – ein Feuervogel
  const flap = Math.sin(time * 18) * 0.5;
  ctx.fillStyle = rgba(color2, 0.75);
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(px + dir * 18 * s, py);
    ctx.quadraticCurveTo(px - dir * 10 * s, py + side * (46 + flap * 20) * s, px - dir * 62 * s, py + side * (36 + flap * 26) * s);
    ctx.quadraticCurveTo(px - dir * 30 * s, py + side * 12 * s, px - dir * 54 * s, py + side * 4 * s);
    ctx.closePath();
    ctx.fill();
  }
  // Schweif
  ctx.beginPath();
  ctx.moveTo(px, py - 10 * s);
  ctx.quadraticCurveTo(px - dir * 70 * s, py - 4 * s, px - dir * 110 * s, py + Math.sin(time * 14) * 10 * s);
  ctx.quadraticCurveTo(px - dir * 70 * s, py + 6 * s, px, py + 10 * s);
  ctx.fill();
  const core = ctx.createRadialGradient(px + dir * 10 * s, py, 0, px, py, 34 * s);
  core.addColorStop(0, '#ffffff');
  core.addColorStop(0.35, color);
  core.addColorStop(1, rgba(color2, 0));
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(px, py, 34 * s, 0, Math.PI * 2);
  ctx.fill();
  // Kopf mit Schnabel
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(px + dir * 30 * s, py - 4 * s);
  ctx.lineTo(px + dir * 44 * s, py + 2 * s);
  ctx.lineTo(px + dir * 28 * s, py + 6 * s);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
}

// ───────────────────────── Gesamtbild ─────────────────────────

interface Rig {
  strands: Strand[];
  trail: { x: number; y: number; t: number }[];
  ghosts: { sk: Sk; a: number; look: string }[];
  ghostT: number;
  hpGhost: number;
  hpDelay: number;
  lastHp: number;
  white: number;
  shield: number;
  combo: number;
  comboT: number;
  sk: Sk | null;
}

function newRig(look: FighterLook): Rig {
  const strands: Strand[] = [];
  if (look.hairStyle === 'ponytail') strands.push(newStrand(8, 7, 8, 3));
  if (look.band) strands.push(newStrand(6, 6.5, 4, 2), newStrand(6, 6, 3.6, 1.8));
  if (look.pantsStyle === 'wide') strands.push(newStrand(4, 6, 4.8, 3.4), newStrand(4, 5.5, 4.8, 3.4));
  return { strands, trail: [], ghosts: [], ghostT: 0, hpGhost: 1, hpDelay: 0, lastHp: 1, white: 0, shield: 0, combo: 0, comboT: 0, sk: null };
}

export interface Gfx {
  stage: Stage;
  cam: Cam;
  parts: Part[];
  rigs: Record<Side, Rig>;
  white: number;
  superT: number;
  time: number;
  u: number;
  mirror: boolean;
  ambT: number;
}

export function newGfx(stage: StageId, w: World): Gfx {
  return {
    stage: getStage(stage),
    cam: newCam(),
    parts: [],
    rigs: { p1: newRig(lookOf(w.f.p1.def, w.f.p1.alt)), p2: newRig(lookOf(w.f.p2.def, w.f.p2.alt)) },
    white: 0,
    superT: 1,
    time: 0,
    u: 1,
    mirror: true,
    ambT: 0,
  };
}

export function resizeGfx(g: Gfx, W: number, H: number) {
  g.cam.W = W;
  g.cam.H = H;
  g.u = clamp(Math.min(W, H * 1.3) / 400, 0.75, 1.7);
  fitCam(g.cam);
}

/** Effektpunkt eines Angriffs (Faust oder Fuß) für die Wischspur */
function effector(sk: Sk, mv: MoveId): Pt {
  return mv === 'p2' ? sk.bh : mv === 'k' || mv === 'ak' ? sk.ft : sk.fh;
}

function updateRig(g: Gfx, w: World, f: Fighter, r: Rig, sk: Sk, dt: number) {
  const ratio = f.hp / f.maxHp;
  if (ratio < r.lastHp) r.hpDelay = 0.55;
  if (ratio > r.hpGhost) r.hpGhost = ratio;
  r.lastHp = ratio;
  if (r.hpDelay > 0) r.hpDelay -= dt;
  else r.hpGhost = Math.max(ratio, r.hpGhost - dt * 0.9);
  r.white = Math.max(0, r.white - dt);
  r.shield = Math.max(0, r.shield - dt);
  if (f.shown !== r.combo) {
    if (f.shown > r.combo) r.comboT = 0;
    r.combo = f.shown;
  }
  r.comboT += dt;

  // Haare & Bänder
  const look = lookOf(f.def, f.alt);
  let i = 0;
  const wind = g.stage.id === 'tempel' ? -40 : 60;
  if (look.hairStyle === 'ponytail') stepStrand(r.strands[i++], headPt(sk, -64, 1.12), dt, wind, sk.face);
  if (look.band) {
    stepStrand(r.strands[i++], headPt(sk, -102, 1.0), dt, wind, sk.face);
    stepStrand(r.strands[i++], headPt(sk, -98, 0.92), dt, wind * 0.8, sk.face);
  }
  if (look.pantsStyle === 'wide') {
    stepStrand(r.strands[i++], bodyPt(sk, 4, -12), dt, wind * 0.5, sk.face);
    stepStrand(r.strands[i++], bodyPt(sk, 3, -11), dt, wind * 0.4, sk.face);
  }

  // Wischspur der Schläge
  const now = g.time;
  if (f.st === 'attack' && f.mv) {
    const m = moveOf(f.def, f.mv);
    if (f.t > m.startup * 0.5 && f.t < m.startup + m.active + 0.04) {
      const e = effector(sk, f.mv);
      r.trail.push({ x: e.x, y: e.y, t: now });
    }
  }
  while (r.trail.length && (now - r.trail[0].t > 0.11 || r.trail.length > 9)) r.trail.shift();

  // Nachbilder bei sehr schnellen Bewegungen
  const fast = (f.st === 'special' && f.sp && (f.sp.ph === 'go' || f.sp.ph === 'lock')) || Math.abs(f.vx) > 700;
  r.ghostT -= dt;
  if (fast && r.ghostT <= 0) {
    r.ghostT = 0.035;
    r.ghosts.push({ sk, a: 0.55, look: f.def.special.color2 });
  }
  for (const gh of r.ghosts) gh.a -= dt * 2.6;
  r.ghosts = r.ghosts.filter((gh) => gh.a > 0).slice(-8);

  // Aura bei vollem Balken
  if (f.power >= POWER_MAX && f.st !== 'ko') {
    g.ambT += dt;
    if (Math.random() < dt * 26) {
      part(g, {
        k: 'ember',
        x: f.x + (Math.random() - 0.5) * 60,
        y: f.y + Math.random() * 120,
        vx: (Math.random() - 0.5) * 30,
        vy: 80 + Math.random() * 90,
        life: 0.6 + Math.random() * 0.4,
        size: 2 + Math.random() * 2.5,
        color: f.def.aura,
      });
    }
  }
  if (w.ph === 'fight' && f.st === 'special' && f.sp?.ph === 'go' && f.def.special.kind === 'rush' && Math.random() < dt * 40) {
    part(g, { k: 'bolt', x: 0, y: 0, life: 0.1, size: 2.2, color: f.def.special.color2, pts: bolt(f.x - f.face * 90, f.y + 40 + Math.random() * 90, f.x, f.y + 70, Math.random, 26) });
  }
}

function stepParts(g: Gfx, dt: number) {
  for (const p of g.parts) {
    p.life -= dt;
    const d = Math.exp(-p.drag * dt);
    p.vx *= d;
    p.vy = p.vy * d + p.g * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.vr * dt;
  }
  g.parts = g.parts.filter((p) => p.life > 0);
}

function drawParts(ctx: CanvasRenderingContext2D, c: Cam, parts: Part[], additive: boolean) {
  ctx.globalCompositeOperation = additive ? 'lighter' : 'source-over';
  for (const p of parts) {
    if (p.add !== additive) continue;
    const a = clamp01(p.life / p.max);
    const x = sx(c, p.x);
    const y = sy(c, p.y);
    const s = c.s;
    switch (p.k) {
      case 'spark': {
        ctx.strokeStyle = rgba(p.color.startsWith('#') ? p.color : '#ffffff', a);
        ctx.lineWidth = p.size * s;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - p.vx * 0.035 * s, y + p.vy * 0.035 * s);
        ctx.stroke();
        break;
      }
      case 'ember':
        glow(ctx, x, y, p.size * 3 * s, p.color, a * 0.9);
        break;
      case 'flash':
        glow(ctx, x, y, p.size * (1.3 - a * 0.3) * s, p.color, a);
        break;
      case 'ring':
        ctx.strokeStyle = rgba(p.color, a);
        ctx.lineWidth = 3 * a * s + 0.5;
        ctx.beginPath();
        ctx.arc(x, y, p.size * (1 + (1 - a) * 3) * s, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'dust':
        ctx.fillStyle = rgba(p.color, a * 0.45);
        ctx.beginPath();
        ctx.arc(x, y, p.size * (1.6 - a * 0.6) * s, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'bolt': {
        if (!p.pts) break;
        const pts = p.pts.map((q) => ({ x: sx(c, q.x), y: sy(c, q.y) }));
        for (const [wd, col] of [
          [p.size * 3, rgba(p.color, a * 0.5)],
          [p.size, `rgba(255,255,255,${a})`],
        ] as const) {
          ctx.strokeStyle = col;
          ctx.lineWidth = wd * s + 0.5;
          ctx.beginPath();
          pts.forEach((q, i) => (i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y)));
          ctx.stroke();
        }
        break;
      }
      case 'star': {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p.rot);
        ctx.fillStyle = rgba(p.color, a);
        const r = p.size * s;
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const rr = i % 2 ? r * 0.42 : r;
          const an = (i / 10) * Math.PI * 2;
          ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr);
        }
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'petal': {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = rgba(p.color, Math.min(1, a * 3) * 0.9);
        ctx.beginPath();
        ctx.ellipse(0, 0, p.size, p.size * 0.55, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'fly':
        glow(ctx, p.x, p.y, p.size * 4, p.color, a * (0.5 + 0.5 * Math.sin(p.rot)));
        break;
    }
  }
  ctx.globalCompositeOperation = 'source-over';
}

/** Wetter im Vordergrund: Blütenblätter und Glühwürmchen (Tempel), Funkenflug (Dach) – in Bildschirmpixeln */
function ambient(g: Gfx, dt: number) {
  const { W, H } = g.cam;
  const u = g.u;
  if (g.stage.id === 'tempel') {
    if (Math.random() < dt * 5) {
      part(g, { k: 'petal', x: Math.random() * W * 1.2, y: -10, vx: -30 * u - Math.random() * 30 * u, vy: 26 * u + Math.random() * 30 * u, life: 9, size: (2.5 + Math.random() * 2) * u, color: Math.random() < 0.5 ? '#ffb3d4' : '#ff8fc0', vr: (Math.random() - 0.5) * 6, add: false });
    }
    if (Math.random() < dt * 1.2) {
      part(g, { k: 'fly', x: Math.random() * W, y: H * (0.35 + Math.random() * 0.4), vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 14, life: 3 + Math.random() * 2, size: 1.6 * u, color: '#d8ff7a', vr: 3 });
    }
  } else if (Math.random() < dt * 3) {
    part(g, { k: 'fly', x: Math.random() * W, y: H * (0.2 + Math.random() * 0.6), vx: 14 * u + Math.random() * 20 * u, vy: -6 - Math.random() * 10, life: 4, size: 1.2 * u, color: '#ffb36b', vr: 5 });
  }
}

const isScreen = (p: Part) => p.k === 'petal' || p.k === 'fly';

function drawFighters(ctx: CanvasRenderingContext2D, g: Gfx, w: World, order: Side[], skel: Record<Side, Sk>, mirror: boolean) {
  const c = g.cam;
  for (const side of order) {
    const f = w.f[side];
    const r = g.rigs[side];
    const sk = skel[side];
    const look = lookOf(f.def, f.alt);
    const hurt = f.st === 'hit' || f.st === 'air' || f.st === 'held' || f.st === 'down' || f.st === 'tired';
    const o: DrawOpts = { hurt, ko: f.st === 'ko', rim: mirror ? undefined : g.stage.rim, rx: g.stage.rx * 1.6 * g.u, ry: -0.6 * g.u };
    // Ansturm: Sie taucht abwechselnd vor und hinter dem Gegner auf.
    let shown = sk;
    if (f.st === 'special' && f.sp?.ph === 'lock' && f.sp.i % 2 === 1 && f.sp.i < RUSH_TIMES.length) {
      shown = skeleton(f.x + f.face * 128, f.y, (-f.face) as 1 | -1, poseOf(f, g.time));
    }
    if (!mirror) {
      ctx.globalCompositeOperation = 'lighter';
      for (const gh of r.ghosts) {
        ctx.globalAlpha = gh.a * 0.6;
        drawSk(ctx, c, gh.sk, look, [], { ghost: gh.look });
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
    drawSk(ctx, c, shown, look, r.strands, o);
    if (!mirror && r.white > 0) {
      ctx.globalAlpha = Math.min(1, r.white * 12);
      drawSk(ctx, c, shown, look, [], { ghost: '#ffffff' });
      ctx.globalAlpha = 1;
    }
  }
}

/** Die ganze Szene: Himmel, Ebenen, Boden, Spiegelung, Kämpfer, Effekte */
export function drawWorld(ctx: CanvasRenderingContext2D, g: Gfx, w: World, dt: number) {
  g.time += dt;
  const c = g.cam;
  updateCam(c, w, dt, g.u);
  const st = g.stage;
  const t = g.time;

  // Posen und Skelette
  const skel = {} as Record<Side, Sk>;
  for (const side of ['p1', 'p2'] as const) {
    const f = w.f[side];
    skel[side] = skeleton(f.x, f.y, f.face, poseOf(f, t));
    updateRig(g, w, f, g.rigs[side], skel[side], dt);
  }
  // Funken am Geschoss
  for (const p of w.proj) {
    const sd = w.f[p.owner].def.special;
    if (Math.random() < dt * 60) {
      part(g, { k: 'ember', x: p.x - Math.sign(p.vx) * (20 + Math.random() * 50), y: p.y + (Math.random() - 0.5) * 40, vx: -p.vx * 0.15, vy: 40 + Math.random() * 60, life: 0.4, size: 2 + Math.random() * 2, color: Math.random() < 0.5 ? sd.color : sd.color2 });
    }
  }
  ambient(g, dt);
  stepParts(g, dt);

  // Wer gerade angreift, wird oben gezeichnet.
  const busy = (f: Fighter) => f.st === 'attack' || f.st === 'special';
  const order: Side[] = busy(w.f.p1) && !busy(w.f.p2) ? ['p2', 'p1'] : ['p1', 'p2'];

  drawSky(ctx, c, st, t);
  for (const L of st.layers) drawLayer(ctx, c, L);
  drawStageLive(ctx, c, st, t);
  drawFloor(ctx, c, st, t);

  // Spiegelung im Boden
  if (g.mirror) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, c.gy + c.oy, c.W, c.H);
    ctx.clip();
    ctx.translate(0, 2 * (c.gy + c.oy));
    ctx.scale(1, -1);
    ctx.globalAlpha = st.mirror;
    drawFighters(ctx, g, w, order, skel, true);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // Schatten
  for (const side of order) {
    const f = w.f[side];
    const h = clamp01(1 - f.y / 260);
    ctx.fillStyle = `rgba(10,0,20,${0.38 * h})`;
    ctx.beginPath();
    const lying = f.st === 'down' || (f.st === 'ko' && f.y < 1);
    ctx.ellipse(sx(c, f.x), sy(c, 0) + 2, (lying ? 62 : 36) * c.s * (0.6 + 0.4 * h), 6 * c.s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Spezialattacke: Die Welt wird dunkel, der Zünder leuchtet.
  const flashA = w.flash ? Math.min(1, (FLASH_T - w.flash.t) * 6, w.flash.t * 6) : 0;
  if (flashA > 0) {
    ctx.fillStyle = `rgba(8,0,18,${0.62 * flashA})`;
    ctx.fillRect(0, 0, c.W, c.H);
    const f = w.f[w.flash!.side];
    const fx = sx(c, f.x);
    const fy = sy(c, f.y + 80);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = rgba(f.def.aura, 0.35 * flashA);
    ctx.lineWidth = 2 * g.u;
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + t * 0.6;
      const r0 = 70 * c.s + ((t * 900 + i * 53) % 120) * g.u;
      ctx.beginPath();
      ctx.moveTo(fx + Math.cos(a) * r0, fy + Math.sin(a) * r0);
      ctx.lineTo(fx + Math.cos(a) * (r0 + 60 * g.u), fy + Math.sin(a) * (r0 + 60 * g.u));
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // Aura hinter den Kämpfern
  ctx.globalCompositeOperation = 'lighter';
  for (const side of order) {
    const f = w.f[side];
    const full = f.power >= POWER_MAX || (w.flash?.side === side);
    if (!full || f.st === 'ko') continue;
    const pulse = 0.75 + 0.25 * Math.sin(t * 8);
    glow(ctx, sx(c, f.x), sy(c, f.y + 80), 95 * c.s * pulse, f.def.aura, w.flash?.side === side ? 0.6 : 0.28);
  }
  ctx.globalCompositeOperation = 'source-over';

  drawFighters(ctx, g, w, order, skel, false);

  // Deckung: kurz aufblitzender Schild
  for (const side of order) {
    const r = g.rigs[side];
    if (r.shield <= 0) continue;
    const f = w.f[side];
    const a = r.shield / 0.22;
    const x = sx(c, f.x + f.face * 30);
    const y = sy(c, f.y + 85);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(120,210,255,${a})`;
    ctx.lineWidth = 3 * g.u;
    ctx.beginPath();
    const r0 = 62 * c.s;
    const a0 = f.face > 0 ? -0.9 : Math.PI - 0.9;
    for (let i = 0; i <= 6; i++) {
      const an = a0 + (i / 6) * 1.8;
      const px = x + Math.cos(an) * r0;
      const py = y + Math.sin(an) * r0 * 1.2;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.stroke();
    glow(ctx, x, y, r0, '#7fd4ff', 0.25 * a);
    ctx.globalCompositeOperation = 'source-over';
  }

  // Wischspuren
  ctx.globalCompositeOperation = 'lighter';
  for (const side of order) {
    const tr = g.rigs[side].trail;
    if (tr.length < 2) continue;
    const f = w.f[side];
    const col = f.mv === 'k' || f.mv === 'p3' ? '#ffd27a' : '#ffffff';
    for (let i = 1; i < tr.length; i++) {
      const a = i / tr.length;
      ctx.strokeStyle = rgba(col, a * 0.55);
      ctx.lineWidth = (2 + a * 9) * c.s;
      ctx.beginPath();
      ctx.moveTo(sx(c, tr[i - 1].x), sy(c, tr[i - 1].y));
      ctx.lineTo(sx(c, tr[i].x), sy(c, tr[i].y));
      ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = 'source-over';

  for (const p of w.proj) {
    const sd = w.f[p.owner].def.special;
    drawProjectile(ctx, c, p.x, p.y, Math.sign(p.vx) || 1, sd.color, sd.color2, t);
  }

  const world = g.parts.filter((p) => !isScreen(p));
  drawParts(ctx, c, world, false);
  drawParts(ctx, c, world, true);
  const screen = g.parts.filter(isScreen);
  drawParts(ctx, c, screen, false);
  drawParts(ctx, c, screen, true);

  // Vignette
  const vg = ctx.createRadialGradient(c.W / 2, c.H * 0.45, Math.min(c.W, c.H) * 0.35, c.W / 2, c.H * 0.45, Math.max(c.W, c.H) * 0.8);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(6,0,14,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, c.W, c.H);

  if (g.white > 0) {
    ctx.fillStyle = `rgba(255,255,255,${Math.min(1, g.white)})`;
    ctx.fillRect(0, 0, c.W, c.H);
    g.white = Math.max(0, g.white - dt * 3.2);
  }

  if (w.flash) drawCutIn(ctx, g, w, skel[w.flash.side]);
}

/** Einblendung beim Zünden: Band quer durchs Bild mit Gesicht und Name der Attacke */
function drawCutIn(ctx: CanvasRenderingContext2D, g: Gfx, w: World, sk: Sk) {
  const c = g.cam;
  const fl = w.flash!;
  const f = w.f[fl.side];
  const u = g.u;
  const k = 1 - fl.t / FLASH_T;
  const slide = k < 0.18 ? 1 - ease(k / 0.18) : k > 0.86 ? -ease((k - 0.86) / 0.14) : 0;
  const dir = fl.side === 'p1' ? 1 : -1;
  const bh = 78 * u;
  const by = c.H * 0.38;
  ctx.save();
  ctx.translate(-slide * c.W * dir, 0);
  ctx.beginPath();
  ctx.moveTo(0, by - bh / 2 + 10 * u);
  ctx.lineTo(c.W, by - bh / 2 - 10 * u);
  ctx.lineTo(c.W, by + bh / 2 - 10 * u);
  ctx.lineTo(0, by + bh / 2 + 10 * u);
  ctx.closePath();
  const gr = ctx.createLinearGradient(0, 0, c.W, 0);
  gr.addColorStop(dir > 0 ? 0 : 1, rgba(f.def.aura, 0.95));
  gr.addColorStop(0.55, 'rgba(20,6,30,0.92)');
  gr.addColorStop(dir > 0 ? 1 : 0, 'rgba(20,6,30,0.75)');
  ctx.fillStyle = gr;
  ctx.fill();
  ctx.save();
  ctx.clip();
  // Tempolinien
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = 2 * u;
  for (let i = 0; i < 14; i++) {
    const y = by - bh / 2 + ((i * 29 + g.time * 600) % bh);
    const x = ((i * 97 + g.time * 1400 * dir) % (c.W + 200)) - 100;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 80 * u * dir, y);
    ctx.stroke();
  }
  // Großes Gesicht
  const look = lookOf(f.def, f.alt);
  const sc = (bh * 1.6) / 60;
  const hx = dir > 0 ? 70 * u : c.W - 70 * u;
  const cam: Cam = { ...c, cx: sk.head.x, s: sc, gy: by + 10 * u + sk.head.y * sc, ox: hx - c.W / 2, oy: 0 };
  const big = skeleton(f.x, f.y, (dir > 0 ? 1 : -1) as 1 | -1, P(f.def, 'guard'));
  cam.cx = big.head.x;
  cam.gy = by + 12 * u + big.head.y * sc;
  drawSk(ctx, cam, big, look, [], {});
  ctx.restore();
  ctx.restore();
  // Schrift
  ctx.save();
  ctx.translate(-slide * c.W * dir, 0);
  ctx.textAlign = dir > 0 ? 'right' : 'left';
  const tx = dir > 0 ? c.W - 16 * u : 16 * u;
  ctx.font = `italic 800 ${13 * u}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(`${f.def.name.toUpperCase()} · SPEZIALATTACKE`, tx, by - 14 * u);
  ctx.font = `italic 900 ${30 * u}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.lineWidth = 5 * u;
  ctx.strokeStyle = 'rgba(20,4,30,0.9)';
  ctx.strokeText(f.def.special.name.toUpperCase(), tx, by + 22 * u);
  const tg = ctx.createLinearGradient(0, by - 6 * u, 0, by + 22 * u);
  tg.addColorStop(0, '#ffffff');
  tg.addColorStop(1, f.def.special.color);
  ctx.fillStyle = tg;
  ctx.fillText(f.def.special.name.toUpperCase(), tx, by + 22 * u);
  ctx.restore();
}

// ───────────────────────── Anzeige ─────────────────────────

const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

function para(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, sk: number) {
  ctx.beginPath();
  ctx.moveTo(x + sk, y);
  ctx.lineTo(x + w + sk, y);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
}

function bigText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, a: number, scale: number, colors: [string, string], stroke = '#2a0636') {
  if (a <= 0) return;
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(x, y);
  ctx.scale(scale, scale);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `italic 900 ${size}px ${FONT}`;
  ctx.lineJoin = 'round';
  ctx.lineWidth = size * 0.16;
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, 0, 0);
  const gr = ctx.createLinearGradient(0, -size / 2, 0, size / 2);
  gr.addColorStop(0, colors[0]);
  gr.addColorStop(1, colors[1]);
  ctx.fillStyle = gr;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

export interface HudNames {
  p1: { name: string; tag: string };
  p2: { name: string; tag: string };
}

/** Lebensbalken, Uhr, Rundenherzen, Powerbalken, Kombos und die großen Ansagen */
export function drawHud(ctx: CanvasRenderingContext2D, g: Gfx, w: World, names: HudNames) {
  const { W, H } = g.cam;
  const u = g.u;
  const t = g.time;
  const top = 12 * u;
  const bh = 15 * u;
  const tw = 48 * u;
  const bw = W / 2 - 12 * u - tw / 2 - 8 * u;
  for (const side of ['p1', 'p2'] as const) {
    const f = w.f[side];
    const r = g.rigs[side];
    const left = side === 'p1';
    const x0 = left ? 12 * u : W / 2 + tw / 2 + 8 * u;
    const skw = left ? -5 * u : 5 * u;
    // Rahmen
    ctx.fillStyle = 'rgba(16,6,24,0.78)';
    para(ctx, x0 - 2 * u, top - 2 * u, bw + 4 * u, bh + 4 * u, skw);
    ctx.fill();
    const ratio = f.hp / f.maxHp;
    const seg = (from: number, to: number, fill: string | CanvasGradient) => {
      if (to <= from) return;
      const a = left ? x0 + bw * from : x0 + bw * (1 - to);
      ctx.fillStyle = fill;
      para(ctx, a, top, bw * (to - from), bh, skw);
      ctx.fill();
    };
    seg(ratio, r.hpGhost, r.hpDelay > 0 ? '#ffffff' : '#ff3b5c');
    const low = ratio < 0.3;
    const gr = ctx.createLinearGradient(0, top, 0, top + bh);
    if (low) {
      const p = 0.5 + 0.5 * Math.sin(t * 10);
      gr.addColorStop(0, `rgb(255,${Math.round(120 + 60 * p)},90)`);
      gr.addColorStop(1, '#ff3b2f');
    } else {
      gr.addColorStop(0, '#fff27a');
      gr.addColorStop(1, '#ffae22');
    }
    seg(0, ratio, gr);
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    para(ctx, x0, top, bw, bh * 0.38, skw);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1.2 * u;
    para(ctx, x0, top, bw, bh, skw);
    ctx.stroke();

    // Name, Spieler, Rundenherzen
    ctx.textBaseline = 'top';
    ctx.textAlign = left ? 'left' : 'right';
    const nx = left ? x0 : x0 + bw;
    ctx.font = `italic 900 ${13 * u}px ${FONT}`;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(20,4,30,0.85)';
    ctx.lineWidth = 3 * u;
    const label = f.def.name.toUpperCase();
    ctx.strokeText(label, nx, top + bh + 4 * u);
    ctx.fillText(label, nx, top + bh + 4 * u);
    const lw = ctx.measureText(label).width;
    ctx.font = `700 ${10.5 * u}px ${FONT}`;
    ctx.fillStyle = 'rgba(255,236,250,0.85)';
    const tx = left ? nx + lw + 6 * u : nx - lw - 6 * u;
    ctx.strokeText(names[side].tag, tx, top + bh + 6 * u);
    ctx.fillText(names[side].tag, tx, top + bh + 6 * u);
    for (let i = 0; i < 2; i++) {
      const hx = left ? x0 + bw - 8 * u - i * 15 * u : x0 + 8 * u + i * 15 * u;
      heartPath(ctx, hx, top + bh + 12 * u, 6 * u);
      if (w.wins[side] > i) {
        ctx.fillStyle = '#ff4f81';
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 1.2 * u;
      ctx.stroke();
    }

    // Powerbalken unten
    const pw = Math.min(W * 0.36, 170 * u);
    const ph = 9 * u;
    const py = H - 14 * u - ph;
    const px = left ? 12 * u : W - 12 * u - pw;
    const full = f.power >= POWER_MAX;
    ctx.fillStyle = 'rgba(16,6,24,0.78)';
    para(ctx, px - 2 * u, py - 2 * u, pw + 4 * u, ph + 4 * u, -skw);
    ctx.fill();
    const pr = Math.min(1, f.power / POWER_MAX);
    if (pr > 0) {
      const pg = ctx.createLinearGradient(px, 0, px + pw, 0);
      pg.addColorStop(0, shade(f.def.aura, -0.25));
      pg.addColorStop(1, full ? '#ffffff' : f.def.aura);
      ctx.fillStyle = pg;
      para(ctx, left ? px : px + pw * (1 - pr), py, pw * pr, ph, -skw);
      ctx.fill();
    }
    if (full) {
      ctx.globalCompositeOperation = 'lighter';
      const sh = ((t * 1.4) % 1) * pw;
      const sg = ctx.createLinearGradient(px + sh - 30 * u, 0, px + sh + 30 * u, 0);
      sg.addColorStop(0, 'rgba(255,255,255,0)');
      sg.addColorStop(0.5, 'rgba(255,255,255,0.75)');
      sg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = sg;
      para(ctx, px, py, pw, ph, -skw);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.strokeStyle = full ? '#ffffff' : 'rgba(255,255,255,0.45)';
    ctx.lineWidth = 1 * u;
    for (let i = 1; i < 4; i++) {
      const x = px + (pw * i) / 4;
      ctx.beginPath();
      ctx.moveTo(x, py);
      ctx.lineTo(x - skw * 0.3, py + ph);
      ctx.stroke();
    }
    para(ctx, px, py, pw, ph, -skw);
    ctx.stroke();
    ctx.textBaseline = 'bottom';
    ctx.textAlign = left ? 'left' : 'right';
    ctx.font = `italic 900 ${(full ? 12 : 10) * u}px ${FONT}`;
    const lx = left ? px : px + pw;
    const ptxt = full ? `${f.def.emoji} SPEZIAL BEREIT!` : `${f.def.emoji} POWER`;
    ctx.strokeStyle = 'rgba(20,4,30,0.85)';
    ctx.lineWidth = 3 * u;
    ctx.globalAlpha = full ? 0.75 + 0.25 * Math.sin(t * 9) : 0.8;
    ctx.strokeText(ptxt, lx, py - 3 * u);
    ctx.fillStyle = full ? '#ffffff' : 'rgba(255,240,250,0.9)';
    ctx.fillText(ptxt, lx, py - 3 * u);
    ctx.globalAlpha = 1;

    // Kombo
    if (r.combo >= 2) {
      const pop = 1 + Math.max(0, 0.35 - r.comboT) * 1.6;
      const cx = left ? 52 * u : W - 52 * u;
      const cy = H * 0.3;
      bigText(ctx, String(r.combo), cx, cy, 34 * u, 1, pop, ['#fff7a8', '#ff8a1f']);
      bigText(ctx, 'TREFFER', cx, cy + 24 * u, 11 * u, 1, 1, ['#ffffff', '#ffd6ef']);
    }
  }

  // Uhr
  const cx = W / 2;
  ctx.fillStyle = 'rgba(16,6,24,0.85)';
  ctx.beginPath();
  ctx.roundRect(cx - tw / 2, top - 4 * u, tw, 34 * u, 9 * u);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1.2 * u;
  ctx.stroke();
  const secs = Math.ceil(w.clock);
  const urgent = secs <= 10 && w.ph === 'fight';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${23 * u}px ${FONT}`;
  ctx.fillStyle = urgent && Math.sin(t * 12) > 0 ? '#ff5a6e' : '#ffffff';
  ctx.fillText(String(secs), cx, top + 13 * u);

  announce(ctx, g, w, names);
}

function announce(ctx: CanvasRenderingContext2D, g: Gfx, w: World, names: HudNames) {
  const { W, H } = g.cam;
  const u = g.u;
  const y = H * 0.4;
  const pop = (k: number) => 1 + Math.max(0, 1 - k / 0.22) * 0.7;
  const fade = (k: number, len: number) => clamp01(Math.min(k / 0.12, (len - k) / 0.2));
  const T = w.phT;
  if (w.ph === 'intro') {
    const finale = w.wins.p1 === 1 && w.wins.p2 === 1;
    if (T < 1.35) {
      bigText(ctx, finale ? 'FINALE RUNDE' : `RUNDE ${w.round}`, W / 2, y, (finale ? 34 : 42) * u, fade(T, 1.35), pop(T), ['#ffffff', '#ffd3f0']);
    } else bigText(ctx, 'KAMPF!', W / 2, y, 56 * u, fade(T - 1.35, INTRO_T - 1.35 + 0.5), pop(T - 1.35), ['#fff27a', '#ff6a1f']);
  } else if (w.ph === 'fight' && T < 0.45) {
    bigText(ctx, 'KAMPF!', W / 2, y, 56 * u, clamp01((0.45 - T) / 0.3), 1 + T * 0.4, ['#fff27a', '#ff6a1f']);
  } else if (w.ph === 'ko') {
    if (T < 1.7) bigText(ctx, w.timeUp ? 'ZEIT!' : 'K.O.!', W / 2, y, 64 * u, fade(T, 1.7), pop(T), w.timeUp ? ['#ffffff', '#9fd8ff'] : ['#fff27a', '#ff2b4a']);
    else {
      const k = T - 1.7;
      const rw = w.roundWin;
      const text = rw === 'draw' || !rw ? 'UNENTSCHIEDEN' : `${w.f[rw].def.name.toUpperCase()} GEWINNT`;
      bigText(ctx, text, W / 2, y, 28 * u, fade(k, 1.6), pop(k), ['#ffffff', '#ffd3f0']);
      if (rw && rw !== 'draw') {
        bigText(ctx, names[rw].tag, W / 2, y + 30 * u, 14 * u, fade(k, 1.6), 1, ['#ffffff', '#ffe9f6']);
        if (w.perfect) bigText(ctx, 'PERFEKT!', W / 2, y - 42 * u, 30 * u, fade(k, 1.6), pop(k), ['#7ff7ff', '#2f8bff']);
      }
    }
  } else if (w.ph === 'over') {
    const win = w.winner;
    const text = win === 'draw' || !win ? 'UNENTSCHIEDEN' : `${w.f[win].def.name.toUpperCase()} SIEGT!`;
    bigText(ctx, text, W / 2, y, 34 * u, clamp01(T / 0.15), pop(T), ['#fff27a', '#ff6a1f']);
    if (win && win !== 'draw') bigText(ctx, names[win].tag, W / 2, y + 34 * u, 15 * u, clamp01(T / 0.15), 1, ['#ffffff', '#ffe9f6']);
  }
}

// ───────────────────────── Kämpferwahl ─────────────────────────

/** Kleines Bild eines Kämpfers für die Auswahl (Brustbild) */
export function drawPortrait(cv: HTMLCanvasElement, def: FighterDef, alt: boolean, dpr: number) {
  const W = cv.clientWidth || 72;
  const H = cv.clientHeight || 72;
  cv.width = Math.round(W * dpr);
  cv.height = Math.round(H * dpr);
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const gr = ctx.createLinearGradient(0, 0, W, H);
  gr.addColorStop(0, shade(def.aura, -0.55));
  gr.addColorStop(1, shade(def.aura, -0.15));
  ctx.fillStyle = gr;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, W * 0.5, H * 0.45, W * 0.6, def.aura, 0.5);
  ctx.globalCompositeOperation = 'source-over';
  const sk = skeleton(0, 0, 1, P(def, 'guard'));
  const s = H / 78;
  const cam: Cam = { ...newCam(), W, H, cx: sk.head.x - 4, s, gy: H * 0.32 + sk.head.y * s, ox: 0, oy: 0 };
  const rig = newRig(lookOf(def, alt));
  for (let i = 0; i < 30; i++) {
    const look = lookOf(def, alt);
    let k = 0;
    if (look.hairStyle === 'ponytail') stepStrand(rig.strands[k++], headPt(sk, -64, 1.12), 1 / 30, 0, 1);
    if (look.band) {
      stepStrand(rig.strands[k++], headPt(sk, -102, 1.0), 1 / 30, 0, 1);
      stepStrand(rig.strands[k++], headPt(sk, -98, 0.92), 1 / 30, 0, 1);
    }
  }
  drawSk(ctx, cam, sk, lookOf(def, alt), rig.strands.filter((st) => st.w0 < 4.6 || lookOf(def, alt).hairStyle === 'ponytail'), { rim: 'rgba(255,255,255,0.5)', rx: 1.2, ry: -0.6 });
}

/** Vorschau in der Kämpferwahl: beide Kämpfer in der Arena, Kamera fest */
export function drawPreview(ctx: CanvasRenderingContext2D, g: Gfx, w: World, dt: number) {
  for (const f of [w.f.p1, w.f.p2]) {
    f.t += dt;
    f.x = STAGE_W / 2 + (f.side === 'p1' ? -110 : 110);
    f.face = f.side === 'p1' ? 1 : -1;
  }
  const saved = w.ph;
  w.ph = 'intro';
  drawWorld(ctx, g, w, dt);
  w.ph = saved;
}
