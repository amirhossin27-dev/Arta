import { useEffect, useRef, useState, type CSSProperties, type MouseEvent as RMouseEvent, type PointerEvent as RPointerEvent } from 'react';
import { cls } from '../lib/hooks';
import { buzz, hum, sfx, tone, useLoop } from './engine';
import {
  COUNTDOWN,
  ITEM_EMOJI,
  LANE_MAX,
  LAPS,
  VMAX,
  ahead,
  applyZap,
  assistInput,
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
  onRoad,
  packKart,
  stepKart,
  sweepBananas,
  tickCourse,
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
} from './kart';
import { drawOverlay, makeGround, markSkid, prepareGfx, stepParticles, type Cam, type DrawKart, type Ground, type Mood, type Particle } from './kartGfx';
import { otherSide, type Side } from './logic';
import type { GameProps, Player } from './types';

/** Nur im Test-Build: Die Karts der Menschen fahren von selbst. */
const AUTOPILOT = import.meta.env.VITE_KART_AUTOPILOT === '1';

/** So oft geht der eigene Stand online raus (Sekunden) */
const NET_EVERY = 0.11;
/** Meldet sich das andere Handy so lange nicht, ist das Rennen entschieden. */
const NET_TIMEOUT = 8;
const ITEMS: ItemKind[] = ['pilz', 'banane', 'pfeil'];

/** Kamera: Abstand hinter dem Kart und Brennweite – beim Turbo etwas weiter weg und weitwinkliger. */
const CAM_DIST = 50;
const CAM_DIST_BOOST = 57;
const FOCAL = 0.86;
const FOCAL_BOOST = 0.74;

const SETTINGS = 'arta.kart.v1';

interface Settings {
  assist: boolean;
  gl: boolean;
  /** Feste Tageszeit statt Wechsel (zum Ausprobieren) */
  mood?: Mood;
}

function loadSettings(): Settings {
  try {
    const v = JSON.parse(localStorage.getItem(SETTINGS) ?? '{}') as Partial<Settings>;
    return { assist: v.assist !== false, gl: v.gl !== false, mood: v.mood === 'tag' || v.mood === 'abend' ? v.mood : undefined };
  } catch {
    return { assist: true, gl: true };
  }
}

function saveAssist(assist: boolean) {
  try {
    localStorage.setItem(SETTINGS, JSON.stringify({ ...loadSettings(), assist }));
  } catch {
    // ohne Speicher gilt die Einstellung eben nur für dieses Rennen
  }
}

const TIPS_ASSIST = ['🛟 Lenkhilfe an: Das Kart fährt von selbst der Strecke nach.', '◀ ▶ antippen wechselt die Spur – in Kurven halten = Drift 🔥', 'Mitte tippen = Item einsetzen 🍄 🍌 💘'];
const TIPS_FREE = ['◀ ▶ lenken – in Kurven halten = Drift, loslassen = Mini-Turbo 🔥', 'Mitte tippen = Item einsetzen 🍄 🍌 💘', 'Zu schwer? Oben auf „Lenkhilfe“ tippen 🛟'];

// ───────────────────────── Effekte ─────────────────────────

const SPARK = ['#ffffff', '#6fd0ff', '#ff9a2e'];
const CONFETTI = ['#ff4f81', '#ffd84a', '#5fd4ff', '#b47bff', '#7be07b', '#ffffff'];

/** Wo die Hinterräder gerade sind – daraus werden die Bremsspuren */
function rearWheels(x: number, y: number, a: number): [number, number, number, number] {
  const fx = Math.cos(a);
  const fy = Math.sin(a);
  return [x - fx * 8 + fy * 6, y - fy * 8 - fx * 6, x - fx * 8 - fy * 6, y - fy * 8 + fx * 6];
}

/** Wie viele Teilchen in diesem Bild entstehen, bei `perSec` pro Sekunde */
const howMany = (perSec: number, dt: number) => Math.floor(perSec * dt + Math.random());

