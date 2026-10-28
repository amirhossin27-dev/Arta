import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { cls } from '../lib/hooks';
import { burst, buzz, clamp, drawParticles, heartPath, oval, noise, outlinedText, stepParticles, tone, useFillCanvas, useLoop, type Particle } from './engine';
import type { GameProps } from './types';

/** Breite des Panoramas (vorderste Ebene) */
const PANO = 1250;
const ROUND = 90;
const AMMO = 8;
const RELOAD = 0.75;
/** Parallaxe der drei Flugebenen: hinten, Mitte, vorn */
const PAR = [0.42, 0.7, 1];
const SCALE = [0.5, 0.75, 1.05];
const POINTS = [25, 10, 5];
const EDGE = 46;

type Kind = 'bird' | 'gold' | 'balloon';

interface Target {
  kind: Kind;
  depth: 0 | 1 | 2;
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
  amp: number;
  color: string;
  hit?: number;
}

interface Pop {
  x: number;
  y: number;
  text: string;
  life: number;
  color: string;
}

interface Shot {
  x: number;
  y: number;
  t: number;
  hit: boolean;
}

interface AmorState {
  cam: number;
  pan: number;
  targets: Target[];
  spawn: number;
  time: number;
  score: number;
  ammo: number;
  reload: number;
  over: boolean;
  started: boolean;
  t: number;
  parts: Particle[];
  pops: Pop[];
  shots: Shot[];
  aim: { x: number; y: number; t: number } | null;
  sails: number;
  sailSpin: number;
  millDone: boolean;
  signFlip: number;
  snail: number;
  view: { w: number; h: number; s: number };
  hits: number;
  shotsFired: number;
}

const BIRD_COLORS = ['#ffd43b', '#63e6be', '#ff922b', '#74c0fc', '#b197fc', '#ff8787'];

function fresh(): AmorState {
  return {
    cam: (PANO - 380) / 2,
    pan: 0,
    targets: [],
    spawn: 0.3,
    time: ROUND,
    score: 0,
    ammo: AMMO,
    reload: 0,
    over: false,
    started: false,
    t: 0,
    parts: [],
    pops: [],
    shots: [],
    aim: null,
    sails: 0,
    sailSpin: 0.8,
    millDone: false,
    signFlip: 0,
    snail: 0,
    view: { w: 380, h: 600, s: 1 },
    hits: 0,
    shotsFired: 0,
  };
}

// ───── Landschaft (fest, damit sie wie gemalt aussieht) ─────

function ridge(seed: number, x: number) {
  return Math.sin(x * 0.011 + seed) * 0.5 + Math.sin(x * 0.027 + seed * 2.3) * 0.3 + Math.sin(x * 0.061 + seed * 5.1) * 0.2;
}

function layerSpan(view: AmorState['view'], par: number) {
  return view.w + (PANO - view.w) * par;
}

function drawSky(ctx: CanvasRenderingContext2D, st: AmorState) {
  const { w, h } = st.view;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#4b3b9a');
  g.addColorStop(0.45, '#c86fb0');
  g.addColorStop(0.78, '#ff9fb4');
  g.addColorStop(1, '#ffd6a0');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // Sterne ganz oben
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  for (let i = 0; i < 26; i++) {
    const x = ((i * 137.5) % (w + 40)) - ((st.cam * 0.04) % 40);
    const y = (i * 53) % Math.max(60, h * 0.32);
    ctx.globalAlpha = 0.25 + 0.35 * Math.sin(st.t * 1.5 + i);
    ctx.fillRect(x, y, 1.6, 1.6);
  }
  ctx.globalAlpha = 1;
  // Sonne
  const sx = 640 - st.cam * 0.08 - (PANO - w) * 0.04;
  const sy = h - 175;
  const sg = ctx.createRadialGradient(sx, sy, 10, sx, sy, 140);
  sg.addColorStop(0, 'rgba(255,240,200,0.95)');
  sg.addColorStop(0.25, 'rgba(255,200,150,0.55)');
  sg.addColorStop(1, 'rgba(255,170,150,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(sx - 140, sy - 140, 280, 280);
  ctx.fillStyle = '#fff1d6';
  ctx.beginPath();
  ctx.arc(sx, sy, 34, 0, Math.PI * 2);
  ctx.fill();
  // Wolken
  for (let i = 0; i < 8; i++) {
    const span = layerSpan(st.view, 0.14) + 200;
    const x = ((((i * 211 + st.t * (5 + (i % 3) * 3)) % span) + span) % span) - 100 - st.cam * 0.14;
    const y = 40 + ((i * 97) % Math.max(80, h - 330));
    ctx.fillStyle = `rgba(255,232,242,${0.35 + (i % 3) * 0.12})`;
    const s = 0.7 + (i % 4) * 0.25;
    ctx.beginPath();
    oval(ctx, x, y, 42 * s, 12 * s);
    oval(ctx, x + 20 * s, y - 8 * s, 24 * s, 13 * s);
    oval(ctx, x - 18 * s, y - 4 * s, 18 * s, 10 * s);
    ctx.fill();
  }
}

function drawMountains(ctx: CanvasRenderingContext2D, st: AmorState) {
  const { w, h } = st.view;
  const off = st.cam * 0.25;
  const base = h - 120;
  const g = ctx.createLinearGradient(0, base - 120, 0, base + 40);
  g.addColorStop(0, '#9b7fd6');
  g.addColorStop(1, '#d6a3d8');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w + 8; x += 8) {
    const wx = x + off;
    const peak = Math.abs(Math.sin(wx * 0.0085 + 1.3)) * 0.65 + ridge(3, wx) * 0.35;
    ctx.lineTo(x, base - 40 - peak * 85);
  }
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
  // Schneekappen: nur oberhalb einer Linie, an den Berg geschnitten
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgba(255,240,250,0.5)';
  ctx.fillRect(0, 0, w, base - 40 - 0.66 * 85);
  ctx.restore();
}

