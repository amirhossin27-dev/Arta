import { useEffect, useRef, useState, type CSSProperties, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent } from 'react';
import { cls } from '../lib/hooks';
import { buzz, hum, sfx, tone, useLoop } from './engine';
import {
  COUNTDOWN,
  ITEM_EMOJI,
  LAPS,
  WALL,
  WORLD,
  ROAD,
  ahead,
  applyZap,
  bump,
  decideOnline,
  driftLevel,
  fmtTime,
  getTrack,
  hitBananas,
  kiInput,
  kiVmax,
  newCourse,
  newKart,
  packKart,
  seeded,
  stepKart,
  sweepBananas,
  tickCourse,
  trackPoint,
  unpackHazards,
  wrapAngle,
  type Course,
  type Hazard,
  type Input,
  type ItemKind,
  type KartEvent,
  type KartState,
  type NetKart,
  type Rival,
  type Track,
} from './kart';
import { otherSide, type Side } from './logic';
import type { GameProps, Player } from './types';

/** Nur im Test-Build: Die Karts der Menschen fahren von selbst. */
const AUTOPILOT = import.meta.env.VITE_KART_AUTOPILOT === '1';

/** Breite des Bildes in echten Retro-Pixeln – die Höhe richtet sich nach dem Platz. */
const VIEW_W = 256;
const HORIZON = 0.34;
const CAM_DIST = 52;
const KART_Y = 0.84;
/** So oft geht der eigene Stand online raus (Sekunden) */
const NET_EVERY = 0.11;
/** Meldet sich das andere Handy so lange nicht, ist das Rennen entschieden. */
const NET_TIMEOUT = 8;
const ITEMS: ItemKind[] = ['pilz', 'banane', 'pfeil'];

// ───────────────────────── Grafik ─────────────────────────

const rgba = (r: number, g: number, b: number) => ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
const G1 = rgba(98, 178, 84);
const G2 = rgba(86, 164, 74);

interface Assets {
  tex: Uint32Array;
  hills: HTMLCanvasElement;
  trees: HTMLCanvasElement[];
  box: HTMLCanvasElement;
  banana: HTMLCanvasElement;
  arrow: HTMLCanvasElement;
  map: HTMLCanvasElement;
  karts: Map<string, HTMLCanvasElement>;
}

let assets: Assets | undefined;

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function heartPath(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.beginPath();
  g.moveTo(x, y + s * 0.35);
  g.bezierCurveTo(x - s * 0.05, y + s * 0.1, x - s * 0.5, y + s * 0.05, x - s * 0.5, y - s * 0.2);
  g.bezierCurveTo(x - s * 0.5, y - s * 0.5, x - s * 0.1, y - s * 0.55, x, y - s * 0.28);
  g.bezierCurveTo(x + s * 0.1, y - s * 0.55, x + s * 0.5, y - s * 0.5, x + s * 0.5, y - s * 0.2);
  g.bezierCurveTo(x + s * 0.5, y + s * 0.05, x + s * 0.05, y + s * 0.1, x, y + s * 0.35);
  g.closePath();
}

function makeTexture(t: Track): Uint32Array {
  const [, g] = canvas(WORLD, WORLD);
  for (let y = 0; y < WORLD; y += 32) {
    for (let x = 0; x < WORLD; x += 32) {
      g.fillStyle = (x ^ y) & 32 ? '#56a44a' : '#62b254';
      g.fillRect(x, y, 32, 32);
    }
  }
  const rnd = seeded(7);
  for (let i = 0; i < 700; i++) {
    g.fillStyle = ['#ffd1e6', '#ffffff', '#ffe27a', '#ff8fb8'][i % 4];
    g.fillRect(rnd() * WORLD, rnd() * WORLD, 3, 3);
  }
  // Großes Blumenherz in der Mitte
  g.fillStyle = '#ff7aa8';
  heartPath(g, 640, 700, 230);
  g.fill();
  g.lineWidth = 8;
  g.strokeStyle = '#fff0f6';
  g.stroke();
  g.fillStyle = '#ffb3cf';
  heartPath(g, 640, 700, 120);
  g.fill();

  const line = () => {
    g.beginPath();
    for (let i = 0; i <= t.n; i++) {
      const k = i % t.n;
      if (i === 0) g.moveTo(t.px[k], t.py[k]);
      else g.lineTo(t.px[k], t.py[k]);
    }
    g.closePath();
  };
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const stroke = (w: number, color: string, dash: number[] = []) => {
    line();
    g.setLineDash(dash);
    g.lineWidth = w;
    g.strokeStyle = color;
    g.stroke();
    g.setLineDash([]);
  };
  // Hecke, Wiese daneben, Randsteine, Asphalt, Mittelstreifen
  stroke((WALL + 7) * 2, '#2c6e37');
  stroke((WALL + 3) * 2, '#3f9447');
  stroke(WALL * 2, '#74c25e');
  stroke(ROAD + 12, '#ffffff');
  stroke(ROAD + 12, '#e8364f', [12, 12]);
  stroke(ROAD, '#6d6878');
  for (let i = 0; i < 2200; i++) {
    const p = trackPoint(t, rnd() * t.len, (rnd() - 0.5) * ROAD * 0.95);
    g.fillStyle = rnd() < 0.5 ? '#635e6e' : '#77727f';
    g.fillRect(p.x, p.y, 2, 2);
  }
  stroke(2, 'rgba(255,255,255,0.6)', [16, 16]);

  // Ziellinie im Schachbrettmuster
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 12; c++) {
      const p = trackPoint(t, -6 + r * 6 + 3, -ROAD / 2 + c * 6 + 3);
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.a);
      g.fillStyle = (r + c) % 2 ? '#ffffff' : '#1c1622';
      g.fillRect(-3.2, -3.2, 6.4, 6.4);
      g.restore();
    }
  }
  // Turbo-Felder mit Pfeilen
  for (const p of t.pads) {
    g.save();
    g.translate(p.x, p.y);
    g.rotate(p.a);
    g.fillStyle = '#ff9a1f';
    g.beginPath();
    g.roundRect(-13, -10, 26, 20, 4);
    g.fill();
    g.strokeStyle = '#fff36b';
    g.lineWidth = 3;
    for (const dx of [-7, 0, 7]) {
      g.beginPath();
      g.moveTo(dx - 3, -6);
      g.lineTo(dx + 3, 0);
      g.lineTo(dx - 3, 6);
      g.stroke();
    }
    g.restore();
  }
  const data = g.getImageData(0, 0, WORLD, WORLD).data;
  return new Uint32Array(data.buffer.slice(0));
}

