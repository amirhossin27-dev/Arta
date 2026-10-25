import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { buzz, clamp, roundRect, sfx, useFitCanvas, useLoop } from './engine';
import type { GameProps } from './types';

const W = 300;
const H = 440;
const COLS = 8;
const ROWS = 6;
const BW = 33;
const BH = 12;
const GAP = 3;
const LEFT = (W - (COLS * BW + (COLS - 1) * GAP)) / 2;
const TOP = 58;
const PW = 58;
const PH = 10;
const PAD_Y = H - 34;
const R = 5;
const LIVES = 3;

const ROW_COLORS = ['#ff4f81', '#ff6f61', '#ff9a4d', '#ffc23d', '#8ed86b', '#4fc3f7'];
const ROW_POINTS = [7, 7, 5, 5, 3, 1];

interface BreakoutState {
  bricks: boolean[];
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  stuck: boolean;
  pad: number;
  target: number;
  score: number;
  lives: number;
  level: number;
  over: boolean;
  flash: number;
}

const levelSpeed = (level: number) => 230 + (level - 1) * 30;

function fresh(): BreakoutState {
  return {
    bricks: Array(COLS * ROWS).fill(true),
    x: W / 2,
    y: PAD_Y - R,
    vx: 0,
    vy: 0,
    speed: levelSpeed(1),
    stuck: true,
    pad: W / 2,
    target: W / 2,
    score: 0,
    lives: LIVES,
    level: 1,
    over: false,
    flash: 0,
  };
}

