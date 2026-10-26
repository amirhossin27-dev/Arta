import { HALF, ROAD, WALL, WORLD, locate, seeded, trackPoint, wrapAngle, type Hazard, type Track } from './kart';

/**
 * Herz-Kart: alles, was gemalt wird. Der Boden entsteht im Mode-7-Verfahren (jede Bildzeile ist eine
 * Linie in der Welt) – wenn möglich auf der Grafikkarte (WebGL, scharf in voller Auflösung, mit
 * Nebel in der Ferne), sonst in Software. Darüber liegt eine 2D-Ebene mit Hügeln, Bäumen, Items,
 * Partikeln und den Karts, die aus übereinandergelegten Schichten bestehen und sich so echt drehen.
 */

/** Auflösung der Weltkarte – 1,6 Pixel pro Welteinheit */
const TEX = 2048;
const TS = TEX / WORLD;
export const HORIZON = 0.32;
export const KART_Y = 0.82;

// ───────────────────────── Tageszeit ─────────────────────────

/** Tag oder Abendrot – wechselt von Rennen zu Rennen. */
export type Mood = 'tag' | 'abend';

interface Palette {
  skyTop: number[];
  skyBot: number[];
  fog: number[];
  /** Licht, mit dem der Boden eingefärbt wird */
  light: number[];
  sun: number[];
  /** Höhe der Sonne: Anteil der Himmelshöhe von oben */
  sunY: number;
  far: [string, string];
  snow: string;
  near: [string, string];
  cloud: string;
  cloudShade: string;
  /** Farbschleier über allem Aufrechten */
  wash: string | null;
  vignette: number;
}

/** Richtung, aus der die Sonne scheint (Weltwinkel) – Schatten fallen in die Gegenrichtung. */
const SUN_AZ = -2.2;

const PALETTES: Record<Mood, Palette> = {
  tag: {
    skyTop: [0.36, 0.72, 1.0],
    skyBot: [1.0, 0.86, 0.92],
    fog: [1.0, 0.86, 0.92],
    light: [1.0, 1.0, 1.0],
    sun: [1.0, 0.96, 0.82],
    sunY: 0.4,
    far: ['#b693e6', '#e6c3ef'],
    snow: 'rgba(255,255,255,0.75)',
    near: ['#7fcf74', '#4f9f4c'],
    cloud: '#ffffff',
    cloudShade: '#e4d8f2',
    wash: null,
    vignette: 0.28,
  },
  abend: {
    skyTop: [0.22, 0.2, 0.5],
    skyBot: [1.0, 0.6, 0.45],
    fog: [1.0, 0.66, 0.55],
    light: [1.04, 0.83, 0.74],
    sun: [1.0, 0.7, 0.38],
    sunY: 0.8,
    far: ['#7656a6', '#d08cb0'],
    snow: 'rgba(255,205,175,0.7)',
    near: ['#5f8e57', '#3a6644'],
    cloud: '#ffc4ad',
    cloudShade: '#b77ba6',
    wash: 'rgba(255,120,70,0.12)',
    vignette: 0.42,
  },
};

const css = (c: number[], a = 1) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;

// ───────────────────────── Kamera ─────────────────────────

export interface Cam {
  x: number;
  y: number;
  a: number;
  /** Abstand hinter dem Kart */
  dist: number;
  /** Brennweite relativ zur Bildbreite – kleiner = weiter (Turbo) */
  focal: number;
}

export interface Proj {
  W: number;
  H: number;
  hz: number;
  f: number;
  camH: number;
  cx: number;
  cy: number;
  fx: number;
  fy: number;
  rx: number;
  ry: number;
  a: number;
}

export function projection(W: number, H: number, cam: Cam): Proj {
  const hz = H * HORIZON;
  const f = W * cam.focal;
  const camH = ((H * KART_Y - hz) * cam.dist) / f;
  const fx = Math.cos(cam.a);
  const fy = Math.sin(cam.a);
  return { W, H, hz, f, camH, cx: cam.x - fx * cam.dist, cy: cam.y - fy * cam.dist, fx, fy, rx: -fy, ry: fx, a: cam.a };
}

export function project(p: Proj, x: number, y: number, h = 0) {
  const dx = x - p.cx;
  const dy = y - p.cy;
  const z = dx * p.fx + dy * p.fy;
  if (z < 5) return null;
  const sc = p.f / z;
  return { sx: p.W / 2 + (dx * p.rx + dy * p.ry) * sc, sy: p.hz + (p.camH - h) * sc, sc, z };
}

// ───────────────────────── Hilfen ─────────────────────────

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return [c, c.getContext('2d')!];
}

export function heartPath(g: CanvasRenderingContext2D, x: number, y: number, s: number) {
  g.beginPath();
  g.moveTo(x, y + s * 0.35);
  g.bezierCurveTo(x - s * 0.05, y + s * 0.1, x - s * 0.5, y + s * 0.05, x - s * 0.5, y - s * 0.2);
  g.bezierCurveTo(x - s * 0.5, y - s * 0.5, x - s * 0.1, y - s * 0.55, x, y - s * 0.28);
  g.bezierCurveTo(x + s * 0.1, y - s * 0.55, x + s * 0.5, y - s * 0.5, x + s * 0.5, y - s * 0.2);
  g.bezierCurveTo(x + s * 0.5, y + s * 0.05, x + s * 0.05, y + s * 0.1, x, y + s * 0.35);
  g.closePath();
}

function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)));
  return `rgb(${ch(n >> 16)}, ${ch((n >> 8) & 255)}, ${ch(n & 255)})`;
}

/** Krümmung der Strecke ein Stück voraus (positiv = Rechtskurve) */
function curveAhead(t: Track, s: number, len: number) {
  const a = trackPoint(t, s).a;
  const b = trackPoint(t, s + len).a;
  return wrapAngle(b - a) / len;
}

// ───────────────────────── Weltkarte ─────────────────────────

function grassTile(): HTMLCanvasElement {
  // 128 px = 64 Welteinheiten: Schachbrett aus zwei Grüntönen, mit Halmen und Sprenkeln
  const [c, g] = canvas(128, 128);
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 2; x++) {
      g.fillStyle = (x + y) % 2 ? '#56a647' : '#60b350';
      g.fillRect(x * 64, y * 64, 64, 64);
    }
  }
  const rnd = seeded(31);
  for (let i = 0; i < 900; i++) {
    const v = rnd();
    g.fillStyle = v < 0.45 ? 'rgba(30,90,30,0.22)' : v < 0.9 ? 'rgba(200,255,150,0.18)' : 'rgba(255,255,255,0.35)';
    g.fillRect(rnd() * 128, rnd() * 128, 1 + rnd() * 1.5, 1 + rnd() * 2.5);
  }
  return c;
}

/**
 * Feine Muster für die Nähe, nahtlos kachelbar: Rot = Asphaltkörnung, Grün = Grashalme,
 * Blau = weiche Flecken für großflächige Abwechslung.
 */
