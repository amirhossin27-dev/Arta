import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { buzz, sfx, useFitCanvas, useLoop } from './engine';
import type { GameProps } from './types';

const COLS = 15;
const ROWS = 19;
const C = 20;
const W = COLS * C;
const H = ROWS * C;

// Game-Boy-Palette
const LCD = { bg: '#9bbc0f', grid: '#8bac0f', mid: '#306230', dark: '#0f380f' };

const HEART = ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'];

type Dir = 'up' | 'down' | 'left' | 'right';
const VEC: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const OPPOSITE: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };
const KEYS: Record<string, Dir> = {
  arrowup: 'up',
  w: 'up',
  arrowdown: 'down',
  s: 'down',
  arrowleft: 'left',
  a: 'left',
  arrowright: 'right',
  d: 'right',
};

interface Pt {
  x: number;
  y: number;
}

interface SnakeState {
  snake: Pt[];
  dir: Dir;
  queue: Dir[];
  food: Pt;
  acc: number;
  interval: number;
  started: boolean;
  alive: boolean;
  score: number;
  blink: number;
}

function placeFood(snake: Pt[]): Pt {
  const free: Pt[] = [];
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (!snake.some((p) => p.x === x && p.y === y)) free.push({ x, y });
  return free[Math.floor(Math.random() * free.length)];
}

function fresh(): SnakeState {
  const y = Math.floor(ROWS / 2);
  const snake = [
    { x: 5, y },
    { x: 4, y },
    { x: 3, y },
  ];
  return { snake, dir: 'right', queue: [], food: placeFood(snake), acc: 0, interval: 0.16, started: false, alive: true, score: 0, blink: 0 };
}

export function Snake({ best, onEnd }: GameProps) {
  const s = useRef<SnakeState>(fresh());
  const [score, setScore] = useState(0);
  const [started, setStarted] = useState(false);
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null);

  const { wrapRef, canvasRef, paint } = useFitCanvas(W, H, (ctx) => {
    const st = s.current;
    ctx.fillStyle = LCD.bg;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = LCD.grid;
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) ctx.fillRect(x * C + C / 2 - 1, y * C + C / 2 - 1, 2, 2);

    // Herz in Pixeln
    const px = C / 8;
    ctx.fillStyle = LCD.dark;
    HEART.forEach((row, ry) =>
      [...row].forEach((ch, rx) => {
        if (ch === 'X') ctx.fillRect(st.food.x * C + px * (rx + 0.5), st.food.y * C + px * (ry + 1), px, px);
      }),
    );

    if (!st.alive && Math.floor(st.blink * 8) % 2 === 1) return;
    st.snake.forEach((p, i) => {
      ctx.fillStyle = i === 0 ? LCD.dark : LCD.mid;
      ctx.fillRect(p.x * C + 1.5, p.y * C + 1.5, C - 3, C - 3);
    });
    // Augen
    const head = st.snake[0];
    const [dx, dy] = VEC[st.dir];
    ctx.fillStyle = LCD.bg;
    const cx = head.x * C + C / 2 + dx * 4;
    const cy = head.y * C + C / 2 + dy * 4;
    ctx.fillRect(cx - 1.5 + dy * 4, cy - 1.5 + dx * 4, 3, 3);
    ctx.fillRect(cx - 1.5 - dy * 4, cy - 1.5 - dx * 4, 3, 3);
  });

  const turn = (d: Dir) => {
    const st = s.current;
    if (!st.alive) return;
    if (!st.started) {
      st.started = true;
      setStarted(true);
    }
    const last = st.queue[st.queue.length - 1] ?? st.dir;
    if (d === last || d === OPPOSITE[last] || st.queue.length >= 2) return;
    st.queue.push(d);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const d = KEYS[e.key.toLowerCase()];
      if (!d) return;
      e.preventDefault();
      turn(d);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const tick = () => {
    const st = s.current;
    st.dir = st.queue.shift() ?? st.dir;
    const [dx, dy] = VEC[st.dir];
    const head = { x: st.snake[0].x + dx, y: st.snake[0].y + dy };
    const eats = head.x === st.food.x && head.y === st.food.y;
    const body = eats ? st.snake : st.snake.slice(0, -1);
    if (head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS || body.some((p) => p.x === head.x && p.y === head.y)) {
      st.alive = false;
      sfx.miss();
      buzz(120);
      window.setTimeout(() => onEnd({ score: st.score }), 1100);
      return;
    }
    st.snake = [head, ...body];
    if (eats) {
      st.score++;
      setScore(st.score);
      st.interval = Math.max(0.07, st.interval - 0.005);
      st.food = placeFood(st.snake);
      sfx.eat();
      buzz(15);
    }
  };

  useLoop((dt) => {
    const st = s.current;
    if (!st.alive) {
      st.blink += dt;
      paint();
      return;
    }
    if (!st.started) return;
    st.acc += dt;
    while (st.acc >= st.interval && st.alive) {
      st.acc -= st.interval;
      tick();
    }
    paint();
  }, true);

  // Wischen: schon während der Bewegung abbiegen, damit es sich direkt anfühlt.
  const onDown = (e: RPointerEvent) => {
    swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const onMove = (e: RPointerEvent) => {
    const sw = swipe.current;
    if (!sw || sw.id !== e.pointerId) return;
    const dx = e.clientX - sw.x;
    const dy = e.clientY - sw.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;
    turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
    swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const onUp = () => {
    swipe.current = null;
  };

  const pad = (d: Dir, label: string, symbol: string) => (
    <button
      className={`dpad-btn dpad-${d}`}
      onPointerDown={(e) => {
        e.preventDefault();
        turn(d);
      }}
      aria-label={label}
    >
      {symbol}
    </button>
  );

  return (
    <div className="g-col fill">
      <div className="score-strip lcd">
        <span>❤ {String(score).padStart(3, '0')}</span>
        <span>🏆 {best !== undefined ? String(best).padStart(3, '0') : '---'}</span>
      </div>
      <div className="canvas-wrap lcd-frame" ref={wrapRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <canvas ref={canvasRef} className="game-canvas" />
        {!started && (
          <div className="canvas-overlay snake-start">
            <span className="lcd-text">Wische oder tippe einen Pfeil ▶</span>
          </div>
        )}
      </div>
      <div className="dpad">
        {pad('up', 'Hoch', '▲')}
        {pad('left', 'Links', '◀')}
        {pad('right', 'Rechts', '▶')}
        {pad('down', 'Runter', '▼')}
      </div>
    </div>
  );
}