function makeHills(): HTMLCanvasElement {
  const [c, g] = canvas(512, 44);
  g.fillStyle = 'rgba(255,255,255,0.85)';
  for (const [x, y, s] of [
    [40, 10, 1],
    [170, 6, 0.8],
    [300, 12, 1.1],
    [430, 7, 0.9],
  ]) {
    g.beginPath();
    g.ellipse(x, y, 18 * s, 5 * s, 0, 0, Math.PI * 2);
    g.ellipse(x + 12 * s, y - 3 * s, 11 * s, 5 * s, 0, 0, Math.PI * 2);
    g.fill();
  }
  const ridge = (base: number, amp: number, color: string, freq: number[]) => {
    g.fillStyle = color;
    g.beginPath();
    g.moveTo(0, 44);
    for (let x = 0; x <= 512; x += 4) {
      const y = base - amp * (0.5 + 0.25 * Math.sin((x / 512) * Math.PI * 2 * freq[0]) + 0.25 * Math.sin((x / 512) * Math.PI * 2 * freq[1] + 1.3));
      g.lineTo(x, y);
    }
    g.lineTo(512, 44);
    g.closePath();
    g.fill();
  };
  ridge(40, 26, '#c79be8', [3, 7]);
  ridge(44, 16, '#7fc77a', [5, 11]);
  return c;
}

