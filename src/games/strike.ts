import { otherSide, type Side } from './logic';

/**
 * Herz-Strike: Paintball-Duell in der Arena – die Spiellogik ohne Grafik.
 * Einheiten: Meter und Sekunden. x nach Osten, z nach Norden, y nach oben.
 * Die Arena ist flach; jede Deckung ist ein senkrechtes Luftkissen mit einem Grundriss-Polygon.
 * Blickrichtung: yaw = 0 schaut nach +z, vorwärts = (sin yaw, cos yaw).
 */

/** Die Arena reicht von -HALF bis HALF */
export const HALF = 17;
export const WALL_H = 3.2;
/** Körper-Radius beim Laufen */
export const R = 0.4;
/** Trefferzone (etwas großzügiger als der Körper, sonst ist es am Handy zu schwer) */
export const HIT_R = 0.5;
export const BODY_H = 1.78;
export const EYE = 1.52;
export const SPEED = 5.2;
export const MAX_HP = 3;
export const WIN = 5;
export const MAG = 12;
export const RELOAD = 1.3;
export const FIRE_GAP = 0.16;
export const BALL_V = 38;
export const BALL_G = 4.5;
export const RESPAWN = 2.2;
export const SHIELD = 1.6;
export const MATCH_T = 240;
export const COUNT_T = 3;
/** Solo-Zielschießen */
export const SOLO_T = 60;
/** Online: so lange ohne Nachricht, dann ist der andere weg */
export const NET_TIMEOUT = 10;
export const NET_EVERY = 0.075;

export type V2 = [number, number];
export type V3 = [number, number, number];
type Rnd = () => number;

export const fwd = (yaw: number): V2 => [Math.sin(yaw), Math.cos(yaw)];
/** Rechts vom Blick (vom Spieler aus gesehen) */
export const rightOf = (yaw: number): V2 => [-Math.cos(yaw), Math.sin(yaw)];
export const dir3 = (yaw: number, pitch: number): V3 => [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
export const angDiff = (a: number, b: number) => {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

// ───────────── Arena ─────────────

export type BlockKind = 'can' | 'brick' | 'snake' | 'tower' | 'heart';

export interface Block {
  kind: BlockKind;
  /** Grundriss gegen den Uhrzeigersinn (x, z) */
  pts: V2[];
  h: number;
  cx: number;
  cz: number;
  /** Farbe aus der Luftkissen-Palette */
  color: number;
}

function area(pts: V2[]) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, z1] = pts[i];
    const [x2, z2] = pts[(i + 1) % pts.length];
    a += x1 * z2 - x2 * z1;
  }
  return a / 2;
}

function block(kind: BlockKind, pts: V2[], h: number, color: number): Block {
  if (area(pts) < 0) pts.reverse();
  let cx = 0;
  let cz = 0;
  for (const p of pts) {
    cx += p[0] / pts.length;
    cz += p[1] / pts.length;
  }
  return { kind, pts, h, cx, cz, color };
}

const rot = (x: number, z: number, a: number): V2 => [x * Math.cos(a) - z * Math.sin(a), x * Math.sin(a) + z * Math.cos(a)];

function rect(cx: number, cz: number, w: number, d: number, a = 0): V2[] {
  return [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [w / 2, d / 2],
    [-w / 2, d / 2],
  ].map(([x, z]) => {
    const [rx, rz] = rot(x, z, a);
    return [cx + rx, cz + rz] as V2;
  });
}

function circle(cx: number, cz: number, r: number, n = 18): V2[] {
  return Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * r, cz + Math.sin((i / n) * Math.PI * 2) * r] as V2);
}

/** Langes Kissen mit runden Enden („Schlange“) */
function stadium(cx: number, cz: number, len: number, w: number, a = 0): V2[] {
  const pts: V2[] = [];
  const r = w / 2;
  const s = len / 2 - r;
  for (let i = 0; i <= 8; i++) {
    const t = -Math.PI / 2 + (i / 8) * Math.PI;
    pts.push([s + Math.cos(t) * r, Math.sin(t) * r]);
  }
  for (let i = 0; i <= 8; i++) {
    const t = Math.PI / 2 + (i / 8) * Math.PI;
    pts.push([-s + Math.cos(t) * r, Math.sin(t) * r]);
  }
  return pts.map(([x, z]) => {
    const [rx, rz] = rot(x, z, a);
    return [cx + rx, cz + rz] as V2;
  });
}

/** Herz-Grundriss, die Spitze zeigt nach +x */
function heart(cx: number, cz: number, size: number): V2[] {
  const pts: V2[] = [];
  const n = 30;
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const hx = 16 * Math.sin(t) ** 3;
    const hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
    // hy zeigt nach oben (Bögen), die Spitze liegt bei hy < 0 → nach +x drehen
    pts.push([cx - ((hy + 2.5) / 32) * size, cz + (hx / 32) * size]);
  }
  return pts;
}

function mirror(b: Block): Block {
  return block(
    b.kind,
    b.pts.map(([x, z]) => [x, -z] as V2),
    b.h,
    b.color,
  );
}

