import { ARENA, BODY_H, EYE, HALF, HOME, SPAWNS, TARGET_W, TARGET_Y0, TARGET_Y1, WALL_H, dir3, inPoly, nearestEdge, segWorld, type Block, type Fighter, type Target, type V2, type V3 } from './strike';

/**
 * Herz-Strike in 3D: ein kleiner WebGL-Renderer nur für dieses Spiel.
 * Alles teilt sich ein Shader-Programm: Licht von Sonne und Himmel, Glanz, Randlicht, Nebel.
 * Die Schatten der Arena werden beim Start einmal in die Ecken (Vertex-Alpha) eingebacken.
 */

export type RGB = [number, number, number];
type RGBA = [number, number, number, number];

export const hexRgb = (hex: string): RGB => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const mixc = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mulc = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];
const rgba = (c: RGB, a = 1): RGBA => [c[0], c[1], c[2], a];

/** Farben der Luftkissen */
const BUNKER: RGB[] = ['#ff8fb8', '#8fd3ff', '#ffd36e', '#b9a2ff', '#7fe0b5', '#ff5c8f'].map(hexRgb);
const SUN: V3 = (() => {
  const v: V3 = [-0.52, 0.72, -0.46];
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
})();
const FOG: RGB = hexRgb('#ffd9c4');

// ───────────── Matrizen (spaltenweise wie in WebGL) ─────────────

type M4 = Float32Array<ArrayBuffer>;
const m4 = () => {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
};

function mul(a: M4, b: M4, out: M4 = new Float32Array(16)): M4 {
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

function perspective(fovy: number, aspect: number, near: number, far: number): M4 {
  const f = 1 / Math.tan(fovy / 2);
  const nf = 1 / (near - far);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) * nf;
  m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}

/** Blickmatrix und ihre Umkehrung (Kamera → Welt) */
function lookDir(eye: V3, d: V3): { view: M4; world: M4; right: V3; up: V3 } {
  let z0 = -d[0];
  let z1 = -d[1];
  let z2 = -d[2];
  let l = 1 / Math.hypot(z0, z1, z2);
  z0 *= l;
  z1 *= l;
  z2 *= l;
  let x0 = z2;
  let x1 = 0;
  let x2 = -z0;
  l = Math.hypot(x0, x1, x2) || 1;
  x0 /= l;
  x1 /= l;
  x2 /= l;
  const y0 = z1 * x2 - z2 * x1;
  const y1 = z2 * x0 - z0 * x2;
  const y2 = z0 * x1 - z1 * x0;
  const view = new Float32Array([
    x0, y0, z0, 0,
    x1, y1, z1, 0,
    x2, y2, z2, 0,
    -(x0 * eye[0] + x1 * eye[1] + x2 * eye[2]),
    -(y0 * eye[0] + y1 * eye[1] + y2 * eye[2]),
    -(z0 * eye[0] + z1 * eye[1] + z2 * eye[2]),
    1,
  ]);
  const world = new Float32Array([x0, x1, x2, 0, y0, y1, y2, 0, z0, z1, z2, 0, eye[0], eye[1], eye[2], 1]);
  return { view, world, right: [x0, x1, x2], up: [y0, y1, y2] };
}

/** Verschieben · um y drehen · um x drehen · skalieren */
function trs(x: number, y: number, z: number, ry = 0, rx = 0, s: number | V3 = 1): M4 {
  const [sx, sy, sz] = typeof s === 'number' ? [s, s, s] : s;
  const cy = Math.cos(ry);
  const sy_ = Math.sin(ry);
  const cx = Math.cos(rx);
  const sx_ = Math.sin(rx);
  // R = Ry · Rx
  return new Float32Array([
    cy * sx, 0, -sy_ * sx, 0,
    sy_ * sx_ * sy, cx * sy, cy * sx_ * sy, 0,
    sy_ * cx * sz, -sx_ * sz, cy * cx * sz, 0,
    x, y, z, 1,
  ]);
}

// ───────────── Netze bauen ─────────────

/** Je Ecke: Position, Normale, Farbe (RGBA), Texturkoordinate */
const STRIDE = 12;
const W_UV: V2 = [6 / 512, 6 / 512];

class MB {
  d: number[] = [];
  v(p: V3, n: V3, c: RGBA, uv: V2 = W_UV) {
    this.d.push(p[0], p[1], p[2], n[0], n[1], n[2], c[0], c[1], c[2], c[3], uv[0], uv[1]);
  }
  tri(a: V3, b: V3, c: V3, n: V3 | null, col: RGBA) {
    const nn = n ?? faceN(a, b, c);
    this.v(a, nn, col);
    this.v(b, nn, col);
    this.v(c, nn, col);
  }
  /** Viereck a-b-c-d (gegen den Uhrzeigersinn von vorn gesehen) */
  quad(a: V3, b: V3, c: V3, d: V3, n: V3 | null, col: RGBA | RGBA[], uv?: [V2, V2, V2, V2]) {
    const nn = n ?? faceN(a, b, c);
    const cs = Array.isArray(col[0]) ? (col as RGBA[]) : [col as RGBA, col as RGBA, col as RGBA, col as RGBA];
    const u = uv ?? [W_UV, W_UV, W_UV, W_UV];
    this.v(a, nn, cs[0], u[0]);
    this.v(b, nn, cs[1], u[1]);
    this.v(c, nn, cs[2], u[2]);
    this.v(a, nn, cs[0], u[0]);
    this.v(c, nn, cs[2], u[2]);
    this.v(d, nn, cs[3], u[3]);
  }
  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, col: RGBA, bottomDark = 1) {
    const x0 = cx - sx / 2;
    const x1 = cx + sx / 2;
    const y0 = cy - sy / 2;
    const y1 = cy + sy / 2;
    const z0 = cz - sz / 2;
    const z1 = cz + sz / 2;
    const dk: RGBA = [col[0] * bottomDark, col[1] * bottomDark, col[2] * bottomDark, col[3]];
    const side = [dk, dk, col, col];
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], side);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], side);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], side);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], side);
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], col);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0], dk);
  }
  sphere(cx: number, cy: number, cz: number, r: number | V3, col: RGBA, seg = 14, ring = 9) {
    const [rx, ry, rz] = typeof r === 'number' ? [r, r, r] : r;
    const pt = (i: number, j: number): [V3, V3] => {
      const th = (i / seg) * Math.PI * 2;
      const ph = (j / ring) * Math.PI;
      const n: V3 = [Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th)];
      const nl = Math.hypot(n[0] / rx, n[1] / ry, n[2] / rz) || 1;
      return [[cx + n[0] * rx, cy + n[1] * ry, cz + n[2] * rz], [n[0] / rx / nl, n[1] / ry / nl, n[2] / rz / nl]];
    };
    for (let j = 0; j < ring; j++) {
      for (let i = 0; i < seg; i++) {
        const [a, na] = pt(i, j);
        const [b, nb] = pt(i, j + 1);
        const [c, nc] = pt(i + 1, j + 1);
        const [d, nd] = pt(i + 1, j);
        this.v(a, na, col);
        this.v(c, nc, col);
        this.v(b, nb, col);
        this.v(a, na, col);
        this.v(d, nd, col);
        this.v(c, nc, col);
      }
    }
  }
  /** Zylinder zwischen zwei Punkten */
  tube(a: V3, b: V3, r0: number, r1: number, col: RGBA, seg = 10, caps = true) {
    const ax: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const len = Math.hypot(...ax) || 1;
    const w: V3 = [ax[0] / len, ax[1] / len, ax[2] / len];
    const tmp: V3 = Math.abs(w[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const u = norm(cross(w, tmp));
    const v = cross(w, u);
    const ring = (c: V3, r: number, i: number): [V3, V3] => {
      const t = (i / seg) * Math.PI * 2;
      const n: V3 = [u[0] * Math.cos(t) + v[0] * Math.sin(t), u[1] * Math.cos(t) + v[1] * Math.sin(t), u[2] * Math.cos(t) + v[2] * Math.sin(t)];
      return [[c[0] + n[0] * r, c[1] + n[1] * r, c[2] + n[2] * r], n];
    };
    for (let i = 0; i < seg; i++) {
      const [p0, n0] = ring(a, r0, i);
      const [p1, n1] = ring(a, r0, i + 1);
      const [q0] = ring(b, r1, i);
      const [q1] = ring(b, r1, i + 1);
      this.v(p0, n0, col);
      this.v(q1, n1, col);
      this.v(q0, n0, col);
      this.v(p0, n0, col);
      this.v(p1, n1, col);
      this.v(q1, n1, col);
      if (caps) {
        this.v(b, w, col);
        this.v(q0, w, col);
        this.v(q1, w, col);
        const nw: V3 = [-w[0], -w[1], -w[2]];
        this.v(a, nw, col);
        this.v(p1, nw, col);
        this.v(p0, nw, col);
      }
    }
  }
  /** Flache Herzscheibe in der x-y-Ebene, zeigt nach +z */
  heart(cx: number, cy: number, cz: number, s: number, depth: number, col: RGBA, ry = 0) {
    const pts: V2[] = [];
    for (let i = 0; i < 28; i++) {
      const t = (i / 28) * Math.PI * 2;
      pts.push([(16 * Math.sin(t) ** 3 * s) / 17, ((13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t) + 2) * s) / 17]);
    }
    const c = Math.cos(ry);
    const sn = Math.sin(ry);
    const P = (x: number, y: number, z: number): V3 => [cx + x * c + z * sn, cy + y, cz - x * sn + z * c];
    const N = (x: number, y: number, z: number): V3 => [x * c + z * sn, y, -x * sn + z * c];
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % pts.length];
      this.tri(P(0, 0, depth / 2), P(x1, y1, depth / 2), P(x0, y0, depth / 2), N(0, 0, 1), col);
      this.tri(P(0, 0, -depth / 2), P(x0, y0, -depth / 2), P(x1, y1, -depth / 2), N(0, 0, -1), col);
      const en = norm([y1 - y0, -(x1 - x0), 0]);
      this.quad(P(x0, y0, -depth / 2), P(x1, y1, -depth / 2), P(x1, y1, depth / 2), P(x0, y0, depth / 2), N(-en[0], -en[1], 0), col);
    }
  }
}

