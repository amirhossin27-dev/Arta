import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { buzz, clamp, sfx, tone, useFitCanvas, useLoop } from './engine';
import type { GameProps } from './types';

const W = 240;
const H = 320;
const PLAYER_Y = 296;
const COLS = 8;
const ROWS = 5;
const PX = 2; // Pixelgröße der Sprites

// Zwei Bilder pro Invader-Art (Animation), X = Pixel
const SPRITES = [
  [
    ['..X..X..', '...XX...', '..XXXX..', '.XX..XX.', 'XXXXXXXX', '.X.XX.X.', 'X......X'],
    ['..X..X..', 'X..XX..X', 'X.XXXX.X', 'XXX..XXX', 'XXXXXXXX', '..X..X..', '.X....X.'],
  ],
  [
    ['..X....X..', '...X..X...', '..XXXXXX..', '.XX.XX.XX.', 'XXXXXXXXXX', 'X.XXXXXX.X', 'X.X....X.X', '...XX.XX..'],
    ['..X....X..', 'X..X..X..X', 'X.XXXXXX.X', 'XXX.XX.XXX', 'XXXXXXXXXX', '.XXXXXXXX.', '..X....X..', '.X......X.'],
  ],
  [
    ['...XXXX...', '.XXXXXXXX.', 'XXXXXXXXXX', 'XXX.XX.XXX', 'XXXXXXXXXX', '..XX..XX..', '.XX.XX.XX.', 'XX......XX'],
    ['...XXXX...', '.XXXXXXXX.', 'XXXXXXXXXX', 'XXX.XX.XXX', 'XXXXXXXXXX', '...X..X...', '..X.XX.X..', '.X......X.'],
  ],
];
const ROW_KIND = [0, 1, 1, 2, 2];
const ROW_POINTS = [30, 20, 20, 10, 10];
const ROW_COLOR = ['#ff6b9d', '#c77dff', '#c77dff', '#4fc3f7', '#4fc3f7'];
const SHIP = ['....X....', '...XXX...', '.XXXXXXX.', 'XXXXXXXXX', 'XXXXXXXXX'];
const HEART = ['.X.X.', 'XXXXX', '.XXX.', '..X..'];

interface Shot {
  x: number;
  y: number;
}

interface InvState {
  aliens: { r: number; c: number; alive: boolean }[];
  ox: number;
  oy: number;
  dir: number;
  stepAcc: number;
  frame: number;
  px: number;
  target: number | null;
  shots: Shot[];
  bombs: Shot[];
  fireAcc: number;
  bombAcc: number;
  bunkers: boolean[][];
  ufo: { x: number; dir: number } | null;
  ufoAcc: number;
  score: number;
  lives: number;
  wave: number;
  hitFlash: number;
  alive: boolean;
  pause: number;
  pops: { x: number; y: number; life: number; text?: string }[];
}

const BUNKER_W = 16;
const BUNKER_H = 8;
const BUNKER_CELL = 2;
const BUNKER_Y = 260;
const bunkerX = (k: number) => 30 + k * 70;

function sprite(ctx: CanvasRenderingContext2D, rows: string[], x: number, y: number, color: string, px = PX) {
  ctx.fillStyle = color;
  rows.forEach((row, r) => [...row].forEach((ch, c) => ch === 'X' && ctx.fillRect(x + c * px, y + r * px, px, px)));
}

function newBunkers(): boolean[][] {
  return Array.from({ length: 3 }, () =>
    Array.from({ length: BUNKER_W * BUNKER_H }, (_, i) => {
      const r = Math.floor(i / BUNKER_W);
      const c = i % BUNKER_W;
      // Bogenform: unten in der Mitte offen, oben abgerundet
      if (r === 0 && (c < 2 || c > BUNKER_W - 3)) return false;
      if (r >= BUNKER_H - 3 && c >= 5 && c < BUNKER_W - 5) return false;
      return true;
    }),
  );
}