function makeArena(): Block[] {
  // Eine Hälfte (Süden, z < 0); der Norden ist gespiegelt – so ist es für beide gleich fair.
  const half: Block[] = [
    block('can', circle(-5, -4.6, 0.85), 2.1, 1),
    block('can', circle(5.4, -5.2, 0.8), 2.1, 2),
    block('brick', rect(0, -9.6, 2.8, 1.2), 1.7, 3),
    block('snake', stadium(-10.6, -6.4, 6, 1.1, Math.PI / 2), 1.05, 0),
    block('snake', stadium(10.2, -7.2, 5.4, 1.1, Math.PI / 2.6), 1.05, 4),
    block('tower', rect(-13.2, -12.6, 2.2, 2.2), 3, 2),
    block('brick', rect(12.8, -12.2, 1.2, 2.8), 1.7, 1),
    block('can', circle(-3, -13.2, 0.6, 14), 1.4, 4),
    block('can', circle(3.6, -13.6, 0.6, 14), 1.4, 0),
    block('brick', rect(-9.2, -1.9, 3, 1.2), 1.7, 3),
    block('can', circle(13.6, -2.6, 0.75), 2.1, 3),
    block('brick', rect(6.6, -1.2, 1.2, 1.2, Math.PI / 4), 1.5, 0),
  ];
  return [block('heart', heart(0.4, 0, 4), 2.4, 5), ...half, ...half.map(mirror)];
}

export const ARENA: Block[] = makeArena();

/** Startplätze: [x, z, Blickrichtung] */
export const SPAWNS: [number, number, number][] = [
  [0, -15.4, 0],
  [-8, -15, 0.3],
  [8.4, -15.2, -0.3],
  [-15.3, -7, 0.9],
  [15.3, -5.5, -0.9],
  [0, 15.4, Math.PI],
  [-8, 15, Math.PI - 0.3],
  [8.4, 15.2, Math.PI + 0.3],
  [-15.3, 7, Math.PI - 0.9],
  [15.3, 5.5, Math.PI + 0.9],
];
export const HOME: Record<Side, number> = { p1: 0, p2: 5 };

// ───────────── Geometrie ─────────────

export function inPoly(x: number, z: number, pts: V2[]) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i];
    const [xj, zj] = pts[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Nächster Punkt auf dem Rand: Abstand² und die Außen-Normale der Kante */
export function nearestEdge(x: number, z: number, pts: V2[]) {
  let best = Infinity;
  let px = 0;
  let pz = 0;
  let nx = 0;
  let nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[(i + 1) % pts.length];
    const ex = bx - ax;
    const ez = bz - az;
    const l2 = ex * ex + ez * ez || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / l2));
    const qx = ax + ex * t;
    const qz = az + ez * t;
    const d = (x - qx) ** 2 + (z - qz) ** 2;
    if (d < best) {
      best = d;
      px = qx;
      pz = qz;
      const l = Math.sqrt(l2);
      nx = ez / l;
      nz = -ex / l;
    }
  }
  return { d2: best, x: px, z: pz, nx, nz };
}

/** Schiebt einen Kreis aus allen Deckungen und hält ihn in der Arena. */
export function collide(x: number, z: number, r = R, blocks = ARENA): V2 {
  for (let pass = 0; pass < 2; pass++) {
    for (const b of blocks) {
      if (Math.abs(x - b.cx) > 4 || Math.abs(z - b.cz) > 4) continue;
      const inside = inPoly(x, z, b.pts);
      const e = nearestEdge(x, z, b.pts);
      if (inside) {
        x = e.x + e.nx * (r + 0.001);
        z = e.z + e.nz * (r + 0.001);
      } else if (e.d2 < r * r) {
        const d = Math.sqrt(e.d2) || 1e-6;
        x = e.x + ((x - e.x) / d) * (r + 0.001);
        z = e.z + ((z - e.z) / d) * (r + 0.001);
      }
    }
  }
  const lim = HALF - r;
  return [Math.max(-lim, Math.min(lim, x)), Math.max(-lim, Math.min(lim, z))];
}

export interface SegHit {
  t: number;
  p: V3;
  n: V3;
  /** Index der Deckung, -1 = Boden, -2 = Außenwand */
  b: number;
}

const cross2 = (ax: number, az: number, bx: number, bz: number) => ax * bz - az * bx;

