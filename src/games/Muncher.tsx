import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { burst, buzz, drawParticles, heartPath, stepParticles, tone, useFitCanvas, useLoop, useTouchLock, type Particle } from './engine';
import {
  canGo,
  chooseDir,
  countDots,
  DOOR,
  dotGrid,
  DX,
  DY,
  EXIT,
  frightTime,
  FRUITS,
  ghostTarget,
  GHOSTS,
  HOUSE,
  isWall,
  MAZE,
  MH,
  modeAt,
  MW,
  opposite,
  speeds,
  START,
  TUNNEL_ROW,
  type Dir,
  type GhostId,
} from './muncher';
import type { GameProps } from './types';

const CS = 16;
const BAR = 28;
const W = MW * CS;
const H = MH * CS + BAR;
const LIVES = 3;

type GState = 'house' | 'exit' | 'roam' | 'eaten' | 'enter';

interface Mover {
  x: number;
  y: number;
  dir: Dir;
}

interface Ghost extends Mover {
  id: GhostId;
  st: GState;
  fright: number;
  wait: number;
  slot: number;
}

interface Pop {
  x: number;
  y: number;
  text: string;
  life: number;
}

interface MState {
  me: Mover;
  want: Dir | null;
  moving: boolean;
  mouth: number;
  ghosts: Ghost[];
  dots: number[][];
  left: number;
  total: number;
  score: number;
  lives: number;
  level: number;
  phase: 'ready' | 'play' | 'dying' | 'clear' | 'over';
  phaseT: number;
  modeT: number;
  combo: number;
  freeze: number;
  fruit: { t: number; kind: number } | null;
  fruitsShown: number;
  extra: boolean;
  parts: Particle[];
  pops: Pop[];
  t: number;
}

const SLOTS = [HOUSE.x, HOUSE.x - 2, HOUSE.x + 2];

function newGhosts(level: number): Ghost[] {
  const release = [0, Math.max(0.5, 1.5 - level * 0.2), Math.max(2, 6 - level), Math.max(4, 11 - level * 1.5)];
  return ([0, 1, 2, 3] as GhostId[]).map((id) =>
    id === 0
      ? { id, x: EXIT.x, y: EXIT.y, dir: 2, st: 'roam', fright: 0, wait: 0, slot: HOUSE.x }
      : { id, x: SLOTS[id - 1], y: HOUSE.y, dir: 3, st: 'house', fright: 0, wait: release[id], slot: SLOTS[id - 1] },
  );
}

function fresh(): MState {
  const dots = dotGrid();
  const total = countDots(dots);
  return {
    me: { x: START.x, y: START.y, dir: 2 },
    want: null,
    moving: false,
    mouth: 0,
    ghosts: newGhosts(1),
    dots,
    left: total,
    total,
    score: 0,
    lives: LIVES,
    level: 1,
    phase: 'ready',
    phaseT: 2,
    modeT: 0,
    combo: 0,
    freeze: 0,
    fruit: null,
    fruitsShown: 0,
    extra: false,
    parts: [],
    pops: [],
    t: 0,
  };
}

const atCenter = (m: Mover) => Math.abs(m.x - Math.round(m.x)) < 1e-4 && Math.abs(m.y - Math.round(m.y)) < 1e-4;
const wrapX = (x: number) => ((x % MW) + MW) % MW;

/** Figur um `dist` Felder bewegen; an jeder Feldmitte entscheidet `decide` die Richtung (null = stehen bleiben). */
function advance(m: Mover, dist: number, decide: (x: number, y: number) => Dir | null): boolean {
  let moved = false;
  for (let guard = 0; dist > 1e-6 && guard < 8; guard++) {
    if (atCenter(m)) {
      m.x = Math.round(m.x);
      m.y = Math.round(m.y);
      const d = decide(wrapX(m.x), m.y);
      if (d === null) return moved;
      m.dir = d;
    }
    const ax = DX[m.dir];
    const ay = DY[m.dir];
    const p = ax ? m.x * ax : m.y * ay;
    const next = Math.floor(p + 1e-6) + 1;
    const step = Math.min(dist, next - p);
    m.x += ax * step;
    m.y += ay * step;
    dist -= step;
    moved = true;
    if (Math.abs(m.x - Math.round(m.x)) < 1e-6) m.x = Math.round(m.x);
    if (Math.abs(m.y - Math.round(m.y)) < 1e-6) m.y = Math.round(m.y);
    if (m.x < -0.5) m.x += MW;
    if (m.x > MW - 0.5) m.x -= MW;
  }
  return moved;
}

