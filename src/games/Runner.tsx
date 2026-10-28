import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { buzz, heartPath, noise, outlinedText, oval, tone, useFillCanvas, useLoop } from './engine';
import { FWD, HALF, LANE, newRun, rightOf, runScore, runStep, segPoint, TURN_WINDOW, yawOf, type Decor, type Obstacle, type RunInput, type RunState, type Seg } from './runner';
import type { GameProps } from './types';

// ───────────────────────── Kamera ─────────────────────────

interface Cam {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  f: number;
  cx: number;
  cy: number;
  c: number;
  s: number;
  cp: number;
  sp: number;
}

const NEAR = 0.25;
const FAR = 120;
const DROP = 2.6;

type V3 = [number, number, number];

function toCam(cam: Cam, wx: number, wy: number, wz: number): V3 {
  const dx = wx - cam.x;
  const dy = wy - cam.y;
  const dz = wz - cam.z;
  const x = dx * cam.c - dz * cam.s;
  const z = dx * cam.s + dz * cam.c;
  return [x, dy * cam.cp + z * cam.sp, -dy * cam.sp + z * cam.cp];
}

/** Vieleck gegen die Nah-Ebene schneiden und projizieren */
function project(cam: Cam, pts: V3[]): [number, number][] | null {
  const out: V3[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const ain = a[2] >= NEAR;
    const bin = b[2] >= NEAR;
    if (ain) out.push(a);
    if (ain !== bin) {
      const t = (NEAR - a[2]) / (b[2] - a[2]);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, NEAR]);
    }
  }
  if (out.length < 3) return null;
  return out.map(([x, y, z]) => [cam.cx + (cam.f * x) / z, cam.cy - (cam.f * y) / z]);
}

// ───────────────────────── Farben & Nebel ─────────────────────────

type RGB = [number, number, number];
const FOG: RGB = [246, 170, 150];