/** Erster Aufprall einer Strecke a→b an Deckungen, Boden oder Außenwand. */
export function segWorld(a: V3, b: V3, blocks = ARENA): SegHit | null {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  let best: SegHit | null = null;
  const at = (t: number): V3 => [a[0] + dx * t, a[1] + dy * t, a[2] + dz * t];
  const take = (t: number, n: V3, bi: number, p?: V3) => {
    if (t < 0 || t > 1 || (best && best.t <= t)) return;
    best = { t, p: p ?? at(t), n, b: bi };
  };
  // Boden
  if (b[1] < 0 && a[1] >= 0) take(a[1] / (a[1] - b[1]), [0, 1, 0], -1);
  // Außenwände
  for (const [axis, sgn] of [
    [0, 1],
    [0, -1],
    [2, 1],
    [2, -1],
  ] as const) {
    const from = a[axis] * sgn;
    const to = b[axis] * sgn;
    if (to > HALF && from <= HALF) {
      const t = (HALF - from) / (to - from);
      const p = at(t);
      if (p[1] < WALL_H) take(t, axis === 0 ? [-sgn, 0, 0] : [0, 0, -sgn], -2, p);
    }
  }
  // Deckungen
  const minX = Math.min(a[0], b[0]);
  const maxX = Math.max(a[0], b[0]);
  const minZ = Math.min(a[2], b[2]);
  const maxZ = Math.max(a[2], b[2]);
  for (let bi = 0; bi < blocks.length; bi++) {
    const bl = blocks[bi];
    if (maxX < bl.cx - 3.5 || minX > bl.cx + 3.5 || maxZ < bl.cz - 3.5 || minZ > bl.cz + 3.5) continue;
    if (Math.min(a[1], b[1]) > bl.h) continue;
    // Kreuzungen mit den Kanten
    const cuts: { t: number; nx: number; nz: number }[] = [];
    const pts = bl.pts;
    for (let i = 0; i < pts.length; i++) {
      const [px, pz] = pts[i];
      const [qx, qz] = pts[(i + 1) % pts.length];
      const ex = qx - px;
      const ez = qz - pz;
      const den = cross2(dx, dz, ex, ez);
      if (Math.abs(den) < 1e-9) continue;
      const t = cross2(px - a[0], pz - a[2], ex, ez) / den;
      const s = cross2(px - a[0], pz - a[2], dx, dz) / den;
      if (t < 0 || t > 1 || s < 0 || s > 1) continue;
      const l = Math.hypot(ex, ez) || 1;
      cuts.push({ t, nx: ez / l, nz: -ex / l });
    }
    cuts.sort((p, q) => p.t - q.t);
    let inside = inPoly(a[0], a[2], pts);
    let t0 = 0;
    let n0: V3 = [0, 1, 0];
    const check = (t1: number) => {
      const y0 = a[1] + dy * t0;
      const y1 = a[1] + dy * t1;
      if (y0 < bl.h) take(t0, n0, bi);
      else if (y1 < bl.h) {
        const t = t0 + ((y0 - bl.h) / (y0 - y1)) * (t1 - t0);
        const p = at(t);
        p[1] = bl.h;
        take(t, [0, 1, 0], bi, p);
      }
    };
    for (const c of cuts) {
      if (inside) check(c.t);
      else {
        t0 = c.t;
        n0 = [c.nx, 0, c.nz];
      }
      inside = !inside;
    }
    if (inside) check(1);
  }
  return best;
}

/** Freie Sicht zwischen zwei Punkten? */
export function los(a: V3, b: V3, blocks = ARENA) {
  const h = segWorld(a, b, blocks);
  return !h || h.b === -1;
}

/** Trifft die Strecke a→b den Körper (stehender Zylinder bei x/z)? Gibt t zurück. */
export function segBody(a: V3, b: V3, x: number, z: number, r = HIT_R, h = BODY_H): number | null {
  const dx = b[0] - a[0];
  const dz = b[2] - a[2];
  const fx = a[0] - x;
  const fz = a[2] - z;
  const A = dx * dx + dz * dz;
  const B = 2 * (fx * dx + fz * dz);
  const C = fx * fx + fz * fz - r * r;
  if (A < 1e-12) return null;
  const disc = B * B - 4 * A * C;
  if (disc < 0) return null;
  const t = C < 0 ? 0 : (-B - Math.sqrt(disc)) / (2 * A);
  if (t < 0 || t > 1) return null;
  const y = a[1] + (b[1] - a[1]) * t;
  return y >= 0 && y <= h ? t : null;
}

// ───────────── Spieler ─────────────

export interface Splat {
  /** Winkel um den Körper (relativ zur Blickrichtung) und Höhe */
  a: number;
  y: number;
  s: number;
}

export interface Fighter {
  x: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  pitch: number;
  hp: number;
  alive: boolean;
  /** Zeit bis zum Wiedereinstieg */
  deadT: number;
  /** Schutz nach dem Wiedereinstieg */
  shield: number;
  ammo: number;
  /** > 0: lädt gerade nach */
  reload: number;
  fireT: number;
  /** Wie oft man schon voller Farbe war (= Punkt für den anderen) */
  deaths: number;
  walk: number;
  /** Rückstoß-Anzeige 0…1 */
  kick: number;
  splats: Splat[];
}

export function newFighter(spawn: number): Fighter {
  const [x, z, yaw] = SPAWNS[spawn];
  return { x, z, vx: 0, vz: 0, yaw, pitch: 0, hp: MAX_HP, alive: true, deadT: 0, shield: 0, ammo: MAG, reload: 0, fireT: 0, deaths: 0, walk: 0, kick: 0, splats: [] };
}

/** Wunsch-Bewegung (Weltrichtung, Länge ≤ 1) umsetzen */
export function moveFighter(f: Fighter, mx: number, mz: number, dt: number, speed = SPEED) {
  const l = Math.hypot(mx, mz);
  if (l > 1) {
    mx /= l;
    mz /= l;
  }
  if (!f.alive) {
    mx = 0;
    mz = 0;
  }
  const k = Math.min(1, dt * 12);
  f.vx += (mx * speed - f.vx) * k;
  f.vz += (mz * speed - f.vz) * k;
  const [x, z] = collide(f.x + f.vx * dt, f.z + f.vz * dt);
  // Was die Wand geschluckt hat, ist keine Geschwindigkeit mehr
  if (dt > 0) {
    f.vx = (x - f.x) / dt;
    f.vz = (z - f.z) / dt;
  }
  f.x = x;
  f.z = z;
  f.walk += Math.hypot(f.vx, f.vz) * dt;
}