function makeTree(k: number): HTMLCanvasElement {
  const [c, g] = canvas(30, 38);
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.beginPath();
  g.ellipse(15, 36, 10, 2.5, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#7a4a2a';
  g.fillRect(13, 24, 4, 12);
  if (k === 2) {
    g.fillStyle = '#2f7d45';
    for (const [y, w] of [
      [4, 7],
      [12, 10],
      [20, 13],
    ]) {
      g.beginPath();
      g.moveTo(15, y - 4);
      g.lineTo(15 + w, y + 8);
      g.lineTo(15 - w, y + 8);
      g.closePath();
      g.fill();
    }
  } else {
    const [dark, light] = k === 1 ? ['#ff8fbf', '#ffc4dc'] : ['#3d9a4a', '#6cc366'];
    g.fillStyle = dark;
    g.beginPath();
    g.arc(15, 16, 12, 0, Math.PI * 2);
    g.arc(8, 20, 7, 0, Math.PI * 2);
    g.arc(22, 20, 7, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = light;
    g.beginPath();
    g.arc(11, 11, 5, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

function makeBox(): HTMLCanvasElement {
  const [c, g] = canvas(24, 24);
  const grad = g.createLinearGradient(0, 0, 24, 24);
  grad.addColorStop(0, '#ff6fa8');
  grad.addColorStop(0.5, '#b47bff');
  grad.addColorStop(1, '#5fd4ff');
  g.fillStyle = grad;
  g.beginPath();
  g.roundRect(1, 1, 22, 22, 5);
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.stroke();
  g.fillStyle = '#fff';
  g.font = '900 16px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('?', 12, 13);
  return c;
}

function makeBanana(): HTMLCanvasElement {
  const [c, g] = canvas(24, 20);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.beginPath();
  g.ellipse(12, 18, 9, 2, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#ffd93b';
  g.lineWidth = 6;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(12, 2, 12, Math.PI * 0.2, Math.PI * 0.8);
  g.stroke();
  g.strokeStyle = '#6b4a1e';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(21, 10);
  g.lineTo(23, 8);
  g.moveTo(3, 10);
  g.lineTo(1, 8);
  g.stroke();
  return c;
}

function makeArrow(): HTMLCanvasElement {
  const [c, g] = canvas(26, 22);
  g.strokeStyle = '#ffe6a1';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(1, 20);
  g.lineTo(25, 2);
  g.stroke();
  g.fillStyle = '#ff3d77';
  heartPath(g, 13, 11, 18);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.7)';
  g.beginPath();
  g.arc(9, 7, 2, 0, Math.PI * 2);
  g.fill();
  return c;
}

function makeMap(t: Track): HTMLCanvasElement {
  const [c, g] = canvas(64, 64);
  const s = 64 / WORLD;
  g.lineJoin = 'round';
  g.beginPath();
  for (let i = 0; i <= t.n; i++) {
    const k = i % t.n;
    if (i === 0) g.moveTo(t.px[k] * s, t.py[k] * s);
    else g.lineTo(t.px[k] * s, t.py[k] * s);
  }
  g.closePath();
  g.strokeStyle = 'rgba(30,15,40,0.55)';
  g.lineWidth = 7;
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.lineWidth = 3.5;
  g.stroke();
  return c;
}

/** Kart von hinten: Reifen, Karosserie in der Spielerfarbe, Helm und das eigene Emoji als Aufkleber. */
function kartSprite(color: string, emoji: string): HTMLCanvasElement {
  const key = color + emoji;
  const cached = assets?.karts.get(key);
  if (cached) return cached;
  const S = 1.6;
  const [c, g] = canvas(40 * S, 34 * S);
  g.scale(S, S);
  g.fillStyle = 'rgba(0,0,0,0.28)';
  g.beginPath();
  g.ellipse(20, 32, 18, 3, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#1d1a22';
  g.beginPath();
  g.roundRect(1, 19, 9, 13, 3);
  g.roundRect(30, 19, 9, 13, 3);
  g.fill();
  g.fillStyle = '#3a3542';
  g.fillRect(2, 23, 7, 2);
  g.fillRect(31, 23, 7, 2);
  // Helm
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(20, 10, 8, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = color;
  g.fillRect(12, 8, 16, 3);
  // Karosserie
  g.fillStyle = color;
  g.beginPath();
  g.roundRect(7, 15, 26, 14, 5);
  g.fill();
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.fillRect(7, 25, 26, 4);
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(10, 16, 20, 2);
  // Spoiler
  g.fillStyle = '#2a2430';
  g.fillRect(5, 13, 30, 3);
  // Auspuff
  g.fillStyle = '#9a96a3';
  g.beginPath();
  g.arc(15, 29.5, 1.8, 0, Math.PI * 2);
  g.arc(25, 29.5, 1.8, 0, Math.PI * 2);
  g.fill();
  g.font = '9px serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(emoji, 20, 22);
  assets?.karts.set(key, c);
  return c;
}

function getAssets(t: Track): Assets {
  if (!assets) {
    assets = {
      tex: makeTexture(t),
      hills: makeHills(),
      trees: [0, 1, 2].map(makeTree),
      box: makeBox(),
      banana: makeBanana(),
      arrow: makeArrow(),
      map: makeMap(t),
      karts: new Map(),
    };
  }
  return assets;
}

interface DrawKart {
  x: number;
  y: number;
  a: number;
  spinA: number;
  boost: boolean;
  drift: number;
  color: string;
  emoji: string;
  /** Lokales Kart dieser Seite (online: das eigene) */
  side: Side | null;
  own: boolean;
  lean: number;
}

interface Scene {
  karts: DrawKart[];
  haz: Hazard[];
  boxes: number[];
  time: number;
}

interface ViewGfx {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  img: ImageData;
  buf: Uint32Array;
  sky: CanvasGradient;
  fog: CanvasGradient;
}

function drawView(v: ViewGfx, t: Track, A: Assets, cam: { x: number; y: number; a: number }, scene: Scene, boostFx: boolean) {
  const { ctx, w: W, h: H, buf } = v;
  const hz = Math.round(H * HORIZON);
  const f = W * 0.82;
  const camH = ((H * KART_Y - hz) * CAM_DIST) / f;
  const fx = Math.cos(cam.a);
  const fy = Math.sin(cam.a);
  const rx = -fy;
  const ry = fx;
  const cx = cam.x - fx * CAM_DIST;
  const cy = cam.y - fy * CAM_DIST;
  const tex = A.tex;

  // Boden im Mode-7-Stil: jede Bildzeile ist eine Linie in der Welt, je höher, desto weiter weg.
  for (let y = hz + 1; y < H; y++) {
    const z = (camH * f) / (y - hz);
    const k = z / f;
    let wx = cx + fx * z - (rx * k * W) / 2;
    let wy = cy + fy * z - (ry * k * W) / 2;
    const sx = rx * k;
    const sy = ry * k;
    let o = y * W;
    for (let x = 0; x < W; x++) {
      const ix = Math.floor(wx);
      const iy = Math.floor(wy);
      buf[o++] = ix >= 0 && ix < WORLD && iy >= 0 && iy < WORLD ? tex[iy * WORLD + ix] : ((ix >> 5) ^ (iy >> 5)) & 1 ? G2 : G1;
      wx += sx;
      wy += sy;
    }
  }
  ctx.putImageData(v.img, 0, 0, 0, hz + 1, W, H - hz - 1);

  ctx.fillStyle = v.sky;
  ctx.fillRect(0, 0, W, hz + 1);
  const hw = A.hills.width;
  let ox = ((((-cam.a / (Math.PI * 2)) * hw * 2) % hw) + hw) % hw;
  ox -= hw;
  for (; ox < W; ox += hw) ctx.drawImage(A.hills, Math.round(ox), hz + 1 - A.hills.height);
  ctx.fillStyle = v.fog;
  ctx.fillRect(0, hz - 4, W, 30);

  // Alles, was aufrecht steht, von hinten nach vorne
  const list: { z: number; draw: () => void }[] = [];
  const add = (x: number, y: number, ww: number, hh: number, lift: number, draw: (sx: number, sy: number, sw: number, sh: number, z: number) => void, maxZ = 900) => {
    const dx = x - cx;
    const dy = y - cy;
    const z = dx * fx + dy * fy;
    if (z < 8 || z > maxZ) return;
    const sc = f / z;
    const sx = W / 2 + (dx * rx + dy * ry) * sc;
    const sw = ww * sc;
    if (sx + sw < 0 || sx - sw > W) return;
    const sy = hz + (camH - lift) * sc;
    list.push({ z, draw: () => draw(sx, sy, sw, hh * sc, z) });
  };
  for (const tr of t.trees) add(tr.x, tr.y, 30, 38, 0, (sx, sy, sw, sh) => ctx.drawImage(A.trees[tr.k], sx - sw / 2, sy - sh, sw, sh));
  t.boxes.forEach((b, i) => {
    if (scene.boxes[i] > 0) return;
    const bob = Math.sin(scene.time * 3 + i) * 1.5;
    add(b.x, b.y, 11, 11, 3 + bob, (sx, sy, sw, sh) => {
      const squeeze = 0.75 + 0.25 * Math.abs(Math.cos(scene.time * 2 + i));
      ctx.drawImage(A.box, sx - (sw * squeeze) / 2, sy - sh, sw * squeeze, sh);
    });
  });
  for (const h of scene.haz) {
    if (h.k === 'banane') add(h.x, h.y, 10, 8, 0, (sx, sy, sw, sh) => ctx.drawImage(A.banana, sx - sw / 2, sy - sh, sw, sh));
    else add(h.x, h.y, 12, 10, 5, (sx, sy, sw, sh) => ctx.drawImage(A.arrow, sx - sw / 2, sy - sh, sw, sh));
  }
  for (const k of scene.karts) {
    add(
      k.x,
      k.y,
      15,
      12.75,
      0,
      (sx, sy, sw, sh) => {
        ctx.save();
        ctx.translate(sx, sy);
        const rot = k.spinA || (k.own ? k.lean : Math.max(-0.4, Math.min(0.4, wrapAngle(k.a - cam.a) * 0.3)));
        ctx.translate(0, -sh / 2);
        ctx.rotate(rot);
        ctx.translate(0, sh / 2);
        if (k.boost) {
          const fl = sh * (0.25 + Math.random() * 0.2);
          ctx.fillStyle = Math.random() < 0.5 ? '#ffd23b' : '#ff7a1f';
          for (const ex of [-0.13, 0.13]) {
            ctx.beginPath();
            ctx.moveTo(sw * ex - sw * 0.06, -sh * 0.12);
            ctx.lineTo(sw * ex + sw * 0.06, -sh * 0.12);
            ctx.lineTo(sw * ex, -sh * 0.12 + fl);
            ctx.closePath();
            ctx.fill();
          }
        }
        ctx.drawImage(kartSprite(k.color, k.emoji), -sw / 2, -sh, sw, sh);
        if (k.drift) {
          ctx.fillStyle = Math.abs(k.drift) >= 2 ? '#ff9a2e' : '#6fd0ff';
          for (const ex of [-0.4, 0.4]) {
            for (let i = 0; i < 3; i++) {
              const s = Math.max(1, sw * 0.05);
              ctx.fillRect(sw * ex + (Math.random() - 0.5) * sw * 0.25, -sh * 0.08 - Math.random() * sh * 0.25, s, s);
            }
          }
        }
        ctx.restore();
      },
      1400,
    );
  }
  list.sort((a, b) => b.z - a.z);
  for (const o of list) o.draw();

  if (boostFx) {
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 7; i++) {
      const side = i % 2 ? 1 : -1;
      const y0 = hz + 10 + Math.random() * (H - hz - 20);
      const x0 = W / 2 + side * (W * 0.32 + Math.random() * W * 0.15);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + side * 18, y0 + (y0 - hz) * 0.25);
      ctx.stroke();
    }
  }

  // Minikarte oben im Himmel
  const ms = Math.round(Math.min(W * 0.24, hz - 6));
  const mx = Math.round((W - ms) / 2);
  const my = Math.max(3, hz - ms - 3);
  ctx.drawImage(A.map, mx, my, ms, ms);
  for (const k of [...scene.karts].sort((a, b) => Number(a.own) - Number(b.own))) {
    ctx.fillStyle = '#1b1022';
    ctx.fillRect(mx + (k.x / WORLD) * ms - 2.5, my + (k.y / WORLD) * ms - 2.5, 5, 5);
    ctx.fillStyle = k.color;
    ctx.fillRect(mx + (k.x / WORLD) * ms - 1.5, my + (k.y / WORLD) * ms - 1.5, 3, 3);
  }
}

// ───────────────────────── Spiel ─────────────────────────

type Phase = 'wait' | 'count' | 'race' | 'end';
type Zone = 'l' | 'r' | 'u';

interface HostSnap {
  ph: Phase;
  k: NetKart;
  win: Side | null;
}

interface GuestAct {
  rdy: 1;
  k: NetKart;
}

/** Online: das Kart vom Schatz, wie es zuletzt ankam – zwischen zwei Nachrichten weitergerechnet. */
interface Remote {
  pkt: NetKart;
  at: number;
  x: number;
  y: number;
  a: number;
  prog: number;
  fin: number | null;
  el: number;
  haz: Hazard[];
  hits: number[];
  zap: number;
}

interface Msg {
  text: string;
  until: number;
  big?: boolean;
}

interface Race {
  ph: Phase;
  count: number;
  t: number;
  karts: Partial<Record<Side, KartState>>;
  remote: Remote | null;
  course: Course;
  winner: Side | null;
  endIn: number;
  ended: boolean;
  netT: number;
  seq: number;
  lastN: number;
  lastSeq: number;
  cams: Partial<Record<Side, { x: number; y: number; a: number }>>;
  msgs: Partial<Record<Side, Msg>>;
  hudT: number;
  beeped: number;
}

interface Hud {
  lap: number;
  time: string;
  place: number;
  item: string;
  rolling: boolean;
  msg: Msg | null;
}

const isSide = (s: string): s is Side => s === 'p1' || s === 'p2';

export function Kart({ mode, p1, p2, starter, best, net, onEnd }: GameProps) {
  const track = getTrack();
  const online = mode === 'online' && !!net;
  const solo = mode === 'solo';
  const duo = mode === 'duo';
  const me: Side = online ? net!.me : 'p1';
  const players: Record<Side, Player> = { p1, p2 };
  /** Wessen Bild zu sehen ist – zu zweit: oben (gedreht) p2, unten p1 */
  const views: Side[] = duo ? ['p2', 'p1'] : [me];

  const race = useRef<Race | null>(null);
  if (!race.current) {
    const karts: Partial<Record<Side, KartState>> = {};
    const lat = (s: Side) => (s === starter ? 15 : -15);
    if (online) karts[me] = newKart(track, lat(me));
    else {
      karts.p1 = newKart(track, lat('p1'));
      if (!solo) karts.p2 = newKart(track, lat('p2'));
    }
    race.current = {
      ph: online ? 'wait' : 'count',
      count: COUNTDOWN,
      t: 0,
      karts,
      remote: null,
      course: newCourse(track),
      winner: null,
      endIn: 0,
      ended: false,
      netT: 0,
      seq: 0,
      lastN: -1,
      lastSeq: -1,
      cams: {},
      msgs: {},
      hudT: 0,
      beeped: 0,
    };
  }

  const netRef = useRef(net);
  netRef.current = net;
  const endRef = useRef(onEnd);
  endRef.current = onEnd;

  const canvases = useRef<Partial<Record<Side, HTMLCanvasElement | null>>>({});
  const gfx = useRef<Partial<Record<Side, ViewGfx>>>({});
  const padEls = useRef<Partial<Record<Side, HTMLDivElement | null>>>({});
  const pointers = useRef(new Map<number, { side: Side; zone: Zone }>());
  const keys = useRef(new Set<string>());
  const pressed = useRef<Record<Side, { l: boolean; r: boolean; use: boolean }>>({ p1: { l: false, r: false, use: false }, p2: { l: false, r: false, use: false } });
  const engine = useRef<ReturnType<typeof hum>>(null);
  const [hud, setHud] = useState<Partial<Record<Side, Hud>>>({});
  const [phase, setPhase] = useState<Phase>(race.current.ph);

  // Leinwände an den Platz anpassen
  useEffect(() => {
    getAssets(track);
    const obs: ResizeObserver[] = [];
    for (const side of views) {
      const c = canvases.current[side];
      const box = c?.parentElement;
      if (!c || !box) continue;
      const fit = () => {
        const r = box.getBoundingClientRect();
        if (r.width < 10 || r.height < 10) return;
        const h = Math.max(96, Math.min(640, Math.round((VIEW_W * r.height) / r.width)));
        const old = gfx.current[side];
        if (old && old.h === h) return;
        c.width = VIEW_W;
        c.height = h;
        const ctx = c.getContext('2d')!;
        const img = ctx.createImageData(VIEW_W, h);
        const hz = Math.round(h * HORIZON);
        const sky = ctx.createLinearGradient(0, 0, 0, hz);
        sky.addColorStop(0, '#6cc4ff');
        sky.addColorStop(1, '#ffd9ec');
        const fog = ctx.createLinearGradient(0, hz - 4, 0, hz + 26);
        fog.addColorStop(0, 'rgba(255,217,236,1)');
        fog.addColorStop(1, 'rgba(255,217,236,0)');
        gfx.current[side] = { ctx, w: VIEW_W, h, img, buf: new Uint32Array(img.data.buffer), sky, fog };
      };
      fit();
      const ro = new ResizeObserver(fit);
      ro.observe(box);
      obs.push(ro);
    }
    return () => obs.forEach((o) => o.disconnect());
  }, [duo]);

  // Tastatur: ←/→ lenken, ↑ oder Leertaste für das Item – zu zweit oben mit A/D und W.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (!e.repeat) {
        if (key === 'arrowup' || key === ' ') pressed.current[views[views.length - 1]].use = true;
        if (key === 'w') pressed.current[duo ? 'p2' : me].use = true;
      }
      if (key.startsWith('arrow') || key === ' ') e.preventDefault();
      keys.current.add(key);
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      engine.current?.stop();
      engine.current = null;
    };
  }, []);

  const humanInput = (side: Side): Input => {
    const p = pressed.current[side];
    const k = keys.current;
    const own = views[views.length - 1] === side;
    const left = p.l || (own && k.has('arrowleft')) || ((duo ? side === 'p2' : true) && k.has('a'));
    const right = p.r || (own && k.has('arrowright')) || ((duo ? side === 'p2' : true) && k.has('d'));
    const use = p.use;
    p.use = false;
    return { steer: (right ? 1 : 0) - (left ? 1 : 0), use };
  };

  const say = (side: Side, text: string, sec = 1.3, big = false) => {
    race.current!.msgs[side] = { text, until: performance.now() + sec * 1000, big };
  };

  const rivalOf = (R: Race, side: Side): Rival | null => {
    if (online) return R.remote;
    return R.karts[otherSide(side)] ?? null;
  };

  const feedback = (side: Side, ev: KartEvent[]) => {
    if (!views.includes(side) || !ev.length) return;
    const R = race.current!;
    const k = R.karts[side]!;
    for (const e of ev) {
      // Nach dem Zieleinlauf fährt das Kart allein weiter – dann bitte keine Meldungen mehr.
      if (e !== 'finish' && (R.ph === 'end' || (k.fin !== null && k.fin < R.t))) continue;
      if (e === 'box') tone(1200, 40, 'square', 0.04);
      else if (e === 'item') tone(988, 90, 'triangle', 0.06);
      else if (e === 'pilz') {
        tone(300, 420, 'sawtooth', 0.05, 900);
        say(side, 'Turbo! 🍄', 0.9);
      } else if (e === 'drop') tone(500, 80, 'triangle', 0.06);
      else if (e === 'fire') tone(700, 260, 'square', 0.04, 1600);
      else if (e === 'zap') {
        sfx.point();
        say(side, 'Treffer! 💘');
      } else if (e === 'turbo') {
        tone(600, 200, 'square', 0.05, 1400);
        say(side, 'Mini-Turbo! 🔥', 0.8);
      } else if (e === 'pad') tone(500, 200, 'square', 0.04, 1200);
      else if (e === 'wall') {
        sfx.wall();
        buzz(15);
      } else if (e === 'hit') {
        sfx.miss();
        buzz([30, 40, 30]);
        say(side, 'Autsch! 💫');
      } else if (e === 'lap') {
        sfx.point();
        say(side, `Runde ${k.lap}/${LAPS}`);
      } else if (e === 'final') {
        sfx.match();
        say(side, 'Letzte Runde! 🏁', 1.6);
      } else if (e === 'finish') {
        sfx.point();
        say(side, `Ziel! 🏁 ${fmtTime(k.fin ?? 0)}`, 30);
      }
    }
  };

  const startCountdown = (R: Race) => {
    R.ph = 'count';
    R.count = COUNTDOWN;
    setPhase('count');
  };

  const endRace = (R: Race, winner: Side | null) => {
    R.winner = winner;
    R.ph = 'end';
    R.endIn = 2.2;
    setPhase('end');
    if (winner && !solo) {
      for (const side of views) {
        const k = R.karts[side];
        if (side !== winner && k?.fin === null) say(side, `${players[winner].cpu ? 'Die KI' : players[winner].name} ist zuerst im Ziel!`, 30);
      }
    }
  };

  // ───── Online ─────
  const absorb = (R: Race, nk: NetKart, now: number) => {
    if (!nk || typeof nk.x !== 'number') return;
    const p = R.remote;
    if (!p) {
      R.remote = { pkt: nk, at: now, x: nk.x, y: nk.y, a: nk.a, prog: nk.p, fin: nk.f, el: nk.el, haz: unpackHazards(nk.h), hits: nk.hi ?? [], zap: nk.z ?? 0 };
      const mine = R.karts[me];
      if (mine) mine.seenZap = nk.z ?? 0;
      return;
    }
    p.pkt = nk;
    p.at = now;
    p.fin = nk.f;
    p.hits = nk.hi ?? [];
    p.zap = nk.z ?? 0;
  };

  const syncNet = (R: Race, dt: number, now: number) => {
    const n = netRef.current;
    const mine = R.karts[me];
    if (!n || !mine) return;
    if (me === 'p1') {
      const last = n.acts[n.acts.length - 1];
      if (last && last.n !== R.lastN) {
        R.lastN = last.n;
        const a = last.a as GuestAct | undefined;
        if (a?.k) absorb(R, a.k, now);
        if (R.ph === 'wait') startCountdown(R);
      }
    } else {
      const sh = n.shared;
      if (sh && sh.seq !== R.lastSeq) {
        R.lastSeq = sh.seq;
        const st = sh.st as HostSnap | undefined;
        if (st?.k) absorb(R, st.k, now);
        if (st && st.ph !== 'wait' && R.ph === 'wait') startCountdown(R);
        if (st?.win && R.ph !== 'end') endRace(R, st.win);
      }
    }
    R.netT -= dt;
    if (R.netT <= 0) {
      R.netT = NET_EVERY;
      const k = packKart(mine, R.t);
      if (me === 'p1') n.publish({ seq: ++R.seq, st: { ph: R.ph, k, win: R.winner } satisfies HostSnap, ack: 0 });
      else n.pushAct({ rdy: 1, k } satisfies GuestAct, 1);
    }
  };

  const updateRemote = (p: Remote, dt: number, now: number) => {
    const age = Math.min((now - p.at) / 1000, 0.5);
    const nk = p.pkt;
    const tx = nk.x + Math.cos(nk.a) * nk.v * age;
    const ty = nk.y + Math.sin(nk.a) * nk.v * age;
    if (Math.hypot(tx - p.x, ty - p.y) > 60) {
      p.x = tx;
      p.y = ty;
    } else {
      const f = Math.min(1, dt * 12);
      p.x += (tx - p.x) * f;
      p.y += (ty - p.y) * f;
    }
    p.a = wrapAngle(p.a + wrapAngle(nk.a - p.a) * Math.min(1, dt * 12));
    p.prog = nk.p + (nk.f === null ? nk.v * age : 0);
    p.el = nk.el + age;
    p.haz = unpackHazards(nk.h).map((h) => (h.k === 'pfeil' ? { ...h, x: h.x + Math.cos(h.a) * 330 * age, y: h.y + Math.sin(h.a) * 330 * age } : h));
  };

  // ───── Rennen ─────
  const stepKarts = (R: Race, dt: number) => {
    for (const side of Object.keys(R.karts).filter(isSide)) {
      const k = R.karts[side]!;
      const rival = rivalOf(R, side);
      const cpu = players[side].cpu && !online;
      const auto = cpu || k.fin !== null || R.ph === 'end' || AUTOPILOT;
      const inp = auto ? kiInput(k, track, rival, Math.random, dt) : humanInput(side);
      const ev: KartEvent[] = [];
      stepKart(k, inp, dt, track, R.t, ev, {
        rnd: Math.random,
        course: R.course,
        leading: rival ? ahead(k, rival) : true,
        solo,
        target: rival,
        vmaxMul: cpu ? kiVmax(k, rival) : 1,
      });
      feedback(side, ev);
    }
    if (online) {
      const k = R.karts[me];
      const r = R.remote;
      if (k && r) {
        const ev: KartEvent[] = [];
        hitBananas(k, r.haz, ev);
        sweepBananas(k, r.hits);
        applyZap(k, r.zap, ev);
        bump(k, r.x, r.y, 1);
        feedback(me, ev);
      }
    } else if (R.karts.p1 && R.karts.p2) {
      const a = R.karts.p1;
      const b = R.karts.p2;
      const ea: KartEvent[] = [];
      const eb: KartEvent[] = [];
      hitBananas(a, b.haz, ea);
      hitBananas(b, a.haz, eb);
      sweepBananas(a, b.hits);
      sweepBananas(b, a.hits);
      applyZap(a, b.zap, ea);
      applyZap(b, a.zap, eb);
      const ax = a.x;
      const ay = a.y;
      bump(a, b.x, b.y, 0.5);
      bump(b, ax, ay, 0.5);
      feedback('p1', ea);
      feedback('p2', eb);
    }
    tickCourse(R.course, dt);
  };

  const checkFinish = (R: Race, now: number) => {
    if (solo) {
      if (R.karts.p1!.fin !== null) endRace(R, 'p1');
      return;
    }
    if (!online) {
      const a = R.karts.p1!;
      const b = R.karts.p2!;
      if (a.fin !== null || b.fin !== null) endRace(R, ahead(a, b) ? 'p1' : 'p2');
      return;
    }
    const mine = R.karts[me]!;
    const r = R.remote;
    const silent = !r || (now - r.at) / 1000 > NET_TIMEOUT;
    if (me === 'p1') {
      const w = r ? decideOnline({ fin: mine.fin, el: R.t }, { fin: r.fin, el: r.el }) : null;
      if (w) endRace(R, w);
      else if (mine.fin !== null && silent) endRace(R, 'p1');
    } else if (mine.fin !== null && silent) endRace(R, 'p2');
  };

  const finish = (R: Race) => {
    if (R.ended) return;
    R.ended = true;
    engine.current?.stop();
    engine.current = null;
    if (solo) endRef.current({ score: Math.round((R.karts.p1!.fin ?? R.t) * 10) / 10 });
    else endRef.current({ winner: R.winner ?? 'draw' });
  };

  useLoop((dt) => {
    const R = race.current!;
    const now = performance.now();
    if (online) syncNet(R, dt, now);
    if (R.remote) updateRemote(R.remote, dt, now);

    if (R.ph === 'count') {
      const n = Math.ceil(R.count);
      if (n !== R.beeped) {
        R.beeped = n;
        tone(440, 160, 'square', 0.05);
      }
      R.count -= dt;
      if (R.count <= 0) {
        R.ph = 'race';
        setPhase('race');
        tone(880, 450, 'square', 0.06);
        for (const side of views) say(side, 'LOS!', 0.8, true);
        engine.current ??= hum();
      }
    } else if (R.ph === 'race' || R.ph === 'end') {
      R.t += dt;
      stepKarts(R, dt);
      if (R.ph === 'race') checkFinish(R, now);
      else {
        R.endIn -= dt;
        if (R.endIn <= 0) finish(R);
      }
    }

    // Motor
    if (engine.current) {
      const ks = views.map((s) => R.karts[s]!);
      const v = ks.reduce((sum, k) => sum + k.v, 0) / ks.length;
      engine.current.set(48 + v * 0.42, 0.022);
    }

    // Bilder malen
    const A = getAssets(track);
    const dk: DrawKart[] = [];
    for (const side of Object.keys(R.karts).filter(isSide)) {
      const k = R.karts[side]!;
      dk.push({
        x: k.x,
        y: k.y,
        a: k.a,
        spinA: k.spin > 0 ? (1.1 - k.spin) * Math.PI * 3.6 : 0,
        boost: k.boost > 0,
        drift: driftLevel(k) * k.driftDir,
        color: players[side].color,
        emoji: players[side].emoji,
        side,
        own: false,
        lean: 0,
      });
    }
    if (R.remote) {
      const o = otherSide(me);
      const nk = R.remote.pkt;
      dk.push({ x: R.remote.x, y: R.remote.y, a: R.remote.a, spinA: nk.sp ? ((now / 1000) * 11) % (Math.PI * 2) : 0, boost: !!nk.b, drift: nk.d, color: players[o].color, emoji: players[o].emoji, side: null, own: false, lean: 0 });
    }
    const haz: Hazard[] = [...Object.values(R.karts).flatMap((k) => k!.haz), ...(R.remote?.haz ?? [])];
    for (const side of views) {
      const g = gfx.current[side];
      const k = R.karts[side]!;
      const cam = (R.cams[side] ??= { x: k.x, y: k.y, a: k.a });
      cam.a = wrapAngle(cam.a + wrapAngle(k.a - cam.a) * Math.min(1, dt * 6));
      cam.x = k.x;
      cam.y = k.y;
      if (!g) continue;
      const rel = wrapAngle(k.a - cam.a);
      const karts = dk.map((d) => (d.side === side ? { ...d, own: true, lean: Math.max(-0.35, Math.min(0.35, rel * 0.8 + k.st * 0.06 + (k.drift > 0 ? k.driftDir * 0.12 : 0))) } : d));
      drawView(g, track, A, cam, { karts, haz, boxes: R.course.boxes, time: now / 1000 }, k.boost > 0);
    }

    // Anzeige (10× pro Sekunde reicht)
    R.hudT -= dt;
    if (R.hudT <= 0) {
      R.hudT = 0.1;
      const next: Partial<Record<Side, Hud>> = {};
      for (const side of views) {
        const k = R.karts[side]!;
        const rival = rivalOf(R, side);
        let msg: Msg | null = null;
        if (R.ph === 'wait') msg = { text: `Warte auf ${players[otherSide(me)].name} …`, until: Infinity };
        else if (R.ph === 'count') msg = { text: String(Math.max(1, Math.ceil(R.count))), until: Infinity, big: true };
        else {
          const m = R.msgs[side];
          if (m && m.until > now) msg = m;
        }
        next[side] = {
          lap: k.lap,
          time: fmtTime(k.fin ?? R.t),
          place: rival ? (ahead(k, rival) ? 1 : 2) : 1,
          item: k.roll > 0 ? ITEM_EMOJI[ITEMS[Math.floor(now / 90) % 3]] : k.item ? ITEM_EMOJI[k.item] : '',
          rolling: k.roll > 0,
          msg,
        };
      }
      setHud(next);
    }
  }, true);

  // ───── Steuerung per Touch: links lenken, Mitte Item, rechts lenken (auch mit zwei Fingern) ─────
  const zoneAt = (el: HTMLDivElement, clientX: number, flipped: boolean): Zone => {
    const r = el.getBoundingClientRect();
    let x = (clientX - r.left) / r.width;
    if (flipped) x = 1 - x;
    return x < 0.36 ? 'l' : x > 0.64 ? 'r' : 'u';
  };
  const refreshPads = () => {
    for (const side of views) {
      const list = [...pointers.current.values()].filter((p) => p.side === side);
      const st = pressed.current[side];
      st.l = list.some((p) => p.zone === 'l');
      st.r = list.some((p) => p.zone === 'r');
      const el = padEls.current[side];
      if (el) {
        el.querySelector('[data-z="l"]')?.classList.toggle('on', st.l);
        el.querySelector('[data-z="r"]')?.classList.toggle('on', st.r);
        el.querySelector('[data-z="u"]')?.classList.toggle('on', list.some((p) => p.zone === 'u'));
      }
    }
  };
  const padHandlers = (side: Side, flipped: boolean) => ({
    onPointerDown: (e: RPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      const zone = zoneAt(e.currentTarget, e.clientX, flipped);
      pointers.current.set(e.pointerId, { side, zone });
      if (zone === 'u') pressed.current[side].use = true;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      refreshPads();
    },
    onPointerMove: (e: RPointerEvent<HTMLDivElement>) => {
      const p = pointers.current.get(e.pointerId);
      if (!p) return;
      const zone = zoneAt(e.currentTarget, e.clientX, flipped);
      if (zone !== p.zone && (zone !== 'u' || p.zone !== 'u')) {
        p.zone = zone === 'u' ? p.zone : zone;
        refreshPads();
      }
    },
    onPointerUp: (e: RPointerEvent<HTMLDivElement>) => {
      pointers.current.delete(e.pointerId);
      refreshPads();
    },
    onPointerCancel: (e: RPointerEvent<HTMLDivElement>) => {
      pointers.current.delete(e.pointerId);
      refreshPads();
    },
    onContextMenu: (e: RMouseEvent) => e.preventDefault(),
  });

  return (
    <div className={cls('kart', duo ? 'duo' : 'single')}>
      {views.map((side) => {
        const h = hud[side];
        const flipped = duo && side === 'p2';
        return (
          <div key={side} className={cls('kart-view', flipped && 'flip')} style={{ '--pc': players[side].color } as CSSProperties}>
            <div className="kart-screen">
              <canvas ref={(el) => void (canvases.current[side] = el)} />
              <div className="kart-hud">
                <div className="kart-top">
                  <div className="kart-info">
                    <span className="kart-lap">
                      {duo && <b>{players[side].emoji}</b>} Runde {h?.lap ?? 1}/{LAPS}
                    </span>
                    <span className="kart-time">{h?.time ?? fmtTime(0)}</span>
                    {solo && best !== undefined && <span className="kart-best">🏆 {fmtTime(best)}</span>}
                  </div>
                  <div className={cls('kart-item', h?.rolling && 'rolling', !h?.item && 'empty')}>{h?.item ?? ''}</div>
                </div>
                {!solo && phase !== 'wait' && <div className={cls('kart-place', `p${h?.place ?? 1}`)}>{h?.place ?? 1}.</div>}
                {h?.msg && (
                  <div key={h.msg.text} className={cls('kart-msg', h.msg.big && 'big')}>
                    {h.msg.text}
                  </div>
                )}
              </div>
            </div>
            <div className="kart-pad" ref={(el) => void (padEls.current[side] = el)} {...padHandlers(side, flipped)}>
              <div data-z="l" aria-label="Links lenken">
                ◀
              </div>
              <div data-z="u" className={cls('kart-use', !h?.item && 'empty')} aria-label="Item einsetzen">
                {h?.item && !h.rolling ? h.item : '✦'}
              </div>
              <div data-z="r" aria-label="Rechts lenken">
                ▶
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
