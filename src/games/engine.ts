import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';
import { getDevice } from '../lib/store';

// ───────────────────────── Retro-Sound ─────────────────────────

let audio: AudioContext | undefined;

function audioCtx(): AudioContext | undefined {
  if (!audio) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return undefined;
    audio = new AC();
  }
  if (audio.state === 'suspended') void audio.resume();
  return audio;
}

/** iOS spielt Töne erst nach einer Berührung – deshalb beim „Los geht's“-Tipp aufwecken. */
export function unlockAudio() {
  if (getDevice().sound !== false) audioCtx();
}

/** Ein 8-Bit-Piepser. */
export function tone(freq: number, ms = 90, type: OscillatorType = 'square', vol = 0.05, slideTo?: number) {
  if (getDevice().sound === false) return;
  try {
    const c = audioCtx();
    if (!c) return;
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + ms / 1000);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + ms / 1000 + 0.02);
  } catch {
    // Kein Ton – das Spiel läuft trotzdem.
  }
}

/** Leises Motorbrummen für Rennspiele: `set` passt Tonhöhe und Lautstärke an, `stop` beendet es. */
export function hum(): { set(freq: number, vol: number): void; stop(): void } | null {
  if (getDevice().sound === false) return null;
  try {
    const c = audioCtx();
    if (!c) return null;
    const o = c.createOscillator();
    const lp = c.createBiquadFilter();
    const g = c.createGain();
    o.type = 'sawtooth';
    o.frequency.value = 60;
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    g.gain.value = 0;
    o.connect(lp).connect(g).connect(c.destination);
    o.start();
    return {
      set(freq, vol) {
        const t = c.currentTime;
        o.frequency.setTargetAtTime(freq, t, 0.06);
        g.gain.setTargetAtTime(getDevice().sound === false ? 0 : vol, t, 0.08);
      },
      stop() {
        const t = c.currentTime;
        g.gain.setTargetAtTime(0, t, 0.05);
        o.stop(t + 0.4);
      },
    };
  } catch {
    return null;
  }
}

/** Kurzes Rauschen – für Schläge, Wusch und Aufprall. `freq`: Mitte des Klangs, `to`: dahin gleitet er. */
export function noise(ms = 80, vol = 0.08, freq = 1200, to?: number) {
  if (getDevice().sound === false) return;
  try {
    const c = audioCtx();
    if (!c) return;
    const t = c.currentTime;
    const len = Math.max(1, Math.round((c.sampleRate * ms) / 1000));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(freq, t);
    if (to) bp.frequency.exponentialRampToValueAtTime(to, t + ms / 1000);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
    src.connect(bp).connect(g).connect(c.destination);
    src.start(t);
  } catch {
    // Kein Ton – das Spiel läuft trotzdem.
  }
}

function melody(notes: number[], step = 110, ms = 140, type: OscillatorType = 'square') {
  notes.forEach((f, i) => window.setTimeout(() => tone(f, ms, type), i * step));
}

export const sfx = {
  tap: () => tone(660, 45),
  flip: () => tone(520, 35, 'triangle', 0.06),
  bounce: () => tone(440, 40),
  wall: () => tone(250, 35),
  brick: () => tone(700 + Math.random() * 300, 45),
  eat: () => tone(880, 70, 'square', 0.05, 1320),
  point: () => melody([660, 990], 80, 90),
  match: () => melody([784, 1047], 90, 110, 'triangle'),
  miss: () => tone(240, 320, 'sawtooth', 0.04, 70),
  win: () => melody([523, 659, 784, 1047, 1319], 100, 150),
  lose: () => melody([392, 330, 262, 196], 130, 170, 'triangle'),
  draw: () => melody([523, 523, 659], 120, 120, 'triangle'),
};

export function buzz(ms: number | number[] = 18) {
  // Ohne vorheriges Tippen blockt der Browser die Vibration (und meckert in der Konsole).
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    // Vibration nicht verfügbar
  }
}

// ───────────────────────── Touch ─────────────────────────

/**
 * Kein Markieren, keine Lupe, kein Kopieren-Menü: In Echtzeitspielen heißt ein langer Finger auf dem
 * Bildschirm Lenken oder Kämpfen. Knöpfe bleiben antippbar.
 */
export function useTouchLock(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const html = document.documentElement;
    html.classList.add('touch-lock');
    const block = (e: Event) => {
      // Knöpfe und Listen zum Scrollen (data-free) bleiben bedienbar.
      if (e.target instanceof Element && e.target.closest('button, [data-free]')) return;
      if (e.cancelable) e.preventDefault();
    };
    const unselect = () => {
      const sel = document.getSelection();
      if (sel && !sel.isCollapsed) sel.removeAllRanges();
    };
    const opts = { passive: false } as const;
    el.addEventListener('touchstart', block, opts);
    el.addEventListener('touchmove', block, opts);
    el.addEventListener('contextmenu', block);
    el.addEventListener('selectstart', block);
    el.addEventListener('dragstart', block);
    document.addEventListener('gesturestart', block, opts);
    document.addEventListener('selectionchange', unselect);
    return () => {
      html.classList.remove('touch-lock');
      el.removeEventListener('touchstart', block);
      el.removeEventListener('touchmove', block);
      el.removeEventListener('contextmenu', block);
      el.removeEventListener('selectstart', block);
      el.removeEventListener('dragstart', block);
      document.removeEventListener('gesturestart', block);
      document.removeEventListener('selectionchange', unselect);
    };
  }, []);
}