/** Ohne Gitter geradeaus auf ein Ziel zu (im Geisterhaus). true = angekommen */
function glide(m: Mover, tx: number, ty: number, dist: number): boolean {
  const dx = tx - m.x;
  const dy = ty - m.y;
  if (Math.abs(dx) > 1e-4) {
    const s = Math.min(Math.abs(dx), dist);
    m.x += Math.sign(dx) * s;
    m.dir = dx > 0 ? 0 : 2;
    dist -= s;
  }
  if (dist > 0 && Math.abs(dy) > 1e-4) {
    const s = Math.min(Math.abs(dy), dist);
    m.y += Math.sign(dy) * s;
    m.dir = dy > 0 ? 1 : 3;
  }
  return Math.abs(tx - m.x) < 1e-4 && Math.abs(ty - m.y) < 1e-4;
}

let wallCache: { canvas: HTMLCanvasElement; flash: boolean } | null = null;

/** Neon-Wände einmal vorzeichnen */
function wallsImage(flash: boolean): HTMLCanvasElement {
  if (wallCache && wallCache.flash === flash) return wallCache.canvas;
  const k = 3;
  const c = document.createElement('canvas');
  c.width = W * k;
  c.height = MH * CS * k;
  const g = c.getContext('2d')!;
  g.scale(k, k);
  const shape = (inset: number, color: string, blur = 0) => {
    g.fillStyle = color;
    g.shadowColor = color;
    g.shadowBlur = blur;
    const half = CS / 2 - inset;
    for (let y = 0; y < MH; y++)
      for (let x = 0; x < MW; x++) {
        if (MAZE[y][x] !== '#') continue;
        const cx = x * CS + CS / 2;
        const cy = y * CS + CS / 2;
        const r = isWall(x + 1, y) && x + 1 < MW;
        const d = isWall(x, y + 1) && y + 1 < MH;
        const l = x > 0 && isWall(x - 1, y);
        const u = y > 0 && isWall(x, y - 1);
        g.beginPath();
        const rad = Math.max(1, half * 0.7);
        g.roundRect(cx - (l ? CS / 2 : half), cy - (u ? CS / 2 : half), (l ? CS / 2 : half) + (r ? CS / 2 : half), (u ? CS / 2 : half) + (d ? CS / 2 : half), [
          !l && !u ? rad : 0,
          !r && !u ? rad : 0,
          !r && !d ? rad : 0,
          !l && !d ? rad : 0,
        ]);
        g.fill();
        if (r && d && isWall(x + 1, y + 1)) g.fillRect(cx, cy, CS, CS);
      }
    g.shadowBlur = 0;
  };
  shape(3, flash ? '#ffffff' : '#ff5fa8', 6);
  shape(5, flash ? '#6a5a9a' : '#2a1240');
  // Tür
  g.fillStyle = '#ffc2e0';
  g.fillRect(DOOR.x * CS + 1, DOOR.y * CS + CS / 2 - 1.5, CS - 2, 3);
  wallCache = { canvas: c, flash };
  return c;
}

