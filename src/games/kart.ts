import type { Side } from './logic';

/**
 * Herz-Kart: Spiellogik ohne Bildschirm. Die Strecke ist ein Herz aus einer geschlossenen Kurve,
 * Positionen auf der Strecke werden als Weg entlang der Mittellinie (`s`) und seitlicher Abstand
 * (`lat`, rechts positiv) beschrieben. Jedes Kart rechnet sich selbst – online simuliert jedes
 * Handy nur das eigene Kart und bekommt das andere mitgeschickt.
 */

export const WORLD = 1280;
/** Straßenbreite */
export const ROAD = 72;
const HALF = ROAD / 2;
/** Hecke: so weit darf man seitlich von der Mittellinie weg */
export const WALL = 84;
export const LAPS = 3;
export const KART_R = 7;
export const VMAX = 190;
export const OFFROAD = 92;
export const BOOST = 285;
export const COUNTDOWN = 3;
/** Ab so viel Driftzeit gibt's den kleinen / großen Mini-Turbo */
export const DRIFT_TURBO = [0.5, 1.1] as const;
/** Startaufstellung: so weit vor der Ziellinie, seitlich versetzt */
const GRID_BACK = 28;
const SPACING = 8;

export type ItemKind = 'pilz' | 'banane' | 'pfeil';
export const ITEM_EMOJI: Record<ItemKind, string> = { pilz: '🍄', banane: '🍌', pfeil: '💘' };
export const ITEM_NAME: Record<ItemKind, string> = { pilz: 'Turbo-Pilz', banane: 'Banane', pfeil: 'Herzpfeil' };

// ───────────────────────── Strecke ─────────────────────────

export interface Track {
  n: number;
  /** Mittellinie, gleichmäßig verteilt */
  px: number[];
  py: number[];
  /** Fahrtrichtung als Einheitsvektor */
  dx: number[];
  dy: number[];
  len: number;
  spacing: number;
  /** Item-Boxen */
  boxes: { x: number; y: number }[];
  /** Turbo-Felder */
  pads: { x: number; y: number; a: number; s: number; lat: number }[];
  /** Bäume neben der Strecke (k = Sorte) */
  trees: { x: number; y: number; k: number }[];
}

/** Das Herz, im Uhrzeigersinn gefahren – rechts runter zur Spitze, links hoch, über die Bögen zurück. */
const HEART: [number, number][] = [
  [1110, 480],
  [1060, 650],
  [930, 820],
  [780, 970],
  [680, 1080],
  [600, 1080],
  [500, 970],
  [350, 820],
  [220, 650],
  [170, 480],
  [220, 330],
  [360, 250],
  [520, 300],
  [600, 390],
  [680, 390],
  [760, 300],
  [920, 250],
  [1060, 330],
];
const START: [number, number] = [1085, 565];