/** Zeiten weiterzählen (Nachladen, Feuerpause, Schutz, Wiedereinstieg). Gibt 'reloaded' / 'respawn' zurück. */
export function tickFighter(f: Fighter, dt: number): 'reloaded' | 'respawn' | null {
  f.fireT = Math.max(0, f.fireT - dt);
  f.shield = Math.max(0, f.shield - dt);
  f.kick = Math.max(0, f.kick - dt * 6);
  if (f.reload > 0) {
    f.reload -= dt;
    if (f.reload <= 0) {
      f.reload = 0;
      f.ammo = MAG;
      return 'reloaded';
    }
  }
  if (!f.alive) {
    f.deadT -= dt;
    if (f.deadT <= 0) return 'respawn';
  }
  return null;
}

export function startReload(f: Fighter) {
  if (f.reload > 0 || f.ammo >= MAG || !f.alive) return false;
  f.reload = RELOAD;
  return true;
}

/** Bester Startplatz: weit weg vom Gegner und möglichst außer Sicht */
export function pickSpawn(foe: Fighter | null, rnd: Rnd = Math.random) {
  let best = 0;
  let bestS = -Infinity;
  SPAWNS.forEach(([x, z], i) => {
    let s = rnd() * 3;
    if (foe) {
      s += Math.hypot(x - foe.x, z - foe.z);
      if (foe.alive && los([foe.x, EYE, foe.z], [x, 1.2, z])) s -= 12;
    }
    if (s > bestS) {
      bestS = s;
      best = i;
    }
  });
  return best;
}

export function respawn(f: Fighter, spawn: number) {
  const [x, z, yaw] = SPAWNS[spawn];
  Object.assign(f, { x, z, vx: 0, vz: 0, yaw, pitch: 0, hp: MAX_HP, alive: true, deadT: 0, shield: SHIELD, ammo: MAG, reload: 0, fireT: 0, splats: [] });
}

/** Mündung des Farbblasters (etwas rechts unter dem Auge) */
export function muzzle(f: Fighter): V3 {
  const [fx, fz] = fwd(f.yaw);
  const [rx, rz] = rightOf(f.yaw);
  return [f.x + fx * 0.45 + rx * 0.16, EYE - 0.14 + Math.sin(f.pitch) * 0.45, f.z + fz * 0.45 + rz * 0.16];
}

// ───────────── Farbkugeln ─────────────

export interface Ball {
  /** Laufende Nummer des Schützen (online zum Wiedererkennen) */
  n: number;
  side: Side;
  p: V3;
  v: V3;
  t: number;
  /** Darf Treffer zählen (online nur die eigenen Kugeln) */
  real: boolean;
}

/**
 * Schuss abgeben. Die Kugel fliegt vom Blaster zu dem Punkt, auf den das Fadenkreuz zeigt –
 * so trifft sie, wohin man zielt, obwohl der Blaster rechts unten hängt.
 */
export function fire(f: Fighter, side: Side, n: number, rnd: Rnd = Math.random, spread = 0.008): Ball | null {
  if (!f.alive || f.fireT > 0 || f.reload > 0 || f.ammo <= 0) return null;
  f.ammo--;
  f.fireT = FIRE_GAP;
  f.kick = 1;
  const eye: V3 = [f.x, EYE, f.z];
  const moving = Math.hypot(f.vx, f.vz) / SPEED;
  const s = spread * (1 + moving * 1.5);
  const yaw = f.yaw + (rnd() - 0.5) * 2 * s;
  const pitch = f.pitch + (rnd() - 0.5) * 2 * s;
  const d = dir3(yaw, pitch);
  const far: V3 = [eye[0] + d[0] * 60, eye[1] + d[1] * 60, eye[2] + d[2] * 60];
  const hit = segWorld(eye, far);
  const aim = hit ? hit.p : far;
  const m = muzzle(f);
  let vx = aim[0] - m[0];
  let vy = aim[1] - m[1];
  let vz = aim[2] - m[2];
  const dist = Math.hypot(vx, vy, vz);
  if (dist < 2) {
    // Ganz nah an der Wand: einfach geradeaus
    vx = d[0];
    vy = d[1];
    vz = d[2];
  } else {
    // Den Fall der Kugel ausgleichen
    const tf = dist / BALL_V;
    vy += 0.5 * BALL_G * tf * tf;
  }
  const l = Math.hypot(vx, vy, vz) || 1;
  // Ein kleines Stück Rückwärtsgang: die Kugel startet vor der Wand, auch wenn man direkt davor steht
  return { n, side, p: dist < 2 ? [eye[0], eye[1] - 0.1, eye[2]] : m, v: [(vx / l) * BALL_V, (vy / l) * BALL_V, (vz / l) * BALL_V], t: 0, real: true };
}

export type BallHit = { k: 'world'; p: V3; n: V3; b: number } | { k: 'body'; p: V3; side: Side } | { k: 'target'; p: V3; i: number } | { k: 'gone' };

