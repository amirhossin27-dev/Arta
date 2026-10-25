import { useEffect, useLayoutEffect, useRef } from 'react';
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

export function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fill();
}