/** Kleiner, fester Zufallsgenerator – alle Handys bekommen dieselben Bäume. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const wrapAngle = (a: number) => {
  a %= Math.PI * 2;
  if (a > Math.PI) a -= Math.PI * 2;
  else if (a < -Math.PI) a += Math.PI * 2;
  return a;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export function buildTrack(): Track {
  // Catmull-Rom durch die Herzpunkte, fein abgetastet …
  const dense: [number, number][] = [];
  const m = HEART.length;
  for (let i = 0; i < m; i++) {
    const p0 = HEART[(i - 1 + m) % m];
    const p1 = HEART[i];
    const p2 = HEART[(i + 1) % m];
    const p3 = HEART[(i + 2) % m];
    for (let j = 0; j < 48; j++) {
      const t = j / 48;
      const t2 = t * t;
      const t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      dense.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  // … und dann in gleichen Abständen neu verteilt.
  const cum = [0];
  for (let i = 1; i <= dense.length; i++) {
    const a = dense[i - 1];
    const b = dense[i % dense.length];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = cum[dense.length];
  const n = Math.round(total / SPACING);
  const spacing = total / n;
  let px: number[] = [];
  let py: number[] = [];
  let j = 0;
  for (let i = 0; i < n; i++) {
    const d = i * spacing;
    while (cum[j + 1] < d) j++;
    const u = (d - cum[j]) / (cum[j + 1] - cum[j] || 1);
    const a = dense[j];
    const b = dense[(j + 1) % dense.length];
    px.push(a[0] + (b[0] - a[0]) * u);
    py.push(a[1] + (b[1] - a[1]) * u);
  }
  // Ziellinie an den Anfang drehen
  let first = 0;
  let bd = Infinity;
  for (let i = 0; i < n; i++) {
    const d = (px[i] - START[0]) ** 2 + (py[i] - START[1]) ** 2;
    if (d < bd) {
      bd = d;
      first = i;
    }
  }
  px = [...px.slice(first), ...px.slice(0, first)];
  py = [...py.slice(first), ...py.slice(0, first)];
  const dx: number[] = [];
  const dy: number[] = [];
  for (let i = 0; i < n; i++) {
    const ax = px[(i + 1) % n] - px[(i - 1 + n) % n];
    const ay = py[(i + 1) % n] - py[(i - 1 + n) % n];
    const l = Math.hypot(ax, ay) || 1;
    dx.push(ax / l);
    dy.push(ay / l);
  }
  const t: Track = { n, px, py, dx, dy, len: total, spacing, boxes: [], pads: [], trees: [] };

  for (const at of [0.28, 0.66]) {
    for (const lat of [-24, -8, 8, 24]) {
      const p = trackPoint(t, at * total, lat);
      t.boxes.push({ x: p.x, y: p.y });
    }
  }
  for (const [at, lat] of [
    [0.12, -16],
    [0.47, 16],
    [0.83, -14],
  ] as const) {
    const p = trackPoint(t, at * total, lat);
    t.pads.push({ x: p.x, y: p.y, a: p.a, s: at * total, lat });
  }

  const rnd = seeded(2024);
  for (let tries = 0; t.trees.length < 90 && tries < 2000; tries++) {
    const p = trackPoint(t, rnd() * total, (rnd() < 0.5 ? -1 : 1) * (WALL + 16 + rnd() * 150));
    if (p.x < 24 || p.y < 24 || p.x > WORLD - 24 || p.y > WORLD - 24) continue;
    // Nicht auf einem anderen Stück Strecke
    if (Math.abs(locate(t, p.x, p.y).lat) < WALL + 12) continue;
    if (t.trees.some((o) => Math.hypot(o.x - p.x, o.y - p.y) < 26)) continue;
    t.trees.push({ x: p.x, y: p.y, k: Math.floor(rnd() * 3) });
  }
  return t;
}

let trackCache: Track | undefined;
export const getTrack = () => (trackCache ??= buildTrack());

const wrapS = (t: Track, s: number) => ((s % t.len) + t.len) % t.len;

/** Punkt auf der Strecke: `s` entlang der Mittellinie, `lat` nach rechts. */
export function trackPoint(t: Track, s: number, lat = 0) {
  const w = wrapS(t, s) / t.spacing;
  const i = Math.floor(w) % t.n;
  const k = (i + 1) % t.n;
  const u = w - Math.floor(w);
  let dx = t.dx[i] + (t.dx[k] - t.dx[i]) * u;
  let dy = t.dy[i] + (t.dy[k] - t.dy[i]) * u;
  const l = Math.hypot(dx, dy) || 1;
  dx /= l;
  dy /= l;
  return { x: t.px[i] + (t.px[k] - t.px[i]) * u - dy * lat, y: t.py[i] + (t.py[k] - t.py[i]) * u + dx * lat, a: Math.atan2(dy, dx) };
}

export interface Loc {
  i: number;
  s: number;
  lat: number;
}

