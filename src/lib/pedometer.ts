import { useSyncExternalStore } from 'react';
import { celebrateSteps } from './celebrate';
import { todayKey } from './date';
import { StepDetector } from './stepDetector';
import { stepsOn } from './steps';
import { actions, getData, getDevice } from './store';

/**
 * Schrittzähler über den Bewegungssensor. Browser liefern Sensordaten nur, solange die Seite
 * sichtbar ist – deshalb zählt Arta nur bei geöffneter App und hält dafür das Display wach.
 * Gezählte Schritte landen gesammelt alle 30 Sekunden im Datenstand (und damit beim Partner),
 * damit der Live-Sync nicht bei jedem Schritt hochlädt.
 */

export interface PedometerState {
  running: boolean;
  /** Tag, auf den gerade gezählt wird. */
  date: string;
  /** Gezählt, aber noch nicht gespeichert. */
  pending: number;
  /** Seit dem Start gezählt. */
  session: number;
  /** Kommen schon Sensordaten an? */
  sensing: boolean;
  error?: string;
}

const FLUSH_MS = 30_000;
/** So lange nach einem Tipp auf den Bildschirm zählt ein Stoß nicht als Schritt. */
const TOUCH_MS = 250;
const MILESTONE = 1000;

let state: PedometerState = { running: false, date: todayKey(), pending: 0, session: 0, sensing: false };
const listeners = new Set<() => void>();

function set(changes: Partial<PedometerState>) {
  state = { ...state, ...changes };
  listeners.forEach((l) => l());
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

export const getPedometer = () => state;

export function usePedometer(): PedometerState {
  return useSyncExternalStore(subscribe, getPedometer, getPedometer);
}

/** Eigene Schritte eines Tages inklusive der noch nicht gespeicherten. */
export function myLiveSteps(date: string): number {
  const stored = stepsOn(getData(), date, getDevice().me).count;
  return stored + (state.running && state.date === date ? state.pending : 0);
}

export const pedometerSupported = () => typeof window !== 'undefined' && 'DeviceMotionEvent' in window;

let detector = new StepDetector();
let lastFlush = 0;
let lastTouch = -Infinity;
let watchdog: number | undefined;
let wakeLock: WakeLockSentinel | null = null;

type RequestPermission = () => Promise<'granted' | 'denied'>;

const DENIED =
  'Arta darf den Bewegungssensor nicht nutzen. iPhone: Arta ganz schließen, neu öffnen und bei der Frage „Erlauben“ tippen. Android: in Chrome unter Website-Einstellungen „Bewegungssensoren“ erlauben.';

/** Muss direkt aus einem Tipp heraus aufgerufen werden (iPhone fragt sonst nicht nach Erlaubnis). */
export async function startPedometer(): Promise<boolean> {
  if (state.running) return true;
  if (!pedometerSupported()) {
    set({ error: 'Dieser Browser hat keinen Bewegungssensor, den Arta nutzen kann.' });
    return false;
  }
  const request = (DeviceMotionEvent as unknown as { requestPermission?: RequestPermission }).requestPermission;
  if (typeof request === 'function') {
    try {
      if ((await request.call(DeviceMotionEvent)) !== 'granted') {
        set({ error: DENIED });
        return false;
      }
    } catch {
      set({ error: DENIED });
      return false;
    }
  }
  detector = new StepDetector();
  lastFlush = Date.now();
  window.addEventListener('devicemotion', onMotion);
  window.addEventListener('pointerdown', onTouch, { capture: true, passive: true });
  document.addEventListener('visibilitychange', onVisibility);
  window.addEventListener('pagehide', flush);
  set({ running: true, date: todayKey(), pending: 0, session: 0, sensing: false, error: undefined });
  watchdog = window.setTimeout(() => {
    if (!state.running || state.sensing) return;
    stopPedometer();
    set({ error: 'Es kommen keine Bewegungsdaten an. Am Computer gibt es keinen Schrittsensor – probier es auf dem Handy.' });
  }, 4000);
  void keepAwake();
  return true;
}

export function stopPedometer() {
  if (!state.running) return;
  flush();
  window.removeEventListener('devicemotion', onMotion);
  window.removeEventListener('pointerdown', onTouch, { capture: true });
  document.removeEventListener('visibilitychange', onVisibility);
  window.removeEventListener('pagehide', flush);
  window.clearTimeout(watchdog);
  void wakeLock?.release().catch(() => undefined);
  wakeLock = null;
  set({ running: false, pending: 0 });
}

/** Schritte von Hand setzen (z. B. aus der Health-App) – die gezählten sind darin schon enthalten. */
export function setMySteps(date: string, count: number) {
  const before = myLiveSteps(date);
  if (state.running && state.date === date) set({ pending: 0 });
  actions.setSteps(date, count);
  const after = myLiveSteps(date);
  celebrateSteps(before, after, stepsOn(getData(), date, getDevice().me).goal, date === todayKey());
}

export function addMySteps(date: string, n: number) {
  const before = myLiveSteps(date);
  actions.addSteps(date, n);
  celebrateSteps(before, before + n, stepsOn(getData(), date, getDevice().me).goal, date === todayKey());
}

function flush() {
  lastFlush = Date.now();
  if (!state.pending) return;
  const { date, pending } = state;
  set({ pending: 0 });
  actions.addSteps(date, pending);
}

function onTouch() {
  lastTouch = performance.now();
}

function onVisibility() {
  if (document.visibilityState === 'hidden') flush();
  else if (state.running) void keepAwake();
}

async function keepAwake() {
  try {
    wakeLock = (await navigator.wakeLock?.request('screen')) ?? null;
  } catch {
    wakeLock = null; // nicht unterstützt oder Akku-Sparmodus
  }
}

function onMotion(e: DeviceMotionEvent) {
  const a = e.accelerationIncludingGravity;
  if (a?.x == null || a.y == null || a.z == null) return;
  if (!state.sensing) set({ sensing: true });
  const t = e.timeStamp || performance.now();
  const n = detector.push(t, a.x, a.y, a.z, t - lastTouch < TOUCH_MS);
  if (n) {
    const today = todayKey();
    if (today !== state.date) {
      // Mitternacht: Bisheriges dem alten Tag gutschreiben.
      flush();
      set({ date: today });
    }
    const before = myLiveSteps(today);
    set({ pending: state.pending + n, session: state.session + n });
    celebrateSteps(before, before + n, stepsOn(getData(), today, getDevice().me).goal, true, MILESTONE);
  }
  if (state.pending && Date.now() - lastFlush >= FLUSH_MS) flush();
}