function drawWindmill(ctx: CanvasRenderingContext2D, st: AmorState, x: number, y: number) {
  // Turm
  ctx.fillStyle = '#f3e3d3';
  ctx.beginPath();
  ctx.moveTo(x - 14, y + 46);
  ctx.lineTo(x - 9, y);
  ctx.lineTo(x + 9, y);
  ctx.lineTo(x + 14, y + 46);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#d9486f';
  ctx.beginPath();
  ctx.moveTo(x - 12, y + 2);
  ctx.lineTo(x, y - 12);
  ctx.lineTo(x + 12, y + 2);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#8b5a3c';
  ctx.fillRect(x - 3, y + 34, 6, 12);
  ctx.fillStyle = '#ff6fa5';
  heartPath(ctx, x, y + 18, 4);
  ctx.fill();
  // Flügel
  ctx.save();
  ctx.translate(x, y - 2);
  ctx.rotate(st.sails);
  for (let k = 0; k < 4; k++) {
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = '#7a4e33';
    ctx.fillRect(-1, 0, 2, 34);
    ctx.fillStyle = st.millDone ? '#ffd1e3' : '#fff7ee';
    ctx.fillRect(1, 8, 8, 25);
    ctx.strokeStyle = 'rgba(120,80,60,0.4)';
    ctx.lineWidth = 0.6;
    for (let r = 12; r < 33; r += 5) {
      ctx.beginPath();
      ctx.moveTo(1, r);
      ctx.lineTo(9, r);
      ctx.stroke();
    }
  }
  ctx.fillStyle = '#5c3a26';
  ctx.beginPath();
  ctx.arc(0, 0, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

const millPos = (st: AmorState) => ({ x: 830 * 0.55 + 140 - st.cam * 0.5, y: st.view.h - 150 });

function drawHills(ctx: CanvasRenderingContext2D, st: AmorState) {
  const { w, h } = st.view;
  const off = st.cam * 0.5;
  const base = h - 92;
  const g = ctx.createLinearGradient(0, base - 60, 0, h);
  g.addColorStop(0, '#7cc79a');
  g.addColorStop(1, '#3f8f68');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w + 8; x += 8) ctx.lineTo(x, base - 22 - ridge(7, x + off) * 26);
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
  // Bäumchen
  for (let i = 0; i < 22; i++) {
    const wx = i * 53 + 20;
    const x = wx - off;
    if (x < -20 || x > w + 20) continue;
    const y = base - 22 - ridge(7, wx) * 26;
    if (i % 3 === 0) {
      ctx.fillStyle = '#2f7552';
      ctx.beginPath();
      ctx.moveTo(x - 7, y + 3);
      ctx.lineTo(x, y - 20);
      ctx.lineTo(x + 7, y + 3);
      ctx.fill();
    } else {
      ctx.fillStyle = '#6b4a3a';
      ctx.fillRect(x - 1, y - 6, 2, 8);
      ctx.fillStyle = i % 2 ? '#55a877' : '#ff9cc2';
      ctx.beginPath();
      ctx.arc(x, y - 10, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const m = millPos(st);
  if (m.x > -60 && m.x < w + 60) drawWindmill(ctx, st, m.x, m.y);
  // Schlösschen
  const cx = 300 - off;
  if (cx > -60 && cx < w + 60) {
    const cy = base - 22 - ridge(7, 300) * 26;
    ctx.fillStyle = '#f0d7e4';
    ctx.fillRect(cx - 18, cy - 26, 36, 28);
    ctx.fillRect(cx - 24, cy - 38, 10, 40);
    ctx.fillRect(cx + 14, cy - 38, 10, 40);
    ctx.fillStyle = '#c2457a';
    for (const tx of [cx - 19, cx + 19]) {
      ctx.beginPath();
      ctx.moveTo(tx - 7, cy - 38);
      ctx.lineTo(tx, cy - 52);
      ctx.lineTo(tx + 7, cy - 38);
      ctx.fill();
    }
    ctx.fillStyle = '#8b3a62';
    ctx.beginPath();
    ctx.arc(cx, cy, 6, Math.PI, 0);
    ctx.fill();
    ctx.strokeStyle = '#6b4a3a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx + 19, cy - 52);
    ctx.lineTo(cx + 19, cy - 64);
    ctx.stroke();
    ctx.fillStyle = '#ff4f81';
    heartPath(ctx, cx + 24, cy - 61, 4 + Math.sin(st.t * 4) * 0.4);
    ctx.fill();
  }
}

function drawMeadow(ctx: CanvasRenderingContext2D, st: AmorState) {
  const { w, h } = st.view;
  const off = st.cam * 0.75;
  const base = h - 54;
  const g = ctx.createLinearGradient(0, base - 30, 0, h);
  g.addColorStop(0, '#62b866');
  g.addColorStop(1, '#3c8a48');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(0, h);
  for (let x = 0; x <= w + 8; x += 8) ctx.lineTo(x, base - 10 - ridge(11, x + off) * 14);
  ctx.lineTo(w, h);
  ctx.closePath();
  ctx.fill();
  // Büsche mit Blüten
  for (let i = 0; i < 26; i++) {
    const wx = i * 47 + ((i * 31) % 20);
    const x = wx - off;
    if (x < -30 || x > w + 30) continue;
    const y = base - 6 - ridge(11, wx) * 14;
    ctx.fillStyle = '#3f9450';
    ctx.beginPath();
    ctx.arc(x, y, 11, Math.PI, 0);
    ctx.arc(x + 12, y + 2, 8, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = ['#ffd6e8', '#ffe066', '#ffffff'][i % 3];
    for (let k = 0; k < 3; k++) ctx.fillRect(x - 5 + k * 6, y - 6 - (k % 2) * 3, 2.2, 2.2);
  }
}

function drawForeground(ctx: CanvasRenderingContext2D, st: AmorState) {
  const { w, h } = st.view;
  const off = st.cam;
  const base = h - 22;
  // großer Baum
  const tx = 560 - off;
  if (tx > -120 && tx < w + 120) {
    ctx.fillStyle = '#6b4433';
    ctx.beginPath();
    ctx.moveTo(tx - 16, h);
    ctx.quadraticCurveTo(tx - 8, base - 80, tx - 12, base - 150);
    ctx.lineTo(tx + 12, base - 150);
    ctx.quadraticCurveTo(tx + 6, base - 80, tx + 18, h);
    ctx.fill();
    ctx.strokeStyle = '#6b4433';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(tx, base - 120);
    ctx.quadraticCurveTo(tx + 30, base - 140, tx + 52, base - 168);
    ctx.stroke();
    for (const [dx, dy, r, c] of [
      [-30, -175, 38, '#2f7d4f'],
      [26, -190, 44, '#37905a'],
      [-4, -215, 40, '#3d9a62'],
      [52, -168, 30, '#2f7d4f'],
      [-50, -150, 26, '#37905a'],
    ] as const) {
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(tx + dx, base + dy, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ff8fb8';
    for (let k = 0; k < 9; k++) {
      heartPath(ctx, tx - 50 + ((k * 37) % 110), base - 230 + ((k * 23) % 90), 3.5);
      ctx.fill();
    }
  }
  // Zaun
  ctx.fillStyle = '#c99a6b';
  const fStart = Math.floor(off / 34) * 34;
  for (let wx = fStart; wx < off + w + 34; wx += 34) {
    const x = wx - off;
    ctx.fillRect(x - 3, base - 34, 6, 40);
    ctx.beginPath();
    ctx.moveTo(x - 3, base - 34);
    ctx.lineTo(x, base - 39);
    ctx.lineTo(x + 3, base - 34);
    ctx.fill();
  }
  ctx.fillStyle = '#b5845a';
  ctx.fillRect(0, base - 27, w, 4);
  ctx.fillRect(0, base - 14, w, 4);
  // Schnecke auf dem Zaun
  const sx = 1010 - off;
  if (sx > -30 && sx < w + 30) {
    const sy = base - 27;
    ctx.save();
    ctx.translate(sx + Math.sin(st.t * 0.4) * 6, sy);
    if (st.snail > 0) {
      ctx.fillStyle = '#ffb3d1';
      ctx.beginPath();
      ctx.arc(0, -6, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff4f81';
      heartPath(ctx, 0, -6, 3);
      ctx.fill();
    } else {
      ctx.fillStyle = '#c7f2a4';
      ctx.beginPath();
      oval(ctx, 4, -1.5, 10, 2.5);
      ctx.fill();
      ctx.strokeStyle = '#c7f2a4';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(11, -2);
      ctx.lineTo(13, -9);
      ctx.moveTo(9, -2);
      ctx.lineTo(9, -8);
      ctx.stroke();
      ctx.fillStyle = '#d98c5f';
      ctx.beginPath();
      ctx.arc(0, -6, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#8f5032';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, -6, 4, 0, Math.PI * 1.6);
      ctx.stroke();
    }
    ctx.restore();
  }
  // Wegweiser
  const px = 250 - off;
  if (px > -50 && px < w + 50) {
    ctx.fillStyle = '#8b5a3c';
    ctx.fillRect(px - 2.5, base - 60, 5, 66);
    ctx.save();
    ctx.translate(px, base - 52);
    ctx.scale(Math.cos(st.signFlip * Math.PI), 1);
    ctx.fillStyle = st.signFlip > 0.5 ? '#ff6fa5' : '#e8c39e';
    ctx.beginPath();
    ctx.moveTo(-26, -9);
    ctx.lineTo(20, -9);
    ctx.lineTo(28, 0);
    ctx.lineTo(20, 9);
    ctx.lineTo(-26, 9);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = st.signFlip > 0.5 ? '#fff' : '#6b4433';
    ctx.font = '800 9px system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(st.signFlip > 0.5 ? '💗 +25' : 'ARTA', 0, 0.5);
    ctx.restore();
  }
  // Gras
  ctx.fillStyle = '#2f7a3d';
  ctx.fillRect(0, base, w, h - base);
  ctx.strokeStyle = '#3c9a4c';
  ctx.lineWidth = 2;
  ctx.beginPath();
  const gStart = Math.floor(off / 7) * 7;
  for (let wx = gStart; wx < off + w + 7; wx += 7) {
    const x = wx - off;
    const hh = 6 + ((wx * 13) % 9);
    ctx.moveTo(x, base + 4);
    ctx.lineTo(x + Math.sin(st.t * 2 + wx) * 1.5 + 2, base - hh);
  }
  ctx.stroke();
}

function drawBird(ctx: CanvasRenderingContext2D, tg: Target, x: number, y: number, t: number) {
  const s = SCALE[tg.depth] * (tg.kind === 'gold' ? 0.9 : 1);
  const dir = tg.vx >= 0 ? 1 : -1;
  const love = tg.hit !== undefined;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s * dir, s);
  if (love) ctx.rotate(Math.sin(tg.hit! * 10) * 0.3);
  const flap = Math.sin(t * (love ? 30 : 16) + tg.amp * 10);
  const body = tg.kind === 'gold' ? '#ffcf33' : tg.color;
  // hinterer Flügel
  ctx.fillStyle = shade(body, -0.18);
  ctx.beginPath();
  oval(ctx, -2, -6, 12, 5, -0.9 - flap * 0.7);
  ctx.fill();
  // Körper
  const g = ctx.createRadialGradient(-4, -6, 2, 0, 0, 18);
  g.addColorStop(0, shade(body, 0.3));
  g.addColorStop(1, body);
  ctx.fillStyle = g;
  ctx.beginPath();
  oval(ctx, 0, 0, 16, 13);
  ctx.fill();
  // Bauch
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  oval(ctx, 3, 5, 9, 6);
  ctx.fill();
  // Schwanz + Schopf
  ctx.fillStyle = shade(body, -0.25);
  ctx.beginPath();
  ctx.moveTo(-14, -2);
  ctx.lineTo(-24, -8);
  ctx.lineTo(-22, 2);
  ctx.lineTo(-25, 7);
  ctx.lineTo(-13, 4);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(2, -12);
  ctx.quadraticCurveTo(0, -20, 6, -19);
  ctx.quadraticCurveTo(4, -15, 7, -12);
  ctx.fill();
  // Schnabel
  ctx.fillStyle = '#ff9f43';
  ctx.beginPath();
  ctx.moveTo(14, -1);
  ctx.lineTo(22, 2);
  ctx.lineTo(14, 5);
  ctx.closePath();
  ctx.fill();
  // Auge
  if (love) {
    ctx.fillStyle = '#ff2f6d';
    heartPath(ctx, 8, -3, 5);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,120,160,0.7)';
    ctx.beginPath();
    oval(ctx, 6, 5, 4, 2.5);
    ctx.fill();
  } else {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    oval(ctx, 8, -3, 5, 6);
    ctx.fill();
    ctx.fillStyle = '#20112b';
    ctx.beginPath();
    ctx.arc(9.5, -2.5, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(10.5, -3.6, 1, 0, Math.PI * 2);
    ctx.fill();
  }
  // vorderer Flügel
  ctx.fillStyle = shade(body, 0.12);
  ctx.beginPath();
  oval(ctx, -3, -2, 11, 5.5, -0.5 + flap * 0.8);
  ctx.fill();
  if (tg.kind === 'gold') {
    ctx.fillStyle = '#fff6bf';
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 9);
    for (let k = 0; k < 3; k++) {
      const a = t * 3 + k * 2.1;
      ctx.fillRect(Math.cos(a) * 22 - 1, Math.sin(a) * 16 - 1, 2.4, 2.4);
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawBalloon(ctx: CanvasRenderingContext2D, tg: Target, x: number, y: number) {
  const s = SCALE[tg.depth];
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.strokeStyle = 'rgba(80,40,70,0.6)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 14);
  ctx.quadraticCurveTo(5, 28, 0, 42);
  ctx.stroke();
  ctx.fillStyle = '#ff3d7f';
  heartPath(ctx, 0, 0, 18);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  oval(ctx, -8, -8, 4, 6, -0.5);
  ctx.fill();
  ctx.restore();
}

function shade(hex: string, k: number) {
  const n = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const m = n.map((v) => Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k)));
  return `rgb(${m.join(',')})`;
}

/** Bildschirm-Position eines Ziels */
function screenPos(st: AmorState, tg: Target) {
  return { x: tg.x - st.cam * PAR[tg.depth], y: tg.y + (tg.kind === 'bird' || tg.kind === 'gold' ? Math.sin(tg.t * 2.2 + tg.amp * 6) * tg.amp * 18 : 0) };
}

function spawnTarget(st: AmorState) {
  const { h } = st.view;
  const r = Math.random();
  const kind: Kind = r < 0.07 ? 'gold' : r < 0.17 ? 'balloon' : 'bird';
  const depth = (kind === 'gold' ? 2 : kind === 'balloon' ? 1 : Math.random() < 0.34 ? 0 : Math.random() < 0.55 ? 1 : 2) as 0 | 1 | 2;
  const span = layerSpan(st.view, PAR[depth]);
  const fromLeft = Math.random() < 0.5;
  // Meist kurz außerhalb des sichtbaren Ausschnitts starten, damit immer etwas los ist
  const near = Math.random() < 0.65;
  const viewL = st.cam * PAR[depth];
  const startX = near ? (fromLeft ? viewL - 30 : viewL + st.view.w + 30) : fromLeft ? -30 : span + 30;
  const speed = (kind === 'gold' ? 190 : [34, 58, 92][depth]) * (0.8 + Math.random() * 0.5) * (1 + (ROUND - st.time) / ROUND * 0.35);
  const top = 50;
  const bottom = h - [150, 120, 90][depth];
  if (kind === 'balloon') {
    st.targets.push({ kind, depth, x: st.cam * PAR[depth] + 40 + Math.random() * (st.view.w - 80), y: h + 40, vx: (Math.random() - 0.5) * 16, vy: -(26 + Math.random() * 18), t: 0, amp: Math.random(), color: '#ff3d7f' });
    return;
  }
  st.targets.push({
    kind,
    depth,
    x: startX,
    y: top + Math.random() * Math.max(40, bottom - top),
    vx: fromLeft ? speed : -speed,
    vy: 0,
    t: Math.random() * 10,
    amp: 0.3 + Math.random() * 0.7,
    color: BIRD_COLORS[Math.floor(Math.random() * BIRD_COLORS.length)],
  });
}

export function Amor({ best, onEnd }: GameProps) {
  const s = useRef<AmorState>(fresh());
  const [hud, setHud] = useState({ score: 0, time: ROUND, ammo: AMMO, reloading: false });
  const [started, setStarted] = useState(false);
  const keys = useRef({ l: false, r: false });
  const edge = useRef<{ id: number; dir: number } | null>(null);
  const mouseEdge = useRef(0);
  const ended = useRef(false);

  const sync = () => {
    const st = s.current;
    const n = { score: st.score, time: Math.ceil(st.time), ammo: st.ammo, reloading: st.reload > 0 };
    setHud((h) => (h.score === n.score && h.time === n.time && h.ammo === n.ammo && h.reloading === n.reloading ? h : n));
  };

  const { wrapRef, canvasRef, paint } = useFillCanvas((ctx, cw, ch) => {
    const st = s.current;
    const sc = Math.min(cw / 380, ch / 300);
    st.view = { w: cw / sc, h: ch / sc, s: sc };
    st.cam = clamp(st.cam, 0, Math.max(0, PANO - st.view.w));
    ctx.save();
    ctx.scale(sc, sc);
    const { w, h } = st.view;
    drawSky(ctx, st);
    drawMountains(ctx, st);
    const layer = (d: number) => {
      for (const tg of st.targets) {
        if (tg.depth !== d) continue;
        const p = screenPos(st, tg);
        if (p.x < -40 || p.x > w + 40) continue;
        if (tg.kind === 'balloon') drawBalloon(ctx, tg, p.x, p.y);
        else drawBird(ctx, tg, p.x, p.y, st.t);
      }
    };
    layer(0);
    drawHills(ctx, st);
    layer(1);
    drawMeadow(ctx, st);
    drawForeground(ctx, st);
    layer(2);

    // Pfeile
    for (const sh of st.shots) {
      const k = Math.min(1, sh.t / 0.09);
      const bx = w / 2;
      const by = h - 20;
      const x = bx + (sh.x - bx) * k;
      const y = by + (sh.y - by) * k;
      if (k < 1) {
        ctx.strokeStyle = 'rgba(255,255,255,0.75)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(bx + (sh.x - bx) * Math.max(0, k - 0.4), by + (sh.y - by) * Math.max(0, k - 0.4));
        ctx.lineTo(x, y);
        ctx.stroke();
      } else if (!sh.hit) {
        // steckengebliebener Pfeil verblasst
        ctx.globalAlpha = Math.max(0, 1 - (sh.t - 0.09) / 0.8);
        const a = Math.atan2(sh.y - by, sh.x - bx);
        ctx.save();
        ctx.translate(sh.x, sh.y);
        ctx.rotate(a);
        ctx.strokeStyle = '#8b5a3c';
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(-14, 0);
        ctx.lineTo(0, 0);
        ctx.stroke();
        ctx.fillStyle = '#ff6fa5';
        ctx.fillRect(-15, -2.5, 4, 5);
        ctx.restore();
        ctx.globalAlpha = 1;
      }
    }
    drawParticles(ctx, st.parts);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const p of st.pops) {
      ctx.globalAlpha = Math.min(1, p.life * 2);
      ctx.font = '900 17px system-ui, sans-serif';
      outlinedText(ctx, p.text, p.x, p.y, p.color, 'rgba(60,10,50,0.6)', 4);
    }
    ctx.globalAlpha = 1;

    // Bogen unten in der Mitte
    const aim = st.aim;
    const ang = aim ? Math.atan2(aim.y - (h - 20), aim.x - w / 2) : -Math.PI / 2;
    ctx.save();
    ctx.translate(w / 2, h - 16);
    ctx.rotate(ang + Math.PI / 2);
    ctx.strokeStyle = '#ff4f81';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 6, 24, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(Math.cos(Math.PI * 1.15) * 24, 6 + Math.sin(Math.PI * 1.15) * 24);
    ctx.lineTo(0, st.reload > 0 || st.ammo === 0 ? -4 : 6);
    ctx.lineTo(Math.cos(Math.PI * 1.85) * 24, 6 + Math.sin(Math.PI * 1.85) * 24);
    ctx.stroke();
    if (st.ammo > 0 && st.reload <= 0) {
      ctx.strokeStyle = '#8b5a3c';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, 6);
      ctx.lineTo(0, -26);
      ctx.stroke();
      ctx.fillStyle = '#ff2f6d';
      heartPath(ctx, 0, -28, 4.5);
      ctx.fill();
    }
    ctx.restore();

    // Fadenkreuz
    if (aim && st.t - aim.t < 0.5) {
      const a = 1 - (st.t - aim.t) / 0.5;
      ctx.globalAlpha = a;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(aim.x, aim.y, 11, 0, Math.PI * 2);
      ctx.moveTo(aim.x - 16, aim.y);
      ctx.lineTo(aim.x - 6, aim.y);
      ctx.moveTo(aim.x + 6, aim.y);
      ctx.lineTo(aim.x + 16, aim.y);
      ctx.moveTo(aim.x, aim.y - 16);
      ctx.lineTo(aim.x, aim.y - 6);
      ctx.moveTo(aim.x, aim.y + 6);
      ctx.lineTo(aim.x, aim.y + 16);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Pfeilvorrat
    for (let i = 0; i < AMMO; i++) {
      const x = 12 + i * 9;
      const y = h - 34;
      ctx.globalAlpha = i < st.ammo ? 1 : 0.22;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(x, y + 22);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = '#ff2f6d';
      heartPath(ctx, x, y - 2, 3.4);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Seitenpfeile zum Schwenken – mit Hinweis auf Vögel außerhalb
    for (const dir of [-1, 1]) {
      const can = dir < 0 ? st.cam > 1 : st.cam < PANO - w - 1;
      if (!can) continue;
      const out = st.targets.filter((tg) => tg.hit === undefined && (dir < 0 ? screenPos(st, tg).x < 0 : screenPos(st, tg).x > w)).length;
      const x = dir < 0 ? 0 : w - EDGE / sc;
      const ew = EDGE / sc;
      const g = ctx.createLinearGradient(dir < 0 ? x : x + ew, 0, dir < 0 ? x + ew : x, 0);
      g.addColorStop(0, 'rgba(30,10,40,0.35)');
      g.addColorStop(1, 'rgba(30,10,40,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, 0, ew, h);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '900 22px system-ui';
      ctx.fillText(dir < 0 ? '‹' : '›', x + ew / 2, h * 0.45);
      if (out) {
        ctx.font = '800 11px system-ui';
        ctx.fillStyle = '#ffd43b';
        ctx.fillText(`${out}🐦`, x + ew / 2, h * 0.45 + 22);
      }
    }

    if (!st.started) {
      ctx.fillStyle = 'rgba(20,6,30,0.45)';
      ctx.fillRect(0, 0, w, h);
    }
    if (st.time <= 10 && !st.over && st.started) {
      ctx.font = '900 54px system-ui, sans-serif';
      ctx.globalAlpha = 0.3 + 0.2 * Math.sin(st.t * 6);
      outlinedText(ctx, String(Math.ceil(st.time)), w / 2, h * 0.3, '#fff', 'rgba(120,20,60,0.6)', 6);
      ctx.globalAlpha = 1;
    }
    if (st.over) {
      ctx.fillStyle = 'rgba(20,6,30,0.35)';
      ctx.fillRect(0, 0, w, h);
      ctx.font = '900 40px system-ui, sans-serif';
      outlinedText(ctx, 'Zeit! 💘', w / 2, h * 0.4, '#fff', 'rgba(120,20,60,0.7)', 7);
    }
    ctx.restore();
  });

  const award = (pts: number, x: number, y: number, color = '#fff') => {
    const st = s.current;
    st.score += pts;
    st.pops.push({ x, y: y - 14, text: `+${pts}`, life: 1, color });
  };

  const begin = () => {
    s.current.started = true;
    setStarted(true);
  };

  const shoot = (x: number, y: number) => {
    const st = s.current;
    if (st.over) return;
    if (!st.started) {
      begin();
      return;
    }
    st.aim = { x, y, t: st.t };
    if (st.reload > 0) return;
    if (st.ammo <= 0) {
      tone(140, 60, 'square', 0.03);
      st.pops.push({ x: st.view.w / 2, y: st.view.h - 70, text: 'Nachladen!', life: 0.8, color: '#ffd43b' });
      return;
    }
    st.ammo--;
    st.shotsFired++;
    noise(70, 0.08, 1800, 600);
    tone(900, 50, 'triangle', 0.03, 500);
    let hit = false;
    // vorn zuerst, Ballons und Goldvögel inklusive
    const order = [...st.targets].filter((tg) => tg.hit === undefined).sort((a, b) => b.depth - a.depth);
    for (const tg of order) {
      const p = screenPos(st, tg);
      const r = (tg.kind === 'balloon' ? 19 : 17) * SCALE[tg.depth] + 4;
      if ((p.x - x) ** 2 + (p.y - y - (tg.kind === 'balloon' ? 0 : 0)) ** 2 > r * r) continue;
      hit = true;
      tg.hit = 0;
      st.hits++;
      if (tg.kind === 'balloon') {
        award(15, p.x, p.y, '#ffd1e6');
        burst(st.parts, p.x, p.y, '#ff3d7f', 18, 160, { heart: true, size: 3.5 });
        tg.hit = 99;
        tone(1200, 90, 'square', 0.04, 300);
      } else {
        const pts = tg.kind === 'gold' ? 50 : POINTS[tg.depth];
        award(pts, p.x, p.y, tg.kind === 'gold' ? '#ffd43b' : '#fff');
        burst(st.parts, p.x, p.y, '#ff6fa5', 10, 110, { heart: true, size: 3 });
        burst(st.parts, p.x, p.y, '#fff', 6, 90);
        tone(tg.kind === 'gold' ? 1320 : 780, 120, 'triangle', 0.05, tg.kind === 'gold' ? 1980 : 1170);
      }
      buzz(15);
      break;
    }
    // Versteckte Ziele
    if (!hit) {
      const m = millPos(st);
      if (!st.millDone && Math.hypot(x - m.x, y - (m.y - 2)) < 34) {
        st.millDone = true;
        st.sailSpin = 9;
        award(25, m.x, m.y - 30, '#ffd43b');
        tone(500, 300, 'sawtooth', 0.03, 1500);
        hit = true;
      } else if (st.signFlip === 0 && Math.abs(x - (250 - st.cam)) < 28 && Math.abs(y - (st.view.h - 22 - 52)) < 12) {
        st.signFlip = 0.001;
        award(25, x, y, '#ffd43b');
        tone(660, 200, 'triangle', 0.05, 990);
        hit = true;
      } else if (st.snail === 0 && Math.abs(x - (1010 - st.cam)) < 14 && Math.abs(y - (st.view.h - 22 - 33)) < 12) {
        st.snail = 1;
        award(50, x, y, '#ffd43b');
        burst(st.parts, x, y, '#ffd43b', 14, 120);
        tone(1046, 300, 'square', 0.04, 2093);
        hit = true;
      }
    }
    st.shots.push({ x, y, t: 0, hit });
    if (!hit) burst(st.parts, x, y, 'rgba(255,255,255,0.8)', 5, 50);
    sync();
  };

  const reload = () => {
    const st = s.current;
    if (st.over || st.reload > 0 || st.ammo === AMMO) return;
    st.reload = RELOAD;
    noise(160, 0.05, 900, 400);
    window.setTimeout(() => tone(520, 50, 'triangle', 0.04), 320);
    window.setTimeout(() => tone(700, 60, 'triangle', 0.04), 600);
    sync();
  };

  useLoop((dtRaw) => {
    const st = s.current;
    const dt = Math.min(dtRaw, 1 / 30);
    st.t += dt;
    stepParticles(st.parts, dt);
    for (const p of st.pops) {
      p.life -= dt;
      p.y -= 26 * dt;
    }
    st.pops = st.pops.filter((p) => p.life > 0);
    for (const sh of st.shots) sh.t += dt;
    st.shots = st.shots.filter((sh) => sh.t < 1);
    st.sailSpin += (0.8 - st.sailSpin) * Math.min(1, dt * 0.6);
    st.sails += st.sailSpin * dt;
    if (st.signFlip > 0 && st.signFlip < 1) st.signFlip = Math.min(1, st.signFlip + dt * 3);

    // Schwenken
    let pan = 0;
    if (keys.current.l) pan -= 1;
    if (keys.current.r) pan += 1;
    if (edge.current) pan += edge.current.dir;
    pan += mouseEdge.current;
    st.cam = clamp(st.cam + clamp(pan, -1, 1) * 520 * dt, 0, Math.max(0, PANO - st.view.w));

    if (st.started && !st.over) {
      st.time -= dt;
      if (st.reload > 0) {
        st.reload -= dt;
        if (st.reload <= 0) {
          st.ammo = AMMO;
          sync();
        }
      }
      if (Math.ceil(st.time) !== Math.ceil(st.time + dt)) {
        if (st.time <= 10) tone(st.time <= 3 ? 990 : 660, 60, 'square', 0.035);
        sync();
      }
      st.spawn -= dt;
      const alive = st.targets.filter((tg) => tg.hit === undefined).length;
      if (st.spawn <= 0 && alive < 12) {
        spawnTarget(st);
        st.spawn = 0.3 + Math.random() * 0.6;
      }
      if (st.time <= 0) {
        st.time = 0;
        st.over = true;
        sync();
        tone(523, 160, 'square', 0.05);
        window.setTimeout(() => tone(659, 160, 'square', 0.05), 170);
        window.setTimeout(() => tone(784, 300, 'square', 0.05), 340);
      }
    } else if (st.over && !ended.current) {
      st.time -= dt;
      if (st.time < -1.8) {
        ended.current = true;
        onEnd({ score: st.score });
      }
    }

    for (const tg of st.targets) {
      tg.t += dt;
      if (tg.hit !== undefined) {
        tg.hit += dt;
        tg.vy -= 260 * dt;
        tg.y += tg.vy * dt * 0.5;
        tg.x += tg.vx * dt * 0.3;
        if (Math.random() < dt * 12) {
          const p = screenPos(st, tg);
          st.parts.push({ x: p.x, y: p.y, vx: (Math.random() - 0.5) * 40, vy: 30, life: 0.7, max: 0.7, size: 2.5, color: '#ff8fb8', heart: true });
        }
        continue;
      }
      tg.x += tg.vx * dt;
      tg.y += tg.vy * dt;
    }
    st.targets = st.targets.filter((tg) => {
      const span = layerSpan(st.view, PAR[tg.depth]);
      if (tg.hit !== undefined && (tg.hit > 2 || tg.y < -60)) return false;
      if (tg.kind === 'balloon') return tg.y > -60;
      return tg.x > -60 && tg.x < span + 60;
    });
    paint();
  }, true);

  useEffect(() => {
    const set = (e: KeyboardEvent, v: boolean) => {
      const k = e.key.toLowerCase();
      if (k === 'arrowleft' || k === 'a') keys.current.l = v;
      else if (k === 'arrowright' || k === 'd') keys.current.r = v;
      else if (v && (k === 'r' || k === ' ' || k === 'arrowdown')) reload();
      else return;
      e.preventDefault();
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

  const logical = (e: RPointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const sc = s.current.view.s || 1;
    return { x: (e.clientX - r.left) / sc, y: (e.clientY - r.top) / sc, sx: e.clientX - r.left, w: r.width };
  };

  const onDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button === 2) {
      reload();
      return;
    }
    const p = logical(e);
    // Ränder schwenken statt schießen
    if (p.sx < EDGE || p.sx > p.w - EDGE) {
      if (!s.current.started) begin();
      edge.current = { id: e.pointerId, dir: p.sx < EDGE ? -1 : 1 };
      e.currentTarget.setPointerCapture?.(e.pointerId);
      return;
    }
    shoot(p.x, p.y);
  };
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse') return;
    const p = logical(e);
    // Maus am Rand schwenkt – wie früher am PC
    mouseEdge.current = p.sx < EDGE ? -1 : p.sx > p.w - EDGE ? 1 : 0;
    if (s.current.started && !edge.current) s.current.aim = { x: p.x, y: p.y, t: s.current.t };
  };
  const onUp = (e: RPointerEvent<HTMLDivElement>) => {
    if (edge.current?.id === e.pointerId) edge.current = null;
  };


  return (
    <div className="g-col fill amor">
      <div className="score-strip">
        <span>🎯 {hud.score}</span>
        <span className={cls(hud.time <= 10 && 'amor-hurry')}>⏱ {hud.time}</span>
        <span>🏆 {best ?? '–'}</span>
      </div>
      <div
        className="canvas-wrap amor-wrap"
        ref={wrapRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={() => (mouseEdge.current = 0)}
        onContextMenu={(e) => e.preventDefault()}
      >
        <canvas ref={canvasRef} className="amor-canvas" />
        {!started && (
          <div className="canvas-overlay">
            <span className="flappy-start amor-start">
              🏹 Tippe auf die Vögel – verliebt fliegen sie davon!
              <small>Am Rand schwenken · Köcher zum Nachladen · Tippen zum Start</small>
            </span>
          </div>
        )}
        <button
          className={cls('amor-quiver', hud.ammo === 0 && 'empty', hud.reloading && 'busy')}
          onPointerDown={(e) => {
            e.stopPropagation();
            reload();
          }}
          aria-label="Nachladen"
        >
          <span>🏹</span>
          <small>{hud.reloading ? '…' : hud.ammo === 0 ? 'Laden!' : 'Laden'}</small>
        </button>
      </div>
    </div>
  );
}