const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const faceN = (a: V3, b: V3, c: V3) => norm(cross([b[0] - a[0], b[1] - a[1], b[2] - a[2]], [c[0] - a[0], c[1] - a[1], c[2] - a[2]]));

// ───────────── Textur-Atlas ─────────────

const ATLAS = 512;
export const UV = {
  splat: (k: number): [number, number, number, number] => [(k * 128) / ATLAS, 128 / ATLAS, ((k + 1) * 128) / ATLAS, 256 / ATLAS],
  shadow: [0, 256 / ATLAS, 128 / ATLAS, 384 / ATLAS] as [number, number, number, number],
  dot: [128 / ATLAS, 256 / ATLAS, 192 / ATLAS, 320 / ATLAS] as [number, number, number, number],
  heart: [192 / ATLAS, 256 / ATLAS, 256 / ATLAS, 320 / ATLAS] as [number, number, number, number],
  cloud: [256 / ATLAS, 256 / ATLAS, 384 / ATLAS, 384 / ATLAS] as [number, number, number, number],
  glow: [384 / ATLAS, 256 / ATLAS, 512 / ATLAS, 384 / ATLAS] as [number, number, number, number],
  banner: [0, 392 / ATLAS, 1, 504 / ATLAS] as [number, number, number, number],
  target: [128 / ATLAS, 0, 256 / ATLAS, 128 / ATLAS] as [number, number, number, number],
  gold: [256 / ATLAS, 0, 384 / ATLAS, 128 / ATLAS] as [number, number, number, number],
  ring: [192 / ATLAS, 320 / ATLAS, 256 / ATLAS, 384 / ATLAS] as [number, number, number, number],
};

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function heartShape(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath();
  g.moveTo(x, y + r * 0.9);
  g.bezierCurveTo(x - r * 1.5, y - r * 0.1, x - r * 0.8, y - r * 1.25, x, y - r * 0.45);
  g.bezierCurveTo(x + r * 0.8, y - r * 1.25, x + r * 1.5, y - r * 0.1, x, y + r * 0.9);
  g.closePath();
}

