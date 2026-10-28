import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { burst, buzz, clamp, drawParticles, heartPath, stepParticles, tone, useFitCanvas, useLoop, type Particle } from './engine';
import type { GameProps } from './types';

export const BZ_COLS = 7;
export const BZ_ROWS = 11;
const CELL = 44;
const GAP = 4;
const MX = 4;
const TOP = 6;
const W = MX * 2 + BZ_COLS * CELL;
const H = TOP + BZ_ROWS * CELL + 46;
const FLOOR = H - 12;
const R = 5.5;
const SPEED = 640;
const LAUNCH_EVERY = 0.065;
const ITEM_R = 11;
/** Flacher als das darf man nicht zielen, sonst pendelt der Ball ewig hin und her. */
const MIN_ANGLE = 0.14;

export type BzCell =
  | { k: 'block'; hp: number; max: number; flash: number }
  | { k: 'plus' }
  | { k: 'laser'; dir: 'h' | 'v'; used: boolean; flash: number };

export type BzGrid = (BzCell | null)[][];

type Rnd = () => number;

/** Neue Reihe für Runde `round`: Blöcke mit round (manchmal doppelt so viel) Leben, immer ein +1-Ball. */
export function bzRow(round: number, rnd: Rnd = Math.random): (BzCell | null)[] {
  const row: (BzCell | null)[] = Array(BZ_COLS).fill(null);
  const cols = Array.from({ length: BZ_COLS }, (_, i) => i).sort(() => rnd() - 0.5);
  const plus = cols.pop()!;
  row[plus] = { k: 'plus' };
  const maxBlocks = Math.min(BZ_COLS - 1, 3 + Math.floor(round / 5));
  const n = 1 + Math.floor(rnd() * maxBlocks);
  for (let i = 0; i < n && cols.length; i++) {
    const c = cols.pop()!;
    const hp = round >= 8 && rnd() < 0.22 ? round * 2 : round;
    row[c] = { k: 'block', hp, max: hp, flash: 0 };
  }
  if (round >= 4 && cols.length && rnd() < 0.2) row[cols.pop()!] = { k: 'laser', dir: rnd() < 0.5 ? 'h' : 'v', used: false, flash: 0 };
  return row;
}

/** Alles rutscht eine Reihe tiefer; true = ein Block ist unten angekommen (vorbei). */
export function bzShift(grid: BzGrid): boolean {
  const last = grid[BZ_ROWS - 1];
  const dead = last.some((c) => c?.k === 'block');
  for (let r = BZ_ROWS - 1; r > 0; r--) grid[r] = grid[r - 1];
  grid[0] = Array(BZ_COLS).fill(null);
  return dead;
}

export const bzEmpty = (): BzGrid => Array.from({ length: BZ_ROWS }, () => Array(BZ_COLS).fill(null));

const cellX = (c: number) => MX + c * CELL + GAP / 2;
const cellY = (r: number) => TOP + r * CELL + GAP / 2;
const BS = CELL - GAP;

interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 0 = wartet, 1 = fliegt, 2 = gelandet */
  st: 0 | 1 | 2;
}

interface Pop {
  x: number;
  y: number;
  life: number;
  text: string;
  color: string;
}

interface BzState {
  grid: BzGrid;
  round: number;
  balls: number;
  gained: number;
  lx: number;
  nextX: number | null;
  phase: 'aim' | 'fly' | 'shift' | 'over';
  aim: { x: number; y: number } | null;
  flying: Ball[];
  launched: number;
  launchT: number;
  flyT: number;
  speedUp: number;
  shiftT: number;
  parts: Particle[];
  pops: Pop[];
  shake: number;
  t: number;
  lasers: { r: number; c: number; dir: 'h' | 'v'; life: number }[];
}

function fresh(): BzState {
  const grid = bzEmpty();
  grid[0] = bzRow(1);
  return {
    grid,
    round: 1,
    balls: 1,
    gained: 0,
    lx: W / 2,
    nextX: null,
    phase: 'shift',
    aim: null,
    flying: [],
    launched: 0,
    launchT: 0,
    flyT: 0,
    speedUp: 1,
    shiftT: 0.35,
    parts: [],
    pops: [],
    shake: 0,
    t: 0,
    lasers: [],
  };
}

/** Farbe nach Lebenspunkten: wenig = pink, viel = violett bis blau */
function blockHue(hp: number, round: number) {
  const k = clamp((hp - 1) / Math.max(round * 2 - 1, 1), 0, 1);
  return 348 - k * 150;
}

