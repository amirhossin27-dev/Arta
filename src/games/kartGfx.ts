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

const SKY_TOP = [0.36, 0.72, 1.0];
const SKY_BOTTOM = [1.0, 0.86, 0.92];
const FOG = '#ffdbeb';

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

function noiseTile(): HTMLCanvasElement {
  const [c, g] = canvas(64, 64);
  const img = g.createImageData(64, 64);
  const rnd = seeded(5);
  for (let i = 0; i < 64 * 64; i++) {
    const v = 90 + rnd() * 80;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
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

  // Hecke und Wiese neben der Strecke
  stroke((WALL + 10) * 2, '#2b6534');
  stroke((WALL + 2) * 2, grass);
  stroke((WALL + 2) * 2, 'rgba(255,255,190,0.13)');
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

let worldCache: { t: Track; world: HTMLCanvasElement; grass: HTMLCanvasElement; noise: HTMLCanvasElement } | undefined;
function worldAssets(t: Track) {
  if (!worldCache || worldCache.t !== t) worldCache = { t, world: drawWorld(t), grass: grassTile(), noise: noiseTile() };
  return worldCache;
}

// ───────────────────────── Boden ─────────────────────────

export interface Ground {
  readonly kind: 'gl' | 'soft';
  resize(cssW: number, cssH: number, dpr: number): void;
  draw(cam: Cam): void;
  destroy(): void;
}

const VERT = `attribute vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;
const FRAG = `
precision highp float;
uniform sampler2D uTex;
uniform sampler2D uGrass;
uniform sampler2D uNoise;
uniform vec2 uRes;
uniform float uHz;
uniform float uF;
uniform float uCamH;
uniform vec2 uCam;
uniform vec2 uFwd;
uniform vec3 uSkyTop;
uniform vec3 uSkyBot;
void main() {
  float py = uRes.y - gl_FragCoord.y;
  float dy = max(py - uHz, 0.5);
  float z = uCamH * uF / dy;
  vec2 right = vec2(-uFwd.y, uFwd.x);
  vec2 w = uCam + uFwd * z + right * ((gl_FragCoord.x - uRes.x * 0.5) * z / uF);
  vec2 uv = w / ${WORLD.toFixed(1)};
  vec3 inner = texture2D(uTex, clamp(uv, 0.0, 1.0)).rgb;
  vec3 outer = texture2D(uGrass, w / 64.0).rgb;
  float inside = step(0.0, uv.x) * step(0.0, uv.y) * step(uv.x, 1.0) * step(uv.y, 1.0);
  vec3 c = mix(outer, inner, inside);
  float near = clamp(1.0 - z / 240.0, 0.0, 1.0);
  c *= 1.0 + (texture2D(uNoise, w / 7.0).r - 0.5) * 0.22 * near;
  float t = clamp(py / uHz, 0.0, 1.0);
  vec3 sky = mix(uSkyTop, uSkyBot, t * t);
  c = mix(c, uSkyBot, smoothstep(200.0, 1600.0, z) * 0.94);
  gl_FragColor = vec4(mix(c, sky, step(py, uHz + 0.5)), 1.0);
}`;

class GlGround implements Ground {
  readonly kind = 'gl' as const;
  private gl: WebGLRenderingContext;
  private u: Record<string, WebGLUniformLocation | null> = {};
  private w = 1;
  private h = 1;
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
    for (const n of ['uTex', 'uGrass', 'uNoise', 'uRes', 'uHz', 'uF', 'uCamH', 'uCam', 'uFwd', 'uSkyTop', 'uSkyBot']) this.u[n] = gl.getUniformLocation(prog, n);

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
    };
    tex(0, A.world, false);
    tex(1, A.grass, true);
    tex(2, A.noise, true);
    gl.uniform1i(this.u.uTex, 0);
    gl.uniform1i(this.u.uGrass, 1);
    gl.uniform1i(this.u.uNoise, 2);
    gl.uniform3fv(this.u.uSkyTop, SKY_TOP);
    gl.uniform3fv(this.u.uSkyBot, SKY_BOTTOM);
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

  draw(cam: Cam) {
    const { gl, u } = this;
    if (gl.isContextLost()) return;
    const p = projection(this.w, this.h, cam);
    gl.uniform2f(u.uRes, this.w, this.h);
    gl.uniform1f(u.uHz, p.hz);
    gl.uniform1f(u.uF, p.f);
    gl.uniform1f(u.uCamH, p.camH);
    gl.uniform2f(u.uCam, p.cx, p.cy);
    gl.uniform2f(u.uFwd, p.fx, p.fy);
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

/** Ersatz ohne WebGL: derselbe Boden, in niedriger Auflösung in Software gerechnet. */
class SoftGround implements Ground {
  readonly kind = 'soft' as const;
  private ctx: CanvasRenderingContext2D;
  private img: ImageData | null = null;
  private buf: Uint32Array | null = null;
  private w = 1;
  private h = 1;
  private sky: CanvasGradient | null = null;
  private fog: CanvasGradient | null = null;

  constructor(
    private cv: HTMLCanvasElement,
    t: Track,
  ) {
    this.ctx = cv.getContext('2d')!;
    if (!softTex) {
      const A = worldAssets(t);
      softTex = new Uint32Array(A.world.getContext('2d')!.getImageData(0, 0, TEX, TEX).data.buffer.slice(0));
    }
  }

  resize(cssW: number, cssH: number) {
    this.w = 300;
    this.h = Math.max(60, Math.round((300 * cssH) / Math.max(1, cssW)));
    this.cv.width = this.w;
    this.cv.height = this.h;
    this.img = this.ctx.createImageData(this.w, this.h);
    this.buf = new Uint32Array(this.img.data.buffer);
    const hz = Math.round(this.h * HORIZON);
    this.sky = this.ctx.createLinearGradient(0, 0, 0, hz);
    this.sky.addColorStop(0, '#5cb8ff');
    this.sky.addColorStop(1, FOG);
    this.fog = this.ctx.createLinearGradient(0, hz, 0, hz + this.h * 0.12);
    this.fog.addColorStop(0, FOG);
    this.fog.addColorStop(1, 'rgba(255,219,235,0)');
  }

  draw(cam: Cam) {
    const { ctx, buf, img, w: W, h: H } = this;
    if (!buf || !img || !softTex) return;
    const p = projection(W, H, cam);
    const hz = Math.round(p.hz);
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
    ctx.fillStyle = this.sky!;
    ctx.fillRect(0, 0, W, hz + 1);
    ctx.fillStyle = this.fog!;
    ctx.fillRect(0, hz, W, H * 0.12);
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
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.beginPath();
  g.ellipse(48, 114, 30, 6, 0, 0, Math.PI * 2);
  g.fill();
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
function hillsSprite(W: number, H: number): { far: HTMLCanvasElement; near: HTMLCanvasElement } {
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
  mg.addColorStop(0, '#b693e6');
  mg.addColorStop(1, '#e6c3ef');
  ridge(gf, hh, hh * 0.95, [4, 9], 0.3, mg);
  // Schneekappen
  gf.globalCompositeOperation = 'source-atop';
  gf.fillStyle = 'rgba(255,255,255,0.75)';
  gf.fillRect(0, 0, w, hh * 0.22);
  gf.globalCompositeOperation = 'source-over';
  const [near, gn] = canvas(w, hh);
  const hg = gn.createLinearGradient(0, hh * 0.3, 0, hh);
  hg.addColorStop(0, '#7fcf74');
  hg.addColorStop(1, '#4f9f4c');
  ridge(gn, hh, hh * 0.55, [6, 13], 1.7, hg);
  const rnd = seeded(12);
  for (let i = 0; i < w / 9; i++) {
    const x = rnd() * w;
    const u = (x / w) * Math.PI * 2;
    const top = hh - hh * 0.55 * (0.55 + 0.25 * Math.sin(u * 6 + 1.7) + 0.2 * Math.sin(u * 13 + 3.57));
    gn.fillStyle = rnd() < 0.3 ? '#ff9fc5' : '#3a8a43';
    gn.beginPath();
    gn.arc(x, top + 2 + rnd() * hh * 0.2, 1.5 + rnd() * (hh * 0.05), 0, Math.PI * 2);
    gn.fill();
  }
  return { far, near };
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

interface Prop {
  x: number;
  y: number;
  kind: 'tree' | 'sign';
  k: number;
}

interface Sprites {
  trees: HTMLCanvasElement[];
  signs: Record<string, HTMLCanvasElement>;
  box: HTMLCanvasElement[];
  banana: HTMLCanvasElement;
  arrow: HTMLCanvasElement;
  banner: HTMLCanvasElement;
  karts: Map<string, HTMLCanvasElement[]>;
  props: Prop[];
  arch: { l: { x: number; y: number }; r: { x: number; y: number } };
}

let sprites: Sprites | undefined;
const BOX_LAYERS = 10;
const BOX_SIZE = 9;

function getSprites(t: Track): Sprites {
  if (sprites) return sprites;
  const props: Prop[] = t.trees.map((tr, i) => ({ x: tr.x, y: tr.y, kind: 'tree', k: i % 7 === 0 ? 3 : tr.k }));
  // Kurvenschilder außen vor den engen Kurven
  let last = -999;
  for (let s = 0; s < t.len; s += 8) {
    const k = curveAhead(t, s + 50, 40);
    if (Math.abs(k) < 1 / 110 || s - last < 26) continue;
    last = s;
    const p = trackPoint(t, s + 50, -Math.sign(k) * (HALF + 20));
    if (Math.abs(locate(t, p.x, p.y).lat) < HALF + 12) continue;
    props.push({ x: p.x, y: p.y, kind: 'sign', k: Math.sign(k) });
  }
  sprites = {
    trees: [0, 1, 2, 3].map(treeSprite),
    signs: { '1': signSprite(1), '-1': signSprite(-1) },
    box: Array.from({ length: BOX_LAYERS }, (_, i) => boxLayer(i, BOX_LAYERS)),
    banana: bananaSprite(),
    arrow: arrowSprite(),
    banner: bannerSprite(),
    karts: new Map(),
    props,
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
}

interface OverlayCache {
  W: number;
  H: number;
  hills: { far: HTMLCanvasElement; near: HTMLCanvasElement };
  map: HTMLCanvasElement;
  ms: number;
}
const overlayCache = new WeakMap<HTMLCanvasElement, OverlayCache>();

export function drawOverlay(cv: HTMLCanvasElement, t: Track, cam: Cam, scene: Scene) {
  const ctx = cv.getContext('2d')!;
  const W = cv.width;
  const H = cv.height;
  const S = getSprites(t);
  let oc = overlayCache.get(cv);
  if (!oc || oc.W !== W || oc.H !== H) {
    const ms = Math.round(Math.min(W * 0.2, H * HORIZON * 0.78));
    oc = { W, H, hills: hillsSprite(W, H), map: mapSprite(t, ms), ms };
    overlayCache.set(cv, oc);
  }
  const p = projection(W, H, cam);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);

  // Sonne, Berge, Hügel
  const sunRel = wrapAngle(-2.2 - cam.a);
  if (Math.cos(sunRel) > 0.2) {
    const sx = W / 2 + Math.tan(sunRel) * p.f;
    const sy = p.hz * 0.42;
    const r = W * 0.07;
    const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 3);
    glow.addColorStop(0, 'rgba(255,255,240,0.95)');
    glow.addColorStop(0.25, 'rgba(255,245,200,0.6)');
    glow.addColorStop(1, 'rgba(255,220,235,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sx - r * 3, sy - r * 3, r * 6, r * 6);
  }
  const hw = oc.hills.far.width;
  const layerAt = (img: HTMLCanvasElement, speed: number) => {
    let ox = ((((-cam.a / (Math.PI * 2)) * hw * speed) % hw) + hw) % hw;
    ox -= hw;
    for (; ox < W; ox += hw) ctx.drawImage(img, Math.round(ox), Math.round(p.hz + 1 - img.height));
  };
  layerAt(oc.hills.far, 1);
  layerAt(oc.hills.near, 2);
  const haze = ctx.createLinearGradient(0, p.hz - H * 0.05, 0, p.hz + 2);
  haze.addColorStop(0, 'rgba(255,219,235,0)');
  haze.addColorStop(1, 'rgba(255,219,235,0.75)');
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

  for (const pr of S.props) {
    if (pr.kind === 'tree') {
      const big = pr.k === 3 ? [20, 25] : [34, 42];
      billboard(S.trees[pr.k], pr.x, pr.y, big[0], big[1]);
    } else billboard(S.signs[String(pr.k)], pr.x, pr.y, 15, 15, 0, 900);
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
        layers.forEach((img, i) => {
          for (let j = 0; j < (i === last ? 1 : steps); j++) {
            ctx.setTransform(1, 0, 0, 1, q.sx, q.sy - (i + j / steps) * gap);
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