/** Kugel bewegen; liefert, worauf sie geprallt ist. */
export function stepBall(ball: Ball, dt: number, bodies: Partial<Record<Side, Fighter | null>>, targets: Target[] = []): BallHit | null {
  ball.t += dt;
  const steps = Math.max(1, Math.ceil((BALL_V * dt) / 0.35));
  const h = dt / steps;
  for (let s = 0; s < steps; s++) {
    const a = ball.p;
    ball.v[1] -= BALL_G * h;
    const b: V3 = [a[0] + ball.v[0] * h, a[1] + ball.v[1] * h, a[2] + ball.v[2] * h];
    let bestT = Infinity;
    let res: BallHit | null = null;
    for (const side of ['p1', 'p2'] as Side[]) {
      const f = bodies[side];
      if (!f || !f.alive || side === ball.side) continue;
      const t = segBody(a, b, f.x, f.z);
      if (t !== null && t < bestT) {
        bestT = t;
        res = { k: 'body', p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], side };
      }
    }
    targets.forEach((tg, i) => {
      const t = segTarget(a, b, tg);
      if (t !== null && t < bestT) {
        bestT = t;
        res = { k: 'target', p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t], i };
      }
    });
    const w = segWorld(a, b);
    if (w && w.t < bestT) return { k: 'world', p: w.p, n: w.n, b: w.b };
    if (res) return res;
    ball.p = b;
    if (Math.abs(b[0]) > HALF + 4 || Math.abs(b[2]) > HALF + 4 || ball.t > 2.5) return { k: 'gone' };
  }
  return null;
}

/** Farbklecks am Körper merken (Winkel relativ zum Blick) */
export function stain(f: Fighter, p: V3, rnd: Rnd = Math.random) {
  const a = angDiff(f.yaw, Math.atan2(p[0] - f.x, p[2] - f.z));
  f.splats.push({ a, y: Math.max(0.25, Math.min(1.6, p[1])), s: 0.75 + rnd() * 0.5 });
  if (f.splats.length > 8) f.splats.shift();
}

/** Treffer abbekommen. Gibt true zurück, wenn man jetzt voller Farbe ist (Punkt für den anderen). */
export function takeHit(f: Fighter): boolean {
  if (!f.alive || f.shield > 0) return false;
  f.hp--;
  if (f.hp > 0) return false;
  f.alive = false;
  f.deadT = RESPAWN;
  f.deaths++;
  f.reload = 0;
  return true;
}

// ───────────── Zielschießen (allein) ─────────────

export interface Target {
  x: number;
  z: number;
  yaw: number;
  /** 0 = liegt, 1 = steht */
  up: number;
  life: number;
  gold: boolean;
  hit: boolean;
}

export const TARGET_W = 0.95;
export const TARGET_Y0 = 0.5;
export const TARGET_Y1 = 1.75;

/** Plätze, an denen Pappziele hochklappen können */
export const TARGET_SPOTS: V2[] = (() => {
  const s: V2[] = [];
  for (const b of ARENA) {
    // neben jeder Deckung, nach Osten und Westen versetzt
    for (const side of [-1, 1]) {
      const [x, z] = collide(b.cx + side * 2.2, b.cz + 0.8, 0.7);
      if (Math.abs(z) > 3 || Math.abs(x) > 3) s.push([x, z]);
    }
  }
  return s;
})();

export function spawnTarget(list: Target[], from: V2, rnd: Rnd = Math.random): Target | null {
  const free = TARGET_SPOTS.filter(([x, z]) => Math.hypot(x - from[0], z - from[1]) > 5 && !list.some((t) => Math.hypot(t.x - x, t.z - z) < 1.5));
  if (!free.length) return null;
  const [x, z] = free[Math.floor(rnd() * free.length)];
  const t: Target = { x, z, yaw: Math.atan2(from[0] - x, from[1] - z), up: 0, life: 2.6 + rnd() * 1.4, gold: rnd() < 0.15, hit: false };
  list.push(t);
  return t;
}

/** Trifft die Strecke a→b die Pappscheibe? */
export function segTarget(a: V3, b: V3, tg: Target): number | null {
  if (tg.hit || tg.up < 0.8) return null;
  const nx = Math.sin(tg.yaw);
  const nz = Math.cos(tg.yaw);
  const da = (a[0] - tg.x) * nx + (a[2] - tg.z) * nz;
  const db = (b[0] - tg.x) * nx + (b[2] - tg.z) * nz;
  if (da * db > 0 || da === db) return null;
  const t = da / (da - db);
  const px = a[0] + (b[0] - a[0]) * t - tg.x;
  const pz = a[2] + (b[2] - a[2]) * t - tg.z;
  const lat = px * nz - pz * nx;
  const y = a[1] + (b[1] - a[1]) * t;
  return Math.abs(lat) <= TARGET_W / 2 && y >= TARGET_Y0 && y <= TARGET_Y1 ? t : null;
}

// ───────────── Wegsuche für die KI ─────────────

export const CELL = 0.5;
export const GN = Math.round((HALF * 2) / CELL);
let navCache: Uint8Array | null = null;

/** 1 = blockiert (inklusive Körperbreite) */
export function navGrid(): Uint8Array {
  if (navCache) return navCache;
  const g = new Uint8Array(GN * GN);
  const pad = R + 0.15;
  for (let j = 0; j < GN; j++) {
    for (let i = 0; i < GN; i++) {
      const x = -HALF + (i + 0.5) * CELL;
      const z = -HALF + (j + 0.5) * CELL;
      let bad = Math.abs(x) > HALF - pad || Math.abs(z) > HALF - pad;
      for (const b of ARENA) {
        if (bad) break;
        if (Math.abs(x - b.cx) > 4.5 || Math.abs(z - b.cz) > 4.5) continue;
        bad = inPoly(x, z, b.pts) || nearestEdge(x, z, b.pts).d2 < pad * pad;
      }
      g[j * GN + i] = bad ? 1 : 0;
    }
  }
  navCache = g;
  return g;
}

