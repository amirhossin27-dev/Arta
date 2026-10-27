import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { burst, buzz, clamp, drawParticles, heartPath, oval, outlinedText, stepParticles, tone, useFitCanvas, useLoop, useTouchLock, type Particle } from './engine';
import type { GameProps } from './types';

const W = 320;
const H = 580;
const GRAVITY = 1500;
const JUMP = -720;
const SPRING = JUMP * 1.55;
const RUN = 300;
const PW = 60;
const PH = 13;
const BODY = 15;
const STORE = 'arta.hop.v1';

export type HopKind = 'normal' | 'move' | 'break' | 'vanish';

export interface HopPlat {
  x: number;
  y: number;
  kind: HopKind;
  vx: number;
  spring?: { x: number; t: number };
  balloon?: boolean;
  broken?: number;
  gone?: number;
  squish: number;
}

interface Foe {
  x: number;
  y: number;
  t: number;
  dead?: number;
}

interface HopState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  face: 1 | -1;
  squash: number;
  cam: number;
  top: number;
  plats: HopPlat[];
  foes: Foe[];
  genY: number;
  nextFoe: number;
  balloon: number;
  alive: boolean;
  fallT: number;
  started: boolean;
  t: number;
  parts: Particle[];
  stars: { x: number; y: number; r: number }[];
}

/** Höhe in Metern */
const meters = (top: number) => Math.max(0, Math.floor(-top / 12));

/** Schwierigkeit 0…1 nach Höhe */
const diff = (y: number) => clamp(-y / 14000, 0, 1);

type Rnd = () => number;

/**
 * Plattformen bis `until` (nach oben = negativ) nachlegen. Der Abstand zwischen zwei
 * erreichbaren Plattformen bleibt immer unter der Sprunghöhe.
 */
export function hopGenerate(plats: HopPlat[], genY: number, until: number, rnd: Rnd = Math.random): number {
  let y = genY;
  while (y > until) {
    const d = diff(y);
    const gap = 34 + d * 96 + rnd() * (24 + d * 22);
    y -= Math.min(gap, 150);
    const r = rnd();
    let kind: HopKind = 'normal';
    if (r < 0.06 + d * 0.3) kind = 'move';
    else if (r < 0.08 + d * 0.42 && y < -2500) kind = 'vanish';
    const p: HopPlat = { x: 8 + rnd() * (W - PW - 16), y, kind, vx: kind === 'move' ? (rnd() < 0.5 ? -1 : 1) * (50 + d * 90) : 0, squish: 0 };
    if (kind === 'normal' && rnd() < 0.08) p.spring = { x: 8 + rnd() * (PW - 24), t: 0 };
    else if (kind === 'normal' && y < -1200 && rnd() < 0.018) p.balloon = true;
    plats.push(p);
    // Kekse brechen beim Draufspringen – sie liegen zusätzlich herum, nie als einziger Weg.
    if (rnd() < 0.12 + d * 0.22) plats.push({ x: 8 + rnd() * (W - PW - 16), y: y - gap * (0.3 + rnd() * 0.4), kind: 'break', vx: 0, squish: 0 });
  }
  return y;
}

function fresh(): HopState {
  const plats: HopPlat[] = [{ x: W / 2 - PW / 2, y: -20, kind: 'normal', vx: 0, squish: 0 }];
  const genY = hopGenerate(plats, -20, -H - 200);
  return {
    x: W / 2,
    y: -20 - BODY - 6,
    vx: 0,
    vy: 0,
    face: 1,
    squash: 0,
    cam: -H + 60,
    top: 0,
    plats,
    foes: [],
    genY,
    nextFoe: -2400,
    balloon: 0,
    alive: true,
    fallT: 0,
    started: false,
    t: 0,
    parts: [],
    stars: Array.from({ length: 60 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 1.4 + 0.3 })),
  };
}

// Himmel nach Höhe: Morgen → Sonnenuntergang → Abend → Nacht → Weltall
const SKY: [number, string, string][] = [
  [0, '#ffd3e6', '#fff2f7'],
  [2500, '#ffb199', '#ffe0b8'],
  [6000, '#8e5bd6', '#ff8fb8'],
  [11000, '#241449', '#5a3290'],
  [18000, '#05030f', '#170b33'],
];