/** Wo auf der Strecke liegt (x, y)? `hint` = Index von vorhin, dann wird nur in der Nähe gesucht. */
export function locate(t: Track, x: number, y: number, hint = -1): Loc {
  const { n, px, py } = t;
  let best = -1;
  let bd = Infinity;
  const scan = (from: number, count: number) => {
    for (let c = 0; c < count; c++) {
      const i = (((from + c) % n) + n) % n;
      const d = (px[i] - x) ** 2 + (py[i] - y) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
  };
  if (hint >= 0) scan(hint - 24, 49);
  if (best < 0 || bd > 110 * 110) scan(0, n);
  let res: Loc = { i: best, s: best * t.spacing, lat: 0 };
  let rd = Infinity;
  for (const a of [(best - 1 + n) % n, best]) {
    const b = (a + 1) % n;
    const ex = px[b] - px[a];
    const ey = py[b] - py[a];
    const l2 = ex * ex + ey * ey || 1;
    const u = clamp(((x - px[a]) * ex + (y - py[a]) * ey) / l2, 0, 1);
    const qx = px[a] + ex * u;
    const qy = py[a] + ey * u;
    const d = (x - qx) ** 2 + (y - qy) ** 2;
    if (d < rd) {
      rd = d;
      const l = Math.sqrt(l2);
      res = { i: u > 0.5 ? b : a, s: wrapS(t, (a + u) * t.spacing), lat: ((x - qx) * -ey + (y - qy) * ex) / l };
    }
  }
  return res;
}

// ───────────────────────── Karts ─────────────────────────

export interface Hazard {
  id: number;
  k: 'banane' | 'pfeil';
  x: number;
  y: number;
  a: number;
  /** Alter in Sekunden */
  t: number;
}

export interface KartState {
  x: number;
  y: number;
  /** Fahrtrichtung (Bogenmaß, 0 = nach rechts, Bildschirm-y zeigt nach unten) */
  a: number;
  v: number;
  /** Geglättete Lenkung */
  st: number;
  seg: number;
  s: number;
  lat: number;
  /** Zurückgelegter Weg seit dem Start (über alle Runden) */
  prog: number;
  lap: number;
  /** Restzeit Dreher */
  spin: number;
  /** Restzeit Turbo */
  boost: number;
  /** Driftladung in Sekunden */
  drift: number;
  /** Richtung des laufenden Drifts (0 = kein Drift) */
  driftDir: number;
  /** So lange schon in dieselbe Richtung (holdDir) gelenkt */
  hold: number;
  holdDir: number;
  /** So lange schon nicht mehr in Driftrichtung gelenkt */
  grace: number;
  item: ItemKind | null;
  /** Item-Roulette läuft noch so lange */
  roll: number;
  /** Zielzeit */
  fin: number | null;
  /** Meine Bananen und Herzpfeile */
  haz: Hazard[];
  /** IDs der fremden Bananen, in die ich gefahren bin (damit der andere sie wegräumt) */
  hits: number[];
  /** So oft hat mein Herzpfeil getroffen */
  zap: number;
  /** So viele Treffer vom anderen habe ich schon abbekommen */
  seenZap: number;
  nextId: number;
  wallT: number;
  ai?: { lane: number; t: number; wait: number };
}

export type KartEvent = 'box' | 'item' | 'pilz' | 'drop' | 'fire' | 'zap' | 'turbo' | 'pad' | 'wall' | 'hit' | 'lap' | 'final' | 'finish';

export interface Input {
  /** −1 links … 1 rechts */
  steer: number;
  /** Item einsetzen (einmalig) */
  use: boolean;
}

/** Was ein Kart von seinem Gegner wissen muss – lokal das andere Kart, online die mitgeschickte Ansicht. */
export interface Rival {
  x: number;
  y: number;
  prog: number;
  fin: number | null;
  haz: Hazard[];
}

/** Item-Boxen erscheinen nach dem Einsammeln wieder (pro Rennen). */
export interface Course {
  boxes: number[];
}

export const newCourse = (t: Track): Course => ({ boxes: t.boxes.map(() => 0) });

export function newKart(t: Track, lat: number): KartState {
  const s = t.len - GRID_BACK;
  const p = trackPoint(t, s, lat);
  return {
    x: p.x,
    y: p.y,
    a: p.a,
    v: 0,
    st: 0,
    seg: locate(t, p.x, p.y).i,
    s,
    lat,
    prog: -GRID_BACK,
    lap: 1,
    spin: 0,
    boost: 0,
    drift: 0,
    driftDir: 0,
    hold: 0,
    holdDir: 0,
    grace: 0,
    item: null,
    roll: 0,
    fin: null,
    haz: [],
    hits: [],
    zap: 0,
    seenZap: 0,
    nextId: 1,
    wallT: 0,
  };
}

/** Startplätze: Wer beginnt, steht rechts. */
export const GRID_LAT: Record<Side, number> = { p1: 15, p2: -15 };

export function pickItem(rnd: () => number, leading: boolean, solo: boolean): ItemKind {
  if (solo) return 'pilz';
  const r = rnd();
  if (leading) return r < 0.5 ? 'banane' : r < 0.85 ? 'pilz' : 'pfeil';
  return r < 0.45 ? 'pfeil' : r < 0.85 ? 'pilz' : 'banane';
}

function fireItem(k: KartState, ev: KartEvent[]) {
  const item = k.item;
  if (!item) return;
  k.item = null;
  const fx = Math.cos(k.a);
  const fy = Math.sin(k.a);
  if (item === 'pilz') {
    k.boost = Math.max(k.boost, 1.3);
    ev.push('pilz');
  } else if (item === 'banane') {
    const mine = k.haz.filter((h) => h.k === 'banane');
    if (mine.length >= 3) k.haz = k.haz.filter((h) => h !== mine[0]);
    k.haz.push({ id: k.nextId++, k: 'banane', x: k.x - fx * 14, y: k.y - fy * 14, a: k.a, t: 0 });
    ev.push('drop');
  } else {
    k.haz.push({ id: k.nextId++, k: 'pfeil', x: k.x + fx * 12, y: k.y + fy * 12, a: k.a, t: 0 });
    ev.push('fire');
  }
}

export interface StepOpts {
  rnd: () => number;
  course: Course;
  /** Bin ich vorne? (für die Item-Auswahl) */
  leading: boolean;
  /** Zeitfahren: nur Turbo-Pilze */
  solo?: boolean;
  /** Wohin meine Herzpfeile fliegen */
  target?: { x: number; y: number } | null;
  /** Gummiband für die KI */
  vmaxMul?: number;
}

/** Ist das Kart auf dem Asphalt (mit etwas Toleranz für die Randsteine)? */
export const onRoad = (k: { lat: number }) => Math.abs(k.lat) <= HALF + 3;

export function stepKart(k: KartState, inp: Input, dt: number, t: Track, raceT: number, ev: KartEvent[], o: StepOpts) {
  // Item-Roulette
  if (k.roll > 0) {
    k.roll -= dt;
    if (k.roll <= 0) {
      k.roll = 0;
      k.item = pickItem(o.rnd, o.leading, !!o.solo);
      ev.push('item');
    }
  }
  if (inp.use && k.item && k.spin <= 0) fireItem(k, ev);

  const spinning = k.spin > 0;
  k.spin = Math.max(0, k.spin - dt);
  k.boost = Math.max(0, k.boost - dt);
  k.wallT = Math.max(0, k.wallT - dt);
  const road = onRoad(k);

  // Tempo: Gas gibt das Kart von selbst.
  let vmax = (road ? VMAX : OFFROAD) * (o.vmaxMul ?? 1);
  if (k.boost > 0) vmax = Math.max(vmax, BOOST);
  if (spinning) vmax = 25;
  if (k.v < vmax) k.v = Math.min(vmax, k.v + (k.boost > 0 ? 420 : 125) * dt);
  else k.v = Math.max(vmax, k.v - (spinning ? 260 : road ? 160 : 320) * dt);

  // Lenken & Driften: Wer eine Kurve hält, driftet – beim Loslassen gibt's einen Mini-Turbo.
  const steer = spinning ? 0 : clamp(inp.steer, -1, 1);
  k.st += clamp(steer - k.st, -dt * 7, dt * 7);
  const dir = Math.abs(steer) > 0.6 ? Math.sign(steer) : 0;
  if (dir !== 0 && dir === k.holdDir) k.hold += dt;
  else {
    k.holdDir = dir;
    k.hold = 0;
  }
  if (k.driftDir !== 0) {
    if (spinning || !road || k.v < 80) {
      k.driftDir = 0;
      k.drift = 0;
    } else {
      k.drift += dt;
      // Kurz loslassen beendet den Drift noch nicht – erst wer länger geradeaus will.
      k.grace = dir === k.driftDir ? 0 : k.grace + dt;
      if (k.grace > 0.3) {
        if (k.drift >= DRIFT_TURBO[0]) {
          k.boost = Math.max(k.boost, k.drift >= DRIFT_TURBO[1] ? 0.9 : 0.5);
          ev.push('turbo');
        }
        k.driftDir = 0;
        k.drift = 0;
      }
    }
  } else if (dir !== 0 && k.hold >= 0.3 && k.v > 110 && road && !spinning) {
    k.driftDir = dir;
    k.drift = 0;
    k.grace = 0;
  }
  const grip = Math.min(1, k.v / 70);
  const turn = 2.7 * grip * (k.driftDir !== 0 ? k.driftDir * 0.45 + k.st * 0.75 : k.st);
  k.a = wrapAngle(k.a + turn * dt);

  k.x = clamp(k.x + Math.cos(k.a) * k.v * dt, 4, WORLD - 4);
  k.y = clamp(k.y + Math.sin(k.a) * k.v * dt, 4, WORLD - 4);
  const loc = locate(t, k.x, k.y, k.seg);

  // Hecke am Streckenrand: abprallen
  if (Math.abs(loc.lat) > WALL) {
    const side = Math.sign(loc.lat);
    const over = Math.abs(loc.lat) - WALL;
    const nx = -t.dy[loc.i] * side;
    const ny = t.dx[loc.i] * side;
    k.x -= nx * over;
    k.y -= ny * over;
    let hx = Math.cos(k.a);
    let hy = Math.sin(k.a);
    const out = hx * nx + hy * ny;
    if (out > 0) {
      hx -= nx * out * 1.4;
      hy -= ny * out * 1.4;
      k.a = Math.atan2(hy, hx);
      if (k.wallT <= 0) {
        k.v *= 0.6;
        k.wallT = 0.4;
        ev.push('wall');
      }
    }
    loc.lat = side * WALL;
  }

  // Fortschritt – große Sprünge (Abkürzung übers Gras zu einem anderen Streckenstück) zählen nicht.
  let ds = loc.s - k.s;
  if (ds > t.len / 2) ds -= t.len;
  else if (ds < -t.len / 2) ds += t.len;
  if (Math.abs(ds) < 120) k.prog += ds;
  k.s = loc.s;
  k.seg = loc.i;
  k.lat = loc.lat;
  const lap = clamp(Math.floor(k.prog / t.len) + 1, 1, LAPS);
  if (lap > k.lap) {
    k.lap = lap;
    if (k.fin === null) ev.push(lap === LAPS ? 'final' : 'lap');
  }
  if (k.fin === null && k.prog >= LAPS * t.len) {
    k.fin = raceT;
    ev.push('finish');
  }

  // Turbo-Felder
  if (onRoad(k)) {
    for (const p of t.pads) {
      let d = k.s - p.s;
      if (d > t.len / 2) d -= t.len;
      else if (d < -t.len / 2) d += t.len;
      if (Math.abs(d) < 12 && Math.abs(k.lat - p.lat) < 11 && k.boost < 0.6) {
        k.boost = 0.9;
        ev.push('pad');
      }
    }
  }

  // Item-Boxen
  t.boxes.forEach((b, i) => {
    if (o.course.boxes[i] > 0 || (k.x - b.x) ** 2 + (k.y - b.y) ** 2 > 13 * 13) return;
    o.course.boxes[i] = 2.5;
    if (!k.item && k.roll <= 0) {
      k.roll = 1;
      ev.push('box');
    }
  });

  // Eigene Bananen altern, Herzpfeile fliegen dem Ziel hinterher
  for (const h of k.haz) {
    h.t += dt;
    if (h.k !== 'pfeil') continue;
    if (o.target) {
      const want = Math.atan2(o.target.y - h.y, o.target.x - h.x);
      h.a = wrapAngle(h.a + clamp(wrapAngle(want - h.a), -4 * dt, 4 * dt));
    }
    h.x += Math.cos(h.a) * 330 * dt;
    h.y += Math.sin(h.a) * 330 * dt;
    if (o.target && (h.x - o.target.x) ** 2 + (h.y - o.target.y) ** 2 < (KART_R + 6) ** 2) {
      h.t = 99;
      k.zap++;
      ev.push('zap');
    }
  }
  k.haz = k.haz.filter((h) => (h.k === 'pfeil' ? h.t < 4.5 : h.t < 120));
}

export function tickCourse(c: Course, dt: number) {
  c.boxes = c.boxes.map((b) => Math.max(0, b - dt));
}

function spinOut(k: KartState, ev: KartEvent[]) {
  if (k.spin > 0) return;
  k.spin = 1.1;
  k.drift = 0;
  k.driftDir = 0;
  k.hold = 0;
  ev.push('hit');
}

/** In fremde Bananen gefahren? */
export function hitBananas(victim: KartState, haz: Hazard[], ev: KartEvent[]) {
  for (const h of haz) {
    if (h.k !== 'banane' || victim.hits.includes(h.id)) continue;
    if ((victim.x - h.x) ** 2 + (victim.y - h.y) ** 2 > (KART_R + 6) ** 2) continue;
    victim.hits = [...victim.hits.slice(-9), h.id];
    spinOut(victim, ev);
  }
}

/** Bananen wegräumen, in die der andere gefahren ist. */
export function sweepBananas(owner: KartState, rivalHits: number[]) {
  if (owner.haz.some((h) => h.k === 'banane' && rivalHits.includes(h.id))) owner.haz = owner.haz.filter((h) => !(h.k === 'banane' && rivalHits.includes(h.id)));
}

/** Hat mich ein neuer Herzpfeil erwischt? */
export function applyZap(victim: KartState, rivalZap: number, ev: KartEvent[]) {
  if (rivalZap <= victim.seenZap) return;
  victim.seenZap = rivalZap;
  spinOut(victim, ev);
}

/** Karts schubsen sich weg. `share` = welcher Anteil des Stoßes bei diesem Kart landet. */
export function bump(k: KartState, ox: number, oy: number, share: number): boolean {
  const dx = k.x - ox;
  const dy = k.y - oy;
  const d = Math.hypot(dx, dy);
  if (d >= KART_R * 2 || d < 0.01) return false;
  const push = (KART_R * 2 - d) * share;
  k.x += (dx / d) * push;
  k.y += (dy / d) * push;
  k.v *= 0.97;
  return true;
}

/** Wer liegt vorne? */
export function ahead(a: { fin: number | null; prog: number }, b: { fin: number | null; prog: number }): boolean {
  if (a.fin !== null || b.fin !== null) {
    if (a.fin === null) return false;
    if (b.fin === null) return true;
    return a.fin <= b.fin;
  }
  return a.prog >= b.prog;
}

// ───────────────────────── KI ─────────────────────────

/** Gummiband: Liegt die KI weit hinten, fährt sie etwas schneller – liegt sie vorne, etwas langsamer. */
export const kiVmax = (k: { prog: number }, rival: { prog: number } | null) => (rival ? clamp(0.94 + (rival.prog - k.prog) / 2500, 0.88, 1.06) : 1);

export function kiInput(k: KartState, t: Track, rival: Rival | null, rnd: () => number, dt: number): Input {
  const ai = (k.ai ??= { lane: 0, t: 0, wait: 0 });
  ai.t -= dt;
  if (ai.t <= 0) {
    ai.lane = (rnd() * 2 - 1) * 20;
    ai.t = 2 + rnd() * 3;
  }
  let lane = ai.lane;
  // Bananen ausweichen
  if (rival) {
    for (const h of rival.haz) {
      if (h.k !== 'banane') continue;
      const l = locate(t, h.x, h.y, k.seg);
      let d = l.s - k.s;
      if (d < -t.len / 2) d += t.len;
      if (d > 0 && d < 90 && Math.abs(l.lat - lane) < 16) lane = clamp(l.lat > 0 ? l.lat - 22 : l.lat + 22, -28, 28);
    }
  }
  const p = trackPoint(t, k.s + 34 + k.v * 0.32, lane);
  const diff = wrapAngle(Math.atan2(p.y - k.y, p.x - k.x) - k.a);
  const steer = clamp(diff * 2.6, -1, 1);

  let use = false;
  if (k.item) {
    ai.wait += dt;
    if (ai.wait > 0.6) {
      const gap = rival ? rival.prog - k.prog : 0;
      if (k.item === 'pilz') use = Math.abs(diff) < 0.2;
      else if (k.item === 'banane') use = (!!rival && gap < 0 && gap > -160) || ai.wait > 6;
      else use = (!!rival && gap > 0 && gap < 450) || ai.wait > 8;
    }
    if (use) ai.wait = 0;
  } else ai.wait = 0;
  return { steer, use };
}

// ───────────────────────── Online ─────────────────────────

/** Ein Kart, wie es übers Netz geht – kurz, gerundet. */
export interface NetKart {
  x: number;
  y: number;
  a: number;
  v: number;
  /** Fortschritt */
  p: number;
  /** dreht sich gerade */
  sp: number;
  /** Turbo */
  b: number;
  /** Drift-Stufe 0–2 mit Richtung (−2 … 2) */
  d: number;
  f: number | null;
  /** Rennzeit dieses Handys */
  el: number;
  /** Bananen & Herzpfeile: [id, 0 = Banane / 1 = Pfeil, x, y, a] */
  h: [number, number, number, number, number][];
  hi: number[];
  z: number;
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

export function driftLevel(k: { drift: number }) {
  return k.drift >= DRIFT_TURBO[1] ? 2 : k.drift >= DRIFT_TURBO[0] ? 1 : 0;
}

export function packKart(k: KartState, el: number): NetKart {
  return {
    x: r1(k.x),
    y: r1(k.y),
    a: r3(k.a),
    v: r1(k.v),
    p: r1(k.prog),
    sp: k.spin > 0 ? 1 : 0,
    b: k.boost > 0 ? 1 : 0,
    d: driftLevel(k) * k.driftDir,
    f: k.fin,
    el: r1(el),
    h: k.haz.map((h) => [h.id, h.k === 'banane' ? 0 : 1, r1(h.x), r1(h.y), r3(h.a)]),
    hi: k.hits,
    z: k.zap,
  };
}

export function unpackHazards(h: NetKart['h']): Hazard[] {
  return (Array.isArray(h) ? h : []).map(([id, k, x, y, a]) => ({ id, k: k === 0 ? 'banane' : 'pfeil', x, y, a, t: 0 }));
}

/**
 * Wer hat online gewonnen? Jedes Handy misst seine eigene Rennzeit ab dem eigenen Start.
 * Steht nur eine Zielzeit fest, entscheidet sie erst, wenn der andere schon länger unterwegs ist.
 */
export function decideOnline(host: { fin: number | null; el: number }, guest: { fin: number | null; el: number }): Side | null {
  if (host.fin !== null && guest.fin !== null) return host.fin <= guest.fin ? 'p1' : 'p2';
  if (host.fin !== null && guest.el > host.fin) return 'p1';
  if (guest.fin !== null && host.el > guest.fin) return 'p2';
  return null;
}

export function fmtTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
}