const cellOf = (x: number, z: number): [number, number] => [
  Math.max(0, Math.min(GN - 1, Math.floor((x + HALF) / CELL))),
  Math.max(0, Math.min(GN - 1, Math.floor((z + HALF) / CELL))),
];
const cellPos = (i: number, j: number): V2 => [-HALF + (i + 0.5) * CELL, -HALF + (j + 0.5) * CELL];

function nearestFree(g: Uint8Array, i: number, j: number): [number, number] {
  if (!g[j * GN + i]) return [i, j];
  for (let r = 1; r < 8; r++) {
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const a = i + di;
        const b = j + dj;
        if (a >= 0 && b >= 0 && a < GN && b < GN && !g[b * GN + a]) return [a, b];
      }
    }
  }
  return [i, j];
}

/** Kann man gerade von a nach b laufen? */
export function walkable(a: V2, b: V2) {
  const g = navGrid();
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.ceil(d / (CELL * 0.5));
  for (let k = 1; k <= n; k++) {
    const [i, j] = cellOf(a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n);
    if (g[j * GN + i]) return false;
  }
  return true;
}

/** A* über das Raster, danach geglättet. Liefert Wegpunkte ohne den Start. */
export function findPath(from: V2, to: V2): V2[] {
  const g = navGrid();
  const [si, sj] = nearestFree(g, ...cellOf(from[0], from[1]));
  const [ti, tj] = nearestFree(g, ...cellOf(to[0], to[1]));
  const start = sj * GN + si;
  const goal = tj * GN + ti;
  const gs = new Float32Array(GN * GN).fill(Infinity);
  const came = new Int32Array(GN * GN).fill(-1);
  const closed = new Uint8Array(GN * GN);
  // kleiner Binär-Heap über [f, Knoten]
  const heap: [number, number][] = [];
  const push = (f: number, n: number) => {
    heap.push([f, n]);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      [heap[p], heap[i]] = [heap[i], heap[p]];
      i = p;
    }
  };
  const pop = () => {
    const top = heap[0];
    const last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]];
        i = m;
      }
    }
    return top;
  };
  const hdist = (n: number) => {
    const dx = Math.abs((n % GN) - ti);
    const dz = Math.abs(Math.floor(n / GN) - tj);
    return Math.max(dx, dz) + 0.414 * Math.min(dx, dz);
  };
  gs[start] = 0;
  push(hdist(start), start);
  let found = start === goal;
  while (heap.length && !found) {
    const [, n] = pop();
    if (closed[n]) continue;
    closed[n] = 1;
    const ni = n % GN;
    const nj = Math.floor(n / GN);
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const a = ni + di;
        const b = nj + dj;
        if (a < 0 || b < 0 || a >= GN || b >= GN) continue;
        const m = b * GN + a;
        if (g[m] || closed[m]) continue;
        // Keine Ecken abschneiden
        if (di && dj && (g[nj * GN + a] || g[b * GN + ni])) continue;
        const cost = gs[n] + (di && dj ? 1.414 : 1);
        if (cost < gs[m]) {
          gs[m] = cost;
          came[m] = n;
          if (m === goal) found = true;
          push(cost + hdist(m), m);
        }
      }
    }
  }
  if (!found) return [to];
  const cells: V2[] = [];
  for (let n = goal; n !== start && n >= 0; n = came[n]) cells.push(cellPos(n % GN, Math.floor(n / GN)));
  cells.reverse();
  // Glätten: so weit wie möglich geradeaus
  const out: V2[] = [];
  let cur = from;
  let k = 0;
  while (k < cells.length) {
    let far = k;
    for (let m = cells.length - 1; m > k; m--) {
      if (walkable(cur, cells[m])) {
        far = m;
        break;
      }
    }
    out.push(cells[far]);
    cur = cells[far];
    k = far + 1;
  }
  return out;
}

// ───────────── KI ─────────────

export interface Bot {
  path: V2[];
  goal: V2 | null;
  replan: number;
  /** wie lange der Gegner schon ununterbrochen zu sehen ist */
  seen: number;
  react: number;
  lastSeen: V2 | null;
  lost: number;
  strafe: 1 | -1;
  strafeT: number;
  err: V2;
  errT: number;
  mode: 'hunt' | 'fight' | 'cover';
  coverT: number;
  hunt: V2 | null;
  huntT: number;
  stuck: number;
}

export function newBot(): Bot {
  return { path: [], goal: null, replan: 0, seen: 0, react: 0.5, lastSeen: null, lost: 99, strafe: 1, strafeT: 0, err: [0, 0], errT: 0, mode: 'hunt', coverT: 0, hunt: null, huntT: 0, stuck: 0 };
}

export interface BotOut {
  mx: number;
  mz: number;
  fire: boolean;
  reload: boolean;
}