export function Breakout({ best, onEnd }: GameProps) {
  const s = useRef<BreakoutState>(fresh());
  const keys = useRef(new Set<string>());
  const [, setTick] = useState(0);

  const { wrapRef, canvasRef, paint, toLogical } = useFitCanvas(W, H, (ctx) => {
    const st = s.current;
    ctx.fillStyle = '#0d0717';
    ctx.fillRect(0, 0, W, H);
    if (st.flash > 0) {
      ctx.fillStyle = `rgba(255,79,129,${st.flash * 0.35})`;
      ctx.fillRect(0, 0, W, H);
    }

    // Anzeige oben
    ctx.font = '800 15px ui-monospace, Menlo, monospace';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fbe9f0';
    ctx.textAlign = 'left';
    ctx.fillText(String(st.score).padStart(4, '0'), 10, 20);
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(251,233,240,0.6)';
    ctx.fillText(`LEVEL ${st.level}`, W / 2, 20);
    ctx.textAlign = 'right';
    ctx.font = '14px serif';
    ctx.fillText('❤️'.repeat(Math.max(st.lives, 0)), W - 8, 20);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(0, 38, W, 1);

    // Steine
    st.bricks.forEach((alive, i) => {
      if (!alive) return;
      const row = Math.floor(i / COLS);
      const col = i % COLS;
      const bx = LEFT + col * (BW + GAP);
      const by = TOP + row * (BH + GAP);
      ctx.fillStyle = ROW_COLORS[row];
      roundRect(ctx, bx, by, BW, BH, 3);
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(bx + 3, by + 2, BW - 6, 2);
    });

    // Schläger
    ctx.shadowColor = '#ff5dc8';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#ff7ad1';
    roundRect(ctx, st.pad - PW / 2, PAD_Y, PW, PH, 5);

    // Ball
    ctx.shadowColor = '#ffffff';
    ctx.shadowBlur = 10;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(st.x, st.y, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    if (st.stuck && !st.over) {
      ctx.textAlign = 'center';
      ctx.font = '700 14px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(251,233,240,0.8)';
      ctx.fillText(st.level > 1 && st.bricks.every(Boolean) ? `Level ${st.level}! Tippen zum Abschlag` : 'Tippen zum Abschlag', W / 2, H / 2 + 60);
    }
  });

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      keys.current.add(k);
      if (k === ' ' || k === 'arrowup') {
        e.preventDefault();
        launch();
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const launch = () => {
    const st = s.current;
    if (!st.stuck || st.over) return;
    st.stuck = false;
    const ang = (Math.random() - 0.5) * 0.7;
    st.vx = st.speed * Math.sin(ang);
    st.vy = -st.speed * Math.cos(ang);
    sfx.tap();
  };

  const loseLife = () => {
    const st = s.current;
    st.lives--;
    st.flash = 1;
    sfx.miss();
    buzz(90);
    if (st.lives <= 0) {
      st.over = true;
      window.setTimeout(() => onEnd({ score: st.score }), 1000);
    } else {
      st.stuck = true;
    }
    setTick((t) => t + 1);
  };

  const nextLevel = () => {
    const st = s.current;
    st.score += 25 * st.level;
    st.level++;
    st.bricks = Array(COLS * ROWS).fill(true);
    st.speed = levelSpeed(st.level);
    st.stuck = true;
    sfx.win();
    buzz(40);
  };

  const step = (dt: number) => {
    const st = s.current;
    const steps = Math.ceil((st.speed * dt) / 2.5);
    for (let n = 0; n < steps; n++) {
      st.x += (st.vx * dt) / steps;
      st.y += (st.vy * dt) / steps;
      if (st.x < R) {
        st.x = R;
        st.vx = Math.abs(st.vx);
        sfx.wall();
      } else if (st.x > W - R) {
        st.x = W - R;
        st.vx = -Math.abs(st.vx);
        sfx.wall();
      }
      if (st.y < 40 + R) {
        st.y = 40 + R;
        st.vy = Math.abs(st.vy);
        sfx.wall();
      }
      // Schläger
      if (st.vy > 0 && st.y + R >= PAD_Y && st.y - R <= PAD_Y + PH && Math.abs(st.x - st.pad) <= PW / 2 + R) {
        const off = clamp((st.x - st.pad) / (PW / 2), -1, 1);
        const ang = off * 1.05;
        st.vx = st.speed * Math.sin(ang);
        st.vy = -st.speed * Math.cos(ang);
        st.y = PAD_Y - R;
        sfx.bounce();
      }
      // Steine
      for (let i = 0; i < st.bricks.length; i++) {
        if (!st.bricks[i]) continue;
        const row = Math.floor(i / COLS);
        const bx = LEFT + (i % COLS) * (BW + GAP);
        const by = TOP + row * (BH + GAP);
        if (st.x + R <= bx || st.x - R >= bx + BW || st.y + R <= by || st.y - R >= by + BH) continue;
        const ox = Math.min(st.x + R - bx, bx + BW - (st.x - R));
        const oy = Math.min(st.y + R - by, by + BH - (st.y - R));
        if (ox < oy) st.vx = -st.vx;
        else st.vy = -st.vy;
        st.bricks[i] = false;
        st.score += ROW_POINTS[row];
        st.speed = Math.min(st.speed + 2.5, levelSpeed(st.level) + 160);
        const len = Math.hypot(st.vx, st.vy) || 1;
        st.vx = (st.vx / len) * st.speed;
        st.vy = (st.vy / len) * st.speed;
        sfx.brick();
        buzz(6);
        break;
      }
      if (st.bricks.every((b) => !b)) {
        nextLevel();
        return;
      }
      if (st.y - R > H) {
        loseLife();
        return;
      }
    }
  };

  useLoop((dt) => {
    const st = s.current;
    if (st.flash > 0) st.flash = Math.max(0, st.flash - dt * 2.5);
    const k = keys.current;
    if (k.has('arrowleft')) st.target -= 380 * dt;
    if (k.has('arrowright')) st.target += 380 * dt;
    st.target = clamp(st.target, PW / 2, W - PW / 2);
    st.pad += clamp(st.target - st.pad, -1400 * dt, 1400 * dt);
    if (!st.over) {
      if (st.stuck) {
        st.x = st.pad;
        st.y = PAD_Y - R;
      } else step(dt);
    }
    paint();
  }, true);

  // Ziehen bewegt den Schläger, kurzes Tippen schlägt ab.
  const drag = useRef({ startX: 0, moved: 0 });
  const onDown = (e: RPointerEvent) => {
    drag.current = { startX: e.clientX, moved: 0 };
    s.current.target = toLogical(e.clientX, e.clientY).x;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: RPointerEvent) => {
    if (e.pointerType !== 'mouse' && e.buttons === 0) return;
    drag.current.moved = Math.max(drag.current.moved, Math.abs(e.clientX - drag.current.startX));
    s.current.target = toLogical(e.clientX, e.clientY).x;
  };
  const onUp = () => {
    if (drag.current.moved < 14) launch();
  };

  return (
    <div className="g-col fill">
      <div className="score-strip">
        <span>👆 Ziehen &amp; tippen</span>
        <span>🏆 Rekord {best ?? '–'}</span>
      </div>
      <div className="canvas-wrap" ref={wrapRef}>
        <canvas ref={canvasRef} className="game-canvas" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} />
      </div>
    </div>
  );
}