/** Flugrichtung zum Finger, nie zu flach */
function aimDir(lx: number, ax: number, ay: number): { x: number; y: number } | null {
  const dx = ax - lx;
  const dy = ay - (FLOOR - R);
  if (dy > -12) return null;
  let a = Math.atan2(-dy, dx);
  a = clamp(a, MIN_ANGLE, Math.PI - MIN_ANGLE);
  return { x: Math.cos(a), y: -Math.sin(a) };
}

/** Kreis gegen Rechteck: Ball abprallen lassen. true = getroffen */
function bounceRect(b: Ball, x: number, y: number, w: number, h: number): boolean {
  const cx = clamp(b.x, x, x + w);
  const cy = clamp(b.y, y, y + h);
  let dx = b.x - cx;
  let dy = b.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 > R * R) return false;
  let d = Math.sqrt(d2);
  let push: number;
  if (d < 1e-6) {
    // Mittelpunkt steckt drin: zur nächsten Kante raus
    const ox = Math.min(b.x - x, x + w - b.x);
    const oy = Math.min(b.y - y, y + h - b.y);
    if (ox < oy) {
      dx = b.x - x < x + w - b.x ? -1 : 1;
      dy = 0;
    } else {
      dy = b.y - y < y + h - b.y ? -1 : 1;
      dx = 0;
    }
    d = 1;
    push = R + Math.min(ox, oy) + 0.01;
  } else push = R - d + 0.01;
  const nx = dx / d;
  const ny = dy / d;
  const dot = b.vx * nx + b.vy * ny;
  if (dot < 0) {
    b.vx -= 2 * dot * nx;
    b.vy -= 2 * dot * ny;
  }
  b.x += nx * push;
  b.y += ny * push;
  return true;
}

function keepSteep(b: Ball) {
  const s = Math.hypot(b.vx, b.vy) || SPEED;
  if (Math.abs(b.vy) < s * Math.sin(MIN_ANGLE * 0.8)) {
    b.vy = (b.vy <= 0 ? -1 : 1) * s * Math.sin(MIN_ANGLE * 0.8);
    b.vx = Math.sign(b.vx || 1) * Math.sqrt(Math.max(0, s * s - b.vy * b.vy));
  }
}

/** Einen Ball eine Strecke bewegen. Gibt Treffer zurück (für Vorschau und Spiel). */
function moveBall(st: BzState, b: Ball, dist: number, onHit: ((r: number, c: number) => void) | null, onItem: ((r: number, c: number) => void) | null): 'floor' | null {
  const steps = Math.max(1, Math.ceil(dist / 2.5));
  const len = Math.hypot(b.vx, b.vy) || 1;
  for (let i = 0; i < steps; i++) {
    b.x += (b.vx / len) * (dist / steps);
    b.y += (b.vy / len) * (dist / steps);
    let hit = false;
    if (b.x < R) {
      b.x = R;
      b.vx = Math.abs(b.vx);
      hit = true;
    } else if (b.x > W - R) {
      b.x = W - R;
      b.vx = -Math.abs(b.vx);
      hit = true;
    }
    if (b.y < R) {
      b.y = R;
      b.vy = Math.abs(b.vy);
      hit = true;
    }
    if (b.vy > 0 && b.y >= FLOOR - R) {
      b.y = FLOOR - R;
      return 'floor';
    }
    const c0 = Math.floor((b.x - R - MX) / CELL);
    const c1 = Math.floor((b.x + R - MX) / CELL);
    const r0 = Math.floor((b.y - R - TOP) / CELL);
    const r1 = Math.floor((b.y + R - TOP) / CELL);
    for (let r = r0; r <= r1; r++) {
      if (r < 0 || r >= BZ_ROWS) continue;
      for (let c = c0; c <= c1; c++) {
        if (c < 0 || c >= BZ_COLS) continue;
        const cell = st.grid[r][c];
        if (!cell) continue;
        if (cell.k === 'block') {
          if (bounceRect(b, cellX(c), cellY(r), BS, BS)) {
            hit = true;
            onHit?.(r, c);
          }
        } else if (onItem) {
          const ix = cellX(c) + BS / 2;
          const iy = cellY(r) + BS / 2;
          if ((b.x - ix) ** 2 + (b.y - iy) ** 2 < (R + ITEM_R) ** 2) onItem(r, c);
        }
      }
    }
    if (hit) keepSteep(b);
  }
  return null;
}

