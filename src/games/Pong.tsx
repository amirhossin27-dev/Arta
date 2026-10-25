import { useEffect, useRef, type PointerEvent as RPointerEvent } from 'react';
import { buzz, clamp, roundRect, sfx, useFitCanvas, useLoop } from './engine';
import { otherSide, type Side } from './logic';
import type { GameProps } from './types';

const W = 300;
const H = 500;
const PW = 66;
const PH = 10;
const R = 7;
const WIN = 5;
const PAD_Y: Record<Side, number> = { p1: H - 30 - PH, p2: 30 };
const START_SPEED = 250;
const MAX_SPEED = 640;

interface PongState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  pad: Record<Side, number>;
  target: Record<Side, number>;
  score: Record<Side, number>;
  serveIn: number;
  serveTo: Side;
  cpuErr: number;
  over: boolean;
}

function fresh(serveTo: Side): PongState {
  return {
    x: W / 2,
    y: H / 2,
    vx: 0,
    vy: 0,
    speed: START_SPEED,
    pad: { p1: W / 2, p2: W / 2 },
    target: { p1: W / 2, p2: W / 2 },
    score: { p1: 0, p2: 0 },
    serveIn: 1.4,
    serveTo,
    cpuErr: 0,
    over: false,
  };
}

export function Pong({ p1, p2, starter, onEnd }: GameProps) {
  const s = useRef<PongState>(fresh(otherSide(starter)));
  const pointers = useRef(new Map<number, Side>());
  const keys = useRef(new Set<string>());
  const players = { p1, p2 };

  const { wrapRef, canvasRef, paint, toLogical } = useFitCanvas(W, H, (ctx) => {
    const st = s.current;
    ctx.fillStyle = '#0d0717';
    ctx.fillRect(0, 0, W, H);

    // Mittellinie
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    for (let x = 6; x < W; x += 18) ctx.fillRect(x, H / 2 - 1.5, 9, 3);

    // Spielstand (oben gedreht für die Person gegenüber)
    ctx.font = '800 64px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,255,255,0.13)';
    ctx.fillText(String(st.score.p1), W / 2, H / 2 + 62);
    ctx.save();
    ctx.translate(W / 2, H / 2 - 62);
    ctx.rotate(Math.PI);
    ctx.fillText(String(st.score.p2), 0, 0);
    ctx.restore();

    // Wer wo sitzt
    ctx.font = '22px serif';
    ctx.globalAlpha = 0.85;
    ctx.fillText(p1.emoji, 18, H - 12);
    ctx.save();
    ctx.translate(W - 18, 12);
    ctx.rotate(Math.PI);
    ctx.fillText(p2.emoji, 0, 0);
    ctx.restore();
    ctx.globalAlpha = 1;

    if (st.serveIn > 0 && st.score.p1 + st.score.p2 === 0) {
      ctx.font = '700 15px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText(`${p1.name}: Finger auf deine Hälfte 👇`, W / 2, H - 90);
      if (!p2.cpu) {
        ctx.save();
        ctx.translate(W / 2, 90);
        ctx.rotate(Math.PI);
        ctx.fillText(`${p2.name}: Finger auf deine Hälfte 👇`, 0, 0);
        ctx.restore();
      }
    }

    // Schläger
    for (const side of ['p1', 'p2'] as const) {
      ctx.shadowColor = players[side].color;
      ctx.shadowBlur = 14;
      ctx.fillStyle = players[side].color;
      roundRect(ctx, st.pad[side] - PW / 2, PAD_Y[side], PW, PH, 5);
    }
    ctx.shadowBlur = 0;

    // Ball als Herz
    ctx.font = `${R * 2.6}px serif`;
    ctx.fillText('💗', st.x, st.y + 1);
  });

  useEffect(() => {
    const down = (e: KeyboardEvent) => keys.current.add(e.key.toLowerCase());
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const bounce = (side: Side) => {
    const st = s.current;
    const off = clamp((st.x - st.pad[side]) / (PW / 2), -1, 1);
    const ang = off * 1.0;
    st.speed = Math.min(st.speed * 1.07, MAX_SPEED);
    st.vx = st.speed * Math.sin(ang);
    st.vy = (side === 'p1' ? -1 : 1) * st.speed * Math.cos(ang);
    st.cpuErr = (Math.random() - 0.5) * PW * 0.9;
    sfx.bounce();
    buzz(8);
  };

  const scored = (side: Side) => {
    const st = s.current;
    st.score[side]++;
    sfx.point();
    buzz(40);
    if (st.score[side] >= WIN) {
      st.over = true;
      window.setTimeout(() => onEnd({ winner: side }), 900);
      return;
    }
    st.x = W / 2;
    st.y = H / 2;
    st.vx = 0;
    st.vy = 0;
    st.speed = START_SPEED;
    st.serveIn = 0.9;
    st.serveTo = otherSide(side);
  };

  useLoop((dt) => {
    const st = s.current;
    if (st.over) return;

    // Tastatur (Computer): ←/→ unten, A/D oben
    const k = keys.current;
    const kb = 420 * dt;
    if (k.has('arrowleft')) st.target.p1 -= kb;
    if (k.has('arrowright')) st.target.p1 += kb;
    if (!p2.cpu && k.has('a')) st.target.p2 -= kb;
    if (!p2.cpu && k.has('d')) st.target.p2 += kb;

    if (p2.cpu) {
      const chasing = st.vy < 0 && st.y < H * 0.85;
      st.target.p2 = chasing ? st.x + st.cpuErr : W / 2;
    }
    for (const side of ['p1', 'p2'] as const) {
      st.target[side] = clamp(st.target[side], PW / 2, W - PW / 2);
      const maxMove = (players[side].cpu ? 200 + st.score.p1 * 18 : 1600) * dt;
      st.pad[side] += clamp(st.target[side] - st.pad[side], -maxMove, maxMove);
    }

    if (st.serveIn > 0) {
      st.serveIn -= dt;
      if (st.serveIn <= 0) {
        const ang = (Math.random() - 0.5) * 0.8;
        st.vx = st.speed * Math.sin(ang);
        st.vy = (st.serveTo === 'p1' ? 1 : -1) * st.speed * Math.cos(ang);
      }
      paint();
      return;
    }

    const steps = Math.ceil((st.speed * dt) / 3);
    for (let i = 0; i < steps; i++) {
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
      const hitsX = (side: Side) => Math.abs(st.x - st.pad[side]) <= PW / 2 + R;
      if (st.vy > 0 && st.y + R >= PAD_Y.p1 && st.y - R <= PAD_Y.p1 + PH && hitsX('p1')) bounce('p1');
      if (st.vy < 0 && st.y - R <= PAD_Y.p2 + PH && st.y + R >= PAD_Y.p2 && hitsX('p2')) bounce('p2');
      if (st.y > H + R * 2) {
        scored('p2');
        break;
      }
      if (st.y < -R * 2) {
        scored('p1');
        break;
      }
    }
    paint();
  }, true);

  const onDown = (e: RPointerEvent) => {
    const { x, y } = toLogical(e.clientX, e.clientY);
    const side: Side = p2.cpu || y > H / 2 ? 'p1' : 'p2';
    pointers.current.set(e.pointerId, side);
    s.current.target[side] = x;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: RPointerEvent) => {
    const side = pointers.current.get(e.pointerId);
    if (!side) return;
    s.current.target[side] = toLogical(e.clientX, e.clientY).x;
  };
  const onUp = (e: RPointerEvent) => {
    pointers.current.delete(e.pointerId);
  };

  return (
    <div className="canvas-wrap" ref={wrapRef}>
      <canvas ref={canvasRef} className="game-canvas" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} />
    </div>
  );
}