function puff(parts: Particle[], p: Omit<Particle, 'max'>) {
  parts.push({ ...p, max: p.life });
}

/** Spuren hinter einem fahrenden Kart: Driftfunken, Turboflammen, Staub auf der Wiese */
function trail(parts: Particle[], x: number, y: number, a: number, v: number, boost: boolean, driftDir: number, level: number, offroad: boolean, dt: number) {
  const fx = Math.cos(a);
  const fy = Math.sin(a);
  const rx = -fy;
  const ry = fx;
  const rnd = Math.random;
  if (driftDir !== 0) {
    const n = howMany(level ? 46 : 16, dt);
    for (let i = 0; i < n; i++) {
      for (const side of [-1, 1]) {
        const wx = x - fx * 8 + rx * side * 6;
        const wy = y - fy * 8 + ry * side * 6;
        puff(parts, {
          x: wx,
          y: wy,
          h: 0.8,
          vx: -fx * 25 + rx * side * (10 + rnd() * 30) + (rnd() - 0.5) * 20,
          vy: -fy * 25 + ry * side * (10 + rnd() * 30) + (rnd() - 0.5) * 20,
          vh: 18 + rnd() * 34,
          life: level ? 0.22 + rnd() * 0.18 : 0.45,
          size: level ? 0.9 + rnd() * 0.6 : 1.3,
          color: SPARK[level],
          kind: level ? 'spark' : 'smoke',
        });
      }
    }
  }
  if (boost) {
    const n = howMany(70, dt);
    for (let i = 0; i < n; i++) {
      const side = rnd() < 0.5 ? -1 : 1;
      puff(parts, {
        x: x - fx * 10 + rx * side * 3,
        y: y - fy * 10 + ry * side * 3,
        h: 3.2,
        vx: -fx * (40 + rnd() * 40) + (rnd() - 0.5) * 16,
        vy: -fy * (40 + rnd() * 40) + (rnd() - 0.5) * 16,
        vh: 4 + rnd() * 8,
        life: 0.14 + rnd() * 0.1,
        size: 1.6 + rnd() * 1.2,
        color: rnd() < 0.5 ? '#ffd23b' : '#ff6a1f',
        kind: 'flame',
      });
    }
  }
  if (offroad && v > 40) {
    const n = howMany(26, dt);
    for (let i = 0; i < n; i++) {
      const side = rnd() < 0.5 ? -1 : 1;
      puff(parts, {
        x: x - fx * 8 + rx * side * 6,
        y: y - fy * 8 + ry * side * 6,
        h: 0.5,
        vx: (rnd() - 0.5) * 30 - fx * 15,
        vy: (rnd() - 0.5) * 30 - fy * 15,
        vh: 20 + rnd() * 25,
        life: 0.5 + rnd() * 0.3,
        size: 1.2 + rnd() * 1.2,
        color: rnd() < 0.6 ? '#b9965e' : '#8fd27a',
        kind: 'dust',
      });
    }
  }
}

function burst(parts: Particle[], x: number, y: number, n: number, make: (rnd: () => number, i: number) => Partial<Particle>) {
  for (let i = 0; i < n; i++) {
    const p = make(Math.random, i);
    const life = p.life ?? 0.8;
    parts.push({ x, y, h: 2, vx: 0, vy: 0, vh: 0, size: 1.5, color: '#fff', kind: 'spark', ...p, life, max: life });
  }
}