export function Ballz({ best, onEnd }: GameProps) {
  const s = useRef<BzState>(fresh());
  const [hud, setHud] = useState({ round: 1, balls: 1, flying: false, fast: 1 });

  const sync = () => {
    const st = s.current;
    setHud((h) => {
      const n = { round: st.round, balls: st.balls, flying: st.phase === 'fly', fast: st.speedUp };
      return h.round === n.round && h.balls === n.balls && h.flying === n.flying && h.fast === n.fast ? h : n;
    });
  };

  const { wrapRef, canvasRef, paint, toLogical } = useFitCanvas(W, H, (ctx) => {
    const st = s.current;
    ctx.save();
    if (st.shake > 0) ctx.translate((Math.random() - 0.5) * st.shake * 6, (Math.random() - 0.5) * st.shake * 6);

    // Hintergrund
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#1d0f33');
    bg.addColorStop(1, '#0c0618');
    ctx.fillStyle = bg;
    ctx.fillRect(-10, -10, W + 20, H + 20);
    ctx.strokeStyle = 'rgba(255,255,255,0.035)';
    ctx.lineWidth = 1;
    for (let c = 0; c <= BZ_COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(MX + c * CELL, TOP);
      ctx.lineTo(MX + c * CELL, TOP + BZ_ROWS * CELL);
      ctx.stroke();
    }
    for (let r = 0; r <= BZ_ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(MX, TOP + r * CELL);
      ctx.lineTo(W - MX, TOP + r * CELL);
      ctx.stroke();
    }
    // schwebende Herzen im Hintergrund
    ctx.fillStyle = 'rgba(255,90,160,0.06)';
    for (let k = 0; k < 7; k++) {
      const y = (((k * 83 - st.t * (8 + k)) % (H + 40)) + H + 40) % (H + 40) - 20;
      heartPath(ctx, ((k * 97) % (W - 30)) + 15, y, 8 + (k % 3) * 5);
      ctx.fill();
    }

    // Gefahr: Blöcke in der letzten Reihe
    const danger = st.grid[BZ_ROWS - 1].some((c) => c?.k === 'block');
    if (danger && st.phase !== 'over') {
      const a = 0.12 + 0.1 * Math.sin(st.t * 7);
      const g = ctx.createLinearGradient(0, TOP + (BZ_ROWS - 1) * CELL, 0, FLOOR);
      g.addColorStop(0, 'rgba(255,40,80,0)');
      g.addColorStop(1, `rgba(255,40,80,${a + 0.15})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, TOP + (BZ_ROWS - 1) * CELL, W, FLOOR - TOP - (BZ_ROWS - 1) * CELL);
    }

    // Reihen gleiten beim Weiterrücken nach unten
    const slide = st.phase === 'shift' ? -CELL * Math.pow(clamp(st.shiftT / 0.35, 0, 1), 2) : 0;
    ctx.save();
    ctx.translate(0, Math.min(0, slide));

    for (let r = 0; r < BZ_ROWS; r++) {
      for (let c = 0; c < BZ_COLS; c++) {
        const cell = st.grid[r][c];
        if (!cell) continue;
        const x = cellX(c);
        const y = cellY(r);
        if (cell.k === 'block') {
          const hue = blockHue(cell.hp, st.round);
          const pop = 1 + cell.flash * 0.06;
          ctx.save();
          ctx.translate(x + BS / 2, y + BS / 2);
          ctx.scale(pop, pop);
          // Leuchten
          ctx.fillStyle = `hsla(${hue}, 95%, 60%, 0.18)`;
          ctx.beginPath();
          ctx.roundRect(-BS / 2 - 3, -BS / 2 - 3, BS + 6, BS + 6, 10);
          ctx.fill();
          const g = ctx.createLinearGradient(0, -BS / 2, 0, BS / 2);
          g.addColorStop(0, `hsl(${hue}, 95%, 66%)`);
          g.addColorStop(1, `hsl(${hue - 12}, 85%, 46%)`);
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.roundRect(-BS / 2, -BS / 2, BS, BS, 8);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.22)';
          ctx.beginPath();
          ctx.roundRect(-BS / 2 + 3, -BS / 2 + 3, BS - 6, BS * 0.32, 5);
          ctx.fill();
          if (cell.flash > 0) {
            ctx.fillStyle = `rgba(255,255,255,${cell.flash * 0.55})`;
            ctx.beginPath();
            ctx.roundRect(-BS / 2, -BS / 2, BS, BS, 8);
            ctx.fill();
          }
          ctx.font = `900 ${cell.hp >= 100 ? 13 : 16}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = 'rgba(40,0,50,0.35)';
          ctx.fillText(String(cell.hp), 0, 2.2);
          ctx.fillStyle = '#fff';
          ctx.fillText(String(cell.hp), 0, 1);
          ctx.restore();
        } else if (cell.k === 'plus') {
          const cx = x + BS / 2;
          const cy = y + BS / 2;
          const p = 1 + Math.sin(st.t * 5 + c) * 0.08;
          ctx.strokeStyle = '#ffd1e6';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(cx, cy, ITEM_R * p, 0, Math.PI * 2);
          ctx.stroke();
          ctx.fillStyle = '#ff6fae';
          heartPath(ctx, cx, cy + 1, 6 * p);
          ctx.fill();
        } else {
          const cx = x + BS / 2;
          const cy = y + BS / 2;
          ctx.strokeStyle = cell.used ? 'rgba(120,240,255,0.5)' : '#7af3ff';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(cx, cy, ITEM_R, 0, Math.PI * 2);
          ctx.stroke();
          ctx.lineWidth = 3;
          ctx.beginPath();
          if (cell.dir === 'h') {
            ctx.moveTo(cx - 6, cy);
            ctx.lineTo(cx + 6, cy);
          } else {
            ctx.moveTo(cx, cy - 6);
            ctx.lineTo(cx, cy + 6);
          }
          ctx.stroke();
        }
      }
    }
    ctx.restore();

    // Laserblitze
    for (const l of st.lasers) {
      const a = l.life / 0.25;
      ctx.fillStyle = `rgba(140,245,255,${a * 0.8})`;
      if (l.dir === 'h') ctx.fillRect(0, cellY(l.r) + BS / 2 - 3 * a, W, 6 * a);
      else ctx.fillRect(cellX(l.c) + BS / 2 - 3 * a, 0, 6 * a, FLOOR);
    }

    // Boden
    ctx.fillStyle = 'rgba(255,111,174,0.35)';
    ctx.fillRect(0, FLOOR, W, 1.5);

    // Zielhilfe
    if (st.phase === 'aim' && st.aim) {
      const dir = aimDir(st.lx, st.aim.x, st.aim.y);
      if (dir) {
        const ghost: Ball = { x: st.lx, y: FLOOR - R, vx: dir.x, vy: dir.y, st: 1 };
        let bounced = 0;
        let travelled = 0;
        ctx.fillStyle = '#fff';
        let next = 10;
        while (travelled < 520 && bounced < 2) {
          const vx0 = ghost.vx;
          const vy0 = ghost.vy;
          if (moveBall(st, ghost, 3, null, null) === 'floor') break;
          travelled += 3;
          if (ghost.vx !== vx0 || ghost.vy !== vy0) bounced++;
          if (travelled >= next) {
            const k = 1 - travelled / 560;
            ctx.globalAlpha = 0.25 + k * 0.7;
            ctx.beginPath();
            ctx.arc(ghost.x, ghost.y, 1.4 + k * 1.6, 0, Math.PI * 2);
            ctx.fill();
            next += 13;
          }
        }
        ctx.globalAlpha = 1;
      }
    }

    // Bälle
    for (const b of st.flying) {
      if (b.st !== 1) continue;
      const sp = Math.hypot(b.vx, b.vy) || 1;
      ctx.strokeStyle = 'rgba(255,120,190,0.35)';
      ctx.lineWidth = R * 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(b.x - (b.vx / sp) * 14, b.y - (b.vy / sp) * 14);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.fillStyle = '#fff';
    for (const b of st.flying) {
      if (b.st !== 1) continue;
      ctx.beginPath();
      ctx.arc(b.x, b.y, R, 0, Math.PI * 2);
      ctx.fill();
    }

    // Abschussrampe: Herz mit Anzahl
    const waiting = st.phase === 'aim' || st.phase === 'shift' ? st.balls : st.flying.filter((b) => b.st === 0).length;
    if (st.phase !== 'over' && (waiting > 0 || st.phase === 'aim')) {
      ctx.fillStyle = '#ff4f9a';
      ctx.shadowColor = '#ff4f9a';
      ctx.shadowBlur = 12;
      heartPath(ctx, st.lx, FLOOR - R - 1, 8);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffd6ea';
      ctx.font = '800 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`×${waiting}`, clamp(st.lx, 22, W - 22), FLOOR - 26);
    }
    // gelandete Bälle sammeln sich an der neuen Stelle
    if (st.nextX !== null && st.phase === 'fly') {
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(st.nextX, FLOOR - R, R, 0, Math.PI * 2);
      ctx.fill();
    }

    drawParticles(ctx, st.parts);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '900 13px system-ui, sans-serif';
    for (const p of st.pops) {
      ctx.globalAlpha = Math.min(1, p.life * 2);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
    }
    ctx.globalAlpha = 1;

    if (st.phase === 'aim' && st.round === 1 && !st.aim) {
      ctx.fillStyle = 'rgba(255,230,245,0.85)';
      ctx.font = '800 15px system-ui, sans-serif';
      ctx.fillText('Finger aufs Feld, zielen, loslassen', W / 2, TOP + 5.5 * CELL);
    }
    ctx.restore();
  });

  const hitBlock = (r: number, c: number) => {
    const st = s.current;
    const cell = st.grid[r][c];
    if (!cell || cell.k !== 'block') return;
    cell.hp--;
    cell.flash = 1;
    if (cell.hp <= 0) {
      st.grid[r][c] = null;
      const hue = blockHue(cell.max, st.round);
      burst(st.parts, cellX(c) + BS / 2, cellY(r) + BS / 2, `hsl(${hue},95%,65%)`, 14, 150);
      burst(st.parts, cellX(c) + BS / 2, cellY(r) + BS / 2, '#fff', 5, 90);
      st.shake = Math.min(1, st.shake + 0.35);
      tone(320 + Math.random() * 80, 90, 'triangle', 0.06, 160);
      buzz(8);
    } else if (Math.random() < 0.5) tone(900 + Math.min(cell.hp, 60) * 6, 25, 'square', 0.025);
  };

  const hitItem = (r: number, c: number) => {
    const st = s.current;
    const cell = st.grid[r][c];
    if (!cell) return;
    if (cell.k === 'plus') {
      st.grid[r][c] = null;
      st.gained++;
      st.pops.push({ x: cellX(c) + BS / 2, y: cellY(r) + BS / 2, life: 0.9, text: '+1', color: '#ffb3d6' });
      burst(st.parts, cellX(c) + BS / 2, cellY(r) + BS / 2, '#ff8cc6', 8, 80, { heart: true, size: 3 });
      tone(880, 70, 'triangle', 0.05, 1320);
    } else if (cell.k === 'laser') {
      if (cell.flash > 0.6) return;
      cell.used = true;
      cell.flash = 1;
      st.lasers.push({ r, c, dir: cell.dir, life: 0.25 });
      tone(1400, 60, 'sawtooth', 0.025, 600);
      if (cell.dir === 'h') for (let k = 0; k < BZ_COLS; k++) hitBlock(r, k);
      else for (let k = 0; k < BZ_ROWS; k++) hitBlock(k, c);
    }
  };

  const endTurn = () => {
    const st = s.current;
    if (st.nextX !== null) st.lx = st.nextX;
    st.nextX = null;
    st.flying = [];
    st.balls += st.gained;
    st.gained = 0;
    st.speedUp = 1;
    // benutzte Laser verschwinden
    for (const row of st.grid) row.forEach((cell, c) => cell?.k === 'laser' && cell.used && (row[c] = null));
    st.round++;
    const dead = bzShift(st.grid);
    if (dead) {
      st.phase = 'over';
      tone(200, 500, 'sawtooth', 0.05, 60);
      buzz([80, 40, 120]);
      for (let c = 0; c < BZ_COLS; c++) {
        const cell = st.grid[BZ_ROWS - 1][c];
        if (cell?.k === 'block') burst(st.parts, cellX(c) + BS / 2, cellY(BZ_ROWS - 1) + BS / 2, '#ff4f6d', 20, 180);
      }
      const score = st.round - 1;
      window.setTimeout(() => onEnd({ score }), 1300);
      sync();
      return;
    }
    st.grid[0] = bzRow(st.round);
    st.phase = 'shift';
    st.shiftT = 0.35;
    sync();
  };

  const recall = () => {
    const st = s.current;
    if (st.phase !== 'fly') return;
    for (const b of st.flying) {
      if (b.st !== 2 && st.nextX === null) st.nextX = b.st === 1 ? clamp(b.x, R, W - R) : st.lx;
      b.st = 2;
    }
    tone(500, 80, 'triangle', 0.05, 250);
    endTurn();
  };

  const fire = (ax: number, ay: number) => {
    const st = s.current;
    if (st.phase !== 'aim') return;
    const dir = aimDir(st.lx, ax, ay);
    st.aim = null;
    if (!dir) return;
    st.flying = Array.from({ length: st.balls }, () => ({ x: st.lx, y: FLOOR - R, vx: dir.x * SPEED, vy: dir.y * SPEED, st: 0 as const }));
    st.launched = 0;
    st.launchT = 0;
    st.flyT = 0;
    st.nextX = null;
    st.phase = 'fly';
    tone(520, 60, 'triangle', 0.05, 780);
    sync();
  };

  useLoop((dtRaw) => {
    const st = s.current;
    const dt = Math.min(dtRaw, 1 / 30);
    st.t += dt;
    st.shake = Math.max(0, st.shake - dt * 4);
    for (const p of st.pops) {
      p.life -= dt;
      p.y -= 28 * dt;
    }
    st.pops = st.pops.filter((p) => p.life > 0);
    st.lasers = st.lasers.filter((l) => (l.life -= dt) > 0);
    stepParticles(st.parts, dt);
    for (const row of st.grid)
      for (const cell of row) {
        if (cell && (cell.k === 'block' || cell.k === 'laser') && cell.flash > 0) cell.flash = Math.max(0, cell.flash - dt * 5);
      }

    if (st.phase === 'shift') {
      st.shiftT -= dt;
      if (st.shiftT <= 0) {
        st.phase = 'aim';
        sync();
      }
    } else if (st.phase === 'fly') {
      st.flyT += dt;
      const fast = st.flyT > 22 ? 3 : st.flyT > 9 ? 2 : 1;
      if (fast !== st.speedUp) {
        st.speedUp = fast;
        sync();
      }
      const sdt = dt * st.speedUp;
      st.launchT -= sdt;
      while (st.launchT <= 0 && st.launched < st.flying.length) {
        st.flying[st.launched].st = 1;
        st.launched++;
        st.launchT += LAUNCH_EVERY;
      }
      for (const b of st.flying) {
        if (b.st !== 1) continue;
        if (moveBall(st, b, SPEED * sdt, hitBlock, hitItem) === 'floor') {
          b.st = 2;
          if (st.nextX === null) st.nextX = clamp(b.x, R + 2, W - R - 2);
        }
      }
      if (st.launched >= st.flying.length && st.flying.every((b) => b.st === 2)) endTurn();
    }
    paint();
  }, true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return;
      if (e.key === 'ArrowDown') recall();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pointer = useRef<number | null>(null);
  const onDown = (e: RPointerEvent<HTMLCanvasElement>) => {
    const st = s.current;
    if (st.phase !== 'aim') return;
    pointer.current = e.pointerId;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    st.aim = toLogical(e.clientX, e.clientY);
  };
  const onMove = (e: RPointerEvent<HTMLCanvasElement>) => {
    const st = s.current;
    if (e.pointerType === 'mouse' && st.phase === 'aim' && pointer.current === null) {
      st.aim = toLogical(e.clientX, e.clientY);
      return;
    }
    if (pointer.current !== e.pointerId) return;
    st.aim = toLogical(e.clientX, e.clientY);
  };
  const onUp = (e: RPointerEvent<HTMLCanvasElement>) => {
    if (pointer.current !== e.pointerId && e.pointerType !== 'mouse') return;
    pointer.current = null;
    const p = toLogical(e.clientX, e.clientY);
    fire(p.x, p.y);
  };

  return (
    <div className="g-col fill">
      <div className="score-strip">
        <span>☄️ Runde {hud.round}</span>
        <span>⚪ ×{hud.balls}</span>
        <span>🏆 {best ?? '–'}</span>
      </div>
      <div className="canvas-wrap" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          className="game-canvas"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={() => {
            pointer.current = null;
            s.current.aim = null;
          }}
        />
        {hud.flying && (
          <div className="bz-fly">
            {hud.fast > 1 && <span className="bz-fast">⏩ {hud.fast}×</span>}
            <button className="bz-recall" onClick={recall}>
              ⏬ Bälle zurück
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
