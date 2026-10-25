import { useEffect, useRef, useState } from 'react';
import { buzz, sfx, tone, useFitCanvas, useLoop } from './engine';
import type { GameProps } from './types';

const W = 240;
const H = 360;
const GROUND = 330;
const HX = 70;
const R = 10;
const GRAVITY = 900;
const FLAP = -270;
const PIPE_W = 40;
const SPACING = 150;
const SPEED = 110;

interface Pipe {
  x: number;
  gap: number;
  top: number;
  passed: boolean;
}

interface FlappyState {
  y: number;
  vy: number;
  started: boolean;
  alive: boolean;
  pipes: Pipe[];
  score: number;
  t: number;
  ground: number;
  wing: number;
}

const gapFor = (score: number) => Math.max(84, 108 - score * 1.2);

function newPipe(x: number, score: number): Pipe {
  const gap = gapFor(score);
  return { x, gap, top: 40 + Math.random() * (GROUND - gap - 80), passed: false };
}

const fresh = (): FlappyState => ({ y: H / 2 - 20, vy: 0, started: false, alive: true, pipes: [], score: 0, t: 0, ground: 0, wing: 0 });

function heart(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.9);
  ctx.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.8, y - r * 1.3, x, y - r * 0.45);
  ctx.bezierCurveTo(x + r * 0.8, y - r * 1.3, x + r * 1.6, y - r * 0.2, x, y + r * 0.9);
  ctx.fill();
}

export function Flappy({ best, onEnd }: GameProps) {
  const s = useRef<FlappyState>(fresh());
  const [score, setScore] = useState(0);
  const [started, setStarted] = useState(false);

  const { wrapRef, canvasRef, paint } = useFitCanvas(W, H, (ctx) => {
    const st = s.current;
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#ffb6d1');
    sky.addColorStop(1, '#ffe7c2');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    // Wolken
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (let k = 0; k < 4; k++) {
      const x = ((k * 90 - st.t * 12) % (W + 80)) + (k * 90 - st.t * 12 < 0 ? W + 80 : 0) - 40;
      const y = 50 + k * 45;
      ctx.beginPath();
      ctx.ellipse(x, y, 22, 9, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 14, y - 5, 14, 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Säulen
    for (const p of st.pipes) {
      for (const [y, h] of [
        [0, p.top],
        [p.top + p.gap, GROUND - p.top - p.gap],
      ]) {
        ctx.fillStyle = '#8e6cff';
        ctx.fillRect(p.x, y, PIPE_W, h);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(p.x + 5, y, 5, h);
      }
      ctx.fillStyle = '#6f4fe0';
      ctx.fillRect(p.x - 3, p.top - 12, PIPE_W + 6, 12);
      ctx.fillRect(p.x - 3, p.top + p.gap, PIPE_W + 6, 12);
    }
    // Boden
    ctx.fillStyle = '#7bd389';
    ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.fillStyle = '#5cb86c';
    for (let x = -((st.ground % 16) + 16); x < W; x += 16) ctx.fillRect(x, GROUND, 8, 5);
    // Herz mit Flügeln
    ctx.save();
    ctx.translate(HX, st.y);
    ctx.rotate(Math.max(-0.5, Math.min(1.1, st.vy / 420)));
    const flap = Math.sin(st.wing) * 4;
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.ellipse(-9, -3 - flap, 8, 4, -0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ff2f6d';
    heart(ctx, 0, 0, R);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(4, -3, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2b1030';
    ctx.beginPath();
    ctx.arc(4.6, -2.8, 1.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Punkte groß in der Mitte
    if (st.started) {
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = 'rgba(80,20,60,0.5)';
      ctx.lineWidth = 3;
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.strokeText(String(st.score), W / 2, 48);
      ctx.fillText(String(st.score), W / 2, 48);
    }
  });

  const flap = () => {
    const st = s.current;
    if (!st.alive) return;
    if (!st.started) {
      st.started = true;
      setStarted(true);
      st.pipes = [newPipe(W + 40, 0)];
    }
    st.vy = FLAP;
    st.wing = 0;
    tone(620, 40, 'triangle', 0.04, 880);
  };

  const crash = () => {
    const st = s.current;
    if (!st.alive) return;
    st.alive = false;
    sfx.miss();
    buzz(120);
    window.setTimeout(() => onEnd({ score: st.score }), 1100);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') {
        e.preventDefault();
        flap();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useLoop((dt) => {
    const st = s.current;
    st.t += dt;
    st.wing += dt * 18;
    if (!st.started) {
      st.y = H / 2 - 20 + Math.sin(st.t * 3) * 6;
      return paint();
    }
    st.vy += GRAVITY * dt;
    st.y += st.vy * dt;
    if (st.alive) {
      st.ground += SPEED * dt;
      for (const p of st.pipes) p.x -= SPEED * dt;
      const last = st.pipes[st.pipes.length - 1];
      if (last && last.x < W - SPACING) st.pipes.push(newPipe(last.x + SPACING, st.score));
      st.pipes = st.pipes.filter((p) => p.x > -PIPE_W - 10);
      for (const p of st.pipes) {
        if (!p.passed && p.x + PIPE_W < HX - R) {
          p.passed = true;
          st.score++;
          setScore(st.score);
          sfx.point();
        }
        const inX = HX + R * 0.8 > p.x && HX - R * 0.8 < p.x + PIPE_W;
        if (inX && (st.y - R * 0.7 < p.top || st.y + R * 0.8 > p.top + p.gap)) crash();
      }
      if (st.y - R < 0) {
        st.y = R;
        st.vy = 0;
      }
    }
    if (st.y + R > GROUND) {
      st.y = GROUND - R;
      st.vy = 0;
      crash();
    }
    paint();
  }, true);

  return (
    <div className="g-col fill">
      <div className="score-strip">
        <span>💘 {score}</span>
        <span>🏆 {best ?? '–'}</span>
      </div>
      <div
        className="canvas-wrap"
        ref={wrapRef}
        onPointerDown={(e) => {
          e.preventDefault();
          flap();
        }}
      >
        <canvas ref={canvasRef} className="game-canvas" />
        {!started && (
          <div className="canvas-overlay">
            <span className="flappy-start">Tippe zum Flattern 💘</span>
          </div>
        )}
      </div>
    </div>
  );
}
