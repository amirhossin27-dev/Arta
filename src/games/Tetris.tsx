import { useEffect, useRef, type PointerEvent as RPointerEvent } from 'react';
import { buzz, sfx, tone, useFitCanvas, useLoop } from './engine';
import type { GameProps } from './types';

const COLS = 10;
const ROWS = 20;
const C = 16;
const PANEL = 5 * C;
const W = COLS * C + PANEL;
const H = ROWS * C;

type Kind = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
const KINDS: Kind[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
const SHAPES: Record<Kind, number[][]> = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  O: [
    [1, 1],
    [1, 1],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
};
const COLOR: Record<Kind, string> = { I: '#4dd0e1', O: '#ffd54f', T: '#ba68c8', S: '#81c784', Z: '#ff6b8b', J: '#64b5f6', L: '#ffb74d' };
const LINE_POINTS = [0, 100, 300, 500, 800];

interface Piece {
  kind: Kind;
  m: number[][];
  x: number;
  y: number;
}

interface Heart {
  x: number;
  y: number;
  vy: number;
  life: number;
}

interface TetrisState {
  grid: (Kind | null)[][];
  piece: Piece;
  next: Kind;
  bag: Kind[];
  acc: number;
  lock: number;
  resets: number;
  score: number;
  lines: number;
  level: number;
  alive: boolean;
  hearts: Heart[];
  flash: number;
}

const rotate = (m: number[][]) => m[0].map((_, c) => m.map((row) => row[c]).reverse());

function nextFromBag(bag: Kind[]): { kind: Kind; bag: Kind[] } {
  let b = bag;
  if (!b.length) {
    b = KINDS.slice();
    for (let i = b.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [b[i], b[j]] = [b[j], b[i]];
    }
  }
  return { kind: b[0], bag: b.slice(1) };
}

const spawn = (kind: Kind): Piece => ({ kind, m: SHAPES[kind], x: Math.floor((COLS - SHAPES[kind][0].length) / 2), y: kind === 'I' ? -1 : 0 });

function fits(grid: (Kind | null)[][], p: Piece, dx = 0, dy = 0, m = p.m): boolean {
  for (let r = 0; r < m.length; r++)
    for (let c = 0; c < m[r].length; c++) {
      if (!m[r][c]) continue;
      const x = p.x + c + dx;
      const y = p.y + r + dy;
      if (x < 0 || x >= COLS || y >= ROWS) return false;
      if (y >= 0 && grid[y][x]) return false;
    }
  return true;
}

function fresh(): TetrisState {
  const a = nextFromBag([]);
  const b = nextFromBag(a.bag);
  return {
    grid: Array.from({ length: ROWS }, () => Array(COLS).fill(null)),
    piece: spawn(a.kind),
    next: b.kind,
    bag: b.bag,
    acc: 0,
    lock: 0,
    resets: 0,
    score: 0,
    lines: 0,
    level: 1,
    alive: true,
    hearts: [],
    flash: 0,
  };
}

const gravity = (level: number) => Math.max(0.07, 0.8 - (level - 1) * 0.07);

function block(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(x + 1, y + 1, C - 2, C - 2, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(x + 3, y + 3, C - 9, 2.5);
  ctx.globalAlpha = 1;
}

export function Tetris({ best, onEnd }: GameProps) {
  const s = useRef<TetrisState>(fresh());
  const touch = useRef<{ x: number; y: number; t: number; moved: boolean; id: number } | null>(null);
  const soft = useRef(false);

  const { wrapRef, canvasRef, paint } = useFitCanvas(W, H, (ctx) => {
    const st = s.current;
    ctx.fillStyle = '#140d22';
    ctx.fillRect(0, 0, W, H);
    // Spielfeld
    ctx.fillStyle = '#1d1430';
    ctx.fillRect(0, 0, COLS * C, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    for (let x = 1; x < COLS; x++) {
      ctx.beginPath();
      ctx.moveTo(x * C, 0);
      ctx.lineTo(x * C, H);
      ctx.stroke();
    }
    st.grid.forEach((row, y) => row.forEach((k, x) => k && block(ctx, x * C, y * C, COLOR[k], st.alive ? 1 : 0.55)));
    if (st.alive) {
      // Schatten, wo der Stein landen wird
      let drop = 0;
      while (fits(st.grid, st.piece, 0, drop + 1)) drop++;
      const p = st.piece;
      p.m.forEach((row, r) =>
        row.forEach((v, c) => {
          if (!v) return;
          if (p.y + r + drop >= 0) {
            ctx.strokeStyle = COLOR[p.kind];
            ctx.globalAlpha = 0.45;
            ctx.strokeRect((p.x + c) * C + 2, (p.y + r + drop) * C + 2, C - 4, C - 4);
            ctx.globalAlpha = 1;
          }
          if (p.y + r >= 0) block(ctx, (p.x + c) * C, (p.y + r) * C, COLOR[p.kind]);
        }),
      );
    }
    if (st.flash > 0) {
      ctx.fillStyle = `rgba(255,255,255,${st.flash * 0.6})`;
      ctx.fillRect(0, 0, COLS * C, H);
    }
    // Herzen bei vollen Reihen
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    for (const h of st.hearts) {
      ctx.globalAlpha = Math.max(0, h.life);
      ctx.fillStyle = '#ff6b9d';
      ctx.fillText('❤', h.x, h.y);
    }
    ctx.globalAlpha = 1;
    // Seitenleiste
    const px = COLS * C + 8;
    ctx.fillStyle = '#baa6cd';
    ctx.textAlign = 'left';
    ctx.font = 'bold 9px sans-serif';
    ctx.fillText('NÄCHSTER', px, 16);
    const nm = SHAPES[st.next];
    const off = (4 - nm[0].length) / 2;
    nm.forEach((row, r) => row.forEach((v, c) => v && block(ctx, px + (c + off) * (C * 0.85), 24 + r * (C * 0.85), COLOR[st.next])));
    const stat = (label: string, value: string, y: number) => {
      ctx.fillStyle = '#baa6cd';
      ctx.font = 'bold 9px sans-serif';
      ctx.fillText(label, px, y);
      ctx.fillStyle = '#f8ecff';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(value, px, y + 16);
    };
    stat('PUNKTE', String(st.score), 110);
    stat('REIHEN', String(st.lines), 150);
    stat('LEVEL', String(st.level), 190);
    stat('REKORD', best !== undefined ? String(best) : '–', 230);
  });

  const lockPiece = () => {
    const st = s.current;
    const p = st.piece;
    let over = false;
    p.m.forEach((row, r) =>
      row.forEach((v, c) => {
        if (!v) return;
        if (p.y + r < 0) over = true;
        else st.grid[p.y + r][p.x + c] = p.kind;
      }),
    );
    const full = st.grid.flatMap((row, y) => (row.every(Boolean) ? [y] : []));
    if (full.length) {
      st.grid = [...Array.from({ length: full.length }, () => Array(COLS).fill(null)), ...st.grid.filter((_, y) => !full.includes(y))];
      st.lines += full.length;
      st.score += LINE_POINTS[full.length] * st.level;
      st.level = 1 + Math.floor(st.lines / 10);
      st.flash = full.length === 4 ? 1 : 0.6;
      for (const y of full) for (let k = 0; k < 4; k++) st.hearts.push({ x: 10 + Math.random() * (COLS * C - 20), y: y * C + 10, vy: -30 - Math.random() * 40, life: 1 });
      if (full.length === 4) {
        sfx.win();
        buzz([30, 30, 60]);
      } else {
        sfx.match();
        buzz(25);
      }
    } else tone(200, 30, 'square', 0.03);
    const n = nextFromBag(st.bag);
    st.piece = spawn(st.next);
    st.next = n.kind;
    st.bag = n.bag;
    st.lock = 0;
    st.resets = 0;
    if (over || !fits(st.grid, st.piece)) {
      st.alive = false;
      sfx.lose();
      buzz(150);
      window.setTimeout(() => onEnd({ score: st.score }), 1300);
    }
  };

  const move = (dx: number) => {
    const st = s.current;
    if (!st.alive || !fits(st.grid, st.piece, dx, 0)) return;
    st.piece = { ...st.piece, x: st.piece.x + dx };
    if (st.lock > 0 && st.resets < 12) {
      st.lock = 0;
      st.resets++;
    }
    sfx.tap();
  };

  const turn = () => {
    const st = s.current;
    if (!st.alive || st.piece.kind === 'O') return;
    const m = rotate(st.piece.m);
    // Einfache Wandkicks
    for (const [dx, dy] of [
      [0, 0],
      [-1, 0],
      [1, 0],
      [-2, 0],
      [2, 0],
      [0, -1],
    ]) {
      if (fits(st.grid, st.piece, dx, dy, m)) {
        st.piece = { ...st.piece, m, x: st.piece.x + dx, y: st.piece.y + dy };
        if (st.lock > 0 && st.resets < 12) {
          st.lock = 0;
          st.resets++;
        }
        sfx.flip();
        return;
      }
    }
  };

  const hardDrop = () => {
    const st = s.current;
    if (!st.alive) return;
    let d = 0;
    while (fits(st.grid, st.piece, 0, d + 1)) d++;
    st.piece = { ...st.piece, y: st.piece.y + d };
    st.score += d * 2;
    buzz(12);
    lockPiece();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k === 'arrowleft' || k === 'a') move(-1);
      else if (k === 'arrowright' || k === 'd') move(1);
      else if (k === 'arrowup' || k === 'w' || k === 'x') turn();
      else if (k === ' ') hardDrop();
      else if (k === 'arrowdown' || k === 's') soft.current = true;
      else return;
      e.preventDefault();
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key.toLowerCase() === 's') soft.current = false;
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onUp);
    };
  }, []);

  useLoop((dt) => {
    const st = s.current;
    st.flash = Math.max(0, st.flash - dt * 3);
    st.hearts = st.hearts.filter((h) => (h.life -= dt * 0.9) > 0);
    st.hearts.forEach((h) => (h.y += h.vy * dt));
    if (st.alive) {
      const resting = !fits(st.grid, st.piece, 0, 1);
      if (resting) {
        st.lock += dt;
        if (st.lock > 0.45) lockPiece();
      } else {
        st.acc += dt;
        const step = soft.current ? Math.min(0.04, gravity(st.level)) : gravity(st.level);
        while (st.acc >= step && fits(st.grid, st.piece, 0, 1)) {
          st.acc -= step;
          st.piece = { ...st.piece, y: st.piece.y + 1 };
          if (soft.current) st.score += 1;
        }
      }
    }
    paint();
  }, true);

  // Gesten: tippen = drehen, seitlich ziehen = schieben, schnell nach unten = fallen lassen
  const onDown = (e: RPointerEvent) => {
    touch.current = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false, id: e.pointerId };
  };
  const onMove = (e: RPointerEvent) => {
    const t = touch.current;
    if (!t || t.id !== e.pointerId) return;
    const dx = e.clientX - t.x;
    const dy = e.clientY - t.y;
    if (Math.abs(dx) > 26) {
      move(dx > 0 ? 1 : -1);
      t.x = e.clientX;
      t.moved = true;
    } else if (dy > 26) {
      soft.current = true;
      t.moved = true;
    }
  };
  const onUp = (e: RPointerEvent) => {
    const t = touch.current;
    soft.current = false;
    touch.current = null;
    if (!t) return;
    const dy = e.clientY - t.y;
    const fast = performance.now() - t.t < 260;
    if (fast && dy > 60) hardDrop();
    else if (!t.moved) turn();
  };

  const btn = (label: string, symbol: string, fn: () => void, hold = false) => (
    <button
      className="t-btn"
      aria-label={label}
      onPointerDown={(e) => {
        e.preventDefault();
        if (hold) soft.current = true;
        else fn();
      }}
      onPointerUp={() => hold && (soft.current = false)}
      onPointerLeave={() => hold && (soft.current = false)}
    >
      {symbol}
    </button>
  );

  return (
    <div className="g-col fill">
      <div className="canvas-wrap" ref={wrapRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <canvas ref={canvasRef} className="game-canvas" />
      </div>
      <div className="t-pad">
        {btn('Links', '◀', () => move(-1))}
        {btn('Drehen', '⟳', turn)}
        {btn('Rechts', '▶', () => move(1))}
        {btn('Schneller', '▼', () => {}, true)}
        {btn('Fallen lassen', '⤓', hardDrop)}
      </div>
    </div>
  );
}