function drawGhost(ctx: CanvasRenderingContext2D, g: Ghost, t: number, frightEnd: boolean) {
  const x = g.x * CS + CS / 2;
  const y = g.y * CS + CS / 2 + BAR;
  const r = CS * 0.46;
  const scared = g.fright > 0 && g.st !== 'eaten' && g.st !== 'enter';
  if (g.st !== 'eaten' && g.st !== 'enter') {
    const blink = scared && frightEnd && Math.floor(t * 8) % 2 === 0;
    ctx.fillStyle = scared ? (blink ? '#f4f0ff' : '#4057ff') : GHOSTS[g.id].color;
    ctx.beginPath();
    ctx.arc(x, y - 1, r, Math.PI, 0);
    ctx.lineTo(x + r, y + r - 1);
    const waves = 3;
    const ph = Math.floor(t * 8) % 2;
    for (let i = 0; i < waves; i++) {
      const x0 = x + r - ((i + 0.5) * 2 * r) / waves;
      const x1 = x + r - ((i + 1) * 2 * r) / waves;
      ctx.quadraticCurveTo(x0, y + r - 1 - (ph ? 4 : 2.5), x1, y + r - 1);
    }
    ctx.closePath();
    ctx.fill();
    // Glanz
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.beginPath();
    ctx.ellipse(x - r * 0.45, y - r * 0.5, r * 0.18, r * 0.28, -0.5, 0, Math.PI * 2);
    ctx.fill();
    if (scared) {
      ctx.fillStyle = blink ? '#ff4d6d' : '#ffe0f0';
      ctx.fillRect(x - 3.5, y - 3, 2, 2);
      ctx.fillRect(x + 1.5, y - 3, 2, 2);
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 0; i <= 4; i++) ctx.lineTo(x - 4 + i * 2, y + 2.5 + (i % 2 ? -1 : 1));
      ctx.stroke();
      return;
    }
  }
  // Augen schauen in Laufrichtung
  const ex = DX[g.dir] * 1.5;
  const ey = DY[g.dir] * 1.5;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.ellipse(x - 3, y - 2, 2.6, 3.2, 0, 0, Math.PI * 2);
  ctx.ellipse(x + 3, y - 2, 2.6, 3.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#241038';
  ctx.beginPath();
  ctx.arc(x - 3 + ex, y - 2 + ey, 1.4, 0, Math.PI * 2);
  ctx.arc(x + 3 + ex, y - 2 + ey, 1.4, 0, Math.PI * 2);
  ctx.fill();
  if (g.st !== 'eaten' && g.st !== 'enter') {
    // grimmige Brauen
    ctx.strokeStyle = 'rgba(40,10,40,0.75)';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(x - 5.2, y - 6);
    ctx.lineTo(x - 1.2, y - 4.6);
    ctx.moveTo(x + 5.2, y - 6);
    ctx.lineTo(x + 1.2, y - 4.6);
    ctx.stroke();
  }
}