function detailTile(): HTMLCanvasElement {
  const N = 256;
  const rnd = seeded(5);
  const [c, g] = canvas(N, N);

  // Grashalme
  const [, bg] = canvas(N, N);
  bg.fillStyle = 'rgb(120,120,120)';
  bg.fillRect(0, 0, N, N);
  bg.lineCap = 'round';
  for (let i = 0; i < 3200; i++) {
    const x = rnd() * N;
    const y = rnd() * N;
    const a = rnd() * Math.PI * 2;
    const l = 3 + rnd() * 7;
    const v = rnd() < 0.5 ? 40 + rnd() * 40 : 170 + rnd() * 70;
    bg.strokeStyle = `rgba(${v},${v},${v},0.7)`;
    bg.lineWidth = 0.8 + rnd() * 0.9;
    for (const dx of [-N, 0, N]) {
      for (const dy of [-N, 0, N]) {
        if ((dx && Math.abs(x + dx - N / 2) > N / 2 + 12) || (dy && Math.abs(y + dy - N / 2) > N / 2 + 12)) continue;
        bg.beginPath();
        bg.moveTo(x + dx, y + dy);
        bg.lineTo(x + dx + Math.cos(a) * l, y + dy + Math.sin(a) * l);
        bg.stroke();
      }
    }
  }
  const blades = bg.getImageData(0, 0, N, N).data;

  // Weiche Flecken: Wertrauschen auf einem 8×8-Gitter, rundum nahtlos
  const G = 8;
  const grid = Array.from({ length: G * G }, () => rnd());
  const smooth = (u: number) => u * u * (3 - 2 * u);
  const blob = (x: number, y: number) => {
    const gx = (x / N) * G;
    const gy = (y / N) * G;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = smooth(gx - x0);
    const fy = smooth(gy - y0);
    const v = (i: number, j: number) => grid[((j + G) % G) * G + ((i + G) % G)];
    const top = v(x0, y0) + (v(x0 + 1, y0) - v(x0, y0)) * fx;
    const bot = v(x0, y0 + 1) + (v(x0 + 1, y0 + 1) - v(x0, y0 + 1)) * fx;
    return top + (bot - top) * fy;
  };

  const img = g.createImageData(N, N);
  const d = img.data;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const o = (y * N + x) * 4;
      d[o] = 128 + (rnd() - 0.5) * 70;
      d[o + 1] = blades[o];
      d[o + 2] = 40 + blob(x, y) * 176;
      d[o + 3] = 255;
    }
  }
  // Kleine Steinchen im Asphalt
  for (let i = 0; i < 700; i++) {
    const x = Math.floor(rnd() * N);
    const y = Math.floor(rnd() * N);
    const v = rnd() < 0.5 ? 50 : 215;
    for (const [dx, dy] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ]) {
      if (rnd() < 0.25) continue;
      d[((((y + dy) % N) * N + ((x + dx) % N)) * 4) as number] = v;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

function drawWorld(t: Track): HTMLCanvasElement {
  const [c, g] = canvas(TEX, TEX);
  g.scale(TS, TS);
  const grass = g.createPattern(grassTile(), 'repeat')!;
  grass.setTransform(new DOMMatrix().scale(0.5));
  g.fillStyle = grass;
  g.fillRect(0, 0, WORLD, WORLD);
  const rnd = seeded(7);

  // Blumen in der Wiese
  for (let i = 0; i < 1600; i++) {
    g.fillStyle = ['#ffd1e6', '#ffffff', '#ffe27a', '#ff8fb8', '#c9a6ff'][i % 5];
    const x = rnd() * WORLD;
    const y = rnd() * WORLD;
    g.beginPath();
    g.arc(x, y, 1 + rnd() * 1.2, 0, Math.PI * 2);
    g.fill();
  }
  // Großes Blumenherz in der Mitte
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.25)';
  g.shadowBlur = 8;
  g.fillStyle = '#ff6f9f';
  heartPath(g, 640, 690, 220);
  g.fill();
  g.restore();
  g.lineWidth = 7;
  g.strokeStyle = '#fff2f7';
  heartPath(g, 640, 690, 220);
  g.stroke();
  g.fillStyle = '#ffa9c8';
  heartPath(g, 640, 690, 140);
  g.fill();
  g.fillStyle = '#ffe1ec';
  heartPath(g, 640, 690, 60);
  g.fill();
  for (let i = 0; i < 260; i++) {
    const a = rnd() * Math.PI * 2;
    const r = rnd() * 80;
    g.fillStyle = rnd() < 0.5 ? '#ffffff' : '#ffd84a';
    g.fillRect(640 + Math.cos(a) * r - 1, 680 + Math.sin(a) * r * 0.8 - 1, 2, 2);
  }
  // Teich im linken Bogen
  g.fillStyle = '#4aa0d8';
  g.beginPath();
  g.ellipse(398, 505, 50, 38, 0.3, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#d9f1ff';
  g.lineWidth = 3;
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.beginPath();
  g.ellipse(386, 494, 22, 9, 0.3, 0, Math.PI * 2);
  g.fill();
  for (const [x, y] of [
    [420, 520],
    [372, 516],
    [410, 486],
  ]) {
    g.fillStyle = '#3c9a4a';
    g.beginPath();
    g.arc(x, y, 5, 0.4, Math.PI * 2);
    g.lineTo(x, y);
    g.fill();
    g.fillStyle = '#ff9ccb';
    g.fillRect(x - 1, y - 1, 2.5, 2.5);
  }
  // Tulpenfeld im rechten Bogen
  for (let r = 0; r < 6; r++) {
    for (let i = 0; i < 16; i++) {
      g.fillStyle = ['#ff4f81', '#ffd84a', '#ff9a3c', '#c77dff', '#ffffff', '#ff6fa8'][r];
      g.beginPath();
      g.arc(830 + i * 7 + (r % 2) * 3, 470 + r * 12, 2.4, 0, Math.PI * 2);
      g.fill();
    }
  }

  const centre = () => {
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
  const stroke = (w: number, style: string | CanvasPattern, dash: number[] = [], offset = 0) => {
    centre();
    g.setLineDash(dash);
    g.lineDashOffset = offset;
    g.lineWidth = w;
    g.strokeStyle = style;
    g.stroke();
    g.setLineDash([]);
  };

  // Hecke und Wiese neben der Strecke – am Fuß der Hecke ein weicher Schatten
  stroke((WALL + 10) * 2, '#2b6534');
  stroke((WALL + 2) * 2, grass);
  stroke((WALL + 2) * 2, 'rgba(0,40,10,0.2)');
  stroke((WALL - 2) * 2, 'rgba(0,40,10,0.12)');
  stroke((WALL - 5) * 2, grass);
  stroke((WALL + 2) * 2, 'rgba(255,255,190,0.13)');
  // Schatten der Bäume, von der Sonne weg
  {
    const sx = -Math.cos(SUN_AZ) * 9;
    const sy = -Math.sin(SUN_AZ) * 9;
    for (const tr of t.trees) {
      const grad = g.createRadialGradient(tr.x + sx, tr.y + sy, 1, tr.x + sx, tr.y + sy, 15);
      grad.addColorStop(0, 'rgba(10,40,20,0.38)');
      grad.addColorStop(1, 'rgba(10,40,20,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.ellipse(tr.x + sx, tr.y + sy, 15, 11, SUN_AZ, 0, Math.PI * 2);
      g.fill();
    }
  }
  for (let s = 0; s < t.len; s += 5) {
    for (const side of [-1, 1]) {
      const p = trackPoint(t, s, side * (WALL + 5.5));
      if (Math.abs(locate(t, p.x, p.y).lat) < WALL + 2) continue;
      g.fillStyle = '#3a8541';
      g.beginPath();
      g.arc(p.x, p.y, 5.2, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#55a852';
      g.beginPath();
      g.arc(p.x - 1.4, p.y - 1.4, 2.6, 0, Math.PI * 2);
      g.fill();
    }
  }
  // Kiesbetten außen in den engen Kurven
  for (let s = 0; s < t.len; s += 6) {
    const k = curveAhead(t, s, 30);
    if (Math.abs(k) < 1 / 150) continue;
    const p = trackPoint(t, s, -Math.sign(k) * (HALF + 26));
    if (Math.abs(locate(t, p.x, p.y).lat) < HALF + 18) continue;
    g.fillStyle = '#ecd7a2';
    g.beginPath();
    g.arc(p.x, p.y, 21, 0, Math.PI * 2);
    g.fill();
  }
  for (let i = 0; i < 2600; i++) {
    const p = trackPoint(t, rnd() * t.len, (rnd() < 0.5 ? -1 : 1) * (HALF + 8 + rnd() * 38));
    g.fillStyle = rnd() < 0.5 ? 'rgba(150,120,70,0.25)' : 'rgba(255,255,255,0.25)';
    g.fillRect(p.x, p.y, 1.2, 1.2);
  }

  // Randsteine, weiße Linie, Asphalt
  stroke(ROAD + 12, '#ffffff');
  stroke(ROAD + 12, '#e8364f', [9, 9]);
  stroke(ROAD + 1, '#f6f2f8');
  stroke(ROAD - 3, '#5f5a6b');
  for (let i = 0; i < 9000; i++) {
    const p = trackPoint(t, rnd() * t.len, (rnd() - 0.5) * (ROAD - 4));
    const v = rnd();
    g.fillStyle = v < 0.45 ? '#55505f' : v < 0.9 ? '#6b6677' : '#7d7889';
    g.fillRect(p.x, p.y, 0.9 + rnd(), 0.9 + rnd());
  }
  // Bremsspuren auf der Ideallinie in den Kurven
  g.strokeStyle = 'rgba(25,20,32,0.22)';
  g.lineWidth = 1.6;
  for (let s = 0; s < t.len; s += 3) {
    const k = curveAhead(t, s, 24);
    if (Math.abs(k) < 1 / 120) continue;
    const lane = Math.sign(k) * 18;
    for (const w of [-4, 4]) {
      const a = trackPoint(t, s, lane + w);
      const b = trackPoint(t, s + 3.2, lane + w);
      g.beginPath();
      g.moveTo(a.x, a.y);
      g.lineTo(b.x, b.y);
      g.stroke();
    }
  }
  stroke(1.6, 'rgba(255,255,255,0.55)', [14, 18]);

  // Ziellinie im Schachbrettmuster, Startplätze
  const sq = (ROAD - 3) / 14;
  for (let r = 0; r < 2; r++) {
    for (let col = 0; col < 14; col++) {
      const p = trackPoint(t, -sq + r * sq + sq / 2, -(ROAD - 3) / 2 + col * sq + sq / 2);
      g.save();
      g.translate(p.x, p.y);
      g.rotate(p.a);
      g.fillStyle = (r + col) % 2 ? '#ffffff' : '#1c1622';
      g.fillRect(-sq / 2 - 0.1, -sq / 2 - 0.1, sq + 0.2, sq + 0.2);
      g.restore();
    }
  }
  for (const lat of [-15, 15]) {
    const p = trackPoint(t, t.len - 28, lat);
    g.save();
    g.translate(p.x, p.y);
    g.rotate(p.a);
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(10, -8);
    g.lineTo(10, 8);
    g.moveTo(10, -8);
    g.lineTo(4, -8);
    g.moveTo(10, 8);
    g.lineTo(4, 8);
    g.stroke();
    g.restore();
  }
  // Schriftzug auf dem Asphalt, lesbar beim Drüberfahren
  {
    const p = trackPoint(t, 70, 0);
    const d = trackPoint(t, 70.5, 0);
    g.save();
    g.translate(p.x, p.y);
    g.rotate(Math.atan2(d.x - p.x, -(d.y - p.y)));
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.font = '900 19px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('♥ ARTA ♥', 0, 0);
    g.restore();
  }
  // Turbo-Felder
  for (const p of t.pads) {
    g.save();
    g.translate(p.x, p.y);
    g.rotate(p.a);
    g.shadowColor = '#ffb100';
    g.shadowBlur = 6;
    g.fillStyle = '#ff8a1f';
    g.beginPath();
    g.roundRect(-14, -11, 28, 22, 5);
    g.fill();
    g.shadowBlur = 0;
    g.strokeStyle = '#fff36b';
    g.lineWidth = 3.2;
    g.lineJoin = 'round';
    for (const dx of [-7, 0, 7]) {
      g.beginPath();
      g.moveTo(dx - 3, -7);
      g.lineTo(dx + 3, 0);
      g.lineTo(dx - 3, 7);
      g.stroke();
    }
    g.restore();
  }
  // Schatten unter den Item-Boxen
  for (const b of t.boxes) {
    g.fillStyle = 'rgba(20,10,30,0.28)';
    g.beginPath();
    g.ellipse(b.x, b.y, 6, 6, 0, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

interface WorldAssets {
  t: Track;
  world: HTMLCanvasElement;
  grass: HTMLCanvasElement;
  detail: HTMLCanvasElement;
  /** Seit dem Aufbau kamen Bremsspuren dazu */
  marked: boolean;
}

let worldCache: WorldAssets | undefined;
function worldAssets(t: Track): WorldAssets {
  if (!worldCache || worldCache.t !== t) worldCache = { t, world: drawWorld(t), grass: grassTile(), detail: detailTile(), marked: false };
  return worldCache;
}

// ───────────────────────── Bremsspuren ─────────────────────────

/** Neue Spuren auf der Weltkarte – jeder Boden holt sich die, die er noch nicht kennt. */
interface Mark {
  ver: number;
  x: number;
  y: number;
  w: number;
  h: number;
}
const marks: Mark[] = [];
let markVer = 0;

/** Malt eine Reifenspur (Weltkoordinaten) dauerhaft auf die Strecke. */
export function markSkid(t: Track, segs: [number, number, number, number][], alpha = 0.22) {
  const A = worldAssets(t);
  const g = A.world.getContext('2d')!;
  g.setTransform(TS, 0, 0, TS, 0, 0);
  g.strokeStyle = `rgba(28,22,34,${alpha})`;
  g.lineWidth = 1.7;
  g.lineCap = 'round';
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  g.beginPath();
  for (const [ax, ay, bx, by] of segs) {
    g.moveTo(ax, ay);
    g.lineTo(bx, by);
    x0 = Math.min(x0, ax, bx);
    y0 = Math.min(y0, ay, by);
    x1 = Math.max(x1, ax, bx);
    y1 = Math.max(y1, ay, by);
  }
  g.stroke();
  g.setTransform(1, 0, 0, 1, 0, 0);
  const x = Math.max(0, Math.floor((x0 - 2) * TS));
  const y = Math.max(0, Math.floor((y0 - 2) * TS));
  const w = Math.min(TEX, Math.ceil((x1 + 2) * TS)) - x;
  const h = Math.min(TEX, Math.ceil((y1 + 2) * TS)) - y;
  if (w <= 0 || h <= 0 || w > 256 || h > 256) return;
  A.marked = true;
  marks.push({ ver: ++markVer, x, y, w, h });
  if (marks.length > 800) marks.splice(0, marks.length - 800);
}

let markScratch: HTMLCanvasElement | undefined;

// ───────────────────────── Boden ─────────────────────────

export interface Ground {
  readonly kind: 'gl' | 'soft';
  resize(cssW: number, cssH: number, dpr: number): void;
  draw(cam: Cam, mood: Mood): void;
  destroy(): void;
}

const VERT = `attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;
const FRAG = `
precision highp float;
uniform sampler2D uTex;
uniform sampler2D uGrass;
uniform sampler2D uDetail;
uniform vec2 uRes;
uniform float uHz;
uniform float uF;
uniform float uCamH;
uniform vec2 uCam;
uniform vec2 uFwd;
uniform vec3 uSkyTop;
uniform vec3 uSkyBot;
uniform vec3 uFog;
uniform vec3 uLight;
uniform vec3 uSun;
uniform vec2 uSunDir;
void main() {
  float py = uRes.y - gl_FragCoord.y;
  if (py <= uHz + 0.5) {
    float t = clamp(py / uHz, 0.0, 1.0);
    gl_FragColor = vec4(mix(uSkyTop, uSkyBot, t * t), 1.0);
    return;
  }
  float z = uCamH * uF / (py - uHz);
  vec2 right = vec2(-uFwd.y, uFwd.x);
  float side = (gl_FragCoord.x - uRes.x * 0.5) * z / uF;
  vec2 w = uCam + uFwd * z + right * side;
  vec2 uv = w / ${WORLD.toFixed(1)};
  vec3 inner = texture2D(uTex, clamp(uv, 0.0, 1.0)).rgb;
  vec3 outer = texture2D(uGrass, w / 64.0).rgb;
  float inside = step(0.0, uv.x) * step(0.0, uv.y) * step(uv.x, 1.0) * step(uv.y, 1.0);
  vec3 c = mix(outer, inner, inside);

  // Woraus ist der Boden hier? Asphalt ist grau, Wiese deutlich grün.
  float hi = max(c.r, max(c.g, c.b));
  float lo = min(c.r, min(c.g, c.b));
  float lum = dot(c, vec3(0.3, 0.59, 0.11));
  float asphalt = (1.0 - smoothstep(0.05, 0.12, hi - lo)) * smoothstep(0.22, 0.3, lum) * (1.0 - smoothstep(0.5, 0.6, lum));
  float grass = smoothstep(0.05, 0.14, c.g - max(c.r, c.b));

  // Feine Muster in der Nähe, weiche Flecken überall
  float near = clamp(1.0 - z / 280.0, 0.0, 1.0);
  vec3 d = texture2D(uDetail, w / 16.0).rgb;
  float spots = texture2D(uDetail, w / 150.0).b;
  c *= 1.0 + ((d.r - 0.5) * 0.42 * asphalt + (d.g - 0.47) * 0.5 * grass) * near;
  c *= 0.9 + spots * 0.2 * (0.4 + grass * 0.6);

  // Licht, Sonnenglanz auf dem Asphalt, Dunst Richtung Sonne heller
  vec2 dir = normalize(uFwd * z + right * side);
  float toSun = max(dot(dir, uSunDir), 0.0);
  c *= uLight;
  c += uSun * asphalt * pow(toSun, 10.0) * smoothstep(25.0, 260.0, z) * 0.32;
  vec3 haze = mix(uFog, uSun, pow(toSun, 5.0) * 0.55);
  c = mix(c, haze, smoothstep(170.0, 1500.0, z) * 0.95);
  gl_FragColor = vec4(c, 1.0);
}`;

class GlGround implements Ground {
  readonly kind = 'gl' as const;
  private gl: WebGLRenderingContext;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private w = 1;
  private h = 1;
  private worldTex: WebGLTexture | null = null;
  private seen = markVer;
  private mipDirty = false;
  private mipT = 0;
  private onLost = (e: Event) => e.preventDefault();
  private onRestored: () => void;

  constructor(
    private cv: HTMLCanvasElement,
    t: Track,
  ) {
    const gl = cv.getContext('webgl', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('kein WebGL');
    this.gl = gl;
    this.init(t);
    // Holt sich das System die Grafikkarte zurück (z. B. App im Hintergrund), wird alles neu aufgebaut.
    this.onRestored = () => {
      this.init(t);
      gl.viewport(0, 0, this.w, this.h);
    };
    cv.addEventListener('webglcontextlost', this.onLost);
    cv.addEventListener('webglcontextrestored', this.onRestored);
  }

  private init(t: Track) {
    const gl = this.gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'Shader');
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'Programm');
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    for (const n of ['uTex', 'uGrass', 'uDetail', 'uRes', 'uHz', 'uF', 'uCamH', 'uCam', 'uFwd', 'uSkyTop', 'uSkyBot', 'uFog', 'uLight', 'uSun', 'uSunDir']) this.u[n] = gl.getUniformLocation(prog, n);

    const A = worldAssets(t);
    const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    const tex = (unit: number, src: HTMLCanvasElement, repeat: boolean) => {
      const tx = gl.createTexture();
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tx);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
      if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      return tx;
    };
    this.worldTex = tex(0, A.world, false);
    tex(1, A.grass, true);
    tex(2, A.detail, true);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(this.u.uTex, 0);
    gl.uniform1i(this.u.uGrass, 1);
    gl.uniform1i(this.u.uDetail, 2);
    gl.uniform2f(this.u.uSunDir, Math.cos(SUN_AZ), Math.sin(SUN_AZ));
    this.seen = markVer;
  }

  /** Neue Bremsspuren in die Textur übernehmen; die kleineren Stufen ab und zu neu rechnen. */
  private syncMarks() {
    const { gl } = this;
    if (this.seen < markVer && worldCache) {
      gl.bindTexture(gl.TEXTURE_2D, this.worldTex);
      markScratch ??= document.createElement('canvas');
      const sg = markScratch.getContext('2d')!;
      for (const m of marks) {
        if (m.ver <= this.seen) continue;
        if (markScratch.width !== m.w || markScratch.height !== m.h) {
          markScratch.width = m.w;
          markScratch.height = m.h;
        } else sg.clearRect(0, 0, m.w, m.h);
        sg.drawImage(worldCache.world, m.x, m.y, m.w, m.h, 0, 0, m.w, m.h);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, m.x, m.y, gl.RGBA, gl.UNSIGNED_BYTE, markScratch);
      }
      this.seen = markVer;
      this.mipDirty = true;
    }
    const now = performance.now();
    if (this.mipDirty && now - this.mipT > 1200) {
      gl.bindTexture(gl.TEXTURE_2D, this.worldTex);
      gl.generateMipmap(gl.TEXTURE_2D);
      this.mipDirty = false;
      this.mipT = now;
    }
  }

  resize(cssW: number, cssH: number, dpr: number) {
    this.w = Math.max(1, Math.round(cssW * dpr));
    this.h = Math.max(1, Math.round(cssH * dpr));
    if (this.cv.width !== this.w || this.cv.height !== this.h) {
      this.cv.width = this.w;
      this.cv.height = this.h;
    }
    this.gl.viewport(0, 0, this.w, this.h);
  }

  draw(cam: Cam, mood: Mood) {
    const { gl, u } = this;
    if (gl.isContextLost()) return;
    this.syncMarks();
    const pal = PALETTES[mood];
    const p = projection(this.w, this.h, cam);
    gl.uniform2f(u.uRes, this.w, this.h);
    gl.uniform1f(u.uHz, p.hz);
    gl.uniform1f(u.uF, p.f);
    gl.uniform1f(u.uCamH, p.camH);
    gl.uniform2f(u.uCam, p.cx, p.cy);
    gl.uniform2f(u.uFwd, p.fx, p.fy);
    gl.uniform3fv(u.uSkyTop, pal.skyTop);
    gl.uniform3fv(u.uSkyBot, pal.skyBot);
    gl.uniform3fv(u.uFog, pal.fog);
    gl.uniform3fv(u.uLight, pal.light);
    gl.uniform3fv(u.uSun, pal.sun);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  destroy() {
    this.cv.removeEventListener('webglcontextlost', this.onLost);
    this.cv.removeEventListener('webglcontextrestored', this.onRestored);
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
    this.cv.remove();
  }
}

let softTex: Uint32Array | undefined;
let softSeen = 0;

/** Ersatz ohne WebGL: derselbe Boden, in niedriger Auflösung in Software gerechnet. */
class SoftGround implements Ground {
  readonly kind = 'soft' as const;
  private ctx: CanvasRenderingContext2D;
  private img: ImageData | null = null;
  private buf: Uint32Array | null = null;
  private w = 1;
  private h = 1;
  private grads: { mood: Mood; sky: CanvasGradient; fog: CanvasGradient } | null = null;

  constructor(
    private cv: HTMLCanvasElement,
    t: Track,
  ) {
    this.ctx = cv.getContext('2d')!;
    if (!softTex) {
      const A = worldAssets(t);
      softTex = new Uint32Array(A.world.getContext('2d')!.getImageData(0, 0, TEX, TEX).data.buffer.slice(0));
      softSeen = markVer;
    }
  }

  resize(cssW: number, cssH: number) {
    this.w = 300;
    this.h = Math.max(60, Math.round((300 * cssH) / Math.max(1, cssW)));
    this.cv.width = this.w;
    this.cv.height = this.h;
    this.img = this.ctx.createImageData(this.w, this.h);
    this.buf = new Uint32Array(this.img.data.buffer);
    this.grads = null;
  }

  private syncMarks() {
    if (!softTex || softSeen >= markVer || !worldCache) return;
    const g = worldCache.world.getContext('2d')!;
    for (const m of marks) {
      if (m.ver <= softSeen) continue;
      const px = new Uint32Array(g.getImageData(m.x, m.y, m.w, m.h).data.buffer);
      for (let y = 0; y < m.h; y++) softTex.set(px.subarray(y * m.w, (y + 1) * m.w), (m.y + y) * TEX + m.x);
    }
    softSeen = markVer;
  }

  draw(cam: Cam, mood: Mood) {
    const { ctx, buf, img, w: W, h: H } = this;
    if (!buf || !img || !softTex) return;
    this.syncMarks();
    const pal = PALETTES[mood];
    const p = projection(W, H, cam);
    const hz = Math.round(p.hz);
    if (!this.grads || this.grads.mood !== mood) {
      const sky = ctx.createLinearGradient(0, 0, 0, hz);
      sky.addColorStop(0, css(pal.skyTop));
      sky.addColorStop(1, css(pal.skyBot));
      const fog = ctx.createLinearGradient(0, hz, 0, hz + H * 0.14);
      fog.addColorStop(0, css(pal.fog));
      fog.addColorStop(1, css(pal.fog, 0));
      this.grads = { mood, sky, fog };
    }
    const G1 = 0xff50b360;
    const G2 = 0xff47a656;
    for (let y = hz + 1; y < H; y++) {
      const z = (p.camH * p.f) / (y - p.hz);
      const k = z / p.f;
      let wx = (p.cx + p.fx * z - (p.rx * k * W) / 2) * TS;
      let wy = (p.cy + p.fy * z - (p.ry * k * W) / 2) * TS;
      const sx = p.rx * k * TS;
      const sy = p.ry * k * TS;
      let o = y * W;
      for (let x = 0; x < W; x++) {
        const ix = Math.floor(wx);
        const iy = Math.floor(wy);
        buf[o++] = ix >= 0 && ix < TEX && iy >= 0 && iy < TEX ? softTex[iy * TEX + ix] : ((ix >> 6) ^ (iy >> 6)) & 1 ? G2 : G1;
        wx += sx;
        wy += sy;
      }
    }
    ctx.putImageData(img, 0, 0, 0, hz + 1, W, H - hz - 1);
    if (pal.light.some((v) => v !== 1)) {
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = css(pal.light.map((v) => Math.min(1, v)));
      ctx.fillRect(0, hz, W, H - hz);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.fillStyle = this.grads.sky;
    ctx.fillRect(0, 0, W, hz + 1);
    ctx.fillStyle = this.grads.fog;
    ctx.fillRect(0, hz, W, H * 0.14);
  }

  destroy() {
    this.cv.remove();
  }
}

/** Legt im Container eine Leinwand für den Boden an – mit WebGL, wenn das Handy es kann. */
export function makeGround(host: HTMLElement, t: Track, preferGl = true): Ground {
  const fresh = () => {
    const cv = document.createElement('canvas');
    host.appendChild(cv);
    return cv;
  };
  if (preferGl) {
    const cv = fresh();
    try {
      return new GlGround(cv, t);
    } catch {
      // Eine Leinwand mit WebGL-Versuch kann kein 2D mehr – also eine neue für die Software
      cv.remove();
    }
  }
  return new SoftGround(fresh(), t);
}

// ───────────────────────── Figuren ─────────────────────────

/** Pixel pro Welteinheit in den Kart-Schichten */
const PPU = 5;
const KART_W = 14;
const KART_L = 20;
export const LAYER_H = 0.72;

/** Kart von oben in Schichten (Spitze zeigt nach oben) – übereinandergelegt ergibt das ein 3D-Kart. */
function kartLayers(color: string, emoji: string): HTMLCanvasElement[] {
  const W = KART_W * PPU;
  const L = KART_L * PPU;
  const layers: HTMLCanvasElement[] = [];
  const layer = (draw: (g: CanvasRenderingContext2D) => void) => {
    const [c, g] = canvas(W, L);
    draw(g);
    layers.push(c);
  };
  const rr = (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string) => {
    g.fillStyle = fill;
    g.beginPath();
    g.roundRect(x, y, w, h, r);
    g.fill();
  };
  const wheels = (g: CanvasRenderingContext2D, rim: boolean) => {
    for (const [x, y, w, h] of [
      [4, 12, 11, 17],
      [55, 12, 11, 17],
      [1, 64, 14, 24],
      [55, 64, 14, 24],
    ]) {
      rr(g, x, y, w, h, 4, '#1b1820');
      if (rim) {
        g.fillStyle = '#8d8899';
        g.fillRect(x + w / 2 - 2, y + h / 2 - 3, 4, 6);
      }
    }
  };
  const body = (g: CanvasRenderingContext2D, fill: string, inset = 0) => {
    g.fillStyle = fill;
    g.beginPath();
    g.moveTo(25 + inset, 4 + inset);
    g.lineTo(45 - inset, 4 + inset);
    g.lineTo(51 - inset, 30);
    g.lineTo(56 - inset, 58);
    g.lineTo(56 - inset, 90 - inset);
    g.lineTo(14 + inset, 90 - inset);
    g.lineTo(14 + inset, 58);
    g.lineTo(19 + inset, 30);
    g.closePath();
    g.fill();
  };
  layer((g) => wheels(g, false));
  layer((g) => {
    wheels(g, false);
    rr(g, 15, 8, 40, 84, 8, '#26222d');
  });
  layer((g) => {
    wheels(g, true);
    body(g, shade(color, -0.35));
  });
  layer((g) => {
    body(g, shade(color, -0.12));
    rr(g, 8, 40, 54, 26, 8, shade(color, -0.2));
  });
  layer((g) => {
    body(g, color);
    rr(g, 9, 41, 52, 24, 8, color);
    rr(g, 22, 2, 26, 6, 3, '#f4f0f8');
  });
  layer((g) => {
    body(g, shade(color, 0.12), 2);
    g.fillStyle = 'rgba(255,255,255,0.9)';
    g.fillRect(32, 6, 6, 34);
    rr(g, 20, 44, 30, 22, 6, '#2a2531');
    rr(g, 22, 70, 26, 20, 4, '#8f8a9a');
    g.fillStyle = '#5d5867';
    g.beginPath();
    g.arc(28, 92, 3, 0, Math.PI * 2);
    g.arc(42, 92, 3, 0, Math.PI * 2);
    g.fill();
  });
  layer((g) => {
    rr(g, 22, 70, 26, 18, 4, '#a39eae');
    g.strokeStyle = '#2a2531';
    g.lineWidth = 3;
    g.beginPath();
    g.arc(35, 36, 6, Math.PI, Math.PI * 2);
    g.stroke();
  });
  layer((g) => {
    rr(g, 4, 86, 62, 9, 3, '#2a2531');
    g.fillStyle = color;
    g.fillRect(6, 88, 58, 3);
    g.fillStyle = shade(color, -0.25);
    g.beginPath();
    g.ellipse(35, 58, 14, 11, 0, 0, Math.PI * 2);
    g.fill();
  });
  layer((g) => {
    rr(g, 4, 86, 62, 8, 3, shade(color, 0.15));
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.ellipse(35, 57, 13, 10, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = color;
    g.fillRect(23, 55, 24, 4);
  });
  for (const r of [10.5, 11, 10.5, 9, 6.5]) {
    const i = layers.length;
    layer((g) => {
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(35, 50, r, 0, Math.PI * 2);
      g.fill();
      if (i === 10) {
        g.fillStyle = color;
        g.beginPath();
        g.arc(35, 50, r, 0, Math.PI * 2);
        g.fill();
      }
      if (i <= 10) {
        g.fillStyle = '#2b2440';
        g.beginPath();
        g.arc(35, 50, r, Math.PI * 1.15, Math.PI * 1.85);
        g.lineTo(35, 50);
        g.fill();
      }
    });
  }
  layer((g) => {
    g.font = '22px serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(emoji, 35, 50);
  });
  return layers;
}

function treeSprite(k: number): HTMLCanvasElement {
  const [c, g] = canvas(96, 120);
  if (k === 3) {
    // Herzbusch
    const grad = g.createLinearGradient(0, 60, 0, 116);
    grad.addColorStop(0, '#6ccf6a');
    grad.addColorStop(1, '#2f8a3f');
    g.fillStyle = grad;
    heartPath(g, 48, 92, 70);
    g.fill();
    g.fillStyle = '#ff7fb0';
    for (const [x, y] of [
      [36, 82],
      [58, 78],
      [48, 98],
      [30, 94],
      [64, 92],
    ]) {
      g.beginPath();
      g.arc(x, y, 3, 0, Math.PI * 2);
      g.fill();
    }
    return c;
  }
  const trunk = g.createLinearGradient(42, 0, 54, 0);
  trunk.addColorStop(0, '#8a5532');
  trunk.addColorStop(1, '#5e3820');
  g.fillStyle = trunk;
  g.fillRect(43, 70, 10, 44);
  if (k === 2) {
    for (const [y, w, col] of [
      [20, 20, '#2f7d45'],
      [42, 28, '#2a7340'],
      [64, 36, '#246a3a'],
    ] as const) {
      g.fillStyle = col;
      g.beginPath();
      g.moveTo(48, y - 16);
      g.lineTo(48 + w, y + 26);
      g.lineTo(48 - w, y + 26);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.beginPath();
      g.moveTo(48, y - 16);
      g.lineTo(48 - w, y + 26);
      g.lineTo(48 - w * 0.4, y + 26);
      g.closePath();
      g.fill();
    }
    return c;
  }
  const [dark, mid, light] = k === 1 ? ['#e86d9f', '#ff93be', '#ffd0e3'] : ['#2f8a3f', '#47a94d', '#86d877'];
  const blob = (x: number, y: number, r: number) => {
    const grad = g.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    grad.addColorStop(0, light);
    grad.addColorStop(0.45, mid);
    grad.addColorStop(1, dark);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  blob(30, 60, 22);
  blob(66, 60, 22);
  blob(48, 40, 30);
  blob(48, 66, 22);
  if (k === 1) {
    g.fillStyle = '#ffffff';
    const rnd = seeded(3);
    for (let i = 0; i < 26; i++) g.fillRect(20 + rnd() * 56, 18 + rnd() * 62, 2, 2);
  }
  return c;
}

/** Eine Schicht der Item-Box – zehn davon übereinander ergeben einen festen, bunten Würfel. */
function boxLayer(i: number, n: number): HTMLCanvasElement {
  const [c, g] = canvas(44, 44);
  const top = i === n - 1;
  const grad = g.createLinearGradient(0, 0, 44, 44);
  const l = top ? 74 : 52 + (i / n) * 14;
  grad.addColorStop(0, `hsl(330, 95%, ${l}%)`);
  grad.addColorStop(0.5, `hsl(275, 90%, ${l}%)`);
  grad.addColorStop(1, `hsl(195, 95%, ${l}%)`);
  g.fillStyle = grad;
  g.beginPath();
  g.roundRect(2, 2, 40, 40, 7);
  g.fill();
  if (i === 0 || top) {
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 3;
    g.stroke();
  }
  if (top) {
    g.fillStyle = 'rgba(255,255,255,0.4)';
    g.beginPath();
    g.roundRect(6, 6, 16, 9, 4);
    g.fill();
    g.fillStyle = '#ffffff';
    g.font = '900 28px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('?', 22, 24);
  }
  return c;
}

const dotCache = new Map<string, HTMLCanvasElement>();
/** Weicher, runder Fleck in einer Farbe – für Rauch, Staub, Funken */
function softDot(color: string): HTMLCanvasElement {
  let c = dotCache.get(color);
  if (!c) {
    const [cv, g] = canvas(32, 32);
    const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, color);
    grad.addColorStop(0.45, color);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 32, 32);
    c = cv;
    dotCache.set(color, c);
  }
  return c;
}

function bananaSprite(): HTMLCanvasElement {
  const [c, g] = canvas(48, 40);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.beginPath();
  g.ellipse(24, 36, 18, 4, 0, 0, Math.PI * 2);
  g.fill();
  g.lineCap = 'round';
  g.strokeStyle = '#d9a91c';
  g.lineWidth = 13;
  g.beginPath();
  g.arc(24, 4, 25, Math.PI * 0.22, Math.PI * 0.78);
  g.stroke();
  g.strokeStyle = '#ffe14a';
  g.lineWidth = 9;
  g.beginPath();
  g.arc(24, 2, 25, Math.PI * 0.25, Math.PI * 0.75);
  g.stroke();
  g.strokeStyle = '#6b4a1e';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(43, 19);
  g.lineTo(47, 14);
  g.moveTo(5, 19);
  g.lineTo(1, 14);
  g.stroke();
  return c;
}

function arrowSprite(): HTMLCanvasElement {
  const [c, g] = canvas(52, 44);
  g.shadowColor = '#ff3d77';
  g.shadowBlur = 10;
  g.strokeStyle = '#ffe6a1';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(4, 40);
  g.lineTo(48, 4);
  g.stroke();
  const grad = g.createLinearGradient(0, 6, 0, 40);
  grad.addColorStop(0, '#ff7aa5');
  grad.addColorStop(1, '#e8104f');
  g.fillStyle = grad;
  heartPath(g, 26, 23, 34);
  g.fill();
  g.shadowBlur = 0;
  g.fillStyle = 'rgba(255,255,255,0.75)';
  g.beginPath();
  g.ellipse(18, 14, 4, 3, -0.5, 0, Math.PI * 2);
  g.fill();
  return c;
}

function signSprite(dir: number): HTMLCanvasElement {
  const [c, g] = canvas(64, 64);
  g.fillStyle = '#8a8592';
  g.fillRect(29, 30, 6, 34);
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.roundRect(2, 4, 60, 30, 5);
  g.fill();
  g.fillStyle = '#e8364f';
  g.beginPath();
  g.roundRect(5, 7, 54, 24, 3);
  g.fill();
  g.strokeStyle = '#ffffff';
  g.lineWidth = 4;
  g.lineJoin = 'round';
  for (const x of [-14, 0, 14]) {
    g.beginPath();
    g.moveTo(32 + x - 4 * dir, 12);
    g.lineTo(32 + x + 4 * dir, 19);
    g.lineTo(32 + x - 4 * dir, 26);
    g.stroke();
  }
  return c;
}

function bannerSprite(): HTMLCanvasElement {
  const [c, g] = canvas(360, 40);
  g.fillStyle = '#ff4f81';
  g.fillRect(0, 0, 360, 40);
  for (let x = 0; x < 360; x += 10) {
    g.fillStyle = (x / 10) % 2 ? '#1c1622' : '#ffffff';
    g.fillRect(x, 0, 10, 5);
    g.fillStyle = (x / 10) % 2 ? '#ffffff' : '#1c1622';
    g.fillRect(x, 35, 10, 5);
  }
  g.fillStyle = '#ffffff';
  g.font = '900 22px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('♥  ARTA RING  ♥', 180, 21);
  return c;
}

/** Hügel und Berge am Horizont – zweimal so breit wie das Bild, damit sie beim Drehen weiterlaufen. */
function hillsSprite(W: number, H: number, pal: Palette): { far: HTMLCanvasElement; near: HTMLCanvasElement } {
  const w = Math.round(W * 2);
  const hh = Math.round(H * 0.13);
  const ridge = (g: CanvasRenderingContext2D, base: number, amp: number, freq: number[], phase: number, fill: string | CanvasGradient) => {
    g.fillStyle = fill;
    g.beginPath();
    g.moveTo(0, hh);
    for (let x = 0; x <= w; x += 3) {
      const u = (x / w) * Math.PI * 2;
      const y = base - amp * (0.55 + 0.25 * Math.sin(u * freq[0] + phase) + 0.2 * Math.sin(u * freq[1] + phase * 2.1));
      g.lineTo(x, y);
    }
    g.lineTo(w, hh);
    g.closePath();
    g.fill();
  };
  const [far, gf] = canvas(w, hh);
  const mg = gf.createLinearGradient(0, 0, 0, hh);
  mg.addColorStop(0, pal.far[0]);
  mg.addColorStop(1, pal.far[1]);
  ridge(gf, hh, hh * 0.95, [4, 9], 0.3, mg);
  // Schneekappen
  gf.globalCompositeOperation = 'source-atop';
  gf.fillStyle = pal.snow;
  gf.fillRect(0, 0, w, hh * 0.22);
  gf.globalCompositeOperation = 'source-over';
  const [near, gn] = canvas(w, hh);
  const hg = gn.createLinearGradient(0, hh * 0.3, 0, hh);
  hg.addColorStop(0, pal.near[0]);
  hg.addColorStop(1, pal.near[1]);
  ridge(gn, hh, hh * 0.55, [6, 13], 1.7, hg);
  const rnd = seeded(12);
  for (let i = 0; i < w / 9; i++) {
    const x = rnd() * w;
    const u = (x / w) * Math.PI * 2;
    const top = hh - hh * 0.55 * (0.55 + 0.25 * Math.sin(u * 6 + 1.7) + 0.2 * Math.sin(u * 13 + 3.57));
    gn.fillStyle = rnd() < 0.3 ? '#ff9fc5' : shade(pal.near[1], -0.25);
    gn.beginPath();
    gn.arc(x, top + 2 + rnd() * hh * 0.2, 1.5 + rnd() * (hh * 0.05), 0, Math.PI * 2);
    gn.fill();
  }
  return { far, near };
}

/** Wolkenband für den Himmel, ebenfalls doppelt so breit wie das Bild */
function cloudsSprite(W: number, H: number, pal: Palette): HTMLCanvasElement {
  const w = Math.round(W * 2);
  const hh = Math.max(8, Math.round(H * HORIZON * 0.9));
  const [c, g] = canvas(w, hh);
  const rnd = seeded(21);
  const n = 7;
  for (let i = 0; i < n; i++) {
    const cy = hh * (0.18 + rnd() * 0.5);
    const size = W * (0.035 + rnd() * 0.035) * (1.25 - cy / hh);
    const cx = ((i + rnd() * 0.5) / n) * w;
    // Jede Wolke auf eigener Leinwand: erst die Form aus Kugeln, dann Licht von oben, Schatten unten
    const cw = Math.ceil(size * 7);
    const ch = Math.ceil(size * 2.6);
    const [cc, cg] = canvas(cw, ch);
    const base = ch * 0.82;
    const puffs = 4 + Math.floor(rnd() * 3);
    cg.fillStyle = pal.cloud;
    for (let j = 0; j < puffs; j++) {
      const u = (j + 0.5) / puffs;
      const r = size * (0.55 + Math.sin(u * Math.PI) * 0.55 + rnd() * 0.2);
      const px = cw * (0.14 + u * 0.72);
      cg.beginPath();
      cg.ellipse(px, base - r * 0.55, r * 1.15, r * 0.85, 0, 0, Math.PI * 2);
      cg.fill();
    }
    cg.fillRect(cw * 0.12, base - size * 0.5, cw * 0.76, size * 0.5);
    cg.clearRect(0, base, cw, ch - base);
    cg.globalCompositeOperation = 'source-atop';
    const grad = cg.createLinearGradient(0, 0, 0, base);
    grad.addColorStop(0, 'rgba(255,255,255,0.55)');
    grad.addColorStop(0.45, 'rgba(255,255,255,0)');
    grad.addColorStop(1, pal.cloudShade);
    cg.fillStyle = grad;
    cg.fillRect(0, 0, cw, ch);
    g.globalAlpha = 0.88;
    for (const dx of [-w, 0, w]) g.drawImage(cc, cx + dx - cw / 2, cy - base);
  }
  g.globalAlpha = 1;
  return c;
}

function vignetteSprite(W: number, H: number, strength: number): HTMLCanvasElement {
  const [c, g] = canvas(W, H);
  const r = Math.hypot(W, H) / 2;
  const grad = g.createRadialGradient(W / 2, H * 0.55, r * 0.45, W / 2, H * 0.55, r);
  grad.addColorStop(0, 'rgba(25,5,35,0)');
  grad.addColorStop(1, `rgba(25,5,35,${strength})`);
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  return c;
}

function mapSprite(t: Track, size: number): HTMLCanvasElement {
  const [c, g] = canvas(size, size);
  const s = size / WORLD;
  g.lineJoin = 'round';
  g.beginPath();
  for (let i = 0; i <= t.n; i++) {
    const k = i % t.n;
    if (i === 0) g.moveTo(t.px[k] * s, t.py[k] * s);
    else g.lineTo(t.px[k] * s, t.py[k] * s);
  }
  g.closePath();
  g.strokeStyle = 'rgba(30,15,40,0.55)';
  g.lineWidth = size * 0.11;
  g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.95)';
  g.lineWidth = size * 0.055;
  g.stroke();
  const p = trackPoint(t, 0);
  g.fillStyle = '#1c1622';
  g.beginPath();
  g.arc(p.x * s, p.y * s, size * 0.035, 0, Math.PI * 2);
  g.fill();
  return c;
}

// ───────────────────────── Kulisse ─────────────────────────

/** Grasbüschel, teils mit Blüten */
function tuftSprite(k: number): HTMLCanvasElement {
  const [c, g] = canvas(32, 32);
  const rnd = seeded(40 + k);
  g.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const x = 16 + (rnd() - 0.5) * 16;
    const top = 6 + rnd() * 12;
    const bend = (rnd() - 0.5) * 10;
    g.strokeStyle = ['#2f8a3f', '#47a94d', '#6cc366'][i % 3];
    g.lineWidth = 2 + rnd();
    g.beginPath();
    g.moveTo(x, 32);
    g.quadraticCurveTo(x + bend * 0.3, 20, x + bend, top);
    g.stroke();
  }
  if (k > 0) {
    const col = ['', '#ff7fb0', '#ffd84a', '#ffffff'][k];
    for (let i = 0; i < 4; i++) {
      const x = 8 + rnd() * 16;
      const y = 6 + rnd() * 10;
      g.fillStyle = col;
      g.beginPath();
      g.arc(x, y, 3, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = k === 3 ? '#ffd84a' : 'rgba(255,255,255,0.8)';
      g.beginPath();
      g.arc(x, y, 1.1, 0, Math.PI * 2);
      g.fill();
    }
  }
  return c;
}

/** Reifenstapel an den Kiesbetten, rot-weiß */
function tiresSprite(): HTMLCanvasElement {
  const [c, g] = canvas(40, 44);
  for (let i = 0; i < 3; i++) {
    const y = 36 - i * 12;
    g.fillStyle = '#1d1a22';
    g.beginPath();
    g.ellipse(20, y + 3, 18, 7, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = i % 2 ? '#ffffff' : '#e8364f';
    g.fillRect(2, y - 5, 36, 8);
    g.beginPath();
    g.ellipse(20, y - 5, 18, 7, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#2a2531';
    g.beginPath();
    g.ellipse(20, y - 5, 9, 3.5, 0, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

/** Herz-Ballon an einer Schnur */
function balloonSprite(color: string): HTMLCanvasElement {
  const [c, g] = canvas(48, 80);
  g.strokeStyle = 'rgba(255,255,255,0.8)';
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(24, 40);
  g.bezierCurveTo(18, 55, 30, 65, 24, 80);
  g.stroke();
  const grad = g.createRadialGradient(17, 14, 2, 24, 22, 28);
  grad.addColorStop(0, shade(color, 0.55));
  grad.addColorStop(0.5, color);
  grad.addColorStop(1, shade(color, -0.3));
  g.fillStyle = grad;
  heartPath(g, 24, 24, 44);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.7)';
  g.beginPath();
  g.ellipse(15, 13, 4, 2.5, -0.6, 0, Math.PI * 2);
  g.fill();
  return c;
}

/** Fahne am Mast, zwei Bilder fürs Wehen */
function flagSprite(color: string, frame: number): HTMLCanvasElement {
  const [c, g] = canvas(40, 96);
  g.fillStyle = '#d9d4e0';
  g.fillRect(4, 4, 3, 92);
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(7, 6);
  for (let x = 0; x <= 30; x += 3) g.lineTo(7 + x, 6 + Math.sin(x / 7 + frame * Math.PI) * 3);
  for (let x = 30; x >= 0; x -= 3) g.lineTo(7 + x, 26 + Math.sin(x / 7 + frame * Math.PI) * 3 + x * 0.1);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.85)';
  heartPath(g, 20, 17 + Math.sin(13 / 7 + frame * Math.PI) * 3, 10);
  g.fill();
  return c;
}

/** Werbebanden am Streckenrand */
function boardSprite(k: number): HTMLCanvasElement {
  const [c, g] = canvas(256, 64);
  g.fillStyle = '#5a5464';
  g.fillRect(10, 40, 8, 24);
  g.fillRect(238, 40, 8, 24);
  const bg = ['#ffffff', '#ff4f81', '#7a5cff'][k];
  const fg = ['#ff4f81', '#ffffff', '#ffe14a'][k];
  g.fillStyle = bg;
  g.beginPath();
  g.roundRect(2, 2, 252, 44, 6);
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.15)';
  g.lineWidth = 3;
  g.stroke();
  g.fillStyle = fg;
  g.font = '900 30px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(['♥ ARTA ♥', 'HERZ-KART', '♥ ♥ ♥ ♥ ♥'][k], 128, 26);
  return c;
}

function boardBack(): HTMLCanvasElement {
  const [c, g] = canvas(256, 64);
  g.fillStyle = '#5a5464';
  g.fillRect(10, 40, 8, 24);
  g.fillRect(238, 40, 8, 24);
  g.fillStyle = '#c9c3d2';
  g.beginPath();
  g.roundRect(2, 2, 252, 44, 6);
  g.fill();
  return c;
}

/** Tribüne mit jubelnden Zuschauern – zwei Bilder, damit sie hüpfen */
function standSprite(frame: number): HTMLCanvasElement {
  const W = 640;
  const H = 150;
  const [c, g] = canvas(W, H);
  const rnd = seeded(77);
  // Dach mit Streifen
  for (let x = 0; x < W; x += 32) {
    g.fillStyle = (x / 32) % 2 ? '#ffffff' : '#ff4f81';
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + 32, 0);
    g.lineTo(x + 32, 16);
    g.quadraticCurveTo(x + 16, 26, x, 16);
    g.closePath();
    g.fill();
  }
  g.fillStyle = '#d9d4e0';
  for (let x = 8; x < W; x += 106) g.fillRect(x, 16, 6, H - 16);
  // Ränge
  for (let r = 0; r < 5; r++) {
    const y = 30 + r * 20;
    g.fillStyle = r % 2 ? '#8d86a0' : '#a39cb4';
    g.fillRect(0, y + 10, W, 10);
    for (let x = 6; x < W - 6; x += 11) {
      if (rnd() < 0.12) continue;
      const hop = frame && rnd() < 0.5 ? -4 : 0;
      g.fillStyle = ['#ff4f81', '#ffd84a', '#5fd4ff', '#b47bff', '#7be07b', '#ffffff', '#ff9a3c'][Math.floor(rnd() * 7)];
      g.fillRect(x - 4, y + 4 + hop, 8, 8);
      g.fillStyle = ['#ffd9b8', '#e8b48a', '#a8724d', '#6b4630'][Math.floor(rnd() * 4)];
      g.beginPath();
      g.arc(x, y + 1 + hop, 3.6, 0, Math.PI * 2);
      g.fill();
      if (frame && rnd() < 0.25) {
        g.strokeStyle = g.fillStyle;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(x - 3, y + 5 + hop);
        g.lineTo(x - 7, y - 4 + hop);
        g.stroke();
      }
    }
  }
  // Brüstung mit Schriftzug
  g.fillStyle = '#ff4f81';
  g.fillRect(0, 128, W, 22);
  g.fillStyle = '#ffffff';
  g.font = '900 17px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let x = 80; x < W; x += 160) g.fillText('♥ ARTA RING ♥', x, 140);
  return c;
}

interface Prop {
  x: number;
  y: number;
  kind: 'tree' | 'sign' | 'tuft' | 'tires' | 'flag' | 'balloon';
  k: number;
  /** Höhe über dem Boden (Ballons) */
  h?: number;
}

/** Senkrechte Fläche, fest in der Welt (Banden, Tribüne) – A links, B rechts von vorn gesehen */
interface Plane {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  h: number;
  img: 'board0' | 'board1' | 'board2' | 'stand';
  slices: number;
}

interface Sprites {
  trees: HTMLCanvasElement[];
  signs: Record<string, HTMLCanvasElement>;
  tufts: HTMLCanvasElement[];
  tires: HTMLCanvasElement;
  balloons: HTMLCanvasElement[];
  flags: HTMLCanvasElement[][];
  boards: HTMLCanvasElement[];
  boardBack: HTMLCanvasElement;
  stand: HTMLCanvasElement[];
  box: HTMLCanvasElement[];
  banana: HTMLCanvasElement;
  arrow: HTMLCanvasElement;
  banner: HTMLCanvasElement;
  karts: Map<string, HTMLCanvasElement[]>;
  props: Prop[];
  planes: Plane[];
  arch: { l: { x: number; y: number }; r: { x: number; y: number } };
}

let sprites: Sprites | undefined;
const BOX_LAYERS = 10;
const BOX_SIZE = 9;

function getSprites(t: Track): Sprites {
  if (sprites) return sprites;
  const rnd = seeded(91);
  const props: Prop[] = t.trees.map((tr, i) => ({ x: tr.x, y: tr.y, kind: 'tree', k: i % 7 === 0 ? 3 : tr.k }));
  const clear = (x: number, y: number, min: number) => Math.abs(locate(t, x, y).lat) >= min;

  // Welche Seite ist außen? Die, die weiter von der Mitte des Herzens weg liegt.
  let mx = 0;
  let my = 0;
  for (let i = 0; i < t.n; i++) {
    mx += t.px[i] / t.n;
    my += t.py[i] / t.n;
  }
  const outside = (s: number) => {
    const a = trackPoint(t, s, 60);
    const b = trackPoint(t, s, -60);
    return Math.hypot(a.x - mx, a.y - my) > Math.hypot(b.x - mx, b.y - my) ? 1 : -1;
  };

  // Kurvenschilder außen vor den engen Kurven
  let last = -999;
  for (let s = 0; s < t.len; s += 8) {
    const k = curveAhead(t, s + 50, 40);
    if (Math.abs(k) < 1 / 110 || s - last < 26) continue;
    last = s;
    const p = trackPoint(t, s + 50, -Math.sign(k) * (HALF + 20));
    if (!clear(p.x, p.y, HALF + 12)) continue;
    props.push({ x: p.x, y: p.y, kind: 'sign', k: Math.sign(k) });
  }
  // Reifenstapel hinter den Kiesbetten
  for (let s = 0; s < t.len; s += 7) {
    const k = curveAhead(t, s, 30);
    if (Math.abs(k) < 1 / 150) continue;
    const p = trackPoint(t, s, -Math.sign(k) * (HALF + 47));
    if (clear(p.x, p.y, HALF + 40)) props.push({ x: p.x, y: p.y, kind: 'tires', k: 0 });
  }
  // Grasbüschel und Blumen neben der Strecke
  for (let i = 0; i < 760; i++) {
    const side = rnd() < 0.5 ? -1 : 1;
    const p = trackPoint(t, rnd() * t.len, side * (HALF + 9 + rnd() * (WALL - HALF - 11)));
    if (clear(p.x, p.y, HALF + 7)) props.push({ x: p.x, y: p.y, kind: 'tuft', k: rnd() < 0.55 ? 0 : 1 + Math.floor(rnd() * 3) });
  }
  // Fahnen am Start
  [8, 34, 60].forEach((s, i) => {
    for (const side of [-1, 1]) {
      const p = trackPoint(t, s, side * (HALF + 11));
      props.push({ x: p.x, y: p.y, kind: 'flag', k: (i + (side > 0 ? 1 : 0)) % 3 });
    }
  });
  // Herz-Ballons über der Wiese
  for (const [x, y, h] of [
    [640, 610, 46],
    [560, 700, 34],
    [720, 700, 40],
    [640, 830, 30],
    [470, 520, 52],
    [810, 520, 44],
    [1190, 620, 38],
    [90, 640, 42],
    [640, 1170, 50],
    [380, 170, 36],
    [900, 170, 48],
  ]) {
    props.push({ x, y, kind: 'balloon', k: props.length % 4, h });
  }

  // Tribüne vor dem Start, Banden an den Geraden
  const planes: Plane[] = [];
  const wall = (s: number, lat: number, len: number, h: number, img: Plane['img'], slices: number) => {
    const o = Math.sign(lat);
    const p = trackPoint(t, s, lat);
    const q = trackPoint(t, s, lat + o);
    const nx = q.x - p.x;
    const ny = q.y - p.y;
    // Von der Strecke aus (Blick nach außen) liegt A links
    const rx = -ny;
    const ry = nx;
    planes.push({ ax: p.x - (rx * len) / 2, ay: p.y - (ry * len) / 2, bx: p.x + (rx * len) / 2, by: p.y + (ry * len) / 2, h, img, slices });
  };
  const so = outside(70);
  wall(70, so * (HALF + 30), 104, 26, 'stand', 12);
  let n = 0;
  for (let s = 140; s < t.len - 40; s += 15) {
    if (Math.abs(curveAhead(t, s - 10, 30)) > 1 / 260) continue;
    const o = outside(s);
    const lat = o * (HALF + 15);
    const a = trackPoint(t, s - 6, lat);
    const b = trackPoint(t, s + 6, lat);
    if (!clear(a.x, a.y, HALF + 9) || !clear(b.x, b.y, HALF + 9)) continue;
    wall(s, lat, 12.5, 3.2, (['board0', 'board1', 'board2'] as const)[n++ % 3], 2);
  }

  sprites = {
    trees: [0, 1, 2, 3].map(treeSprite),
    signs: { '1': signSprite(1), '-1': signSprite(-1) },
    tufts: [0, 1, 2, 3].map(tuftSprite),
    tires: tiresSprite(),
    balloons: ['#ff4f81', '#ff8fbf', '#e8104f', '#b47bff'].map(balloonSprite),
    flags: ['#ff4f81', '#7a5cff', '#ffb100'].map((c) => [flagSprite(c, 0), flagSprite(c, 1)]),
    boards: [0, 1, 2].map(boardSprite),
    boardBack: boardBack(),
    stand: [standSprite(0), standSprite(1)],
    box: Array.from({ length: BOX_LAYERS }, (_, i) => boxLayer(i, BOX_LAYERS)),
    banana: bananaSprite(),
    arrow: arrowSprite(),
    banner: bannerSprite(),
    karts: new Map(),
    props,
    planes,
    arch: { l: trackPoint(t, 0, -(HALF + 9)), r: trackPoint(t, 0, HALF + 9) },
  };
  return sprites;
}

function kartModel(color: string, emoji: string) {
  const S = sprites!;
  const key = color + emoji;
  let m = S.karts.get(key);
  if (!m) {
    m = kartLayers(color, emoji);
    S.karts.set(key, m);
  }
  return m;
}

/** Bäume, Boxen und Kulisse vorab bauen (dauert beim ersten Mal einen Moment). */
export function prepareGfx(t: Track) {
  // Spuren vom letzten Rennen wegräumen
  if (worldCache?.marked && worldCache.t === t) {
    worldCache.world = drawWorld(t);
    worldCache.marked = false;
    softTex = undefined;
    marks.length = 0;
  }
  worldAssets(t);
  getSprites(t);
}

// ───────────────────────── Partikel ─────────────────────────

export interface Particle {
  x: number;
  y: number;
  h: number;
  vx: number;
  vy: number;
  vh: number;
  life: number;
  max: number;
  size: number;
  color: string;
  kind: 'spark' | 'smoke' | 'dust' | 'star' | 'confetti' | 'flame';
}

export function stepParticles(ps: Particle[], dt: number) {
  for (const p of ps) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.h += p.vh * dt;
    if (p.kind === 'dust' || p.kind === 'confetti' || p.kind === 'spark') p.vh -= 60 * dt;
    if (p.kind === 'smoke') p.size += 10 * dt;
    if (p.h < 0) {
      p.h = 0;
      p.vh = Math.abs(p.vh) * 0.3;
    }
  }
  let w = 0;
  for (const p of ps) if (p.life > 0) ps[w++] = p;
  ps.length = Math.min(w, 420);
}

// ───────────────────────── Szene ─────────────────────────

export interface DrawKart {
  x: number;
  y: number;
  a: number;
  /** Zusätzliche Drehung fürs Auge (Drift, Dreher) */
  yaw: number;
  /** Hüpfen auf der Wiese */
  bob: number;
  /** Neigung in der Kurve: so weit (Anteil der Höhe) kippt das Kart oben zur Seite */
  roll: number;
  color: string;
  emoji: string;
  own: boolean;
}

export interface Scene {
  karts: DrawKart[];
  haz: Hazard[];
  boxes: number[];
  parts: Particle[];
  time: number;
  /** Tempo-Streifen am Rand (0–1), z. B. beim Turbo */
  streaks?: number;
  mood: Mood;
}

interface OverlayCache {
  W: number;
  H: number;
  mood: Mood;
  hills: { far: HTMLCanvasElement; near: HTMLCanvasElement };
  clouds: HTMLCanvasElement;
  vignette: HTMLCanvasElement;
  map: HTMLCanvasElement;
  ms: number;
}
const overlayCache = new WeakMap<HTMLCanvasElement, OverlayCache>();

export function drawOverlay(cv: HTMLCanvasElement, t: Track, cam: Cam, scene: Scene) {
  const ctx = cv.getContext('2d')!;
  const W = cv.width;
  const H = cv.height;
  const S = getSprites(t);
  const pal = PALETTES[scene.mood];
  let oc = overlayCache.get(cv);
  if (!oc || oc.W !== W || oc.H !== H || oc.mood !== scene.mood) {
    const ms = Math.round(Math.min(W * 0.2, H * HORIZON * 0.78));
    oc = { W, H, mood: scene.mood, hills: hillsSprite(W, H, pal), clouds: cloudsSprite(W, H, pal), vignette: vignetteSprite(W, H, pal.vignette), map: mapSprite(t, ms), ms };
    overlayCache.set(cv, oc);
  }
  const p = projection(W, H, cam);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);

  // Wolken, Sonne, Berge, Hügel
  const hw = oc.hills.far.width;
  const layerAt = (img: HTMLCanvasElement, speed: number, drift = 0, y = p.hz + 1 - img.height) => {
    let ox = ((((-cam.a / (Math.PI * 2)) * hw * speed - drift) % hw) + hw) % hw;
    ox -= hw;
    for (; ox < W; ox += hw) ctx.drawImage(img, Math.round(ox), Math.round(y));
  };
  layerAt(oc.clouds, 0.7, scene.time * W * 0.006, p.hz * 0.04);
  const sunRel = wrapAngle(SUN_AZ - cam.a);
  const sunSeen = Math.cos(sunRel) > 0.15;
  const sunX = W / 2 + Math.tan(sunRel) * p.f;
  const sunY = p.hz * pal.sunY;
  if (sunSeen) {
    const r = W * (scene.mood === 'abend' ? 0.06 : 0.045);
    const glow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, r * 5);
    glow.addColorStop(0, css(pal.sun, 0.95));
    glow.addColorStop(0.2, css(pal.sun, 0.55));
    glow.addColorStop(1, css(pal.skyBot, 0));
    ctx.fillStyle = glow;
    ctx.fillRect(sunX - r * 5, sunY - r * 5, r * 10, r * 10);
    ctx.fillStyle = scene.mood === 'abend' ? '#ffd9a0' : '#fffef4';
    ctx.beginPath();
    ctx.arc(sunX, sunY, r, 0, Math.PI * 2);
    ctx.fill();
  }
  layerAt(oc.hills.far, 1);
  layerAt(oc.hills.near, 2);
  const haze = ctx.createLinearGradient(0, p.hz - H * 0.05, 0, p.hz + 2);
  haze.addColorStop(0, css(pal.fog, 0));
  haze.addColorStop(1, css(pal.fog, 0.75));
  ctx.fillStyle = haze;
  ctx.fillRect(0, p.hz - H * 0.05, W, H * 0.05 + 2);

  // Alles Aufrechte, von hinten nach vorne
  const list: { z: number; draw: () => void }[] = [];
  const fogAt = (z: number) => Math.min(0.85, Math.max(0, (z - 260) / 1300));
  const billboard = (img: HTMLCanvasElement, x: number, y: number, ww: number, hh: number, lift = 0, maxZ = 1500) => {
    const q = project(p, x, y, lift);
    if (!q || q.z > maxZ) return;
    const w = ww * q.sc;
    if (q.sx + w < 0 || q.sx - w > W) return;
    const h = hh * q.sc;
    list.push({
      z: q.z,
      draw: () => {
        ctx.globalAlpha = 1 - fogAt(q.z);
        ctx.drawImage(img, q.sx - w / 2, q.sy - h, w, h);
        ctx.globalAlpha = 1;
      },
    });
  };

  const wave = Math.floor(scene.time * 4) % 2;
  for (const pr of S.props) {
    if (pr.kind === 'tree') {
      const big = pr.k === 3 ? [20, 25] : [34, 42];
      billboard(S.trees[pr.k], pr.x, pr.y, big[0], big[1]);
    } else if (pr.kind === 'tuft') billboard(S.tufts[pr.k], pr.x, pr.y, 5, 5, 0, 300);
    else if (pr.kind === 'tires') billboard(S.tires, pr.x, pr.y, 7, 7.7, 0, 700);
    else if (pr.kind === 'flag') billboard(S.flags[pr.k][(wave + pr.k) % 2], pr.x, pr.y, 7, 17, 0, 900);
    else if (pr.kind === 'balloon') billboard(S.balloons[pr.k], pr.x, pr.y, 12, 20, (pr.h ?? 40) + Math.sin(scene.time * 1.3 + pr.x) * 2.5, 1600);
    else billboard(S.signs[String(pr.k)], pr.x, pr.y, 15, 15, 0, 900);
  }

  // Banden und Tribüne: fest in der Welt, in Streifen gemalt, damit die Perspektive stimmt
  const cheer = Math.floor(scene.time * 3) % 2;
  for (const pl of S.planes) {
    const img = pl.img === 'stand' ? S.stand[cheer] : S.boards[Number(pl.img.slice(5))];
    const n = pl.slices;
    for (let i = 0; i < n; i++) {
      const u0 = i / n;
      const u1 = (i + 1) / n;
      const x0 = pl.ax + (pl.bx - pl.ax) * u0;
      const y0 = pl.ay + (pl.by - pl.ay) * u0;
      const x1 = pl.ax + (pl.bx - pl.ax) * u1;
      const y1 = pl.ay + (pl.by - pl.ay) * u1;
      const b0 = project(p, x0, y0);
      const b1 = project(p, x1, y1);
      if (!b0 || !b1 || Math.min(b0.z, b1.z) > 1300) continue;
      if (Math.max(b0.sx, b1.sx) < 0 || Math.min(b0.sx, b1.sx) > W) continue;
      const t0y = b0.sy - pl.h * b0.sc;
      const t1y = b1.sy - pl.h * b1.sc;
      const front = (b1.sx - b0.sx) * (b0.sy - t0y) > 0;
      const src = front || pl.img === 'stand' ? img : S.boardBack;
      const sw = src.width * (u1 - u0);
      const z = (b0.z + b1.z) / 2;
      list.push({
        z,
        draw: () => {
          ctx.globalAlpha = 1 - fogAt(z);
          ctx.setTransform((b1.sx - b0.sx) / sw, (t1y - t0y) / sw, 0, (b0.sy - t0y) / src.height, b0.sx, t0y);
          ctx.drawImage(src, src.width * u0, 0, Math.min(sw + 1, src.width * (1 - u0)), src.height, 0, 0, Math.min(sw + 1, src.width * (1 - u0)), src.height);
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalAlpha = 1;
        },
      });
    }
  }

  // Zielbogen
  {
    const l = project(p, S.arch.l.x, S.arch.l.y);
    const r = project(p, S.arch.r.x, S.arch.r.y);
    if (l && r && l.z < 1200) {
      const POST = 30;
      const BAN = 8;
      list.push({
        z: (l.z + r.z) / 2,
        draw: () => {
          ctx.globalAlpha = 1 - fogAt((l.z + r.z) / 2);
          for (const q of [l, r]) {
            ctx.fillStyle = '#e9e4ef';
            ctx.fillRect(q.sx - 1.6 * q.sc, q.sy - POST * q.sc, 3.2 * q.sc, POST * q.sc);
            ctx.fillStyle = '#ff4f81';
            ctx.fillRect(q.sx - 1.6 * q.sc, q.sy - 6 * q.sc, 3.2 * q.sc, 6 * q.sc);
          }
          const lt = { x: l.sx, y: l.sy - POST * l.sc };
          const rt = { x: r.sx, y: r.sy - POST * r.sc };
          const bw = S.banner.width;
          const bh = S.banner.height;
          const hL = BAN * l.sc;
          ctx.setTransform((rt.x - lt.x) / bw, (rt.y - lt.y) / bw, 0, hL / bh, lt.x, lt.y);
          ctx.drawImage(S.banner, 0, 0);
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.globalAlpha = 1;
        },
      });
    }
  }

  // Item-Boxen: drehende Würfel aus Schichten
  t.boxes.forEach((b, i) => {
    if (scene.boxes[i] > 0) return;
    const bob = 4 + Math.sin(scene.time * 3 + i) * 1.4;
    const q = project(p, b.x, b.y, bob);
    if (!q || q.z > 1100) return;
    const rot = scene.time * 1.6 + i;
    const squash = Math.min(1, p.camH / q.z);
    const size = BOX_SIZE * q.sc;
    list.push({
      z: q.z,
      draw: () => {
        ctx.globalAlpha = 1 - fogAt(q.z);
        S.box.forEach((img, li) => {
          ctx.setTransform(1, 0, 0, 1, q.sx, q.sy - li * (BOX_SIZE / BOX_LAYERS) * q.sc);
          ctx.scale(1, squash);
          ctx.rotate(rot);
          ctx.drawImage(img, -size / 2, -size / 2, size, size);
        });
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
      },
    });
  });

  for (const h of scene.haz) {
    if (h.k === 'banane') billboard(S.banana, h.x, h.y, 10, 8.5);
    else billboard(S.arrow, h.x, h.y, 13, 11, 6);
  }

  // Karts: 3D aus Schichten
  for (const k of scene.karts) {
    const q = project(p, k.x, k.y, k.bob);
    if (!q || q.z > 1500) continue;
    const layers = kartModel(k.color, k.emoji);
    const rel = wrapAngle(k.a + k.yaw - cam.a);
    const squash = Math.min(1, p.camH / q.z);
    const lw = KART_W * q.sc;
    const ll = KART_L * q.sc;
    if (q.sx + ll < 0 || q.sx - ll > W) continue;
    list.push({
      z: q.z - 0.5,
      draw: () => {
        ctx.globalAlpha = 1 - fogAt(q.z);
        const g = project(p, k.x, k.y);
        if (g) {
          ctx.setTransform(1, 0, 0, 1, g.sx, g.sy);
          ctx.scale(1, squash);
          ctx.rotate(rel);
          ctx.fillStyle = 'rgba(15,5,25,0.24)';
          ctx.beginPath();
          ctx.ellipse(0, 0, lw * 0.52, ll * 0.47, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        // Nah an der Kamera klaffen die Schichten auseinander – dann Zwischenschichten einschieben.
        const gap = LAYER_H * q.sc;
        const steps = Math.max(1, Math.min(4, Math.ceil(gap / 3)));
        const last = layers.length - 1;
        const rollX = Math.cos(rel) * k.roll;
        const rollY = Math.sin(rel) * squash * k.roll;
        layers.forEach((img, i) => {
          for (let j = 0; j < (i === last ? 1 : steps); j++) {
            const up = (i + j / steps) * gap;
            ctx.setTransform(1, 0, 0, 1, q.sx + rollX * up, q.sy - up + rollY * up);
            ctx.scale(1, squash);
            ctx.rotate(rel);
            ctx.drawImage(img, -lw / 2, -ll / 2, lw, ll);
          }
        });
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = 1;
      },
    });
  }

  // Partikel
  for (const pt of scene.parts) {
    const q = project(p, pt.x, pt.y, pt.h);
    if (!q || q.z > 900) continue;
    const r = Math.max(0.6, pt.size * q.sc);
    const fade = Math.min(1, pt.life / (pt.max * 0.5));
    list.push({
      z: q.z - 1,
      draw: () => {
        ctx.globalAlpha = fade * (pt.kind === 'smoke' ? 0.38 : pt.kind === 'dust' ? 0.8 : 1);
        if (pt.kind === 'star') {
          ctx.fillStyle = pt.color;
          ctx.font = `${Math.round(r * 2.4)}px serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('★', q.sx, q.sy);
        } else if (pt.kind === 'confetti') {
          ctx.fillStyle = pt.color;
          ctx.fillRect(q.sx - r, q.sy - r * 0.5, r * 2, r);
        } else {
          const glow = pt.kind === 'spark' || pt.kind === 'flame';
          if (glow) ctx.globalCompositeOperation = 'lighter';
          const d = r * (glow ? 3 : 2.4);
          ctx.drawImage(softDot(pt.color), q.sx - d / 2, q.sy - d / 2, d, d);
          if (glow) ctx.globalCompositeOperation = 'source-over';
        }
        ctx.globalAlpha = 1;
      },
    });
  }

  list.sort((a, b) => b.z - a.z);
  for (const o of list) o.draw();

  // Abendlicht über allem
  if (pal.wash) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = pal.wash;
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }

  // Blendenflecken, wenn man in die Sonne fährt
  if (sunSeen && sunX > -W * 0.1 && sunX < W * 1.1) {
    const cx = W / 2;
    const cy = H * 0.5;
    const strength = 1 - Math.min(1, Math.abs(sunX - cx) / (W * 0.7));
    ctx.globalCompositeOperation = 'lighter';
    for (const [f, r, a] of [
      [0.35, 0.025, 0.25],
      [0.7, 0.05, 0.12],
      [1.1, 0.018, 0.3],
      [1.45, 0.08, 0.08],
    ]) {
      const fx = sunX + (cx - sunX) * f * 2;
      const fy = sunY + (cy - sunY) * f * 2;
      ctx.fillStyle = css(pal.sun, a * strength);
      ctx.beginPath();
      ctx.arc(fx, fy, W * r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // Tempo-Streifen
  const st = scene.streaks ?? 0;
  if (st > 0) {
    ctx.strokeStyle = `rgba(255,255,255,${0.5 * st})`;
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1, W * 0.004);
    for (let i = 0; i < 9; i++) {
      const side = i % 2 ? 1 : -1;
      const y0 = p.hz + H * 0.08 + Math.random() * (H - p.hz - H * 0.1);
      const x0 = W / 2 + side * (W * 0.3 + Math.random() * W * 0.18);
      const len = W * (0.05 + Math.random() * 0.06);
      const dx = x0 - W / 2;
      const dy = y0 - p.hz;
      const n = Math.hypot(dx, dy);
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + (dx / n) * len, y0 + (dy / n) * len);
      ctx.stroke();
    }
  }

  ctx.drawImage(oc.vignette, 0, 0);

  // Minikarte
  const ms = oc.ms;
  const mx = Math.round((W - ms) / 2);
  const my = Math.round(Math.max(H * 0.012, p.hz - ms - H * 0.02));
  ctx.drawImage(oc.map, mx, my);
  for (const k of [...scene.karts].sort((a, b) => Number(a.own) - Number(b.own))) {
    const x = mx + (k.x / WORLD) * ms;
    const y = my + (k.y / WORLD) * ms;
    const r = ms * (k.own ? 0.06 : 0.048);
    ctx.fillStyle = '#1b1022';
    ctx.beginPath();
    ctx.arc(x, y, r + ms * 0.018, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = k.color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}