function hex(h: string): RGB {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

function fogged(c: RGB, z: number, light = 1): string {
  const k = Math.min(1, Math.max(0, (z - 18) / (FAR - 18))) ** 1.3;
  const r = c[0] * light + (FOG[0] - c[0] * light) * k;
  const g = c[1] * light + (FOG[1] - c[1] * light) * k;
  const b = c[2] * light + (FOG[2] - c[2] * light) * k;
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

const C = {
  tileA: hex('#dcb48a'),
  tileB: hex('#cfa47a'),
  rim: hex('#a77b57'),
  wall: hex('#7d5a43'),
  wallDark: hex('#5b3f31'),
  log: hex('#8a5a3b'),
  logTop: hex('#a8744e'),
  stone: hex('#b9a58f'),
  stoneTop: hex('#d6c4ad'),
  moss: hex('#5f9a5c'),
  gold: hex('#f2c14e'),
};

// ───────────────────────── Zeichen-Liste ─────────────────────────

interface Item {
  z: number;
  draw: () => void;
}

function quadItem(ctx: CanvasRenderingContext2D, cam: Cam, pts: V3[], color: RGB, light: number, list: Item[]) {
  const cp = pts.map((p) => toCam(cam, p[0], p[1], p[2]));
  let zs = 0;
  let any = false;
  for (const p of cp) {
    zs += p[2];
    if (p[2] > NEAR) any = true;
  }
  if (!any) return;
  const zc = zs / cp.length;
  if (zc > FAR + 10) return;
  list.push({
    z: zc,
    draw: () => {
      const sp = project(cam, cp);
      if (!sp) return;
      ctx.fillStyle = fogged(color, zc, light);
      ctx.beginPath();
      ctx.moveTo(sp[0][0], sp[0][1]);
      for (let i = 1; i < sp.length; i++) ctx.lineTo(sp[i][0], sp[i][1]);
      ctx.closePath();
      ctx.fill();
    },
  });
}

/** Welt-Punkt auf einem Streckenstück */
function wp(seg: Seg, d: number, side: number, y: number): V3 {
  const [x, z] = segPoint(seg, d, side);
  return [x, y, z];
}

/** Quader auf der Strecke: d (Mitte), side (Mitte), halbe Tiefe/Breite, y von–bis */
function boxItem(ctx: CanvasRenderingContext2D, cam: Cam, seg: Seg, d: number, side: number, hd: number, hw: number, y0: number, y1: number, col: RGB, top: RGB, list: Item[], extra?: (face: [number, number][], zc: number) => void) {
  const P = (dd: number, ss: number, yy: number) => toCam(cam, ...wp(seg, d + dd, side + ss, yy));
  const c = [P(-hd, -hw, y0), P(-hd, hw, y0), P(hd, hw, y0), P(hd, -hw, y0), P(-hd, -hw, y1), P(-hd, hw, y1), P(hd, hw, y1), P(hd, -hw, y1)];
  const center = toCam(cam, ...wp(seg, d, side, (y0 + y1) / 2));
  if (center[2] < NEAR - hd - 1 || center[2] > FAR) return;
  // Welche Seiten sieht die Kamera? (Kamera-Position im Stück-Koordinatensystem)
  const [fx, fz] = FWD[seg.h];
  const [rx, rz] = rightOf(seg.h);
  const [ox, oz] = segPoint(seg, d, side);
  const camD = (cam.x - ox) * fx + (cam.z - oz) * fz;
  const camS = (cam.x - ox) * rx + (cam.z - oz) * rz;
  const faces: { idx: number[]; light: number; tone: RGB; front?: boolean }[] = [];
  if (camD < -hd) faces.push({ idx: [0, 1, 5, 4], light: 0.92, tone: col, front: true });
  if (camD > hd) faces.push({ idx: [2, 3, 7, 6], light: 0.7, tone: col });
  if (camS < -hw) faces.push({ idx: [3, 0, 4, 7], light: 0.78, tone: col });
  if (camS > hw) faces.push({ idx: [1, 2, 6, 5], light: 0.66, tone: col });
  if (cam.y > y1) faces.push({ idx: [4, 5, 6, 7], light: 1.05, tone: top });
  const zc = center[2];
  list.push({
    z: zc,
    draw: () => {
      for (const f of faces) {
        const sp = project(cam, f.idx.map((i) => c[i]));
        if (!sp) continue;
        ctx.fillStyle = fogged(f.tone, zc, f.light);
        ctx.beginPath();
        ctx.moveTo(sp[0][0], sp[0][1]);
        for (let i = 1; i < sp.length; i++) ctx.lineTo(sp[i][0], sp[i][1]);
        ctx.closePath();
        ctx.fill();
        if (f.front && extra) extra(sp, zc);
      }
    },
  });
}

// ───────────────────────── Figuren ─────────────────────────

/** Läuferin von hinten: Pferdeschwanz, pinke Jacke */
function drawRunner(ctx: CanvasRenderingContext2D, x: number, y: number, ppm: number, st: RunState, phase: number) {
  const s = ppm / 100;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  // Schatten
  const air = Math.min(1, st.y / 1.4);
  ctx.fillStyle = `rgba(40,20,30,${0.32 * (1 - air * 0.6)})`;
  ctx.beginPath();
  oval(ctx, 0, st.y * 100, 30 * (1 - air * 0.3), 9 * (1 - air * 0.3));
  ctx.fill();
  if (st.dead === 'fall') ctx.rotate(Math.min(1.2, st.deadT * 2));
  const sliding = st.slide > 0;
  const swing = Math.sin(phase);
  const inAir = st.y > 0.02;
  if (sliding) {
    // Rutschen: halb liegend, Beine nach vorn
    ctx.fillStyle = '#2d2b55';
    ctx.beginPath();
    ctx.roundRect(-20, -26, 40, 22, 9);
    ctx.fill();
    ctx.fillStyle = '#ff4f8b';
    ctx.beginPath();
    ctx.roundRect(-22, -62, 44, 40, 14);
    ctx.fill();
    ctx.fillStyle = '#2b1a2e';
    ctx.beginPath();
    oval(ctx, 0, -76, 17, 17);
    ctx.fill();
    ctx.fillStyle = '#3a2337';
    ctx.beginPath();
    ctx.ellipse(10, -64, 7, 16, 0.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }
  const lift = inAir ? 0 : Math.abs(Math.sin(phase)) * 6;
  ctx.translate(0, -lift);
  // Beine
  const leg = (dir: number) => {
    const k = inAir ? 0.6 : swing * dir;
    ctx.save();
    ctx.translate(dir * 9, -78);
    ctx.rotate(inAir ? dir * 0.2 : 0);
    ctx.fillStyle = '#2d2b55';
    ctx.beginPath();
    ctx.roundRect(-7, 0, 14, 44 - Math.max(0, k) * 14, 6);
    ctx.fill();
    // Schuh: hebt sich beim Laufen
    ctx.fillStyle = '#ffffff';
    const up = Math.max(0, k) * 14;
    ctx.beginPath();
    ctx.roundRect(-8, 40 - up, 16, 12, 5);
    ctx.fill();
    ctx.fillStyle = '#ff4f8b';
    ctx.fillRect(-8, 47 - up, 16, 3);
    ctx.restore();
  };
  leg(-1);
  leg(1);
  // Körper
  const g = ctx.createLinearGradient(0, -130, 0, -74);
  g.addColorStop(0, '#ff6fa5');
  g.addColorStop(1, '#e63578');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(-21, -132, 42, 60, 14);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  heartPath(ctx, 0, -104, 7);
  ctx.fill();
  // Arme
  for (const dir of [-1, 1]) {
    ctx.save();
    ctx.translate(dir * 21, -124);
    ctx.rotate(dir * 0.25 + (inAir ? -dir * 0.9 : -swing * dir * 0.6));
    ctx.fillStyle = '#ff4f8b';
    ctx.beginPath();
    ctx.roundRect(-6, 0, 12, 34, 6);
    ctx.fill();
    ctx.fillStyle = '#f2c3a7';
    ctx.beginPath();
    oval(ctx, 0, 37, 6, 6);
    ctx.fill();
    ctx.restore();
  }
  // Kopf mit Pferdeschwanz
  ctx.fillStyle = '#f2c3a7';
  ctx.fillRect(-6, -142, 12, 12);
  ctx.fillStyle = '#2b1a2e';
  ctx.beginPath();
  oval(ctx, 0, -158, 19, 20);
  ctx.fill();
  ctx.fillStyle = '#ff4f8b';
  ctx.fillRect(-4, -168, 8, 6);
  ctx.save();
  ctx.translate(0, -164);
  ctx.rotate(Math.sin(phase * 0.5) * 0.35 + (inAir ? 0.4 : 0));
  ctx.fillStyle = '#3a2337';
  ctx.beginPath();
  ctx.moveTo(-6, 0);
  ctx.quadraticCurveTo(-12, 26, 0, 46);
  ctx.quadraticCurveTo(12, 26, 6, 0);
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

/** Das Knuddelmonster will nur kuscheln – aber dann ist das Rennen vorbei. */
function drawMonster(ctx: CanvasRenderingContext2D, x: number, y: number, ppm: number, t: number) {
  const s = ppm / 100;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  const bob = Math.abs(Math.sin(t * 9)) * 8;
  ctx.translate(0, -bob);
  // Fell
  ctx.fillStyle = '#7b4fd6';
  ctx.beginPath();
  for (let i = 0; i <= 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const r = 105 + (i % 2 ? 12 : 0);
    ctx.lineTo(Math.cos(a) * r * 0.95, -120 + Math.sin(a) * r);
  }
  ctx.fill();
  ctx.fillStyle = '#9b6bf0';
  ctx.beginPath();
  oval(ctx, 0, -110, 80, 86);
  ctx.fill();
  // Arme hoch zum Knuddeln
  for (const dir of [-1, 1]) {
    ctx.save();
    ctx.translate(dir * 90, -150);
    ctx.rotate(dir * (0.6 + Math.sin(t * 9) * 0.25));
    ctx.fillStyle = '#7b4fd6';
    ctx.beginPath();
    ctx.roundRect(-18, -90, 36, 100, 18);
    ctx.fill();
    ctx.restore();
  }
  // Hörnchen
  ctx.fillStyle = '#ffd6ea';
  for (const dir of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(dir * 40, -200);
    ctx.lineTo(dir * 58, -250);
    ctx.lineTo(dir * 70, -195);
    ctx.fill();
  }
  // Augen und Herz-Bauch
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  oval(ctx, -30, -160, 20, 24);
  oval(ctx, 30, -160, 20, 24);
  ctx.fill();
  ctx.fillStyle = '#2a1238';
  ctx.beginPath();
  oval(ctx, -28, -152, 9, 11);
  oval(ctx, 28, -152, 9, 11);
  ctx.fill();
  ctx.fillStyle = '#ff6fa5';
  heartPath(ctx, 0, -92, 26);
  ctx.fill();
  ctx.fillStyle = '#4a1f5e';
  ctx.beginPath();
  ctx.ellipse(0, -122, 22, 12, 0, 0, Math.PI);
  ctx.fill();
  ctx.restore();
}

function drawDecor(ctx: CanvasRenderingContext2D, dec: Decor, x: number, y: number, ppm: number, t: number, z: number) {
  const s = ppm / 100;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  const fogK = Math.min(1, Math.max(0, (z - 18) / (FAR - 18)));
  if (dec.kind === 'pillar') {
    ctx.fillStyle = fogged(C.stone, z, 0.85);
    ctx.fillRect(-28, -420, 56, 420 + DROP * 100);
    ctx.fillStyle = fogged(C.stone, z, 1.05);
    ctx.fillRect(-28, -420, 14, 420 + DROP * 100);
    ctx.fillStyle = fogged(C.stoneTop, z, 1);
    ctx.fillRect(-38, -440, 76, 26);
    ctx.fillStyle = fogged(C.moss, z, 0.9);
    for (let k = 0; k < 5; k++) {
      ctx.beginPath();
      oval(ctx, -20 + ((k * 23) % 40), -380 + k * 70, 9, 22);
      ctx.fill();
    }
  } else if (dec.kind === 'palm') {
    ctx.strokeStyle = fogged(hex('#7a5236'), z);
    ctx.lineWidth = 16;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, DROP * 100);
    ctx.quadraticCurveTo(30, -150, 10, -380);
    ctx.stroke();
    ctx.fillStyle = fogged(hex('#3f8f4f'), z);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + Math.sin(t * 1.5 + k) * 0.05;
      ctx.save();
      ctx.translate(10, -380);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.ellipse(70, 10, 80, 18, 0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  } else if (dec.kind === 'torch') {
    ctx.fillStyle = fogged(hex('#5b3f31'), z);
    ctx.fillRect(-7, -190, 14, 190 + DROP * 100);
    ctx.fillStyle = fogged(C.gold, z, 0.9);
    ctx.beginPath();
    ctx.moveTo(-26, -200);
    ctx.lineTo(26, -200);
    ctx.lineTo(14, -180);
    ctx.lineTo(-14, -180);
    ctx.fill();
    const fl = 1 + Math.sin(t * 17 + x) * 0.12;
    ctx.globalAlpha = 1 - fogK * 0.6;
    const g = ctx.createRadialGradient(0, -220, 4, 0, -220, 70);
    g.addColorStop(0, 'rgba(255,220,140,0.55)');
    g.addColorStop(1, 'rgba(255,140,90,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-70, -290, 140, 140);
    ctx.fillStyle = '#ff9d3c';
    ctx.beginPath();
    ctx.moveTo(-18, -200);
    ctx.quadraticCurveTo(-14 * fl, -240 * fl, 0, -262 * fl);
    ctx.quadraticCurveTo(14 * fl, -240 * fl, 18, -200);
    ctx.fill();
    ctx.fillStyle = '#ffe08a';
    ctx.beginPath();
    ctx.moveTo(-8, -200);
    ctx.quadraticCurveTo(-6, -224 * fl, 0, -236 * fl);
    ctx.quadraticCurveTo(6, -224 * fl, 8, -200);
    ctx.fill();
    ctx.globalAlpha = 1;
  } else {
    // Herz-Statue auf Sockel
    ctx.fillStyle = fogged(C.stone, z, 0.8);
    ctx.fillRect(-34, -120, 68, 120 + DROP * 100);
    ctx.fillStyle = fogged(C.stoneTop, z);
    ctx.fillRect(-40, -132, 80, 16);
    ctx.fillStyle = fogged(hex('#e2557f'), z);
    heartPath(ctx, 0, -190, 50);
    ctx.fill();
    ctx.fillStyle = `rgba(255,255,255,${0.3 * (1 - fogK)})`;
    ctx.beginPath();
    ctx.ellipse(-22, -212, 10, 16, -0.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ───────────────────────── Himmel ─────────────────────────

function ridgeH(a: number, seed: number) {
  return Math.sin(a * 3 + seed) * 0.45 + Math.sin(a * 7.3 + seed * 2) * 0.3 + Math.sin(a * 17 + seed * 3) * 0.18 + Math.sin(a * 31 + seed) * 0.07;
}

function drawSky(ctx: CanvasRenderingContext2D, cam: Cam, w: number, h: number) {
  const hy = cam.cy - cam.f * Math.tan(cam.pitch);
  const sky = ctx.createLinearGradient(0, 0, 0, hy);
  sky.addColorStop(0, '#2c1a4f');
  sky.addColorStop(0.55, '#b2507e');
  sky.addColorStop(1, '#ffb08c');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, w, hy + 1);
  // Sonne
  const sunA = 0.55;
  let da = (((sunA - cam.yaw) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
  if (Math.abs(da) < 1.2) {
    const sx = cam.cx + cam.f * Math.tan(da);
    const sy = hy - 40;
    const g = ctx.createRadialGradient(sx, sy, 8, sx, sy, 160);
    g.addColorStop(0, 'rgba(255,245,210,0.95)');
    g.addColorStop(0.2, 'rgba(255,200,150,0.5)');
    g.addColorStop(1, 'rgba(255,160,140,0)');
    ctx.fillStyle = g;
    ctx.fillRect(sx - 160, sy - 160, 320, 320);
    ctx.fillStyle = '#fff3d8';
    ctx.beginPath();
    ctx.arc(sx, sy, 26, 0, Math.PI * 2);
    ctx.fill();
  }
  // Berge und Dschungel – drehen sich mit, wenn man abbiegt
  const layers: [number, number, string, number][] = [
    [1, 60, '#8f5fa8', 0.55],
    [5, 36, '#4f3d72', 0.8],
  ];
  for (const [seed, amp, color] of layers) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, hy + 2);
    for (let x = 0; x <= w + 6; x += 6) {
      const a = cam.yaw + Math.atan((x - cam.cx) / cam.f);
      ctx.lineTo(x, hy - 6 - (ridgeH(a, seed) * 0.5 + 0.5) * amp * (cam.f / 400));
    }
    ctx.lineTo(w, hy + 2);
    ctx.closePath();
    ctx.fill();
  }
  // Abgrund mit Nebel
  const g = ctx.createLinearGradient(0, hy, 0, h);
  g.addColorStop(0, '#f2a48e');
  g.addColorStop(0.08, '#7d6a8a');
  g.addColorStop(0.4, '#2b3d45');
  g.addColorStop(1, '#0f1d1c');
  ctx.fillStyle = g;
  ctx.fillRect(0, hy, w, h - hy);
  // Baumkronen tief unten
  ctx.fillStyle = 'rgba(30,70,55,0.75)';
  for (let x = -20; x <= w + 20; x += 18) {
    const a = cam.yaw + Math.atan((x - cam.cx) / cam.f);
    const r = (ridgeH(a * 2, 9) * 0.5 + 0.5) * 22 + 10;
    ctx.beginPath();
    oval(ctx, x, hy + 26 + r * 0.4, r, r * 0.5);
    ctx.fill();
  }
}

// ───────────────────────── Spiel ─────────────────────────

const TIPS = ['👆 Wischen: ⬅️ ➡️ Spur wechseln · ⬆️ springen · ⬇️ rutschen', '↪️ An Kreuzungen in Pfeilrichtung wischen!'];

export function Runner({ best, onEnd }: GameProps) {
  const s = useRef<RunState>(newRun());
  const inp = useRef<RunInput>({});
  const [hud, setHud] = useState({ m: 0, hearts: 0, score: 0 });
  const [started, setStarted] = useState(false);
  const startedRef = useRef(false);
  const ended = useRef(false);
  const fx = useRef({ shake: 0, flash: 0, phase: 0, pops: [] as { x: number; y: number; life: number }[] });

  useEffect(() => {
    // Nur beim Entwickeln: Zustand für automatische Tests erreichbar
    if (import.meta.env.DEV) (window as unknown as { __runner?: unknown }).__runner = s;
  }, []);

  const sync = () => {
    const st = s.current;
    const n = { m: Math.floor(st.dist), hearts: st.hearts, score: runScore(st) };
    setHud((h) => (h.m === n.m && h.hearts === n.hearts ? h : n));
  };

  const { wrapRef, canvasRef, paint } = useFillCanvas((ctx, w, h) => {
    const st = s.current;
    const seg = st.segs[st.si];
    // Blickrichtung: beim Abbiegen weich hinterherdrehen
    const target = yawOf(seg.h);
    let from = st.turnFrom;
    while (from - target > Math.PI) from -= Math.PI * 2;
    while (target - from > Math.PI) from += Math.PI * 2;
    const k = 1 - (1 - st.turnT) ** 3;
    const yaw = from + (target - from) * k;
    const [px, pz] = segPoint(seg, st.d, st.laneX);
    const [cxw, czw] = segPoint(seg, st.d, st.laneX * 0.55);
    const back = 4.2;
    const f = Math.min(w * 1.25, h * 0.95);
    const pitch = 0.3;
    const camY = 3 + (st.dead === 'fall' ? 0 : st.y * 0.25);
    const cam: Cam = {
      x: cxw - Math.sin(yaw) * back,
      y: camY,
      z: czw - Math.cos(yaw) * back,
      yaw,
      pitch,
      f,
      cx: w / 2,
      cy: h * (w > h ? 0.52 : 0.45),
      c: Math.cos(yaw),
      s: Math.sin(yaw),
      cp: Math.cos(pitch),
      sp: Math.sin(pitch),
    };
    ctx.save();
    const fxs = fx.current;
    if (fxs.shake > 0) ctx.translate((Math.random() - 0.5) * fxs.shake * 10, (Math.random() - 0.5) * fxs.shake * 10);
    drawSky(ctx, cam, w, h);

    // ── Boden: Platten, Ränder, Seitenwände
    const ground: Item[] = [];
    const first = Math.max(0, st.si - 1);
    for (let i = first; i < Math.min(st.segs.length, st.si + 3); i++) {
      const sg = st.segs[i];
      const start = i === 0 ? -12 : HALF;
      const end = sg.len + HALF;
      const gaps = sg.obs.filter((o) => o.kind === 'gap').map((o) => [o.d - o.len / 2, o.d + o.len / 2]);
      const TL = 2.5;
      for (let d = start; d < end; d += TL) {
        let d0 = d;
        let d1 = Math.min(end, d + TL);
        // Lücken aussparen
        let skip = false;
        for (const [a, b] of gaps) {
          if (d1 <= a || d0 >= b) continue;
          if (d0 >= a && d1 <= b) skip = true;
          else if (d0 < a) d1 = a;
          else d0 = b;
        }
        if (skip || d1 - d0 < 0.05) continue;
        const idx = Math.floor((d + 100) / TL);
        const tile = idx % 2 ? C.tileA : C.tileB;
        const shadeK = 0.94 + ((idx * 37) % 7) * 0.015;
        quadItem(ctx, cam, [wp(sg, d0, -HALF + 0.28, 0), wp(sg, d0, HALF - 0.28, 0), wp(sg, d1, HALF - 0.28, 0), wp(sg, d1, -HALF + 0.28, 0)], tile, shadeK, ground);
        // Fugen zwischen den Spuren
        for (const gx of [-LANE / 2, LANE / 2]) quadItem(ctx, cam, [wp(sg, d0, gx - 0.035, 0.001), wp(sg, d0, gx + 0.035, 0.001), wp(sg, d1, gx + 0.035, 0.001), wp(sg, d1, gx - 0.035, 0.001)], C.rim, 0.95, ground);
        quadItem(ctx, cam, [wp(sg, d0, -HALF, 0), wp(sg, d0, -HALF + 0.28, 0), wp(sg, d1, -HALF + 0.28, 0), wp(sg, d1, -HALF, 0)], C.rim, 1, ground);
        quadItem(ctx, cam, [wp(sg, d0, HALF - 0.28, 0), wp(sg, d0, HALF, 0), wp(sg, d1, HALF, 0), wp(sg, d1, HALF - 0.28, 0)], C.rim, 1, ground);
        // Seitenwände (auf der Abbiege-Seite an der Kreuzung offen)
        for (const side of [-1, 1] as const) {
          const open = side === sg.turn ? sg.len - HALF : end;
          const e1 = Math.min(d1, open);
          if (e1 <= d0) continue;
          const camSide = ((cam.x - segPoint(sg, d0, 0)[0]) * rightOf(sg.h)[0] + (cam.z - segPoint(sg, d0, 0)[1]) * rightOf(sg.h)[1]) * side;
          if (camSide < HALF) continue;
          quadItem(ctx, cam, [wp(sg, d0, side * HALF, 0), wp(sg, e1, side * HALF, 0), wp(sg, e1, side * HALF, -DROP), wp(sg, d0, side * HALF, -DROP)], C.wall, side < 0 ? 0.85 : 0.7, ground);
        }
      }
      // Wände in den Lücken (die gegenüberliegende Kante sieht man)
      for (const [, b] of gaps) quadItem(ctx, cam, [wp(sg, b, -HALF, 0), wp(sg, b, HALF, 0), wp(sg, b, HALF, -DROP), wp(sg, b, -HALF, -DROP)], C.wallDark, 1, ground);
      // Stirnseite am Ende (Abgrund geradeaus)
      quadItem(ctx, cam, [wp(sg, end, -HALF, 0), wp(sg, end, HALF, 0), wp(sg, end, HALF, -DROP), wp(sg, end, -HALF, -DROP)], C.wallDark, 0.9, ground);
      // Pfeile auf dem Boden vor der Kreuzung
      const arrowD = sg.len - 4;
      const ac = toCam(cam, ...wp(sg, arrowD, 0, 0.01));
      if (ac[2] > NEAR && ac[2] < FAR) {
        ground.push({
          z: ac[2] - 0.5,
          draw: () => {
            const tip = project(cam, [toCam(cam, ...wp(sg, arrowD, sg.turn * 1.3, 0.01)), toCam(cam, ...wp(sg, arrowD + 1.1, -sg.turn * 0.5, 0.01)), toCam(cam, ...wp(sg, arrowD - 1.1, -sg.turn * 0.5, 0.01))]);
            if (!tip) return;
            ctx.fillStyle = `rgba(255,215,90,${0.55 + 0.35 * Math.sin(st.t * 8)})`;
            ctx.beginPath();
            ctx.moveTo(tip[0][0], tip[0][1]);
            for (const p of tip.slice(1)) ctx.lineTo(p[0], p[1]);
            ctx.closePath();
            ctx.fill();
          },
        });
      }
    }
    ground.sort((a, b) => b.z - a.z);
    for (const it of ground) it.draw();

    // ── Dinge auf dem Weg
    const objs: Item[] = [];
    for (let i = first; i < Math.min(st.segs.length, st.si + 3); i++) {
      const sg = st.segs[i];
      for (const o of sg.obs) addObstacle(ctx, cam, sg, o, objs);
      for (const ht of sg.hearts) {
        if (ht.got) continue;
        const c3 = toCam(cam, ...wp(sg, ht.d, ht.lane * LANE, ht.y));
        if (c3[2] < NEAR || c3[2] > FAR) continue;
        objs.push({
          z: c3[2],
          draw: () => {
            const ppm = cam.f / c3[2];
            const sx = cam.cx + (cam.f * c3[0]) / c3[2];
            const sy = cam.cy - (cam.f * c3[1]) / c3[2];
            const spin = Math.cos(st.t * 4 + ht.d);
            ctx.save();
            ctx.translate(sx, sy);
            ctx.scale(Math.max(0.15, Math.abs(spin)), 1);
            ctx.fillStyle = fogged(hex('#ff3d7f'), c3[2]);
            heartPath(ctx, 0, 0, ppm * 0.22);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.55)';
            ctx.beginPath();
            oval(ctx, -ppm * 0.08, -ppm * 0.08, ppm * 0.04, ppm * 0.06);
            ctx.fill();
            ctx.restore();
          },
        });
      }
      for (const dec of sg.decor) {
        const side = dec.side * (HALF + (dec.kind === 'torch' ? 0.25 : 0.9));
        const c3 = toCam(cam, ...wp(sg, dec.d, side, 0));
        if (c3[2] < NEAR + 0.5 || c3[2] > FAR) continue;
        objs.push({
          z: c3[2],
          draw: () => {
            const ppm = cam.f / c3[2];
            drawDecor(ctx, dec, cam.cx + (cam.f * c3[0]) / c3[2], cam.cy - (cam.f * c3[1]) / c3[2], ppm, st.t, c3[2]);
          },
        });
      }
    }
    // Läuferin
    const pc = toCam(cam, px, st.y, pz);
    if (pc[2] > NEAR) {
      objs.push({
        z: pc[2],
        draw: () => {
          const ppm = cam.f / pc[2];
          drawRunner(ctx, cam.cx + (cam.f * pc[0]) / pc[2], cam.cy - (cam.f * pc[1]) / pc[2], ppm, st, fxs.phase);
        },
      });
    }
    // Monster dicht dahinter
    if (((st.chase > 0 || st.intro > 0) && !st.dead) || st.dead === 'caught') {
      // Seitlich hinter der Läuferin, damit es sie nicht verdeckt
      const caught = st.dead === 'caught';
      const gap = caught ? 0.4 : 1.1 + Math.max(0, 2.5 - Math.max(st.chase, st.intro)) * 1.1;
      const off = caught ? st.laneX : st.laneX + (st.laneX > 0.3 ? -1.25 : 1.25);
      const [mx, mz] = segPoint(seg, st.d - gap, off);
      const mc = toCam(cam, mx, 0, mz);
      if (mc[2] > NEAR) {
        objs.push({
          z: mc[2],
          draw: () => {
            const ppm = cam.f / mc[2];
            drawMonster(ctx, cam.cx + (cam.f * mc[0]) / mc[2], cam.cy - (cam.f * mc[1]) / mc[2], ppm * 0.55, st.t);
          },
        });
      }
    }
    objs.sort((a, b) => b.z - a.z);
    for (const it of objs) it.draw();
    ctx.restore();

    // ── Anzeige
    if (fxs.flash > 0) {
      ctx.fillStyle = `rgba(255,80,120,${fxs.flash * 0.35})`;
      ctx.fillRect(0, 0, w, h);
    }
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = '900 30px system-ui, sans-serif';
    outlinedText(ctx, `${Math.floor(st.dist)} m`, w / 2, 14, '#fff', 'rgba(70,20,50,0.55)', 5);
    // Abbiege-Hinweis
    const cur = st.segs[st.si];
    if (!st.dead && st.d > cur.len - TURN_WINDOW - 6 && st.d < cur.len + HALF) {
      ctx.font = '900 46px system-ui, sans-serif';
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(st.t * 10);
      outlinedText(ctx, cur.turn < 0 ? '⬅' : '➡', w / 2, h * 0.16, '#ffd43b', 'rgba(90,40,10,0.6)', 6);
      ctx.globalAlpha = 1;
    }
    if (st.chase > 0 && !st.dead && startedRef.current) {
      ctx.font = '800 14px system-ui, sans-serif';
      ctx.globalAlpha = Math.min(1, st.chase / 2);
      outlinedText(ctx, '💜 Das Knuddelmonster ist dir dicht auf den Fersen!', w / 2, 56, '#fff', 'rgba(60,20,80,0.7)', 4);
      ctx.globalAlpha = 1;
    }
    if (st.dead) {
      ctx.font = '900 30px system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      const text = st.dead === 'caught' ? 'Geknuddelt! 💜' : st.dead === 'fall' ? 'Abgestürzt! 😵' : 'Autsch! 💫';
      outlinedText(ctx, text, w / 2, h * 0.3, '#fff', 'rgba(90,20,60,0.7)', 6);
    }
  });

  const act = (i: RunInput) => {
    if (!startedRef.current) {
      startedRef.current = true;
      setStarted(true);
      tone(660, 90, 'square', 0.04);
      return;
    }
    inp.current = { ...inp.current, ...i };
  };

  useLoop((dtRaw) => {
    const st = s.current;
    const dt = Math.min(dtRaw, 1 / 30);
    const fxs = fx.current;
    fxs.shake = Math.max(0, fxs.shake - dt * 3);
    fxs.flash = Math.max(0, fxs.flash - dt * 2.5);
    if (startedRef.current) {
      const ev = runStep(st, dt, inp.current);
      inp.current = {};
      fxs.phase += dt * st.speed * 1.25;
      for (const e of ev) {
        if (e === 'jump') tone(520, 110, 'triangle', 0.05, 900);
        else if (e === 'slide') noise(160, 0.06, 700, 300);
        else if (e === 'lane') noise(60, 0.03, 1500, 900);
        else if (e === 'turn') tone(780, 70, 'triangle', 0.04, 1170);
        else if (e === 'heart') {
          tone(1046 + (st.hearts % 5) * 110, 60, 'square', 0.03);
          sync();
        } else if (e === 'stumble') {
          noise(220, 0.12, 500, 120);
          tone(160, 260, 'sawtooth', 0.05, 80);
          fxs.shake = 0.8;
          fxs.flash = 1;
          buzz(70);
        } else if (e === 'crash' || e === 'caught') {
          noise(500, 0.16, 400, 60);
          tone(140, 600, 'sawtooth', 0.06, 40);
          fxs.shake = 1.4;
          fxs.flash = 1;
          buzz([80, 40, 140]);
        } else if (e === 'fall') {
          tone(600, 900, 'sawtooth', 0.05, 60);
          buzz([60, 40, 60]);
        }
      }
      if (Math.floor(st.dist) !== hud.m && Math.floor(st.dist) % 5 === 0) sync();
      if (st.dead && st.deadT > 1.5 && !ended.current) {
        ended.current = true;
        sync();
        onEnd({ score: runScore(st) });
      }
    } else {
      st.t += dt * 0.2;
    }
    paint();
  }, true);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      const m: Record<string, RunInput> = {
        arrowleft: { side: -1 },
        a: { side: -1 },
        arrowright: { side: 1 },
        d: { side: 1 },
        arrowup: { jump: true },
        w: { jump: true },
        ' ': { jump: true },
        arrowdown: { slide: true },
        s: { slide: true },
      };
      if (!m[k]) return;
      e.preventDefault();
      act(m[k]);
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, []);

  // Wischen: eine Geste pro Bewegung, lange Wischer zählen nicht doppelt
  const sw = useRef<{ id: number; x: number; y: number; used: boolean } | null>(null);
  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    sw.current = { id: e.pointerId, x: e.clientX, y: e.clientY, used: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (!startedRef.current) act({});
  };
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    const g = sw.current;
    if (!g || g.id !== e.pointerId || g.used) return;
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 22) return;
    g.used = true;
    if (Math.abs(dx) > Math.abs(dy)) act({ side: dx > 0 ? 1 : -1 });
    else if (dy < 0) act({ jump: true });
    else act({ slide: true });
  };
  const onUp = (e: RPointerEvent<HTMLDivElement>) => {
    if (sw.current?.id === e.pointerId) sw.current = null;
  };

  return (
    <div className="g-col fill runner">
      <div className="score-strip">
        <span>⭐ {hud.score}</span>
        <span>💗 {hud.hearts}</span>
        <span>🏆 {best ?? '–'}</span>
      </div>
      <div className="canvas-wrap runner-wrap" ref={wrapRef} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <canvas ref={canvasRef} className="amor-canvas" />
        {!started && (
          <div className="canvas-overlay">
            <span className="flappy-start amor-start">
              🏃 Tippen oder wischen zum Loslaufen
              {TIPS.map((t) => (
                <small key={t}>{t}</small>
              ))}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function addObstacle(ctx: CanvasRenderingContext2D, cam: Cam, sg: Seg, o: Obstacle, list: Item[]) {
  if (o.kind === 'gap') return;
  if (o.kind === 'log') {
    boxItem(ctx, cam, sg, o.d, 0, 0.3, HALF - 0.05, 0, 0.55, C.log, C.logTop, list, (face, zc) => {
      // Baumringe an der Stirnseite andeuten
      const [a, , c] = face;
      if (!a || !c) return;
      ctx.strokeStyle = fogged(hex('#5b3a26'), zc);
      ctx.lineWidth = Math.max(1, (cam.f / zc) * 0.03);
      const y = (a[1] + c[1]) / 2;
      ctx.beginPath();
      ctx.moveTo(a[0], y);
      ctx.lineTo(c[0], y);
      ctx.stroke();
    });
    return;
  }
  if (o.kind === 'arch') {
    // Steintor: zwei Pfosten, ein Balken – drunter durchrutschen
    for (const side of [-1, 1]) boxItem(ctx, cam, sg, o.d, side * (HALF - 0.05), 0.35, 0.3, 0, 2.2, C.stone, C.stoneTop, list);
    boxItem(ctx, cam, sg, o.d, 0, 0.35, HALF + 0.3, 1.05, 1.75, C.stone, C.stoneTop, list, (face, zc) => {
      const cx = (face[0][0] + face[2][0]) / 2;
      const cy = (face[0][1] + face[2][1]) / 2;
      ctx.fillStyle = fogged(hex('#e2557f'), zc);
      heartPath(ctx, cx, cy, Math.abs(face[2][1] - face[0][1]) * 0.28);
      ctx.fill();
    });
    return;
  }
  for (const lane of o.lanes) {
    boxItem(ctx, cam, sg, o.d, lane * LANE, 0.5, 0.52, 0, 1.45, C.stone, C.stoneTop, list, (face, zc) => {
      const cx = (face[0][0] + face[2][0]) / 2;
      const cy = (face[0][1] + face[2][1]) / 2;
      const size = Math.abs(face[2][1] - face[0][1]);
      ctx.fillStyle = fogged(C.moss, zc, 0.9);
      ctx.fillRect(Math.min(face[0][0], face[2][0]), Math.min(face[0][1], face[2][1]) + size * 0.82, Math.abs(face[2][0] - face[0][0]), size * 0.18);
      ctx.fillStyle = fogged(hex('#c94a72'), zc);
      heartPath(ctx, cx, cy - size * 0.05, size * 0.17);
      ctx.fill();
    });
  }
}