/** Ereignisse eines Karts als Effekt in der Welt */
function eventFx(parts: Particle[], k: KartState, ev: KartEvent[]) {
  for (const e of ev) {
    if (e === 'hit') {
      burst(parts, k.x, k.y, 9, (rnd, i) => {
        const a = (i / 9) * Math.PI * 2;
        return { h: 9, vx: Math.cos(a) * 22, vy: Math.sin(a) * 22, vh: 14 + rnd() * 10, life: 0.9, size: 2.3, color: i % 3 ? '#ffe14a' : '#ffffff', kind: 'star' };
      });
    } else if (e === 'wall') {
      const fx = Math.cos(k.a);
      const fy = Math.sin(k.a);
      burst(parts, k.x + fx * 8, k.y + fy * 8, 7, (rnd) => ({ h: 2, vx: (rnd() - 0.5) * 40, vy: (rnd() - 0.5) * 40, vh: 10 + rnd() * 15, life: 0.6, size: 2.2, color: '#e9e4ef', kind: 'smoke' }));
    } else if (e === 'turbo' || e === 'pad' || e === 'pilz') {
      const fx = Math.cos(k.a);
      const fy = Math.sin(k.a);
      burst(parts, k.x - fx * 9, k.y - fy * 9, 14, (rnd) => ({
        h: 3,
        vx: -fx * (50 + rnd() * 60) + (rnd() - 0.5) * 50,
        vy: -fy * (50 + rnd() * 60) + (rnd() - 0.5) * 50,
        vh: 6 + rnd() * 20,
        life: 0.25 + rnd() * 0.15,
        size: 2 + rnd() * 1.5,
        color: e === 'turbo' ? (k.drift >= 1.1 ? '#ff9a2e' : '#6fd0ff') : rnd() < 0.5 ? '#ffd23b' : '#ff6a1f',
        kind: 'flame',
      }));
    }
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
  warn?: boolean;
}

interface Race {
  ph: Phase;
  count: number;
  t: number;
  karts: Partial<Record<Side, KartState>>;
  remote: Remote | null;
  course: Course;
  boxSeen: number[];
  winner: Side | null;
  endIn: number;
  ended: boolean;
  netT: number;
  seq: number;
  lastN: number;
  lastSeq: number;
  cams: Partial<Record<Side, Cam>>;
  msgs: Partial<Record<Side, Msg>>;
  shake: Partial<Record<Side, number>>;
  parts: Particle[];
  /** Letzte Radpositionen der Karts, die gerade Spuren ziehen */
  skids: Map<string, [number, number, number, number]>;
  hudT: number;
  beeped: number;
}

interface Hud {
  lap: number;
  time: string;
  place: number;
  item: string;
  rolling: boolean;
  speed: number;
  /** Startampel: 1–3 rote Lampen, 4 = grün */
  lights: number;
  tip: string | null;
  msg: Msg | null;
}

interface ViewGfx {
  ground: Ground;
  fx: HTMLCanvasElement;
  ready: boolean;
  fit: () => void;
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
    const course = newCourse(track);
    race.current = {
      ph: online ? 'wait' : 'count',
      count: COUNTDOWN,
      t: 0,
      karts,
      remote: null,
      course,
      boxSeen: [...course.boxes],
      winner: null,
      endIn: 0,
      ended: false,
      netT: 0,
      seq: 0,
      lastN: -1,
      lastSeq: -1,
      cams: {},
      msgs: {},
      shake: {},
      parts: [],
      skids: new Map(),
      hudT: 0,
      beeped: 0,
    };
  }

  const netRef = useRef(net);
  netRef.current = net;
  const endRef = useRef(onEnd);
  endRef.current = onEnd;

  const settings = useRef(loadSettings());
  /** Jedes zweite Rennen bei Abendrot */
  const mood: Mood = settings.current.mood ?? (starter === 'p1' ? 'tag' : 'abend');
  const [assist, setAssist] = useState<Record<Side, boolean>>(() => ({ p1: settings.current.assist, p2: settings.current.assist }));
  const assistRef = useRef(assist);
  assistRef.current = assist;

  const groundHosts = useRef<Partial<Record<Side, HTMLDivElement | null>>>({});
  const fxCanvases = useRef<Partial<Record<Side, HTMLCanvasElement | null>>>({});
  const screens = useRef<Partial<Record<Side, HTMLDivElement | null>>>({});
  const gfx = useRef<Partial<Record<Side, ViewGfx>>>({});
  const padEls = useRef<Partial<Record<Side, HTMLDivElement | null>>>({});
  const pointers = useRef(new Map<number, { side: Side; zone: Zone }>());
  const keys = useRef(new Set<string>());
  const pressed = useRef<Record<Side, { l: boolean; r: boolean; use: boolean }>>({ p1: { l: false, r: false, use: false }, p2: { l: false, r: false, use: false } });
  const engine = useRef<ReturnType<typeof hum>>(null);
  const [hud, setHud] = useState<Partial<Record<Side, Hud>>>({});
  const [phase, setPhase] = useState<Phase>(race.current.ph);
  const [gfxKind, setGfxKind] = useState<string>('');
  /** Bildschärfe: Ruckelt es, rechnen wir mit weniger Pixeln. */
  const quality = useRef({ scale: 1, acc: 0, n: 0 });

  // Boden (WebGL oder Software) und Effekt-Ebene anlegen und an den Platz anpassen
  useEffect(() => {
    prepareGfx(track);
    const obs: ResizeObserver[] = [];
    const made: ViewGfx[] = [];
    for (const side of views) {
      const host = groundHosts.current[side];
      const fx = fxCanvases.current[side];
      if (!host || !fx) continue;
      const fit = () => {
        const r = host.getBoundingClientRect();
        if (r.width < 10 || r.height < 10) return;
        const dpr = Math.max(0.75, Math.min(2, window.devicePixelRatio || 1) * quality.current.scale);
        v.ground.resize(r.width, r.height, dpr);
        const w = Math.round(r.width * dpr);
        const h = Math.round(r.height * dpr);
        if (fx.width !== w || fx.height !== h) {
          fx.width = w;
          fx.height = h;
        }
        v.ready = true;
      };
      const v: ViewGfx = { ground: makeGround(host, track, settings.current.gl), fx, ready: false, fit };
      made.push(v);
      gfx.current[side] = v;
      fit();
      const ro = new ResizeObserver(fit);
      ro.observe(host);
      obs.push(ro);
    }
    setGfxKind(made[0]?.ground.kind ?? '');
    return () => {
      obs.forEach((o) => o.disconnect());
      for (const v of made) v.ground.destroy();
      gfx.current = {};
    };
  }, [duo]);

  // Kein Markieren, keine Lupe, kein Kopieren-Menü: Ein langer Finger auf dem Bildschirm heißt hier Lenken.

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

  const toggleAssist = (side: Side) => {
    const on = !assistRef.current[side];
    const k = race.current!.karts[side];
    if (k && on) k.lane = Math.max(-LANE_MAX, Math.min(LANE_MAX, k.lat));
    setAssist((a) => ({ ...a, [side]: on }));
    saveAssist(on);
    tone(on ? 880 : 520, 70, 'triangle', 0.05);
  };

  const humanInput = (side: Side, k: KartState, dt: number): Input => {
    const p = pressed.current[side];
    const keyset = keys.current;
    const own = views[views.length - 1] === side;
    const left = p.l || (own && keyset.has('arrowleft')) || ((duo ? side === 'p2' : true) && keyset.has('a'));
    const right = p.r || (own && keyset.has('arrowright')) || ((duo ? side === 'p2' : true) && keyset.has('d'));
    const use = p.use;
    p.use = false;
    const steer = (right ? 1 : 0) - (left ? 1 : 0);
    if (assistRef.current[side]) return { ...assistInput(k, track, steer, dt), use };
    return { steer, use };
  };

  const say = (side: Side, text: string, sec = 1.3, big = false) => {
    race.current!.msgs[side] = { text, until: performance.now() + sec * 1000, big };
  };

  const rivalOf = (R: Race, side: Side): Rival | null => {
    if (online) return R.remote;
    return R.karts[otherSide(side)] ?? null;
  };

  const feedback = (side: Side, ev: KartEvent[]) => {
    const R = race.current!;
    const k = R.karts[side]!;
    eventFx(R.parts, k, ev);
    if (!views.includes(side) || !ev.length) return;
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
        R.shake[side] = Math.max(R.shake[side] ?? 0, 0.18);
      } else if (e === 'hit') {
        sfx.miss();
        buzz([30, 40, 30]);
        say(side, 'Autsch! 💫');
        R.shake[side] = 0.45;
      } else if (e === 'lap') {
        sfx.point();
        say(side, `Runde ${k.lap}/${LAPS}`);
      } else if (e === 'final') {
        sfx.match();
        say(side, 'Letzte Runde! 🏁', 1.6);
      } else if (e === 'finish') {
        sfx.point();
        say(side, `Ziel! 🏁 ${fmtTime(k.fin ?? 0)}`, 30);
        burst(R.parts, k.x, k.y, 40, (rnd) => ({
          h: 4,
          vx: (rnd() - 0.5) * 90,
          vy: (rnd() - 0.5) * 90,
          vh: 40 + rnd() * 50,
          life: 1.4 + rnd() * 0.6,
          size: 1.3,
          color: CONFETTI[Math.floor(rnd() * CONFETTI.length)],
          kind: 'confetti',
        }));
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
      const inp = auto ? kiInput(k, track, rival, Math.random, dt) : humanInput(side, k, dt);
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
    // Aufgefahrene Item-Boxen zerplatzen in Konfetti
    R.course.boxes.forEach((left, i) => {
      if (left > 0 && R.boxSeen[i] <= 0) {
        const b = track.boxes[i];
        burst(R.parts, b.x, b.y, 16, (rnd) => ({
          h: 6,
          vx: (rnd() - 0.5) * 70,
          vy: (rnd() - 0.5) * 70,
          vh: 25 + rnd() * 35,
          life: 0.9 + rnd() * 0.4,
          size: 1.2,
          color: CONFETTI[Math.floor(rnd() * CONFETTI.length)],
          kind: 'confetti',
        }));
      }
      R.boxSeen[i] = left;
    });
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
    const time = now / 1000;
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

    // Ruckelt es (schon beim Countdown gemessen), wird das Bild etwas gröber gerechnet.
    if (R.ph === 'count' || R.ph === 'race') {
      const q = quality.current;
      q.acc += dt;
      q.n++;
      if (q.acc >= 1.2) {
        const avg = q.acc / q.n;
        if (avg > 1 / 40 && q.scale > 0.5) {
          q.scale = Math.max(0.5, q.scale * (avg > 1 / 25 ? 0.6 : 0.75));
          for (const side of views) gfx.current[side]?.fit();
        }
        q.acc = 0;
        q.n = 0;
      }
    }

    // Motor
    if (engine.current) {
      const ks = views.map((s) => R.karts[s]!);
      const v = ks.reduce((sum, k) => sum + k.v, 0) / ks.length;
      engine.current.set(48 + v * 0.42, 0.022);
    }

    // Spuren hinter den Karts: Partikel und Reifenspuren auf dem Asphalt
    const racing = R.ph === 'race' || R.ph === 'end';
    const skid = (key: string, x: number, y: number, a: number, on: boolean, dark: boolean) => {
      if (!on || !racing) {
        R.skids.delete(key);
        return;
      }
      const now4 = rearWheels(x, y, a);
      const last = R.skids.get(key);
      if (!last) R.skids.set(key, now4);
      else if (Math.hypot(now4[0] - last[0], now4[1] - last[1]) > 2) {
        markSkid(
          track,
          [
            [last[0], last[1], now4[0], now4[1]],
            [last[2], last[3], now4[2], now4[3]],
          ],
          dark ? 0.26 : 0.18,
        );
        R.skids.set(key, now4);
      }
    };
    const dk: (DrawKart & { side: Side | null })[] = [];
    for (const side of Object.keys(R.karts).filter(isSide)) {
      const k = R.karts[side]!;
      const level = driftLevel(k);
      const off = !onRoad(k);
      if (racing) trail(R.parts, k.x, k.y, k.a, k.v, k.boost > 0, k.driftDir, level, off, dt);
      skid(side, k.x, k.y, k.a, !off && ((k.driftDir !== 0 && k.v > 60) || (k.spin > 0 && k.v > 10)), level > 0 || k.spin > 0);
      dk.push({
        x: k.x,
        y: k.y,
        a: k.a,
        yaw: k.spin > 0 ? (1.1 - k.spin) * Math.PI * 3.6 : k.driftDir * 0.34 + k.st * 0.07,
        bob: off && k.v > 30 ? Math.abs(Math.sin(time * 24)) * 0.9 : 0,
        roll: Math.max(-0.16, Math.min(0.16, -k.st * 0.09 - k.driftDir * 0.07)) * Math.min(1, k.v / 80),
        color: players[side].color,
        emoji: players[side].emoji,
        own: false,
        side,
      });
    }
    if (R.remote) {
      const o = otherSide(me);
      const nk = R.remote.pkt;
      const dir = Math.sign(nk.d);
      if (racing) trail(R.parts, R.remote.x, R.remote.y, R.remote.a, nk.v, !!nk.b, dir, Math.abs(nk.d), false, dt);
      skid('remote', R.remote.x, R.remote.y, R.remote.a, (dir !== 0 && nk.v > 60) || !!nk.sp, Math.abs(nk.d) > 0);
      dk.push({
        x: R.remote.x,
        y: R.remote.y,
        a: R.remote.a,
        yaw: nk.sp ? (time * 11) % (Math.PI * 2) : dir * 0.34,
        bob: 0,
        roll: -dir * 0.07,
        color: players[o].color,
        emoji: players[o].emoji,
        own: false,
        side: null,
      });
    }
    stepParticles(R.parts, dt);

    // Bilder malen
    const haz: Hazard[] = [...Object.values(R.karts).flatMap((k) => k!.haz), ...(R.remote?.haz ?? [])];
    for (const side of views) {
      const v = gfx.current[side];
      const k = R.karts[side]!;
      const cam = (R.cams[side] ??= { x: k.x, y: k.y, a: k.a, dist: CAM_DIST, focal: FOCAL });
      const boosting = k.boost > 0;
      const ease = Math.min(1, dt * 4);
      cam.a = wrapAngle(cam.a + wrapAngle(k.a - cam.a) * Math.min(1, dt * 5.5));
      cam.x = k.x;
      cam.y = k.y;
      cam.focal += ((boosting ? FOCAL_BOOST : FOCAL - 0.04 * Math.min(1, k.v / VMAX)) - cam.focal) * ease;
      cam.dist += ((boosting ? CAM_DIST_BOOST : CAM_DIST) - cam.dist) * ease;

      // Wackeln bei Treffern
      const scr = screens.current[side];
      const sh = R.shake[side] ?? 0;
      if (scr && (sh > 0 || scr.style.transform)) {
        R.shake[side] = Math.max(0, sh - dt);
        const amp = Math.min(1, sh * 3) * 7;
        scr.style.transform = sh > 0 ? `translate(${(Math.random() - 0.5) * amp}px, ${(Math.random() - 0.5) * amp}px)` : '';
      }

      if (!v?.ready) continue;
      v.ground.draw(cam, mood);
      drawOverlay(v.fx, track, cam, {
        karts: dk.map((d) => ({ ...d, own: d.side === side })),
        haz,
        boxes: R.course.boxes,
        parts: R.parts,
        time,
        streaks: boosting ? Math.min(1, k.boost * 2) : 0,
        mood,
      });
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
        let lights = 0;
        let tip: string | null = null;
        if (R.ph === 'wait') msg = { text: `Warte auf ${players[otherSide(me)].name} …`, until: Infinity };
        else if (R.ph === 'count') {
          const n = Math.max(1, Math.ceil(R.count));
          msg = { text: String(n), until: Infinity, big: true };
          lights = 4 - n;
        } else {
          const m = R.msgs[side];
          if (m && m.until > now) msg = m;
          if (R.ph === 'race' && R.t < 0.9) lights = 4;
          if (R.ph === 'race' && k.fin === null && k.wrong > 1) msg = { text: '↩ Falsche Richtung!', until: Infinity, warn: true };
        }
        if (R.ph === 'wait' || R.ph === 'count') {
          const tips = assistRef.current[side] ? TIPS_ASSIST : TIPS_FREE;
          tip = tips[Math.floor(time / 2.6) % tips.length];
        }
        next[side] = {
          lap: k.lap,
          time: fmtTime(k.fin ?? R.t),
          place: rival ? (ahead(k, rival) ? 1 : 2) : 1,
          item: k.roll > 0 ? ITEM_EMOJI[ITEMS[Math.floor(now / 90) % 3]] : k.item ? ITEM_EMOJI[k.item] : '',
          rolling: k.roll > 0,
          speed: Math.round(k.v * 0.6),
          lights,
          tip,
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
        const helped = assist[side];
        return (
          <div key={side} className={cls('kart-view', flipped && 'flip')} style={{ '--pc': players[side].color } as CSSProperties}>
            <div className="kart-screen" data-gfx={gfxKind} ref={(el) => void (screens.current[side] = el)}>
              <div className="kart-ground" ref={(el) => void (groundHosts.current[side] = el)} />
              <canvas className="kart-fx" ref={(el) => void (fxCanvases.current[side] = el)} />
              <div className="kart-hud">
                <div className="kart-top">
                  <div className="kart-info">
                    <span className="kart-lap">
                      {duo && <b>{players[side].emoji}</b>} Runde {h?.lap ?? 1}/{LAPS}
                    </span>
                    <span className="kart-time">{h?.time ?? fmtTime(0)}</span>
                    {solo && best !== undefined && <span className="kart-best">🏆 {fmtTime(best)}</span>}
                    {!AUTOPILOT && (
                      <button type="button" className={cls('kart-assist', helped && 'on')} aria-pressed={helped} onClick={(e) => {
                          e.currentTarget.blur();
                          toggleAssist(side);
                        }}
                      >
                        🛟 Lenkhilfe {helped ? 'an' : 'aus'}
                      </button>
                    )}
                  </div>
                  <div className={cls('kart-item', h?.rolling && 'rolling', !h?.item && 'empty', h?.item && !h.rolling && 'ready')}>{h?.item ?? ''}</div>
                </div>
                {(h?.lights ?? 0) > 0 && (
                  <div className={cls('kart-lights', h!.lights === 4 && 'go')}>
                    {[1, 2, 3].map((n) => (
                      <i key={n} className={cls(h!.lights === 4 ? 'g' : n <= h!.lights && 'r')} />
                    ))}
                  </div>
                )}
                {h?.tip && (
                  <div key={h.tip} className="kart-tip">
                    {h.tip}
                  </div>
                )}
                {phase !== 'wait' && phase !== 'count' && (
                  <div className="kart-speed">
                    <b>{h?.speed ?? 0}</b> km/h
                  </div>
                )}
                {!solo && phase !== 'wait' && phase !== 'count' && <div className={cls('kart-place', `p${h?.place ?? 1}`)}>{h?.place ?? 1}.</div>}
                {h?.msg && (
                  <div key={h.msg.text} className={cls('kart-msg', h.msg.big && 'big', h.msg.warn && 'warn')}>
                    {h.msg.text}
                  </div>
                )}
              </div>
            </div>
            <div className="kart-pad" ref={(el) => void (padEls.current[side] = el)} {...padHandlers(side, flipped)}>
              <div data-z="l" aria-label={helped ? 'Spur nach links' : 'Links lenken'}>
                ◀
              </div>
              <div data-z="u" className={cls('kart-use', !h?.item && 'empty')} aria-label="Item einsetzen">
                {h?.item && !h.rolling ? h.item : '✦'}
              </div>
              <div data-z="r" aria-label={helped ? 'Spur nach rechts' : 'Rechts lenken'}>
                ▶
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