/** Ein Versteck in der Nähe, das der Gegner nicht sieht */
export function findCover(me: Fighter, foe: Fighter, rnd: Rnd = Math.random): V2 | null {
  const g = navGrid();
  let best: V2 | null = null;
  let bestS = Infinity;
  for (let k = 0; k < 60; k++) {
    const a = rnd() * Math.PI * 2;
    const d = 1.5 + rnd() * 6.5;
    const p: V2 = [me.x + Math.cos(a) * d, me.z + Math.sin(a) * d];
    const [i, j] = cellOf(p[0], p[1]);
    if (g[j * GN + i] || Math.abs(p[0]) > HALF - 1 || Math.abs(p[1]) > HALF - 1) continue;
    if (los([foe.x, EYE, foe.z], [p[0], 1.3, p[1]])) continue;
    const s = d + Math.max(0, 6 - Math.hypot(p[0] - foe.x, p[1] - foe.z)) * 2;
    if (s < bestS) {
      bestS = s;
      best = p;
    }
  }
  return best;
}

/**
 * Die KI denkt einen Schritt: wohin laufen, wohin zielen (setzt yaw/pitch am Kämpfer), schießen?
 * `level` 0…1 macht sie treffsicherer und flinker.
 */
export function botThink(b: Bot, me: Fighter, foe: Fighter, dt: number, rnd: Rnd = Math.random, level = 0.5): BotOut {
  const out: BotOut = { mx: 0, mz: 0, fire: false, reload: false };
  if (!me.alive) {
    b.path = [];
    b.seen = 0;
    b.mode = 'hunt';
    return out;
  }
  const eye: V3 = [me.x, EYE, me.z];
  const visible = foe.alive && (los(eye, [foe.x, 1.25, foe.z]) || los(eye, [foe.x, 1.65, foe.z]));
  if (visible) {
    if (b.seen === 0) b.react = 0.55 - level * 0.25 + rnd() * 0.2;
    b.seen += dt;
    b.lastSeen = [foe.x, foe.z];
    b.lost = 0;
  } else {
    b.seen = 0;
    b.lost += dt;
  }
  const dist = Math.hypot(foe.x - me.x, foe.z - me.z);

  // ── Zielen ──
  let wantYaw = me.yaw;
  let wantPitch = 0;
  const aiming = visible && b.seen > b.react;
  if (visible) {
    const tf = dist / BALL_V;
    const lead = 0.55 + level * 0.4;
    const px = foe.x + foe.vx * tf * lead;
    const pz = foe.z + foe.vz * tf * lead;
    const py = 1.15;
    wantYaw = Math.atan2(px - me.x, pz - me.z);
    wantPitch = Math.atan2(py - EYE, Math.hypot(px - me.x, pz - me.z));
    b.errT -= dt;
    if (b.errT <= 0) {
      b.errT = 0.35 + rnd() * 0.35;
      b.err = [rnd() * 2 - 1, rnd() * 2 - 1];
    }
    // Am Anfang wackelt die Hand, mit der Zeit wird sie ruhiger
    const amp = (0.02 + 0.08 * Math.exp(-b.seen * (0.8 + level))) * (1.4 - level * 0.6) + dist * 0.0015;
    wantYaw += b.err[0] * amp;
    wantPitch += b.err[1] * amp * 0.5;
    if (!aiming) wantYaw = me.yaw + angDiff(me.yaw, wantYaw) * 0.3;
  } else if (b.path.length) {
    const [wx, wz] = b.path[0];
    if (Math.hypot(wx - me.x, wz - me.z) > 0.3) wantYaw = Math.atan2(wx - me.x, wz - me.z);
  }
  const turn = (3.2 + level * 3) * dt;
  me.yaw += Math.max(-turn, Math.min(turn, angDiff(me.yaw, wantYaw)));
  me.pitch += Math.max(-turn, Math.min(turn, wantPitch - me.pitch));
  out.fire = aiming && Math.abs(angDiff(me.yaw, wantYaw)) < 0.05 + 0.4 / Math.max(2, dist) && me.ammo > 0 && me.reload <= 0;
  out.reload = me.ammo === 0 || (!visible && b.lost > 1 && me.ammo < MAG / 2);

  // ── Was tun? ──
  if (b.mode === 'cover') {
    b.coverT -= dt;
    if (b.coverT <= 0 || (!b.path.length && !visible && me.reload <= 0 && b.coverT < 0.6)) b.mode = 'hunt';
  } else if (visible && ((me.hp === 1 && foe.hp > 1 && rnd() < dt * 1.5) || (me.ammo === 0 && dist < 12))) {
    const c = findCover(me, foe, rnd);
    if (c) {
      b.mode = 'cover';
      b.coverT = 2 + rnd() * 1.5;
      b.goal = c;
      b.path = findPath([me.x, me.z], c);
    }
  } else if (visible) b.mode = 'fight';
  else b.mode = 'hunt';

  let mx = 0;
  let mz = 0;
  if (b.mode === 'fight') {
    const tx = (foe.x - me.x) / (dist || 1);
    const tz = (foe.z - me.z) / (dist || 1);
    const radial = Math.max(-1, Math.min(1, (dist - 9) / 4));
    b.strafeT -= dt;
    if (b.strafeT <= 0) {
      b.strafeT = 0.5 + rnd() * 1.1;
      if (rnd() < 0.6) b.strafe = b.strafe === 1 ? -1 : 1;
    }
    mx = tx * radial + -tz * b.strafe * 0.9;
    mz = tz * radial + tx * b.strafe * 0.9;
    b.path = [];
  } else {
    // Ziel bestimmen
    let goal: V2 | null = b.goal;
    if (b.mode === 'hunt') {
      if (b.lastSeen && b.lost < 4) goal = b.lastSeen;
      else {
        b.huntT -= dt;
        if (!b.hunt || b.huntT <= 0) {
          b.huntT = 2.5 + rnd() * 2;
          b.hunt = [foe.x + (rnd() - 0.5) * 6, foe.z + (rnd() - 0.5) * 6];
        }
        goal = b.hunt;
      }
    }
    b.replan -= dt;
    if (goal && (b.replan <= 0 || !b.goal || Math.hypot(goal[0] - b.goal[0], goal[1] - b.goal[1]) > 1.5)) {
      b.replan = 0.9;
      b.goal = goal;
      b.path = findPath([me.x, me.z], goal);
    }
    while (b.path.length && Math.hypot(b.path[0][0] - me.x, b.path[0][1] - me.z) < 0.45) b.path.shift();
    if (b.path.length) {
      const [wx, wz] = b.path[0];
      const l = Math.hypot(wx - me.x, wz - me.z) || 1;
      mx = (wx - me.x) / l;
      mz = (wz - me.z) / l;
    } else if (b.mode === 'hunt' && b.lastSeen && b.lost >= 4) b.lastSeen = null;
  }
  // Hängt die KI fest, dreht sie beim Ausweichen um
  const sp = Math.hypot(me.vx, me.vz);
  if (Math.hypot(mx, mz) > 0.5 && sp < 0.8) {
    b.stuck += dt;
    if (b.stuck > 0.35) {
      b.stuck = 0;
      b.strafe = b.strafe === 1 ? -1 : 1;
      b.replan = 0;
    }
  } else b.stuck = 0;
  out.mx = mx;
  out.mz = mz;
  return out;
}