function mix(a: string, b: string, k: number) {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return `rgb(${pa.map((v, i) => Math.round(v + (pb[i] - v) * k)).join(',')})`;
}

function skyAt(h: number): [string, string, number] {
  for (let i = 0; i < SKY.length - 1; i++) {
    const [h0, t0, b0] = SKY[i];
    const [h1, t1, b1] = SKY[i + 1];
    if (h < h1) {
      const k = clamp((h - h0) / (h1 - h0), 0, 1);
      return [mix(t0, t1, k), mix(b0, b1, k), clamp((h - 7000) / 5000, 0, 1)];
    }
  }
  return [SKY[SKY.length - 1][1], SKY[SKY.length - 1][2], 1];
}

function cloud(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.beginPath();
  oval(ctx, x, y, 26 * s, 10 * s);
  oval(ctx, x - 14 * s, y + 2 * s, 14 * s, 8 * s);
  oval(ctx, x + 10 * s, y - 7 * s, 15 * s, 11 * s);
  ctx.fill();
}

function drawPlat(ctx: CanvasRenderingContext2D, p: HopPlat, y: number, t: number) {
  const x = p.x;
  const sq = p.squish * 3;
  ctx.save();
  if (p.gone !== undefined) ctx.globalAlpha = Math.max(0, 1 - p.gone * 3);
  if (p.kind === 'break') {
    // Waffelkeks, bricht in zwei Hälften
    const b = p.broken ?? 0;
    for (const half of [0, 1]) {
      ctx.save();
      const hx = x + (half ? PW / 2 : 0);
      ctx.translate(hx + PW / 4, y + PH / 2 + b * 260 * b);
      ctx.rotate((half ? 1 : -1) * b * 2.2);
      ctx.fillStyle = '#d9954f';
      ctx.beginPath();
      ctx.roundRect(-PW / 4, -PH / 2, PW / 2, PH, half ? [0, 6, 6, 0] : [6, 0, 0, 6]);
      ctx.fill();
      ctx.strokeStyle = 'rgba(120,60,20,0.45)';
      ctx.lineWidth = 1;
      for (let k = -PW / 4 + 5; k < PW / 4; k += 6) {
        ctx.beginPath();
        ctx.moveTo(k, -PH / 2 + 2);
        ctx.lineTo(k, PH / 2 - 2);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,230,190,0.5)';
      ctx.fillRect(-PW / 4 + 2, -PH / 2 + 2, PW / 2 - 4, 2);
      ctx.restore();
    }
    if (!b) {
      ctx.strokeStyle = 'rgba(110,50,10,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + PW / 2, y);
      ctx.lineTo(x + PW / 2 - 3, y + 5);
      ctx.lineTo(x + PW / 2 + 2, y + 8);
      ctx.lineTo(x + PW / 2, y + PH);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }
  const colors: Record<Exclude<HopKind, 'break'>, [string, string, string]> = {
    normal: ['#ff8cc0', '#ff4f96', '#d12f75'],
    move: ['#8fd8ff', '#3fa9f5', '#2179c4'],
    vanish: ['#ffffff', '#efe6ff', '#c9b8f0'],
  };
  const [c0, c1, c2] = colors[p.kind];
  ctx.fillStyle = 'rgba(60,20,60,0.16)';
  ctx.beginPath();
  ctx.roundRect(x + 2, y + 4 + sq, PW - 4, PH, 7);
  ctx.fill();
  const g = ctx.createLinearGradient(0, y, 0, y + PH);
  g.addColorStop(0, c0);
  g.addColorStop(0.6, c1);
  g.addColorStop(1, c2);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(x, y + sq, PW, PH - sq * 0.5, 7);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.roundRect(x + 6, y + 2 + sq, PW - 12, 3, 2);
  ctx.fill();
  if (p.kind === 'vanish') {
    ctx.fillStyle = 'rgba(160,130,220,0.5)';
    for (let k = 0; k < 3; k++) {
      ctx.beginPath();
      ctx.arc(x + 14 + k * 16, y + PH / 2 + 1, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (p.kind === 'move') {
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '700 9px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('◀ ▶', x + PW / 2, y + PH / 2 + 1.5);
  }
  if (p.spring) {
    const sx = x + p.spring.x;
    const comp = p.spring.t > 0 ? 1 - p.spring.t : 0;
    const hgt = 12 + comp * 10;
    ctx.strokeStyle = '#c4c9d8';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let k = 0; k <= 4; k++) {
      const yy = y - (k / 4) * hgt;
      ctx.lineTo(sx + (k % 2 ? 14 : 2), yy);
    }
    ctx.stroke();
    ctx.fillStyle = '#ff4f96';
    ctx.beginPath();
    ctx.roundRect(sx - 1, y - hgt - 4, 18, 5, 2);
    ctx.fill();
  }
  if (p.balloon) {
    const bx = x + PW / 2;
    const by = y - 34 + Math.sin(t * 3) * 3;
    ctx.strokeStyle = 'rgba(80,40,80,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bx, by + 12);
    ctx.quadraticCurveTo(bx + 4, by + 22, bx, y);
    ctx.stroke();
    ctx.fillStyle = '#ff2f6d';
    heartPath(ctx, bx, by, 13);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    oval(ctx, bx - 6, by - 6, 3, 4, -0.5);
    ctx.fill();
  }
  ctx.restore();
}

function drawFoe(ctx: CanvasRenderingContext2D, f: Foe, y: number) {
  const x = f.x;
  ctx.save();
  if (f.dead !== undefined) {
    ctx.globalAlpha = Math.max(0, 1 - f.dead * 2);
    ctx.translate(x, y + f.dead * 120);
    ctx.scale(1 + f.dead, 1 - f.dead * 0.6);
  } else ctx.translate(x, y + Math.sin(f.t * 3) * 4);
  // Gewitterwolke mit Grummelgesicht
  ctx.fillStyle = '#5b5576';
  cloud(ctx, 0, 0, 1.15);
  ctx.fillStyle = '#7a7399';
  cloud(ctx, -2, -3, 0.95);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  oval(ctx, -8, -2, 5, 5.5);
  oval(ctx, 8, -2, 5, 5.5);
  ctx.fill();
  ctx.fillStyle = '#2b1a3a';
  ctx.beginPath();
  ctx.arc(-7, -1, 2.4, 0, Math.PI * 2);
  ctx.arc(9, -1, 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#2b1a3a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-13, -9);
  ctx.lineTo(-4, -6);
  ctx.moveTo(13, -9);
  ctx.lineTo(4, -6);
  ctx.moveTo(-5, 8);
  ctx.quadraticCurveTo(0, 4, 5, 8);
  ctx.stroke();
  // Blitz
  if (f.dead === undefined) {
    ctx.fillStyle = '#ffd43b';
    ctx.beginPath();
    ctx.moveTo(-2, 12);
    ctx.lineTo(4, 12);
    ctx.lineTo(0, 19);
    ctx.lineTo(5, 19);
    ctx.lineTo(-4, 30);
    ctx.lineTo(-1, 21);
    ctx.lineTo(-5, 21);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** Hüpfi: ein Herz mit Füßen, Augen und roten Bäckchen */
function drawHero(ctx: CanvasRenderingContext2D, st: HopState, y: number) {
  ctx.save();
  ctx.translate(st.x, y);
  const stretch = clamp(-st.vy / 2600, -0.12, 0.18);
  const sx = 1 + st.squash * 0.25 - stretch * 0.5;
  const sy = 1 - st.squash * 0.22 + stretch;
  ctx.scale(sx * st.face, sy);
  if (!st.alive) ctx.rotate(st.fallT * 6);
  // Füße
  const tuck = st.vy < 0 ? 4 : 0;
  ctx.fillStyle = '#b81e5c';
  ctx.beginPath();
  oval(ctx, -6, BODY - 1 - tuck, 5, 3.4);
  oval(ctx, 7, BODY - 1 - tuck, 5, 3.4);
  ctx.fill();
  // Körper
  const g = ctx.createLinearGradient(0, -BODY, 0, BODY);
  g.addColorStop(0, '#ff6fa5');
  g.addColorStop(1, '#e8185f');
  ctx.fillStyle = g;
  heartPath(ctx, 0, 2, BODY * 1.08);
  ctx.fill();
  ctx.strokeStyle = '#a3124a';
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  oval(ctx, -9, -7, 3.5, 5, -0.6);
  ctx.fill();
  // Augen schauen in Laufrichtung
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  oval(ctx, 1, -2, 4.2, 5);
  oval(ctx, 10, -2, 4.2, 5);
  ctx.fill();
  ctx.fillStyle = '#2a0f22';
  const look = st.vy > 300 ? 1.5 : -0.5;
  ctx.beginPath();
  if (!st.alive) {
    ctx.strokeStyle = '#2a0f22';
    ctx.lineWidth = 1.6;
    for (const ex of [1, 10]) {
      ctx.moveTo(ex - 2.5, -4.5);
      ctx.lineTo(ex + 2.5, 0.5);
      ctx.moveTo(ex + 2.5, -4.5);
      ctx.lineTo(ex - 2.5, 0.5);
    }
    ctx.stroke();
  } else {
    ctx.arc(2.6, -2 + look, 2.4, 0, Math.PI * 2);
    ctx.arc(11.6, -2 + look, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(3.4, -3 + look, 0.9, 0, Math.PI * 2);
    ctx.arc(12.4, -3 + look, 0.9, 0, Math.PI * 2);
    ctx.fill();
  }
  // Bäckchen + Mund
  ctx.fillStyle = 'rgba(255,190,210,0.85)';
  ctx.beginPath();
  oval(ctx, -4, 5, 3, 2);
  oval(ctx, 14, 5, 2.5, 1.8);
  ctx.fill();
  ctx.strokeStyle = '#6d0d34';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (st.vy < -200 || !st.alive) oval(ctx, 6, 7, 2.4, st.alive ? 2.6 : 1.4);
  else ctx.arc(6, 5, 3, 0.2, Math.PI - 0.2);
  ctx.stroke();
  ctx.restore();
}

function loadTilt(): boolean {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? '{}').tilt === true;
  } catch {
    return false;
  }
}

function saveTilt(tilt: boolean) {
  try {
    localStorage.setItem(STORE, JSON.stringify({ tilt }));
  } catch {
    // nächstes Mal eben wieder Tippen
  }
}

type Orient = { requestPermission?: () => Promise<'granted' | 'denied'> };

export function Hopper({ best, onEnd }: GameProps) {
  const s = useRef<HopState>(fresh());
  const [score, setScore] = useState(0);
  const [started, setStarted] = useState(false);
  const [tilt, setTilt] = useState(loadTilt);
  const [tiltNote, setTiltNote] = useState<string | null>(null);
  const input = useRef({ left: 0, right: 0, keyL: false, keyR: false, gamma: 0, gammaAt: 0 });
  const root = useRef<HTMLDivElement>(null);
  const ended = useRef(false);
  useTouchLock(root);

  const { wrapRef, canvasRef, paint } = useFitCanvas(W, H, (ctx) => {
    const st = s.current;
    const h = -st.cam;
    const [top, bottom, night] = skyAt(h);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Sterne (nachts)
    if (night > 0) {
      ctx.fillStyle = '#fff';
      for (const sp of st.stars) {
        ctx.globalAlpha = night * (0.5 + 0.5 * Math.sin(st.t * 2 + sp.x));
        const yy = (((sp.y - st.cam * 0.05) % H) + H) % H;
        ctx.beginPath();
        ctx.arc(sp.x, yy, sp.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    // Mond / Planet ganz oben
    if (night > 0.2) {
      ctx.globalAlpha = night;
      ctx.fillStyle = '#ffe9b0';
      ctx.beginPath();
      ctx.arc(W * 0.78, 90 + ((-st.cam * 0.02) % 40), 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = top;
      ctx.beginPath();
      ctx.arc(W * 0.78 + 9, 84 + ((-st.cam * 0.02) % 40), 19, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Wolken in zwei Ebenen (Parallaxe)
    for (const [k, speed, size, alpha] of [
      [0, 0.25, 1.2, 0.45],
      [1, 0.55, 0.8, 0.6],
    ] as const) {
      ctx.fillStyle = `rgba(255,255,255,${alpha * (1 - night * 0.7)})`;
      for (let i = 0; i < 5; i++) {
        const span = H + 120;
        const yy = ((((i * 173 + k * 61) - st.cam * speed) % span) + span) % span - 60;
        const xx = ((i * 97 + k * 40 + st.t * (6 + k * 4)) % (W + 120)) - 60;
        cloud(ctx, xx, yy, size);
      }
    }

    // Startwiese
    const groundY = 0 - st.cam;
    if (groundY < H + 80) {
      ctx.fillStyle = '#9fe0a8';
      ctx.beginPath();
      oval(ctx, W * 0.25, groundY + 40, 160, 50);
      oval(ctx, W * 0.85, groundY + 50, 150, 55);
      ctx.fill();
      ctx.fillStyle = '#7ccf8a';
      ctx.fillRect(0, groundY + 30, W, 200);
      ctx.fillStyle = '#ff7eb3';
      for (let i = 0; i < 9; i++) {
        heartPath(ctx, 18 + i * 36, groundY + 44 + (i % 2) * 8, 4);
        ctx.fill();
      }
    }

    for (const p of st.plats) {
      const y = p.y - st.cam;
      if (y < -60 || y > H + 300) continue;
      drawPlat(ctx, p, y, st.t);
    }
    for (const f of st.foes) {
      const y = f.y - st.cam;
      if (y > -40 && y < H + 200) drawFoe(ctx, f, y);
    }

    // Herzballon trägt Hüpfi
    if (st.balloon > 0) {
      const by = st.y - st.cam - 40;
      ctx.strokeStyle = 'rgba(80,40,80,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(st.x, by + 12);
      ctx.lineTo(st.x, st.y - st.cam - 10);
      ctx.stroke();
      ctx.fillStyle = '#ff2f6d';
      heartPath(ctx, st.x, by, 15);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      oval(ctx, st.x - 6, by - 6, 3, 4, -0.5);
      ctx.fill();
    }
    drawHero(ctx, st, st.y - st.cam);
    ctx.save();
    ctx.translate(0, -st.cam);
    drawParticles(ctx, st.parts);
    ctx.restore();

    // Höhe
    ctx.font = '900 30px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    outlinedText(ctx, `${meters(st.top)} m`, W / 2, 14, '#fff', 'rgba(90,20,70,0.45)', 5);
  });

  const tryTilt = async () => {
    const want = !tilt;
    setTiltNote(null);
    if (want) {
      const D = window.DeviceOrientationEvent as unknown as Orient | undefined;
      if (!D) {
        setTiltNote('Dieses Gerät hat keinen Neigungssensor.');
        return;
      }
      if (typeof D.requestPermission === 'function') {
        try {
          if ((await D.requestPermission()) !== 'granted') {
            setTiltNote('Neigen ist nicht erlaubt – iPhone: Arta neu öffnen und „Erlauben“ tippen.');
            return;
          }
        } catch {
          setTiltNote('Neigen ist nicht erlaubt.');
          return;
        }
      }
    }
    setTilt(want);
    saveTilt(want);
  };

  useEffect(() => {
    if (!tilt) return;
    const on = (e: DeviceOrientationEvent) => {
      if (e.gamma === null) return;
      input.current.gamma = e.gamma;
      input.current.gammaAt = performance.now();
    };
    window.addEventListener('deviceorientation', on);
    return () => window.removeEventListener('deviceorientation', on);
  }, [tilt]);

  useEffect(() => {
    const set = (e: KeyboardEvent, v: boolean) => {
      const k = e.key.toLowerCase();
      if (k === 'arrowleft' || k === 'a') input.current.keyL = v;
      else if (k === 'arrowright' || k === 'd') input.current.keyR = v;
      else return;
      e.preventDefault();
      if (v) start();
    };
    const down = (e: KeyboardEvent) => set(e, true);
    const up = (e: KeyboardEvent) => set(e, false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  const start = () => {
    const st = s.current;
    if (st.started) return;
    st.started = true;
    st.vy = JUMP;
    setStarted(true);
  };

  const die = () => {
    const st = s.current;
    if (!st.alive) return;
    st.alive = false;
    st.balloon = 0;
    st.vy = Math.max(st.vy, 120);
    tone(420, 600, 'sawtooth', 0.045, 80);
    buzz([60, 30, 100]);
  };

  useLoop((dtRaw) => {
    const st = s.current;
    const dt = Math.min(dtRaw, 1 / 30);
    st.t += dt;
    stepParticles(st.parts, dt);
    st.squash = Math.max(0, st.squash - dt * 6);
    for (const p of st.plats) {
      p.squish = Math.max(0, p.squish - dt * 6);
      if (p.spring && p.spring.t > 0) p.spring.t = Math.max(0, p.spring.t - dt * 3);
      if (p.kind === 'move') {
        p.x += p.vx * dt;
        if (p.x < 4 || p.x > W - PW - 4) {
          p.vx = -p.vx;
          p.x = clamp(p.x, 4, W - PW - 4);
        }
      }
      if (p.broken !== undefined) p.broken += dt;
      if (p.gone !== undefined) p.gone += dt;
    }
    st.plats = st.plats.filter((p) => (p.broken ?? 0) < 1.2 && (p.gone ?? 0) < 0.4 && p.y < st.cam + H + 340);
    for (const f of st.foes) {
      f.t += dt;
      if (f.dead !== undefined) f.dead += dt;
    }
    st.foes = st.foes.filter((f) => (f.dead ?? 0) < 0.6 && f.y < st.cam + H + 200);

    if (!st.started) {
      // Kleine Hüpfer auf der Startplattform, bis es losgeht
      paint();
      return;
    }

    // Steuerung
    const inp = input.current;
    let dir = 0;
    if (inp.keyL || inp.left > 0) dir -= 1;
    if (inp.keyR || inp.right > 0) dir += 1;
    let target = dir * RUN;
    if (tilt && performance.now() - inp.gammaAt < 600 && dir === 0) target = clamp(inp.gamma / 22, -1.3, 1.3) * RUN;
    if (st.alive) {
      st.vx += (target - st.vx) * Math.min(1, dt * 9);
      if (Math.abs(st.vx) > 20) st.face = st.vx > 0 ? 1 : -1;
    } else st.vx *= 0.97;

    // Bewegung
    const prevFeet = st.y + BODY;
    if (st.balloon > 0) {
      st.balloon -= dt;
      st.vy = Math.max(st.vy - 3000 * dt, -980);
      if (Math.random() < dt * 20) st.parts.push({ x: st.x + (Math.random() - 0.5) * 10, y: st.y + BODY, vx: (Math.random() - 0.5) * 30, vy: 60, life: 0.6, max: 0.6, size: 3, color: '#ff8cc6', heart: true });
      if (st.balloon <= 0) {
        st.vy = Math.min(st.vy, -500);
        burst(st.parts, st.x, st.y - 40, '#ff2f6d', 10, 90, { heart: true, size: 3 });
        tone(300, 120, 'triangle', 0.05, 900);
      }
    } else st.vy += GRAVITY * dt;
    st.x += st.vx * dt;
    st.y += st.vy * dt;
    if (st.x < -BODY) st.x += W + BODY * 2;
    if (st.x > W + BODY) st.x -= W + BODY * 2;

    if (st.alive && st.vy > 0 && st.balloon <= 0) {
      const feet = st.y + BODY;
      for (const p of st.plats) {
        if (p.broken !== undefined || p.gone !== undefined) continue;
        if (prevFeet > p.y + 4 || feet < p.y) continue;
        if (st.x + BODY * 0.7 < p.x || st.x - BODY * 0.7 > p.x + PW) continue;
        if (p.kind === 'break') {
          p.broken = 0;
          tone(180, 140, 'square', 0.04, 90);
          burst(st.parts, p.x + PW / 2, p.y + 4, '#d9954f', 8, 80, { g: 400 });
          continue;
        }
        st.y = p.y - BODY;
        p.squish = 1;
        st.squash = 1;
        if (p.balloon) {
          p.balloon = false;
          st.balloon = 2.3;
          st.vy = -600;
          tone(520, 300, 'triangle', 0.05, 1200);
          buzz(20);
        } else if (p.spring && Math.abs(st.x - (p.x + p.spring.x + 8)) < 16) {
          st.vy = SPRING;
          p.spring.t = 1;
          tone(380, 260, 'square', 0.04, 1400);
          buzz(15);
        } else {
          st.vy = JUMP;
          tone(520 + Math.min(meters(st.top), 3000) / 10, 70, 'triangle', 0.045, 820);
        }
        if (p.kind === 'vanish') p.gone = 0;
        burst(st.parts, st.x, p.y, 'rgba(255,255,255,0.9)', 5, 60);
        break;
      }
    }

    // Grummelwolken
    if (st.alive) {
      for (const f of st.foes) {
        if (f.dead !== undefined) continue;
        const fy = f.y + Math.sin(f.t * 3) * 4;
        const dx = st.x - f.x;
        const dy = st.y - fy;
        if (Math.abs(dx) < 30 && Math.abs(dy) < 26) {
          if (st.vy > 0 && dy < -6) {
            f.dead = 0;
            st.vy = JUMP * 1.1;
            st.squash = 1;
            burst(st.parts, f.x, fy, '#9a93bd', 16, 140);
            tone(240, 160, 'square', 0.05, 900);
            buzz(25);
          } else if (st.balloon <= 0) die();
        }
      }
    }

    // Kamera folgt nach oben, nie zurück
    if (st.alive) {
      const want = st.y - H * 0.42;
      if (want < st.cam) st.cam += (want - st.cam) * Math.min(1, dt * 12);
      if (st.y < st.top) {
        st.top = st.y;
        const m = meters(st.top);
        if (m !== score) setScore(m);
      }
      if (st.y - st.cam > H + 30) die();
    } else {
      st.fallT += dt;
      st.cam += (st.y - H * 0.5 - st.cam) * Math.min(1, dt * 3);
      if (st.fallT > 1.1 && !ended.current) {
        ended.current = true;
        onEnd({ score: meters(st.top) });
      }
    }

    // Nachschub oben
    if (st.genY > st.cam - H) {
      st.genY = hopGenerate(st.plats, st.genY, st.cam - H - 200);
      while (st.nextFoe > st.genY) {
        const d = diff(st.nextFoe);
        // Nicht direkt auf eine Plattform setzen
        let x = 40 + Math.random() * (W - 80);
        for (let k = 0; k < 6; k++) {
          const clash = st.plats.some((p) => Math.abs(p.y - st.nextFoe) < 50 && x > p.x - 30 && x < p.x + PW + 30);
          if (!clash) break;
          x = 40 + Math.random() * (W - 80);
        }
        st.foes.push({ x, y: st.nextFoe, t: Math.random() * 6 });
        st.nextFoe -= 1500 - d * 700 + Math.random() * 700;
      }
    }
    paint();
  }, true);

  // Tippen links/rechts hält die Richtung
  const pointers = useRef(new Map<number, 'left' | 'right'>());
  const side = (e: RPointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return e.clientX < r.left + r.width / 2 ? 'left' : 'right';
  };
  const recount = () => {
    let l = 0;
    let r = 0;
    for (const v of pointers.current.values()) v === 'left' ? l++ : r++;
    input.current.left = l;
    input.current.right = r;
  };
  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    start();
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, side(e));
    recount();
  };
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, side(e));
    recount();
  };
  const onUp = (e: RPointerEvent<HTMLDivElement>) => {
    pointers.current.delete(e.pointerId);
    recount();
  };

  return (
    <div className="g-col fill" ref={root}>
      <div className="score-strip">
        <span>🦘 {score} m</span>
        <button className={`hop-tilt${tilt ? ' on' : ''}`} onClick={() => void tryTilt()}>
          {tilt ? '📱 Neigen an' : '👆 Tippen'}
        </button>
        <span>🏆 {best ?? '–'}</span>
      </div>
      <div className="canvas-wrap" ref={wrapRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <canvas ref={canvasRef} className="game-canvas" />
        {!started && (
          <div className="canvas-overlay">
            <span className="flappy-start hop-start">
              {tilt ? 'Handy neigen zum Lenken 📱' : 'Links oder rechts gedrückt halten 👈👉'}
              <small>Tippen zum Starten</small>
            </span>
          </div>
        )}
        {tiltNote && <p className="hop-note">{tiltNote}</p>}
      </div>
    </div>
  );
}