function makeAtlas(): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = cv.height = ATLAS;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 16, 16);
  // Farbkleckse
  for (let k = 0; k < 4; k++) {
    const rnd = seeded(17 + k * 31);
    const cx = k * 128 + 64;
    const cy = 192;
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(cx, cy, 30, 0, Math.PI * 2);
    g.fill();
    for (let i = 0; i < 11; i++) {
      const a = rnd() * Math.PI * 2;
      const d = 18 + rnd() * 18;
      g.beginPath();
      g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 8 + rnd() * 12, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 9; i++) {
      const a = rnd() * Math.PI * 2;
      const d = 40 + rnd() * 18;
      g.beginPath();
      g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 2 + rnd() * 4, 0, Math.PI * 2);
      g.fill();
    }
    // Tropfnasen nach unten
    for (let i = 0; i < 2; i++) {
      const x = cx - 18 + rnd() * 36;
      const len = 20 + rnd() * 18;
      g.fillRect(x - 3, cy + 10, 6, len + 10);
      g.beginPath();
      g.arc(x, cy + 20 + len, 5, 0, Math.PI * 2);
      g.fill();
    }
  }
  // weicher Schatten
  let rg = g.createRadialGradient(64, 320, 0, 64, 320, 62);
  rg.addColorStop(0, 'rgba(0,0,0,0.75)');
  rg.addColorStop(0.55, 'rgba(0,0,0,0.4)');
  rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rg;
  g.fillRect(0, 256, 128, 128);
  // Punkt
  rg = g.createRadialGradient(160, 288, 0, 160, 288, 30);
  rg.addColorStop(0, 'rgba(255,255,255,1)');
  rg.addColorStop(0.6, 'rgba(255,255,255,0.95)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg;
  g.fillRect(128, 256, 64, 64);
  // Herz
  g.fillStyle = '#fff';
  heartShape(g, 224, 290, 22);
  g.fill();
  // Ring (Schild)
  g.strokeStyle = '#fff';
  g.lineWidth = 5;
  g.beginPath();
  g.arc(224, 352, 25, 0, Math.PI * 2);
  g.stroke();
  // Wolke
  const rc = seeded(5);
  for (let i = 0; i < 16; i++) {
    const x = 270 + 12 + rc() * 76;
    const y = 300 + 20 + Math.sin(((x - 270) / 100) * Math.PI) * -24 + rc() * 14;
    const r = 12 + rc() * 16;
    rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, 'rgba(255,255,255,0.95)');
    rg.addColorStop(0.7, 'rgba(255,255,255,0.75)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // Sonnenschein
  rg = g.createRadialGradient(448, 320, 0, 448, 320, 63);
  rg.addColorStop(0, 'rgba(255,255,255,1)');
  rg.addColorStop(0.18, 'rgba(255,255,255,0.95)');
  rg.addColorStop(0.3, 'rgba(255,255,255,0.35)');
  rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg;
  g.fillRect(384, 256, 128, 128);
  // Banner „ARTA ARENA“
  const bg = g.createLinearGradient(0, 392, 0, 504);
  bg.addColorStop(0, '#ff5d97');
  bg.addColorStop(1, '#d63a78');
  g.fillStyle = bg;
  g.fillRect(0, 392, 512, 112);
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.fillRect(0, 398, 512, 4);
  g.fillRect(0, 494, 512, 4);
  g.font = '900 64px system-ui, -apple-system, "Segoe UI", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = '#fff';
  g.fillText('ARTA ARENA', 256, 450);
  g.fillStyle = '#ffe2ec';
  heartShape(g, 30, 450, 16);
  g.fill();
  heartShape(g, 482, 450, 16);
  g.fill();
  // Pappziele: normal und golden
  for (const [ox, gold] of [
    [128, false],
    [256, true],
  ] as const) {
    g.fillStyle = gold ? '#ffd45c' : '#e9c79a';
    g.fillRect(ox, 0, 128, 128);
    g.strokeStyle = gold ? '#c99510' : '#b98a57';
    g.lineWidth = 6;
    g.strokeRect(ox + 3, 3, 122, 122);
    const rings = gold ? ['#fff3c4', '#ff9d00', '#fff3c4', '#ff5d00'] : ['#fff', '#ff4f8b', '#fff', '#e0245e'];
    rings.forEach((c, i) => {
      g.fillStyle = c;
      heartShape(g, ox + 64, 70, 50 - i * 12);
      g.fill();
    });
  }
  return cv;
}

// ───────────── Shader ─────────────

const VS = `
attribute vec3 aP; attribute vec3 aN; attribute vec4 aC; attribute vec2 aT;
uniform mat4 uVP; uniform mat4 uM;
varying vec3 vN; varying vec4 vC; varying vec2 vT; varying vec3 vW;
void main() {
  vec4 w = uM * vec4(aP, 1.0);
  vW = w.xyz; vN = (uM * vec4(aN, 0.0)).xyz; vC = aC; vT = aT;
  gl_Position = uVP * w;
}`;

const FS = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uTex; uniform vec3 uSun; uniform vec3 uEye; uniform vec3 uFog; uniform vec2 uFogR;
uniform vec4 uTint; uniform float uMode; uniform float uGloss;
varying vec3 vN; varying vec4 vC; varying vec2 vT; varying vec3 vW;
void main() {
  vec4 c = vC * texture2D(uTex, vT) * uTint;
  float sunVis = 1.0;
  if (uMode > 1.5) { sunVis = vC.a; c.a = uTint.a; }
  if (c.a < 0.01) discard;
  vec3 col = c.rgb;
  if (uMode > 0.5 && dot(vN, vN) > 0.01) {
    vec3 n = normalize(vN);
    vec3 v = normalize(uEye - vW);
    float d = max(dot(n, uSun), 0.0) * sunVis;
    vec3 amb = mix(vec3(0.42, 0.36, 0.30), vec3(0.62, 0.70, 0.92), n.y * 0.5 + 0.5);
    col = c.rgb * (amb * 0.78 + vec3(1.0, 0.9, 0.76) * d * 0.72);
    vec3 h = normalize(uSun + v);
    col += vec3(1.0, 0.95, 0.85) * pow(max(dot(n, h), 0.0), 28.0) * uGloss * sunVis;
    col += c.rgb * pow(1.0 - max(dot(n, v), 0.0), 3.0) * 0.28;
  }
  float f = smoothstep(uFogR.x, uFogR.y, length(vW - uEye));
  gl_FragColor = vec4(mix(col, uFog, f), c.a);
}`;

// ───────────── Arena-Netz ─────────────

/** Sieht dieser Punkt die Sonne? */
function sunVis(p: V3, n: V3): number {
  const a: V3 = [p[0] + n[0] * 0.06 + SUN[0] * 0.02, p[1] + n[1] * 0.06 + 0.02, p[2] + n[2] * 0.06 + SUN[2] * 0.02];
  const b: V3 = [a[0] + SUN[0] * 40, a[1] + SUN[1] * 40, a[2] + SUN[2] * 40];
  const h = segWorld(a, b);
  return h && h.b !== -1 ? 0 : 1;
}

/** Wie nah ist eine Wand/Deckung? (für weiche Ecken am Boden) */
function floorAo(x: number, z: number) {
  let d = Math.min(HALF - Math.abs(x), HALF - Math.abs(z)) * 1.4;
  for (const b of ARENA) {
    if (Math.abs(x - b.cx) > 4 || Math.abs(z - b.cz) > 4) continue;
    d = Math.min(d, inPoly(x, z, b.pts) ? 0 : Math.sqrt(nearestEdge(x, z, b.pts).d2));
  }
  return 1 - 0.42 * Math.max(0, 1 - d / 1.1) ** 1.5;
}

/** Senkrechtes Luftkissen mit gepolstertem Rand und Streifen */
function bunker(mb: MB, b: Block) {
  const base = BUNKER[b.color];
  const stripe: RGB = mixc(base, [1, 1, 1], 0.78);
  const pts = b.pts;
  const n = pts.length;
  const smooth = b.kind !== 'tower';
  const bev = Math.min(0.2, b.h * 0.12);
  // Kanten-Normalen
  const en: V2[] = pts.map((p, i) => {
    const q = pts[(i + 1) % n];
    const l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
    return [(q[1] - p[1]) / l, -(q[0] - p[0]) / l];
  });
  const vn = (i: number): V2 => {
    const a = en[(i - 1 + n) % n];
    const c = en[i];
    const x = a[0] + c[0];
    const z = a[1] + c[1];
    const l = Math.hypot(x, z) || 1;
    return [x / l, z / l];
  };
  // Höhenbänder: [y0, y1, Farbe unten, Farbe oben]
  const mid = b.h * 0.56;
  const bands: [number, number, RGB, RGB][] = [
    [0, 0.25, mulc(base, 0.72), base],
    [0.25, mid - 0.1, base, base],
    [mid - 0.1, mid + 0.1, stripe, stripe],
    [mid + 0.1, b.h - bev, base, base],
  ];
  const vis = (p: V3, nn: V3) => sunVis(p, nn);
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    const np: V2 = smooth ? vn(i) : en[i];
    const nq: V2 = smooth ? vn((i + 1) % n) : en[i];
    for (const [y0, y1, c0, c1] of bands) {
      const P0: V3 = [p[0], y0, p[1]];
      const Q0: V3 = [q[0], y0, q[1]];
      const Q1: V3 = [q[0], y1, q[1]];
      const P1: V3 = [p[0], y1, p[1]];
      const NP: V3 = [np[0], 0, np[1]];
      const NQ: V3 = [nq[0], 0, nq[1]];
      mb.v(P0, NP, rgba(c0, vis(P0, NP)));
      mb.v(Q0, NQ, rgba(c0, vis(Q0, NQ)));
      mb.v(Q1, NQ, rgba(c1, vis(Q1, NQ)));
      mb.v(P0, NP, rgba(c0, vis(P0, NP)));
      mb.v(Q1, NQ, rgba(c1, vis(Q1, NQ)));
      mb.v(P1, NP, rgba(c1, vis(P1, NP)));
    }
    // Polsterkante: zwei Ringe nach innen
    const ring = (k: number, ii: number, nv: V2): [V3, V3] => {
      const a = (k * Math.PI) / 2;
      const inset = bev * (1 - Math.cos(a));
      const y = b.h - bev + Math.sin(a) * bev;
      const pp = pts[ii];
      const nrm = norm([nv[0] * Math.cos(a), Math.sin(a), nv[1] * Math.cos(a)]);
      return [[pp[0] - (smooth ? vn(ii)[0] : nv[0]) * inset, y, pp[1] - (smooth ? vn(ii)[1] : nv[1]) * inset], nrm];
    };
    const ip = i;
    const iq = (i + 1) % n;
    for (let k = 0; k < 2; k++) {
      const [a0, an0] = ring(k, ip, np);
      const [b0, bn0] = ring(k, iq, nq);
      const [b1, bn1] = ring(k + 1, iq, nq);
      const [a1, an1] = ring(k + 1, ip, np);
      mb.v(a0, an0, rgba(base, vis(a0, an0)));
      mb.v(b0, bn0, rgba(base, vis(b0, bn0)));
      mb.v(b1, bn1, rgba(base, vis(b1, bn1)));
      mb.v(a0, an0, rgba(base, vis(a0, an0)));
      mb.v(b1, bn1, rgba(base, vis(b1, bn1)));
      mb.v(a1, an1, rgba(base, vis(a1, an1)));
    }
    // Deckel als Fächer
    const [ta] = ring(2, ip, np);
    const [tb] = ring(2, iq, nq);
    const C: V3 = [b.cx, b.h, b.cz];
    const top = rgba(mixc(base, [1, 1, 1], 0.08), 1);
    mb.v(C, [0, 1, 0], [top[0], top[1], top[2], vis(C, [0, 1, 0])]);
    mb.v(tb, [0, 1, 0], [top[0], top[1], top[2], vis(tb, [0, 1, 0])]);
    mb.v(ta, [0, 1, 0], [top[0], top[1], top[2], vis(ta, [0, 1, 0])]);
  }
}

function buildArena(): { mb: MB; banners: number } {
  const mb = new MB();
  // Boden: Kunstrasen mit Mähstreifen, Schatten und weichen Ecken eingebacken
  const S = 0.5;
  const N = Math.round((HALF * 2) / S);
  const grassA = hexRgb('#79cf6f');
  const grassB = hexRgb('#68c062');
  const vert: { c: RGBA }[] = [];
  const rnd = seeded(99);
  for (let j = 0; j <= N; j++) {
    for (let i = 0; i <= N; i++) {
      const x = -HALF + i * S;
      const z = -HALF + j * S;
      const stripe = Math.floor((x + HALF) / 2.125) % 2 === 0 ? grassA : grassB;
      const c = mulc(stripe, floorAo(x, z) * (0.96 + rnd() * 0.08));
      vert.push({ c: rgba(c, sunVis([x, 0, z], [0, 1, 0])) });
    }
  }
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x0 = -HALF + i * S;
      const z0 = -HALF + j * S;
      const a = vert[j * (N + 1) + i].c;
      const b = vert[j * (N + 1) + i + 1].c;
      const c = vert[(j + 1) * (N + 1) + i + 1].c;
      const d = vert[(j + 1) * (N + 1) + i].c;
      mb.quad([x0, 0, z0 + S], [x0 + S, 0, z0 + S], [x0 + S, 0, z0], [x0, 0, z0], [0, 1, 0], [d, c, b, a]);
    }
  }
  // Linien auf dem Rasen
  const line = (x0: number, z0: number, x1: number, z1: number, w = 0.09) => {
    const l = Math.hypot(x1 - x0, z1 - z0) || 1;
    const nx = (-(z1 - z0) / l) * w;
    const nz = ((x1 - x0) / l) * w;
    const y = 0.006;
    const pts: V3[] = [
      [x0 - nx, y, z0 - nz],
      [x0 + nx, y, z0 + nz],
      [x1 + nx, y, z1 + nz],
      [x1 - nx, y, z1 - nz],
    ];
    const cs = pts.map((p) => [0.97, 0.98, 0.95, sunVis(p, [0, 1, 0])] as RGBA);
    // Richtung so wählen, dass die Fläche nach oben zeigt
    const up = faceN(pts[0], pts[1], pts[2])[1] > 0;
    if (up) mb.quad(pts[0], pts[1], pts[2], pts[3], [0, 1, 0], cs);
    else mb.quad(pts[3], pts[2], pts[1], pts[0], [0, 1, 0], [cs[3], cs[2], cs[1], cs[0]]);
  };
  const L = HALF - 1.2;
  line(-L, 0, -2.4, 0);
  line(2.6, 0, L, 0);
  line(-L, -L, L, -L);
  line(L, -L, L, L);
  line(L, L, -L, L);
  line(-L, L, -L, -L);
  for (const side of ['p1', 'p2'] as const) {
    const [sx, sz] = SPAWNS[HOME[side]];
    const sg = Math.sign(sz);
    for (let k = 0; k < 16; k++) {
      const a0 = (k / 16) * Math.PI;
      const a1 = ((k + 1) / 16) * Math.PI;
      const r = 3.4;
      line(sx + Math.cos(a0) * r, sz - sg * Math.sin(a0) * r, sx + Math.cos(a1) * r, sz - sg * Math.sin(a1) * r);
    }
  }
  // Deckungen
  for (const b of ARENA) bunker(mb, b);
  // Außenwand: Holzpaneele, Pfosten, Abdeckung
  const panelA = hexRgb('#fff1e4');
  const panelB = hexRgb('#ffd3df');
  const post = hexRgb('#e8719a');
  for (let w = 0; w < 4; w++) {
    // w: 0 = Süden (z = -HALF), 1 = Osten, 2 = Norden, 3 = Westen; Normale nach innen
    const P = (u: number, y: number, inset = 0): V3 => {
      switch (w) {
        case 0:
          return [u, y, -HALF + inset];
        case 1:
          return [HALF - inset, y, u];
        case 2:
          return [-u, y, HALF - inset];
        default:
          return [-HALF + inset, y, -u];
      }
    };
    const nIn: V3 = [[0, 0, 1], [-1, 0, 0], [0, 0, -1], [1, 0, 0]][w] as V3;
    for (let u = -HALF; u < HALF - 0.01; u += 2.125) {
      const c = Math.round((u + HALF) / 2.125) % 2 ? panelA : panelB;
      const a = P(u, 0);
      const b = P(u + 2.125, 0);
      const cc = P(u + 2.125, WALL_H);
      const d = P(u, WALL_H);
      const col = (p: V3, base: RGB) => rgba(mulc(base, p[1] < 0.1 ? 0.75 : 1), sunVis(p, nIn));
      // Richtung: von innen gesehen gegen den Uhrzeigersinn
      mb.quad(b, a, d, cc, nIn, [col(b, c), col(a, c), col(d, c), col(cc, c)]);
      // Querlatten
      for (const y of [0.9, 2.1]) {
        const l0 = P(u, y - 0.07, 0.03);
        const l1 = P(u + 2.125, y - 0.07, 0.03);
        const l2 = P(u + 2.125, y + 0.07, 0.03);
        const l3 = P(u, y + 0.07, 0.03);
        const lc = mulc(c, 0.9);
        mb.quad(l1, l0, l3, l2, nIn, [rgba(lc, sunVis(l1, nIn)), rgba(lc, sunVis(l0, nIn)), rgba(lc, sunVis(l3, nIn)), rgba(lc, sunVis(l2, nIn))]);
      }
    }
    for (let u = -HALF; u <= HALF + 0.01; u += 4.25) {
      const p = P(u, WALL_H / 2, 0.1);
      const sx = w % 2 ? 0.2 : 0.26;
      const sz = w % 2 ? 0.26 : 0.2;
      mb.box(p[0], p[1], p[2], sx, WALL_H + 0.3, sz, rgba(post, 1), 0.75);
    }
    // Abdeckung oben
    const m0 = P(0, WALL_H + 0.08, 0.05);
    if (w % 2) mb.box(m0[0], m0[1], m0[2], 0.32, 0.16, HALF * 2 + 0.3, rgba(post, 1));
    else mb.box(m0[0], m0[1], m0[2], HALF * 2 + 0.3, 0.16, 0.32, rgba(post, 1));
  }
  // Banner in der Mitte jeder Wand
  const banners = mb.d.length / STRIDE;
  for (let w = 0; w < 4; w++) {
    const [u0, v0, u1, v1] = UV.banner;
    const P = (u: number, y: number): V3 => {
      const i = 0.04;
      switch (w) {
        case 0:
          return [u, y, -HALF + i];
        case 1:
          return [HALF - i, y, u];
        case 2:
          return [-u, y, HALF - i];
        default:
          return [-HALF + i, y, -u];
      }
    };
    const nIn: V3 = [[0, 0, 1], [-1, 0, 0], [0, 0, -1], [1, 0, 0]][w] as V3;
    const a = P(3.2, 1.25);
    const b = P(-3.2, 1.25);
    const c = P(-3.2, 2.35);
    const d = P(3.2, 2.35);
    const col = (p: V3) => [1, 1, 1, sunVis(p, nIn)] as RGBA;
    mb.quad(a, b, c, d, nIn, [col(a), col(b), col(c), col(d)], [
      [u1, v1],
      [u0, v1],
      [u0, v0],
      [u1, v0],
    ]);
  }
  // Masten in den Ecken und Wimpelketten
  const poleTop: V3[] = [];
  for (const [x, z] of [
    [-HALF + 0.3, -HALF + 0.3],
    [HALF - 0.3, -HALF + 0.3],
    [HALF - 0.3, HALF - 0.3],
    [-HALF + 0.3, HALF - 0.3],
  ]) {
    mb.tube([x, 0, z], [x, 7.2, z], 0.12, 0.09, rgba(hexRgb('#f7f2ff'), 1), 10);
    mb.sphere(x, 7.3, z, 0.24, rgba(hexRgb('#ff5c8f'), 1), 10, 7);
    poleTop.push([x, 7.1, z]);
  }
  const flags: RGB[] = ['#ff5c8f', '#ffd36e', '#7fe0b5', '#b9a2ff', '#ffffff', '#8fd3ff'].map(hexRgb);
  const rope = (a: V3, b: V3, sag: number) => {
    const n = Math.round(Math.hypot(b[0] - a[0], b[2] - a[2]) / 0.9);
    const at = (t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * sag, a[2] + (b[2] - a[2]) * t];
    for (let i = 0; i < n; i++) {
      const p = at(i / n);
      const q = at((i + 1) / n);
      mb.tube(p, q, 0.018, 0.018, rgba([0.95, 0.95, 0.95], 1), 4, false);
      if (i === 0 || i === n - 1) continue;
      const m: V3 = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2 - 0.42, (p[2] + q[2]) / 2];
      const c = rgba(flags[i % flags.length], 1);
      const nn = faceN(p, q, m);
      mb.tri(p, q, m, nn, c);
      mb.tri(q, p, m, [-nn[0], -nn[1], -nn[2]], c);
    }
  };
  rope(poleTop[0], poleTop[2], 2.6);
  rope(poleTop[1], poleTop[3], 2.6);
  rope(poleTop[0], poleTop[1], 1.3);
  rope(poleTop[2], poleTop[3], 1.3);
  // Bäume hinter der Wand
  const tr = seeded(7);
  for (let k = 0; k < 30; k++) {
    const a = (k / 30) * Math.PI * 2 + tr() * 0.15;
    const d = 20 + tr() * 6;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    const h = 4.5 + tr() * 3.5;
    mb.tube([x, 0, z], [x, h * 0.6, z], 0.28, 0.2, rgba(hexRgb('#8a5a3c'), 1), 7, false);
    const leaf = mixc(hexRgb('#3fae5a'), hexRgb('#7ccf4a'), tr());
    for (let i = 0; i < 3; i++) {
      const r = 1.5 + tr() * 1.1;
      mb.sphere(x + (tr() - 0.5) * 1.4, h * 0.62 + i * 0.9 + r * 0.5, z + (tr() - 0.5) * 1.4, r, rgba(mulc(leaf, 0.9 + i * 0.07), 1), 10, 7);
    }
  }
  return { mb, banners };
}

/** Himmelskuppel, ferne Hügel, Wolken und Sonne – wandert mit der Kamera mit */
function buildSky(): MB {
  const mb = new MB();
  const zen = hexRgb('#4f86e8');
  const mid = hexRgb('#9cc3f5');
  const hor = hexRgb('#ffd6c0');
  const R = 150;
  const seg = 24;
  const rows = [-0.3, -0.02, 0.06, 0.16, 0.32, 0.55, 0.8, 1.0];
  const colAt = (e: number): RGB => (e < 0.06 ? hor : e < 0.3 ? mixc(hor, mid, (e - 0.06) / 0.24) : mixc(mid, zen, Math.min(1, (e - 0.3) / 0.6)));
  const N0: V3 = [0, 0, 0];
  for (let j = 0; j < rows.length - 1; j++) {
    for (let i = 0; i < seg; i++) {
      const p = (k: number, e: number): V3 => {
        const t = (k / seg) * Math.PI * 2;
        const el = (e * Math.PI) / 2;
        return [Math.cos(t) * Math.cos(el) * R, Math.sin(el) * R, Math.sin(t) * Math.cos(el) * R];
      };
      const e0 = rows[j];
      const e1 = rows[j + 1];
      mb.quad(p(i, e0), p(i + 1, e0), p(i + 1, e1), p(i, e1), N0, [rgba(colAt(e0)), rgba(colAt(e0)), rgba(colAt(e1)), rgba(colAt(e1))]);
      // auch von innen sichtbar (keine Rückseiten-Auslese aktiv)
    }
  }
  // Sonne
  const sp: V3 = [SUN[0] * 140, SUN[1] * 140, SUN[2] * 140];
  billboardTo(mb, sp, 34, [1, 0.96, 0.85, 1], UV.glow);
  // Wolken
  const rc = seeded(3);
  for (let k = 0; k < 11; k++) {
    const a = rc() * Math.PI * 2;
    const el = 0.12 + rc() * 0.22;
    const d = 135;
    const p: V3 = [Math.cos(a) * Math.cos(el) * d, Math.sin(el) * d, Math.sin(a) * Math.cos(el) * d];
    billboardTo(mb, p, 22 + rc() * 18, [1, 0.97, 0.95, 0.92], UV.cloud, 0.55);
  }
  // Hügel in zwei Reihen
  const hills = (r: number, base: number, amp: number, col: RGB, seed: number) => {
    const h = seeded(seed);
    const ph = [h() * 6, h() * 6, h() * 6];
    const n = 64;
    for (let i = 0; i < n; i++) {
      const t0 = (i / n) * Math.PI * 2;
      const t1 = ((i + 1) / n) * Math.PI * 2;
      const hh = (t: number) => base + amp * (0.55 + 0.25 * Math.sin(t * 3 + ph[0]) + 0.15 * Math.sin(t * 7 + ph[1]) + 0.08 * Math.sin(t * 13 + ph[2]));
      const a: V3 = [Math.cos(t0) * r, -6, Math.sin(t0) * r];
      const b: V3 = [Math.cos(t1) * r, -6, Math.sin(t1) * r];
      const c: V3 = [Math.cos(t1) * r, hh(t1), Math.sin(t1) * r];
      const d: V3 = [Math.cos(t0) * r, hh(t0), Math.sin(t0) * r];
      const lo = rgba(mixc(col, hor, 0.45));
      mb.quad(a, b, c, d, N0, [lo, lo, rgba(col), rgba(col)]);
    }
  };
  hills(128, 3, 16, hexRgb('#a99bd8'), 11);
  hills(110, 1, 10, hexRgb('#7fb2a8'), 23);
  return mb;
}

/** Fläche, die zum Ursprung schaut (für Himmel und Wolken) */
function billboardTo(mb: MB, p: V3, size: number, col: RGBA, uv: [number, number, number, number], squash = 1) {
  const f = norm([-p[0], -p[1], -p[2]]);
  const r = norm(cross([0, 1, 0], f));
  const u = cross(f, r);
  const s = size / 2;
  const t = s * squash;
  const P = (a: number, b: number): V3 => [p[0] + r[0] * a + u[0] * b, p[1] + r[1] * a + u[1] * b, p[2] + r[2] * a + u[2] * b];
  mb.quad(P(-s, -t), P(s, -t), P(s, t), P(-s, t), [0, 0, 0], col, [
    [uv[0], uv[3]],
    [uv[2], uv[3]],
    [uv[2], uv[1]],
    [uv[0], uv[1]],
  ]);
}

// ───────────── Figuren ─────────────

interface Model {
  body: Mesh;
  head: Mesh;
  leg: Mesh;
  arms: Mesh;
}

function playerParts(team: RGB): { body: MB; head: MB; leg: MB; arms: MB } {
  const dark = mulc(team, 0.62);
  const light = mixc(team, [1, 1, 1], 0.55);
  const pants: RGBA = rgba(hexRgb('#2f3352'));
  const glove: RGBA = rgba(hexRgb('#fdfdfd'));
  const body = new MB();
  // Hüfte und Oberkörper (Kapuzenpulli)
  body.tube([0, 0.8, 0], [0, 1.38, 0], 0.25, 0.27, rgba(team), 14, false);
  body.sphere(0, 0.82, 0, [0.25, 0.1, 0.25], pants, 14, 6);
  body.sphere(0, 1.36, 0, [0.31, 0.14, 0.25], rgba(team), 14, 7);
  body.tube([0, 1.0, 0], [0, 1.05, 0], 0.262, 0.262, rgba(dark), 14, false);
  // Herz vorn auf der Brust
  body.heart(0, 1.13, 0.255, 0.1, 0.04, rgba([1, 1, 1]));
  // Farbtank auf dem Rücken
  body.tube([0, 0.95, -0.3], [0, 1.4, -0.3], 0.09, 0.09, rgba(light), 10);
  body.sphere(0, 1.42, -0.3, 0.09, rgba(light), 10, 6);
  const head = new MB();
  // Kopf mit Paintball-Maske
  head.sphere(0, 0.18, 0, [0.2, 0.21, 0.2], rgba(team), 16, 10);
  head.sphere(0, 0.21, 0.12, [0.16, 0.075, 0.1], rgba(hexRgb('#1e2340')), 14, 8);
  head.sphere(-0.07, 0.235, 0.205, 0.022, rgba([1, 1, 1]), 6, 4);
  head.box(0, 0.08, 0.17, 0.12, 0.06, 0.08, rgba(dark));
  for (const x of [-0.035, 0, 0.035]) head.box(x, 0.08, 0.212, 0.012, 0.04, 0.01, rgba(hexRgb('#1e2340')));
  // Antenne mit Herz
  head.tube([0, 0.38, 0], [0.02, 0.52, -0.02], 0.012, 0.012, rgba(dark), 5, false);
  head.heart(0.02, 0.5, -0.02, 0.07, 0.04, rgba(light));
  const leg = new MB();
  leg.tube([0, 0, 0], [0, -0.74, 0], 0.095, 0.08, pants, 10);
  leg.box(0, -0.8, 0.05, 0.13, 0.1, 0.27, rgba([1, 1, 1]), 0.85);
  const arms = new MB();
  // Pivot: Schulter-Mitte; Blaster zeigt nach +z
  for (const s of [-1, 1]) {
    arms.tube([s * 0.27, 0, 0], [s * 0.12, -0.12, 0.34], 0.075, 0.065, rgba(team), 8);
    arms.sphere(s * 0.1, -0.12, 0.36, 0.07, glove, 8, 6);
  }
  arms.box(0.02, -0.08, 0.5, 0.1, 0.12, 0.38, rgba(hexRgb('#fbf7ff')), 0.8);
  arms.tube([0.02, -0.06, 0.66], [0.02, -0.06, 0.92], 0.028, 0.028, rgba(dark), 8);
  arms.sphere(0.02, 0.04, 0.44, 0.075, rgba(light), 10, 7);
  return { body, head, leg, arms };
}

/** Der Blaster in der eigenen Hand (Kamera-Koordinaten: -z ist vorn) */
function viewBlaster(team: RGB): MB {
  const mb = new MB();
  const white = rgba(hexRgb('#fbf7ff'));
  const dark = rgba(mulc(team, 0.6));
  const light = rgba(mixc(team, [1, 1, 1], 0.5));
  mb.box(0, 0, 0, 0.085, 0.1, 0.36, white, 0.82);
  mb.box(0, 0.052, 0.02, 0.06, 0.012, 0.3, rgba(team));
  mb.tube([0, 0.012, -0.18], [0, 0.012, -0.46], 0.024, 0.022, rgba(team), 12);
  mb.tube([0, 0.012, -0.44], [0, 0.012, -0.49], 0.032, 0.032, dark, 12);
  // Farbbehälter oben
  mb.tube([0, 0.05, -0.02], [0, 0.11, -0.02], 0.03, 0.03, dark, 10, false);
  mb.sphere(0, 0.15, 0.0, [0.072, 0.065, 0.085], light, 14, 9);
  // Griff und Abzug
  mb.box(0, -0.1, 0.1, 0.06, 0.16, 0.07, dark, 0.8);
  mb.box(0, -0.075, 0.02, 0.012, 0.05, 0.03, dark);
  // Hand im weißen Handschuh
  mb.sphere(0.005, -0.12, 0.11, [0.06, 0.07, 0.055], rgba(hexRgb('#ffffff')), 10, 7);
  mb.tube([0.02, -0.15, 0.13], [0.07, -0.26, 0.32], 0.05, 0.06, rgba(team), 10, false);
  // Herz auf der linken Seite (die sieht man)
  mb.heart(-0.045, -0.01, -0.06, 0.035, 0.012, rgba(team), -Math.PI / 2);
  return mb;
}

function ballMesh(): MB {
  const mb = new MB();
  mb.sphere(0, 0, 0, 0.065, [1, 1, 1, 1], 10, 7);
  return mb;
}

function targetMesh(gold: boolean): MB {
  const mb = new MB();
  const [u0, v0, u1, v1] = gold ? UV.gold : UV.target;
  const w = TARGET_W / 2;
  const y0 = TARGET_Y0;
  const y1 = TARGET_Y1;
  const card: RGBA = gold ? rgba(hexRgb('#e8b830')) : rgba(hexRgb('#cfa678'));
  mb.box(0, y0 / 2, -0.03, 0.06, y0, 0.06, rgba(hexRgb('#8a5a3c')));
  mb.quad([-w, y0, 0.012], [w, y0, 0.012], [w, y1, 0.012], [-w, y1, 0.012], [0, 0, 1], [1, 1, 1, 1], [
    [u0, v1],
    [u1, v1],
    [u1, v0],
    [u0, v0],
  ]);
  mb.box(0, (y0 + y1) / 2, -0.01, TARGET_W + 0.02, y1 - y0 + 0.02, 0.03, card);
  return mb;
}

function balloonMesh(): MB {
  const mb = new MB();
  mb.heart(0, 0, 0, 0.9, 0.45, rgba(hexRgb('#ff4f8b')));
  mb.tube([0, -0.85, 0], [0.05, -2.4, 0.02], 0.012, 0.012, rgba([1, 1, 1]), 4, false);
  return mb;
}

function bubbleMesh(): MB {
  const mb = new MB();
  mb.sphere(0, 0, 0, 1, [1, 1, 1, 1], 18, 12);
  return mb;
}

// ───────────── Laufzeit ─────────────

interface Mesh {
  buf: WebGLBuffer;
  n: number;
}

export interface Decal {
  p: V3;
  n: V3;
  s: number;
  c: RGB;
  k: number;
  r: number;
}

export interface Bit {
  p: V3;
  v: V3;
  life: number;
  max: number;
  size: number;
  c: RGBA;
  g: number;
  heart?: boolean;
}

export interface DrawFighter {
  f: Fighter;
  team: RGB;
  /** Farbe des Gegners (für die Kleckse am Körper) */
  other: RGB;
  /** Wie weit „verschwunden“ (0…1) nach dem Ausscheiden */
  gone: number;
}

export interface DrawBall {
  p: V3;
  c: RGB;
}

export interface ViewModel {
  team: RGB;
  kick: number;
  reload: number;
  bob: number;
  moving: number;
  show: boolean;
}

export interface Frame {
  eye: V3;
  yaw: number;
  pitch: number;
  fighters: DrawFighter[];
  balls: DrawBall[];
  targets: Target[];
  vm: ViewModel | null;
  t: number;
}

export interface Gfx {
  resize(w: number, h: number): void;
  render(fr: Frame): void;
  splat(p: V3, n: V3, c: RGB, size?: number): void;
  burst(p: V3, c: RGB, n?: number, speed?: number, heart?: boolean): void;
  stepBits(dt: number): void;
  /** Weltpunkt → Bildschirm (CSS-Pixel), null wenn hinter der Kamera */
  project(p: V3): [number, number] | null;
  clearSplats(): void;
  dispose(): void;
  lost(): boolean;
}

const BALLOONS: [number, number, number][] = [
  [-6, 8.5, 6],
  [7, 9.5, -4],
  [-9, 9, -9],
  [10, 8.2, 9],
  [0, 10.5, -1],
  [-12, 9.6, 2],
];

export function createGfx(canvas: HTMLCanvasElement, teams: RGB[]): Gfx | null {
  const gl = canvas.getContext('webgl', { antialias: true, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false }) as WebGLRenderingContext | null;
  if (!gl) return null;
  const sh = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
    return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  const A = { p: gl.getAttribLocation(prog, 'aP'), n: gl.getAttribLocation(prog, 'aN'), c: gl.getAttribLocation(prog, 'aC'), t: gl.getAttribLocation(prog, 'aT') };
  const U = {
    vp: gl.getUniformLocation(prog, 'uVP'),
    m: gl.getUniformLocation(prog, 'uM'),
    sun: gl.getUniformLocation(prog, 'uSun'),
    eye: gl.getUniformLocation(prog, 'uEye'),
    fog: gl.getUniformLocation(prog, 'uFog'),
    fogR: gl.getUniformLocation(prog, 'uFogR'),
    tint: gl.getUniformLocation(prog, 'uTint'),
    mode: gl.getUniformLocation(prog, 'uMode'),
    gloss: gl.getUniformLocation(prog, 'uGloss'),
    tex: gl.getUniformLocation(prog, 'uTex'),
  };
  for (const a of [A.p, A.n, A.c, A.t]) gl.enableVertexAttribArray(a);

  const owned: WebGLBuffer[] = [];
  const upload = (mb: MB): Mesh => {
    const buf = gl.createBuffer()!;
    owned.push(buf);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mb.d), gl.STATIC_DRAW);
    return { buf, n: mb.d.length / STRIDE };
  };
  const bind = (buf: WebGLBuffer) => {
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.vertexAttribPointer(A.p, 3, gl.FLOAT, false, STRIDE * 4, 0);
    gl.vertexAttribPointer(A.n, 3, gl.FLOAT, false, STRIDE * 4, 12);
    gl.vertexAttribPointer(A.c, 4, gl.FLOAT, false, STRIDE * 4, 24);
    gl.vertexAttribPointer(A.t, 2, gl.FLOAT, false, STRIDE * 4, 40);
  };

  // Textur
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, makeAtlas());
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.uniform1i(U.tex, 0);

  const arena = upload(buildArena().mb);
  const sky = upload(buildSky());
  const ball = upload(ballMesh());
  const balloon = upload(balloonMesh());
  const bubble = upload(bubbleMesh());
  const targets = [upload(targetMesh(false)), upload(targetMesh(true))];
  const blob = upload((() => {
    const mb = new MB();
    mb.sphere(0, 0, 0, [1, 0.45, 1], [1, 1, 1, 1], 8, 5);
    return mb;
  })());
  const models = new Map<string, Model>();
  const blasters = new Map<string, Mesh>();
  const key = (c: RGB) => c.map((v) => v.toFixed(3)).join(',');
  const modelOf = (team: RGB) => {
    let m = models.get(key(team));
    if (!m) {
      const p = playerParts(team);
      m = { body: upload(p.body), head: upload(p.head), leg: upload(p.leg), arms: upload(p.arms) };
      models.set(key(team), m);
    }
    return m;
  };
  const blasterOf = (team: RGB) => {
    let m = blasters.get(key(team));
    if (!m) {
      m = upload(viewBlaster(team));
      blasters.set(key(team), m);
    }
    return m;
  };
  for (const t of teams) {
    modelOf(t);
    blasterOf(t);
  }

  // Dynamische Puffer: Farbkleckse (selten neu) und Partikel (jedes Bild)
  const decals: Decal[] = [];
  let decalDirty = true;
  const decalBuf = gl.createBuffer()!;
  owned.push(decalBuf);
  let decalN = 0;
  const bits: Bit[] = [];
  const bitBuf = gl.createBuffer()!;
  owned.push(bitBuf);
  const MAX_DECALS = 140;

  let W = 1;
  let H = 1;
  let vp = m4();
  let camRight: V3 = [1, 0, 0];
  let camUp: V3 = [0, 1, 0];
  let isLost = false;
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    isLost = true;
  });

  const draw = (mesh: Mesh, m: M4, tint: RGBA = [1, 1, 1, 1], mode = 1, gloss = 0.35) => {
    bind(mesh.buf);
    gl.uniformMatrix4fv(U.m, false, m);
    gl.uniform4fv(U.tint, tint);
    gl.uniform1f(U.mode, mode);
    gl.uniform1f(U.gloss, gloss);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.n);
  };

  const rebuildDecals = () => {
    const mb = new MB();
    for (const d of decals) {
      const n = d.n;
      const t0: V3 = Math.abs(n[1]) > 0.9 ? [1, 0, 0] : norm(cross([0, 1, 0], n));
      const t1 = cross(n, t0);
      const c = Math.cos(d.r);
      const s = Math.sin(d.r);
      // An Wänden laufen die Tropfen nach unten – dort nicht drehen
      const u: V3 = Math.abs(n[1]) > 0.9 ? [t0[0] * c + t1[0] * s, t0[1] * c + t1[1] * s, t0[2] * c + t1[2] * s] : t0;
      const v: V3 = Math.abs(n[1]) > 0.9 ? cross(n, u) : t1;
      const o: V3 = [d.p[0] + n[0] * 0.012, d.p[1] + n[1] * 0.012, d.p[2] + n[2] * 0.012];
      const S = d.s;
      const P = (a: number, b: number): V3 => [o[0] + u[0] * a + v[0] * b, o[1] + u[1] * a + v[1] * b, o[2] + u[2] * a + v[2] * b];
      const [u0, v0, u1, v1] = UV.splat(d.k);
      // v zeigt nach oben → der obere Bildrand (v0) liegt oben
      mb.quad(P(-S, -S), P(S, -S), P(S, S), P(-S, S), n, rgba(d.c, 1), [
        [u1, v1],
        [u0, v1],
        [u0, v0],
        [u1, v0],
      ]);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, decalBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mb.d), gl.DYNAMIC_DRAW);
    decalN = mb.d.length / STRIDE;
    decalDirty = false;
  };

  const gfx: Gfx = {
    lost: () => isLost,
    resize(w, h) {
      W = w;
      H = h;
      gl.viewport(0, 0, canvas.width, canvas.height);
    },
    splat(p, n, c, size = 0.42) {
      decals.push({ p, n, s: size * (0.8 + Math.random() * 0.45), c, k: Math.floor(Math.random() * 4), r: Math.random() * Math.PI * 2 });
      if (decals.length > MAX_DECALS) decals.shift();
      decalDirty = true;
    },
    clearSplats() {
      decals.length = 0;
      decalDirty = true;
    },
    burst(p, c, n = 14, speed = 4, heart = false) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const e = (Math.random() - 0.2) * Math.PI * 0.6;
        const s = speed * (0.4 + Math.random() * 0.8);
        const max = 0.35 + Math.random() * 0.45;
        bits.push({
          p: [p[0], p[1], p[2]],
          v: [Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + speed * 0.3, Math.sin(a) * Math.cos(e) * s],
          life: max,
          max,
          size: heart ? 0.12 + Math.random() * 0.1 : 0.05 + Math.random() * 0.07,
          c: rgba(c, 1),
          g: heart ? -1 : 9,
          heart,
        });
      }
      if (bits.length > 500) bits.splice(0, bits.length - 500);
    },
    stepBits(dt) {
      for (let i = bits.length - 1; i >= 0; i--) {
        const b = bits[i];
        b.life -= dt;
        if (b.life <= 0) {
          bits.splice(i, 1);
          continue;
        }
        b.v[1] -= b.g * dt;
        b.p[0] += b.v[0] * dt;
        b.p[1] += b.v[1] * dt;
        b.p[2] += b.v[2] * dt;
        if (b.p[1] < 0.02 && !b.heart) {
          b.p[1] = 0.02;
          b.v[0] *= 0.4;
          b.v[2] *= 0.4;
          b.v[1] = 0;
        }
      }
    },
    project(p) {
      const x = vp[0] * p[0] + vp[4] * p[1] + vp[8] * p[2] + vp[12];
      const y = vp[1] * p[0] + vp[5] * p[1] + vp[9] * p[2] + vp[13];
      const w = vp[3] * p[0] + vp[7] * p[1] + vp[11] * p[2] + vp[15];
      if (w <= 0.05) return null;
      return [((x / w) * 0.5 + 0.5) * W, (1 - ((y / w) * 0.5 + 0.5)) * H];
    },
    render(fr) {
      if (isLost) return;
      const aspect = W / Math.max(1, H);
      // Hochkant: waagerecht ~68° Sicht, aber senkrecht nicht mehr als ~92°
      const hfov = (68 * Math.PI) / 180;
      const fovy = Math.min((92 * Math.PI) / 180, Math.max((50 * Math.PI) / 180, 2 * Math.atan(Math.tan(hfov / 2) / aspect)));
      const proj = perspective(fovy, aspect, 0.05, 220);
      const d = dir3(fr.yaw, fr.pitch);
      const cam = lookDir(fr.eye, d);
      camRight = cam.right;
      camUp = cam.up;
      vp = mul(proj, cam.view);
      gl.clearColor(FOG[0], FOG[1], FOG[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.uniformMatrix4fv(U.vp, false, vp);
      gl.uniform3fv(U.sun, SUN);
      gl.uniform3fv(U.eye, fr.eye);
      gl.uniform3fv(U.fog, FOG);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.disable(gl.CULL_FACE);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

      // Himmel (ohne Tiefe, ohne Nebel)
      gl.disable(gl.DEPTH_TEST);
      gl.depthMask(false);
      gl.uniform2f(U.fogR, 1e5, 2e5);
      draw(sky, trs(fr.eye[0], 0, fr.eye[2]), [1, 1, 1, 1], 0);
      gl.enable(gl.DEPTH_TEST);
      gl.depthMask(true);
      gl.uniform2f(U.fogR, 26, 120);

      // Arena (Schatten eingebacken)
      draw(arena, m4(), [1, 1, 1, 1], 2, 0.18);

      // Luftballons
      BALLOONS.forEach(([x, y, z], i) => {
        const t = fr.t + i * 1.7;
        draw(balloon, trs(x + Math.sin(t * 0.5) * 0.3, y + Math.sin(t * 0.9) * 0.35, z, t * 0.25 + i, Math.sin(t * 0.7) * 0.08), [1, 1, 1, 1], 1, 0.7);
      });

      // Figuren
      for (const df of fr.fighters) {
        const f = df.f;
        if (df.gone >= 1) continue;
        const m = modelOf(df.team);
        const s = 1 - df.gone;
        const speed = Math.min(1, Math.hypot(f.vx, f.vz) / 5);
        const sw = Math.sin(f.walk * 2.6) * 0.55 * speed;
        const bob = Math.abs(Math.cos(f.walk * 2.6)) * 0.04 * speed;
        const base = trs(f.x, bob, f.z, f.yaw, 0, [s, s, s]);
        const blink = f.shield > 0 && Math.floor(fr.t * 10) % 2 === 0 ? 0.55 : 1;
        const tint: RGBA = [1, 1, 1, blink];
        draw(m.body, base, tint, 1, 0.45);
        draw(m.leg, mul(base, trs(-0.11, 0.86, 0, 0, sw)), tint);
        draw(m.leg, mul(base, trs(0.11, 0.86, 0, 0, -sw)), tint);
        draw(m.arms, mul(base, trs(0, 1.33, 0, 0, -f.pitch)), tint, 1, 0.4);
        draw(m.head, mul(base, trs(0, 1.42, 0, 0, -f.pitch * 0.4)), tint, 1, 0.6);
        // Farbkleckse am Körper
        for (const sp of f.splats) {
          const r = sp.y > 1.38 ? 0.21 : sp.y > 0.85 ? 0.27 : 0.12;
          const lx = Math.sin(sp.a) * r;
          const lz = Math.cos(sp.a) * r;
          draw(blob, mul(base, trs(lx, sp.y, lz, sp.a, 0, [0.11 * sp.s, 0.11 * sp.s, 0.06 * sp.s])), rgba(df.other, 1), 1, 0.8);
        }
        if (f.shield > 0 && f.alive) {
          gl.depthMask(false);
          draw(bubble, trs(f.x, 0.95, f.z, 0, 0, [0.85, 1.05, 0.85]), [...mixc(df.team, [1, 1, 1], 0.4), 0.18] as RGBA, 1, 1);
          gl.depthMask(true);
        }
      }

      // Pappziele
      for (const tg of fr.targets) {
        const fall = (1 - tg.up) * (Math.PI / 2) * 0.98;
        draw(targets[tg.gold ? 1 : 0], trs(tg.x, 0, tg.z, tg.yaw, -fall), [1, 1, 1, 1], 1, 0.15);
      }

      // Farbkugeln
      for (const b of fr.balls) draw(ball, trs(b.p[0], b.p[1], b.p[2]), rgba(b.c, 1), 1, 1.2);

      // Kleckse, Schatten, Partikel – ohne Tiefe zu schreiben
      gl.depthMask(false);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(-1, -4);
      if (decalDirty) rebuildDecals();
      if (decalN) {
        bind(decalBuf);
        gl.uniformMatrix4fv(U.m, false, m4());
        gl.uniform4fv(U.tint, [1, 1, 1, 0.94]);
        gl.uniform1f(U.mode, 1);
        gl.uniform1f(U.gloss, 0.9);
        gl.drawArrays(gl.TRIANGLES, 0, decalN);
      }
      const dyn = new MB();
      const flat = (p: V3, s: number, c: RGBA, uv: [number, number, number, number]) => {
        dyn.quad([p[0] - s, p[1], p[2] + s], [p[0] + s, p[1], p[2] + s], [p[0] + s, p[1], p[2] - s], [p[0] - s, p[1], p[2] - s], [0, 0, 0], c, [
          [uv[0], uv[3]],
          [uv[2], uv[3]],
          [uv[2], uv[1]],
          [uv[0], uv[1]],
        ]);
      };
      for (const df of fr.fighters) if (df.gone < 1) flat([df.f.x, 0.012, df.f.z], 0.55 * (1 - df.gone), [0, 0, 0, 0.55], UV.shadow);
      for (const b of fr.balls) if (b.p[1] < 3) flat([b.p[0], 0.012, b.p[2]], 0.09, [0, 0, 0, 0.35 * (1 - b.p[1] / 3)], UV.shadow);
      const R = camRight;
      const Up = camUp;
      for (const b of bits) {
        const s = b.size * (b.heart ? 1 : 0.6 + 0.4 * (b.life / b.max));
        const a = Math.min(1, (b.life / b.max) * 2.5);
        const p = b.p;
        const uv = b.heart ? UV.heart : UV.dot;
        const P = (x: number, y: number): V3 => [p[0] + R[0] * x + Up[0] * y, p[1] + R[1] * x + Up[1] * y, p[2] + R[2] * x + Up[2] * y];
        dyn.quad(P(-s, -s), P(s, -s), P(s, s), P(-s, s), [0, 0, 0], [b.c[0], b.c[1], b.c[2], a], [
          [uv[0], uv[3]],
          [uv[2], uv[3]],
          [uv[2], uv[1]],
          [uv[0], uv[1]],
        ]);
      }
      if (dyn.d.length) {
        gl.bindBuffer(gl.ARRAY_BUFFER, bitBuf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(dyn.d), gl.STREAM_DRAW);
        bind(bitBuf);
        gl.uniformMatrix4fv(U.m, false, m4());
        gl.uniform4fv(U.tint, [1, 1, 1, 1]);
        gl.uniform1f(U.mode, 1);
        gl.drawArrays(gl.TRIANGLES, 0, dyn.d.length / STRIDE);
      }
      gl.disable(gl.POLYGON_OFFSET_FILL);
      gl.depthMask(true);

      // Eigener Blaster vorn rechts
      if (fr.vm?.show) {
        const vm = fr.vm;
        gl.clear(gl.DEPTH_BUFFER_BIT);
        gl.uniform2f(U.fogR, 1e5, 2e5);
        const rl = vm.reload > 0 ? Math.sin(Math.min(1, vm.reload) * Math.PI) : 0;
        // Hochkant sitzt der Blaster etwas weiter innen, sonst schaut er kaum ins Bild
        const narrow = aspect < 0.9;
        const bx = (narrow ? 0.16 : 0.2) + Math.sin(vm.bob) * 0.012 * vm.moving;
        const by = (narrow ? -0.25 : -0.21) - Math.abs(Math.cos(vm.bob)) * 0.014 * vm.moving - rl * 0.12;
        const bz = -0.6 + vm.kick * 0.05;
        // leicht zur Bildmitte gedreht, damit der Lauf aufs Fadenkreuz zeigt
        const local = trs(bx, by, bz, 0.2 + rl * 0.4, 0.04 + vm.kick * 0.09 - rl * 0.35, 0.78);
        draw(blasterOf(vm.team), mul(cam.world, local), [1, 1, 1, 1], 1, 0.7);
      }
    },
    dispose() {
      // Den Kontext nicht wegwerfen: React baut im Entwicklungsmodus einmal ab und wieder auf
      // und bekäme sonst einen toten Kontext für dieselbe Leinwand.
      for (const b of owned) gl.deleteBuffer(b);
      owned.length = 0;
      gl.deleteTexture(tex);
      gl.deleteProgram(prog);
    },
  };
  return gfx;
}

/** Augenhöhe beim Zuschauen nach dem Ausscheiden: etwas über dem Kopf */
export const SPECT_EYE = BODY_H + 0.9;
export const PLAYER_EYE = EYE;