// ───────────── Online ─────────────

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Ein Schuss für das andere Handy: [n, x, y, z, vx, vy, vz] */
export type NetShot = [number, number, number, number, number, number, number];
/** Ein Treffer am anderen: [n, x, y, z] */
export type NetHit = [number, number, number, number];

export interface NetMe {
  x: number;
  z: number;
  vx: number;
  vz: number;
  yw: number;
  pt: number;
  hp: number;
  al: 0 | 1;
  sh: 0 | 1;
  dn: number;
  rl: 0 | 1;
  sb: NetShot[];
  ht: NetHit[];
}

export interface NetFlow {
  ph: 'wait' | 'count' | 'play' | 'over';
  cd: number;
  lt: number;
  sd: 0 | 1;
  win?: Side;
}

export function packMe(f: Fighter, shots: Ball[], hits: { n: number; p: V3 }[]): NetMe {
  return {
    x: r2(f.x),
    z: r2(f.z),
    vx: r2(f.vx),
    vz: r2(f.vz),
    yw: r2(f.yaw),
    pt: r2(f.pitch),
    hp: f.hp,
    al: f.alive ? 1 : 0,
    sh: f.shield > 0 ? 1 : 0,
    dn: f.deaths,
    rl: f.reload > 0 ? 1 : 0,
    sb: shots.map((b) => [b.n, r2(b.p[0]), r2(b.p[1]), r2(b.p[2]), r2(b.v[0]), r2(b.v[1]), r2(b.v[2])]),
    ht: hits.map((h) => [h.n, r2(h.p[0]), r2(h.p[1]), r2(h.p[2])]),
  };
}

/** Den Kämpfer des anderen Handys sanft nachführen */
export function followMe(f: Fighter, pk: NetMe, age: number, dt: number) {
  const a = Math.min(age, 0.25);
  const [tx, tz] = collide(pk.x + pk.vx * a, pk.z + pk.vz * a);
  const jump = Math.hypot(tx - f.x, tz - f.z) > 3 || (pk.al && !f.alive);
  const k = jump ? 1 : Math.min(1, dt * 14);
  const ox = f.x;
  const oz = f.z;
  f.x += (tx - f.x) * k;
  f.z += (tz - f.z) * k;
  f.vx = pk.vx;
  f.vz = pk.vz;
  f.walk += Math.hypot(f.x - ox, f.z - oz);
  f.yaw += angDiff(f.yaw, pk.yw) * (jump ? 1 : Math.min(1, dt * 16));
  f.pitch += (pk.pt - f.pitch) * Math.min(1, dt * 16);
  if (!pk.al && f.alive) f.splats = f.splats.slice(-8);
  if (pk.al && !f.alive) f.splats = [];
  f.alive = !!pk.al;
  f.hp = pk.hp;
  f.shield = pk.sh ? Math.max(f.shield, 0.2) : 0;
  f.deaths = pk.dn;
  f.reload = pk.rl ? Math.max(f.reload, 0.1) : 0;
}

/** Punkte einer Seite = wie oft der andere voller Farbe war */
export const scoreOf = (f: Record<Side, Fighter>, side: Side) => f[otherSide(side)].deaths;

/** Ist das Spiel entschieden? (Erster mit WIN Punkten, nach Ablauf der Zeit der mit mehr Punkten.) */
export function decide(f: Record<Side, Fighter>, timeUp: boolean): Side | null {
  const a = scoreOf(f, 'p1');
  const b = scoreOf(f, 'p2');
  if (a >= WIN || b >= WIN) return a > b ? 'p1' : 'p2';
  if (timeUp && a !== b) return a > b ? 'p1' : 'p2';
  return null;
}