function wave(n: number, prev?: InvState): InvState {
  return {
    aliens: Array.from({ length: ROWS * COLS }, (_, i) => ({ r: Math.floor(i / COLS), c: i % COLS, alive: true })),
    ox: 16,
    oy: 40 + Math.min(n - 1, 4) * 8,
    dir: 1,
    stepAcc: 0,
    frame: 0,
    px: prev?.px ?? W / 2,
    target: null,
    shots: [],
    bombs: [],
    fireAcc: 0,
    bombAcc: 0,
    bunkers: prev && n > 1 ? prev.bunkers : newBunkers(),
    ufo: null,
    ufoAcc: 0,
    score: prev?.score ?? 0,
    lives: prev?.lives ?? 3,
    wave: n,
    hitFlash: 0,
    alive: true,
    pause: 1,
    pops: prev?.pops ?? [],
  };
}

const CELL_W = 24;
const CELL_H = 20;
const alienX = (st: InvState, c: number) => st.ox + c * CELL_W;
const alienY = (st: InvState, r: number) => st.oy + r * CELL_H;

export function Invaders({ best, onEnd }: GameProps) {
  const s = useRef<InvState>(wave(1));
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const keys = useRef({ left: false, right: false });

  const { wrapRef, canvasRef, paint, toLogical } = useFitCanvas(W, H, (ctx) => {
    const st = s.current;
    ctx.fillStyle = '#0b0718';
    ctx.fillRect(0, 0, W, H);
    // Sterne
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    for (let k = 0; k < 40; k++) ctx.fillRect((k * 73) % W, (k * 131) % (H - 40), 1, 1);
    for (const a of st.aliens) {
      if (!a.alive) continue;
      const rows = SPRITES[ROW_KIND[a.r]][st.frame];
      const wpx = rows[0].length * PX;
      sprite(ctx, rows, alienX(st, a.c) + (CELL_W - wpx) / 2, alienY(st, a.r), ROW_COLOR[a.r]);
    }
    if (st.ufo) {
      ctx.fillStyle = '#ff5d5d';
      ctx.beginPath();
      ctx.ellipse(st.ufo.x, 24, 13, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffd1dc';
      ctx.beginPath();
      ctx.ellipse(st.ufo.x, 20, 6, 4, 0, Math.PI, 0);
      ctx.fill();
    }
    // Bunker
    ctx.fillStyle = '#5ee6a8';
    st.bunkers.forEach((b, k) => b.forEach((on, i) => on && ctx.fillRect(bunkerX(k) + (i % BUNKER_W) * BUNKER_CELL, BUNKER_Y + Math.floor(i / BUNKER_W) * BUNKER_CELL, BUNKER_CELL, BUNKER_CELL)));
    // Schüsse
    for (const sh of st.shots) sprite(ctx, HEART, sh.x - 5, sh.y - 4, '#ff6b9d', 2);
    ctx.fillStyle = '#ffe066';
    for (const b of st.bombs) {
      ctx.fillRect(b.x - 1, b.y - 4, 2, 3);
      ctx.fillRect(b.x, b.y - 1, 2, 3);
    }
    // Spieler
    if (st.alive && (st.hitFlash <= 0 || Math.floor(st.hitFlash * 10) % 2 === 0)) sprite(ctx, SHIP, st.px - 9, PLAYER_Y - 5, '#7cf0ff');
    ctx.fillStyle = 'rgba(124,240,255,0.25)';
    ctx.fillRect(0, PLAYER_Y + 8, W, 1);
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    for (const p of st.pops) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = '#fff';
      ctx.fillText(p.text ?? '✦', p.x, p.y);
    }
    ctx.globalAlpha = 1;
    if (st.pause > 0 && st.alive) {
      ctx.fillStyle = '#f8ecff';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(`Welle ${st.wave}`, W / 2, H / 2);
    }
  });

  const hitBunker = (x: number, y: number): boolean => {
    const st = s.current;
    for (let k = 0; k < 3; k++) {
      const bx = Math.floor((x - bunkerX(k)) / BUNKER_CELL);
      const by = Math.floor((y - BUNKER_Y) / BUNKER_CELL);
      if (bx < 0 || bx >= BUNKER_W || by < 0 || by >= BUNKER_H) continue;
      const i = by * BUNKER_W + bx;
      if (!st.bunkers[k][i]) continue;
      // Ein kleines Loch sprengen
      for (const d of [0, -1, 1, -BUNKER_W, BUNKER_W]) if (i + d >= 0 && i + d < st.bunkers[k].length) st.bunkers[k][i + d] = false;
      return true;
    }
    return false;
  };

  const loseLife = () => {
    const st = s.current;
    st.lives--;
    setLives(st.lives);
    st.hitFlash = 1.2;
    st.bombs = [];
    sfx.miss();
    buzz([60, 40, 100]);
    if (st.lives <= 0) gameOver();
  };

  const gameOver = () => {
    const st = s.current;
    if (!st.alive) return;
    st.alive = false;
    sfx.lose();
    window.setTimeout(() => onEnd({ score: st.score }), 1300);
  };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') keys.current.left = true;
      else if (e.key === 'ArrowRight' || e.key === 'd') keys.current.right = true;
      else return;
      e.preventDefault();
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') keys.current.left = false;
      if (e.key === 'ArrowRight' || e.key === 'd') keys.current.right = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useLoop((dt) => {
    let st = s.current;
    st.pops = st.pops.filter((p) => (p.life -= dt * 1.4) > 0);
    st.pops.forEach((p) => (p.y -= 20 * dt));
    if (!st.alive) return paint();
    if (st.pause > 0) {
      st.pause -= dt;
      return paint();
    }
    st.hitFlash = Math.max(0, st.hitFlash - dt);

    // Spieler folgt dem Finger
    const speed = 160;
    if (st.target !== null) st.px += clamp(st.target - st.px, -speed * dt * 1.6, speed * dt * 1.6);
    if (keys.current.left) st.px -= speed * dt;
    if (keys.current.right) st.px += speed * dt;
    st.px = clamp(st.px, 10, W - 10);

    // Automatisch Herzen abfeuern
    st.fireAcc += dt;
    if (st.fireAcc > 0.42 && st.shots.length < 2 && st.hitFlash <= 0.6) {
      st.fireAcc = 0;
      st.shots.push({ x: st.px, y: PLAYER_Y - 8 });
      tone(980, 25, 'square', 0.025, 1400);
    }
    st.shots.forEach((sh) => (sh.y -= 260 * dt));

    // Invader marschieren – je weniger, desto schneller
    const alive = st.aliens.filter((a) => a.alive);
    const interval = Math.max(0.05, (0.08 + (alive.length / (ROWS * COLS)) * 0.6) * Math.pow(0.88, st.wave - 1));
    st.stepAcc += dt;
    if (st.stepAcc >= interval) {
      st.stepAcc = 0;
      st.frame = 1 - st.frame;
      const xs = alive.map((a) => alienX(st, a.c));
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs) + CELL_W;
      if ((st.dir > 0 && maxX + 4 > W) || (st.dir < 0 && minX - 4 < 0)) {
        st.dir *= -1;
        st.oy += 8;
      } else st.ox += st.dir * 4;
      tone(110 + st.frame * 20, 40, 'square', 0.02);
    }

    // Bomben
    st.bombAcc += dt;
    if (st.bombAcc > Math.max(0.35, 1.1 - st.wave * 0.1) && alive.length) {
      st.bombAcc = 0;
      const cols = [...new Set(alive.map((a) => a.c))];
      const c = cols[Math.floor(Math.random() * cols.length)];
      const low = alive.filter((a) => a.c === c).reduce((x, y) => (y.r > x.r ? y : x));
      st.bombs.push({ x: alienX(st, c) + CELL_W / 2, y: alienY(st, low.r) + 16 });
    }
    st.bombs.forEach((b) => (b.y += (90 + st.wave * 8) * dt));

    // UFO
    st.ufoAcc += dt;
    if (!st.ufo && st.ufoAcc > 18) {
      st.ufoAcc = 0;
      const dir = Math.random() < 0.5 ? 1 : -1;
      st.ufo = { x: dir > 0 ? -14 : W + 14, dir };
    }
    if (st.ufo) {
      st.ufo.x += st.ufo.dir * 50 * dt;
      if (st.ufo.x < -20 || st.ufo.x > W + 20) st.ufo = null;
    }

    // Treffer
    for (const sh of st.shots) {
      if (sh.y < 0) {
        sh.y = -99;
        continue;
      }
      if (hitBunker(sh.x, sh.y)) {
        sh.y = -99;
        continue;
      }
      if (st.ufo && Math.abs(sh.x - st.ufo.x) < 13 && Math.abs(sh.y - 22) < 7) {
        const pts = [50, 100, 150][Math.floor(Math.random() * 3)];
        st.score += pts;
        st.pops.push({ x: st.ufo.x, y: 22, life: 1.2, text: `+${pts}` });
        st.ufo = null;
        sh.y = -99;
        sfx.win();
        continue;
      }
      for (const a of alive) {
        if (!a.alive) continue;
        const ax = alienX(st, a.c);
        const ay = alienY(st, a.r);
        if (sh.x > ax + 2 && sh.x < ax + CELL_W - 2 && sh.y > ay && sh.y < ay + 16) {
          a.alive = false;
          sh.y = -99;
          st.score += ROW_POINTS[a.r];
          st.pops.push({ x: ax + CELL_W / 2, y: ay + 8, life: 0.6 });
          sfx.brick();
          buzz(8);
          break;
        }
      }
    }
    st.shots = st.shots.filter((sh) => sh.y > -50);
    for (const b of st.bombs) {
      if (b.y > H) b.y = 9999;
      else if (hitBunker(b.x, b.y)) b.y = 9999;
      else if (st.hitFlash <= 0 && Math.abs(b.x - st.px) < 9 && b.y > PLAYER_Y - 5 && b.y < PLAYER_Y + 6) {
        b.y = 9999;
        loseLife();
      }
    }
    st.bombs = st.bombs.filter((b) => b.y < 9000);
    setScore(st.score);

    // Invader zerstören die Bunker, wenn sie tief kommen – und unten ist Schluss
    for (const a of st.aliens) {
      if (!a.alive) continue;
      const ay = alienY(st, a.r) + 14;
      if (ay >= BUNKER_Y) for (let x = alienX(st, a.c); x < alienX(st, a.c) + CELL_W; x += 2) hitBunker(x, ay);
      if (ay >= PLAYER_Y - 4) {
        gameOver();
        break;
      }
    }

    if (st.alive && !st.aliens.some((a) => a.alive)) {
      st = wave(st.wave + 1, st);
      s.current = st;
      sfx.point();
    }
    paint();
  }, true);

  const point = (e: RPointerEvent) => {
    s.current.target = toLogical(e.clientX, e.clientY).x;
  };

  return (
    <div className="g-col fill">
      <div className="score-strip">
        <span>⭐ {score}</span>
        <span>{'❤️'.repeat(Math.max(0, lives))}</span>
        <span>🏆 {best ?? '–'}</span>
      </div>
      <div
        className="canvas-wrap"
        ref={wrapRef}
        onPointerDown={point}
        onPointerMove={(e) => (e.buttons || e.pointerType === 'touch') && point(e)}
        onPointerUp={() => (s.current.target = null)}
        onPointerCancel={() => (s.current.target = null)}
      >
        <canvas ref={canvasRef} className="game-canvas" />
      </div>
      <p className="game-hint">Finger aufs Feld legen und ziehen – geschossen wird von selbst</p>
    </div>
  );
}