function drawMe(ctx: CanvasRenderingContext2D, st: MState) {
  const m = st.me;
  const x = m.x * CS + CS / 2;
  const y = m.y * CS + CS / 2 + BAR;
  const r = CS * 0.47;
  if (st.phase === 'dying') {
    // Mampfi wird zum Herz, das zerbricht
    const k = Math.min(1, (1.8 - st.phaseT) / 0.7);
    const split = Math.max(0, (1.8 - st.phaseT - 0.7) / 0.9);
    ctx.fillStyle = '#ff2f6d';
    for (const side of [-1, 1]) {
      ctx.save();
      ctx.translate(x + side * split * 6, y + split * 10);
      ctx.rotate(side * split * 0.6);
      ctx.globalAlpha = 1 - split * 0.8;
      ctx.beginPath();
      ctx.rect(side < 0 ? -20 : 0, -20, 20, 40);
      ctx.clip();
      heartPath(ctx, 0, 0, r * (0.8 + k * 0.4));
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    return;
  }
  const open = st.moving ? (Math.sin(st.mouth) * 0.5 + 0.5) * 0.85 + 0.05 : 0.35;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((m.dir * Math.PI) / 2);
  const g = ctx.createRadialGradient(-r * 0.3, -r * 0.4, 1, 0, 0, r);
  g.addColorStop(0, '#ff9ac4');
  g.addColorStop(1, '#ff2f78');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, r, open * 0.9, Math.PI * 2 - open * 0.9);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  // Auge und Schleife (nicht mitdrehen, damit sie oben bleiben)
  const flip = m.dir === 2 ? -1 : 1;
  const eyeX = m.dir === 1 || m.dir === 3 ? 2.5 : 0.5 * flip;
  ctx.fillStyle = '#2a0b1e';
  ctx.beginPath();
  ctx.arc(x + eyeX, y - (m.dir === 3 ? -1.5 : 3.6), 1.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffd43b';
  ctx.beginPath();
  ctx.ellipse(x - 2.6 * flip, y - r + 0.5, 2.6, 1.6, -0.4, 0, Math.PI * 2);
  ctx.ellipse(x + 1.6 * flip - 0.5, y - r + 0.2, 2.6, 1.6, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f59f00';
  ctx.beginPath();
  ctx.arc(x - 0.5 * flip, y - r + 0.4, 1.1, 0, Math.PI * 2);
  ctx.fill();
}

export function Muncher({ best, onEnd }: GameProps) {
  const s = useRef<MState>(fresh());
  const [hud, setHud] = useState({ score: 0, lives: LIVES, level: 1 });
  const root = useRef<HTMLDivElement>(null);
  const ended = useRef(false);
  useTouchLock(root);

  const sync = () => {
    const st = s.current;
    setHud((h) => (h.score === st.score && h.lives === st.lives && h.level === st.level ? h : { score: st.score, lives: st.lives, level: st.level }));
  };

  const { wrapRef, canvasRef, paint } = useFitCanvas(W, H, (ctx) => {
    const st = s.current;
    ctx.fillStyle = '#120820';
    ctx.fillRect(0, 0, W, H);

    // Kopfzeile
    ctx.textBaseline = 'middle';
    ctx.font = '800 14px ui-monospace, Menlo, monospace';
    ctx.fillStyle = '#ffe3f1';
    ctx.textAlign = 'left';
    ctx.fillText(String(st.score).padStart(5, '0'), 8, BAR / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,227,241,0.6)';
    ctx.fillText(`LEVEL ${st.level}`, W / 2, BAR / 2);
    ctx.fillStyle = '#ff4f81';
    for (let i = 0; i < st.lives - (st.phase === 'ready' || st.phase === 'dying' ? 1 : 0); i++) {
      heartPath(ctx, W - 14 - i * 16, BAR / 2, 6);
      ctx.fill();
    }

    const flash = st.phase === 'clear' && Math.floor(st.phaseT * 5) % 2 === 0;
    ctx.drawImage(wallsImage(flash), 0, BAR, W, MH * CS);

    // Herzchen
    const pulse = 0.75 + 0.25 * Math.sin(st.t * 8);
    for (let y = 0; y < MH; y++)
      for (let x = 0; x < MW; x++) {
        const v = st.dots[y][x];
        if (!v) continue;
        const cx = x * CS + CS / 2;
        const cy = y * CS + CS / 2 + BAR;
        if (v === 1) {
          ctx.fillStyle = '#ffd1e6';
          ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
        } else {
          ctx.fillStyle = '#ff2f6d';
          heartPath(ctx, cx, cy + 0.5, 5.5 * pulse);
          ctx.fill();
        }
      }

    if (st.fruit) {
      const f = FRUITS[st.fruit.kind];
      ctx.font = '13px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(f.emoji, START.x * CS + CS / 2, START.y * CS + CS / 2 + BAR + 1);
    }

    if (st.phase !== 'over') drawMe(ctx, st);
    if (st.phase !== 'dying' || st.phaseT > 1.5) {
      const frightEnd = st.ghosts.some((g) => g.fright > 0 && g.fright < 2);
      for (const g of st.ghosts) if (st.phase !== 'clear' || g.st === 'roam') drawGhost(ctx, g, st.t, frightEnd);
    }

    ctx.save();
    ctx.translate(0, BAR);
    drawParticles(ctx, st.parts);
    ctx.restore();
    ctx.font = '900 10px system-ui';
    ctx.textAlign = 'center';
    for (const p of st.pops) {
      ctx.globalAlpha = Math.min(1, p.life * 2);
      ctx.fillStyle = '#7af3ff';
      ctx.fillText(p.text, p.x * CS + CS / 2, p.y * CS + CS / 2 + BAR - (1 - p.life) * 8);
    }
    ctx.globalAlpha = 1;

    if (st.phase === 'ready' || st.phase === 'over') {
      const text = st.phase === 'over' ? 'GAME OVER' : st.level > 1 && st.left === st.total ? `LEVEL ${st.level} 💗` : 'BEREIT!';
      const by = 13.5 * CS + BAR;
      ctx.fillStyle = 'rgba(18,8,32,0.85)';
      ctx.beginPath();
      ctx.roundRect(W / 2 - 62, by - 13, 124, 26, 13);
      ctx.fill();
      ctx.font = '900 15px system-ui, sans-serif';
      ctx.fillStyle = st.phase === 'over' ? '#ff4d6d' : '#ffd43b';
      ctx.fillText(text, W / 2, by + 1);
    }
  });

  const resetPositions = () => {
    const st = s.current;
    st.me = { x: START.x, y: START.y, dir: 2 };
    st.want = null;
    st.moving = false;
    st.ghosts = newGhosts(st.level);
    st.modeT = 0;
    st.combo = 0;
    st.phase = 'ready';
    st.phaseT = 1.8;
  };

  const addScore = (n: number) => {
    const st = s.current;
    st.score += n;
    if (!st.extra && st.score >= 10000) {
      st.extra = true;
      st.lives++;
      tone(988, 300, 'square', 0.05);
    }
    sync();
  };

  useLoop((dtRaw) => {
    const st = s.current;
    const dt = Math.min(dtRaw, 1 / 30);
    st.t += dt;
    stepParticles(st.parts, dt);
    for (const p of st.pops) p.life -= dt * 0.8;
    st.pops = st.pops.filter((p) => p.life > 0);

    if (st.phase === 'ready') {
      st.phaseT -= dt;
      if (st.phaseT <= 0) st.phase = 'play';
      return paint();
    }
    if (st.phase === 'dying') {
      st.phaseT -= dt;
      if (st.phaseT <= 0) {
        st.lives--;
        sync();
        if (st.lives <= 0) {
          st.phase = 'over';
          if (!ended.current) {
            ended.current = true;
            window.setTimeout(() => onEnd({ score: st.score }), 1200);
          }
        } else resetPositions();
      }
      return paint();
    }
    if (st.phase === 'clear') {
      st.phaseT -= dt;
      if (st.phaseT <= 0) {
        st.level++;
        st.dots = dotGrid();
        st.left = st.total;
        st.fruit = null;
        st.fruitsShown = 0;
        wallCache = null;
        resetPositions();
        sync();
      }
      return paint();
    }
    if (st.phase === 'over') return paint();
    if (st.freeze > 0) {
      st.freeze -= dt;
      return paint();
    }

    const sp = speeds(st.level);
    st.modeT += dt;
    const anyFright = st.ghosts.some((g) => g.fright > 0);
    const mode = modeAt(st.modeT);

    // Mampfi
    const me = st.me;
    const want = st.want;
    if (want !== null && want === opposite(me.dir)) me.dir = want;
    else if (want !== null && want !== me.dir && !atCenter(me)) {
      // Kurz nach der Mitte darf man noch abbiegen
      const cx = Math.round(me.x);
      const cy = Math.round(me.y);
      if (Math.abs(me.x - cx) + Math.abs(me.y - cy) < 0.3 && canGo(wrapX(cx), cy, want)) {
        me.x = cx;
        me.y = cy;
      }
    }
    st.moving = advance(me, (anyFright ? sp.me * 1.08 : sp.me) * dt, (x, y) => {
      if (want !== null && canGo(x, y, want)) return want;
      if (canGo(x, y, me.dir)) return me.dir;
      return null;
    });
    if (st.moving) st.mouth += dt * 22;

    // Fressen
    const tx = wrapX(Math.round(me.x));
    const ty = Math.round(me.y);
    const v = st.dots[ty]?.[tx];
    if (v) {
      st.dots[ty][tx] = 0;
      st.left--;
      if (v === 1) {
        addScore(10);
        tone(st.left % 2 ? 620 : 780, 35, 'triangle', 0.035);
      } else {
        addScore(50);
        st.combo = 0;
        const ft = frightTime(st.level);
        for (const g of st.ghosts) {
          if (g.st === 'eaten' || g.st === 'enter') continue;
          g.fright = ft;
          if (g.st === 'roam') g.dir = opposite(g.dir);
        }
        tone(300, 380, 'sawtooth', 0.04, 900);
        burst(st.parts, tx * CS + CS / 2, ty * CS + CS / 2, '#ff2f6d', 12, 90, { heart: true, size: 3 });
        buzz(20);
      }
      if (st.total - st.left === 70 || st.total - st.left === 170) {
        st.fruit = { t: 9.5, kind: Math.min(st.level - 1, FRUITS.length - 1) };
      }
      if (st.left === 0) {
        st.phase = 'clear';
        st.phaseT = 2;
        tone(523, 160, 'square', 0.05);
        window.setTimeout(() => tone(784, 160, 'square', 0.05), 160);
        window.setTimeout(() => tone(1047, 260, 'square', 0.05), 320);
        return paint();
      }
    }
    if (st.fruit) {
      st.fruit.t -= dt;
      if (st.fruit.t <= 0) st.fruit = null;
      else if (tx === START.x && ty === START.y && Math.abs(me.x - START.x) < 0.5) {
        const f = FRUITS[st.fruit.kind];
        addScore(f.pts);
        st.pops.push({ x: START.x, y: START.y, text: String(f.pts), life: 1.2 });
        st.fruit = null;
        tone(880, 120, 'square', 0.05, 1760);
      }
    }

    // Geister
    const red = st.ghosts[0];
    for (const g of st.ghosts) {
      if (g.fright > 0) g.fright = Math.max(0, g.fright - dt);
      if (g.st === 'house') {
        g.wait -= dt;
        g.y = HOUSE.y + Math.sin(st.t * 6 + g.id) * 0.25;
        if (g.wait <= 0) g.st = 'exit';
        continue;
      }
      if (g.st === 'exit') {
        const step = sp.ghost * 0.6 * dt;
        if (Math.abs(g.x - HOUSE.x) > 1e-3 || g.y > DOOR.y + 0.5) {
          if (Math.abs(g.x - HOUSE.x) > 1e-3) glide(g, HOUSE.x, HOUSE.y, step);
          else glide(g, HOUSE.x, EXIT.y, step);
        } else if (glide(g, EXIT.x, EXIT.y, step)) {
          g.st = 'roam';
          g.dir = 2;
        }
        continue;
      }
      if (g.st === 'enter') {
        if (glide(g, HOUSE.x, HOUSE.y, sp.eyes * 0.5 * dt)) {
          g.st = 'exit';
          g.fright = 0;
        }
        continue;
      }
      const inTunnel = Math.round(g.y) === TUNNEL_ROW && (g.x < 3 || g.x > MW - 4);
      const speed = g.st === 'eaten' ? sp.eyes : inTunnel ? sp.tunnel : g.fright > 0 ? sp.fright : sp.ghost * (g.id === 0 && st.left < 30 ? 1.06 : 1);
      advance(g, speed * dt, (x, y) => {
        if (g.st === 'eaten') {
          if (x === EXIT.x && y === EXIT.y) {
            g.st = 'enter';
            return null;
          }
          return chooseDir(x, y, g.dir, EXIT);
        }
        if (g.fright > 0) return chooseDir(x, y, g.dir, EXIT, false, Math.random);
        const target = ghostTarget(g.id, mode === 'scatter', { x: wrapX(Math.round(me.x)), y: Math.round(me.y) }, me.dir, { x: Math.round(red.x), y: Math.round(red.y) }, { x, y });
        return chooseDir(x, y, g.dir, target);
      });
    }

    // Zusammenstöße
    for (const g of st.ghosts) {
      if (g.st !== 'roam') continue;
      let dx = Math.abs(g.x - me.x);
      if (dx > MW / 2) dx = MW - dx;
      if (dx + Math.abs(g.y - me.y) > 0.7) continue;
      if (g.fright > 0) {
        g.st = 'eaten';
        g.fright = 0;
        const pts = 200 * 2 ** st.combo;
        st.combo = Math.min(st.combo + 1, 3);
        addScore(pts);
        st.pops.push({ x: g.x, y: g.y, text: String(pts), life: 1.2 });
        st.freeze = 0.45;
        burst(st.parts, g.x * CS + CS / 2, g.y * CS + CS / 2, '#8fa0ff', 14, 110);
        tone(1200, 200, 'square', 0.05, 300);
        buzz(30);
      } else {
        st.phase = 'dying';
        st.phaseT = 1.8;
        st.fruit = null;
        tone(700, 900, 'sawtooth', 0.05, 90);
        buzz([60, 40, 120]);
        break;
      }
    }
    paint();
  }, true);

  // ───── Steuerung ─────
  const setWant = (d: Dir) => {
    s.current.want = d;
  };
  useEffect(() => {
    const keys: Record<string, Dir> = { arrowright: 0, d: 0, arrowdown: 1, s: 1, arrowleft: 2, a: 2, arrowup: 3, w: 3 };
    const down = (e: KeyboardEvent) => {
      const d = keys[e.key.toLowerCase()];
      if (d === undefined) return;
      e.preventDefault();
      setWant(d);
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, []);

  const swipe = useRef<{ id: number; x: number; y: number } | null>(null);
  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    swipe.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    const sw = swipe.current;
    if (!sw || sw.id !== e.pointerId) return;
    const dx = e.clientX - sw.x;
    const dy = e.clientY - sw.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
    setWant(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 0 : 2) : dy > 0 ? 1 : 3);
    swipe.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const onUp = () => {
    swipe.current = null;
  };

  const pad = (d: Dir, label: string, cls: string) => (
    <button
      className={`mu-btn ${cls}`}
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault();
        setWant(d);
      }}
    >
      {['▶', '▼', '◀', '▲'][d]}
    </button>
  );

  return (
    <div className="g-col fill mu" ref={root}>
      <div className="score-strip">
        <span>👻 Level {hud.level}</span>
        <span>🏆 Rekord {best ?? '–'}</span>
      </div>
      <div className="canvas-wrap" ref={wrapRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <canvas ref={canvasRef} className="game-canvas" />
      </div>
      <div className="mu-pad">
        {pad(3, 'Hoch', 'up')}
        {pad(2, 'Links', 'left')}
        {pad(0, 'Rechts', 'right')}
        {pad(1, 'Runter', 'down')}
      </div>
    </div>
  );
}