// ───────────────────────── Spielschleife ─────────────────────────

/** requestAnimationFrame-Schleife mit Zeitschritt in Sekunden (gedeckelt, damit nach dem App-Wechsel nichts springt). */
export function useLoop(step: (dt: number) => void, running: boolean) {
  const stepRef = useRef(step);
  stepRef.current = step;
  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    const tick = (t: number) => {
      const dt = Math.min((t - last) / 1000, 0.05);
      last = t;
      stepRef.current(dt);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running]);
}

/**
 * Canvas, das sich in seinen Container einpasst. Gezeichnet wird in logischen Koordinaten (w × h),
 * Skalierung und Retina-Schärfe übernimmt der Hook.
 */
export function useFitCanvas(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const fit = () => {
      const r = wrap.getBoundingClientRect();
      const s = Math.max(Math.min(r.width / w, r.height / h), 0.1);
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      canvas.style.width = `${Math.floor(w * s)}px`;
      canvas.style.height = `${Math.floor(h * s)}px`;
      canvas.width = Math.round(w * s * dpr);
      canvas.height = Math.round(h * s * dpr);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(s * dpr, 0, 0, s * dpr, 0, 0);
      drawRef.current(ctx);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [w, h]);

  const paint = () => {
    const ctx = canvasRef.current?.getContext('2d');
    if (ctx) drawRef.current(ctx);
  };

  /** Bildschirm-Koordinaten → logische Spielfeld-Koordinaten */
  const toLogical = (clientX: number, clientY: number) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: ((clientX - r.left) / r.width) * w, y: ((clientY - r.top) / r.height) * h };
  };

  return { wrapRef, canvasRef, paint, toLogical };
}

/**
 * Canvas, das den ganzen Container ausfüllt (für Spiele, die sich jeder Bildschirmform anpassen).
 * `draw` bekommt die Größe in CSS-Pixeln; die Retina-Schärfe ist schon eingerechnet.
 */
export function useFillCanvas(draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, maxDpr = 2) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const size = useRef({ w: 0, h: 0, dpr: 1 });
  const drawRef = useRef(draw);
  drawRef.current = draw;

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const fit = () => {
      const r = wrap.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return;
      const dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
      size.current = { w: r.width, h: r.height, dpr };
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawRef.current(ctx, r.width, r.height);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [maxDpr]);

  const paint = () => {
    const ctx = canvasRef.current?.getContext('2d');
    const { w, h, dpr } = size.current;
    if (!ctx || !w) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawRef.current(ctx, w, h);
  };

  return { wrapRef, canvasRef, paint, size };
}

export function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}

/** Ganze Ellipse als eigener Teilpfad – mehrere hintereinander verbinden sich so nicht zu Keilen. */
export function oval(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot = 0) {
  ctx.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot));
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
}

/** Herzform als Pfad (Mitte x/y, Größe r) – füllen oder umranden macht der Aufrufer. */
export function heartPath(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x, y + r * 0.9);
  ctx.bezierCurveTo(x - r * 1.6, y - r * 0.2, x - r * 0.8, y - r * 1.3, x, y - r * 0.45);
  ctx.bezierCurveTo(x + r * 0.8, y - r * 1.3, x + r * 1.6, y - r * 0.2, x, y + r * 0.9);
  ctx.closePath();
}

/** Kleine Partikel für Treffer, Funken und Konfetti – in Spiel-Koordinaten. */
export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  /** Schwerkraft (px/s²) */
  g?: number;
  heart?: boolean;
}

export function burst(list: Particle[], x: number, y: number, color: string, n = 12, speed = 120, opts: Partial<Particle> = {}) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = speed * (0.35 + Math.random() * 0.75);
    const life = 0.35 + Math.random() * 0.45;
    list.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, size: 1.5 + Math.random() * 2.5, color, g: 0, ...opts });
  }
}

export function stepParticles(list: Particle[], dt: number) {
  for (const p of list) {
    p.life -= dt;
    p.vy += (p.g ?? 0) * dt;
    p.vx *= 1 - dt * 1.8;
    p.vy *= 1 - dt * 1.2;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  let w = 0;
  for (const p of list) if (p.life > 0) list[w++] = p;
  list.length = w;
}

export function drawParticles(ctx: CanvasRenderingContext2D, list: Particle[]) {
  for (const p of list) {
    const k = Math.max(0, p.life / p.max);
    ctx.globalAlpha = Math.min(1, k * 1.6);
    ctx.fillStyle = p.color;
    if (p.heart) {
      heartPath(ctx, p.x, p.y, p.size * (0.6 + k * 0.4));
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (0.4 + k * 0.6), 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

/** Text mit dunklem Rand – für Punktzahlen mitten im Spielfeld. */
export function outlinedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, fill = '#fff', stroke = 'rgba(40,10,40,0.55)', width = 4) {
  ctx.lineJoin = 'round';
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}
