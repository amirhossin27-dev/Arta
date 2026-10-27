import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { buzz, heartPath, noise, sfx, tone, unlockAudio, useLoop, useTouchLock } from './engine';
import { otherSide, type Side } from './logic';
import {
  BODY_H,
  COUNT_T,
  EYE,
  HOME,
  MAG,
  MATCH_T,
  MAX_HP,
  NET_EVERY,
  NET_TIMEOUT,
  RELOAD,
  SOLO_T,
  SPEED,
  WIN,
  botThink,
  decide,
  dir3,
  fire,
  followMe,
  fwd,
  los,
  moveFighter,
  newBot,
  newFighter,
  packMe,
  pickSpawn,
  respawn,
  rightOf,
  scoreOf,
  segBody,
  segWorld,
  spawnTarget,
  stain,
  startReload,
  stepBall,
  takeHit,
  tickFighter,
  type Ball,
  type Bot,
  type Fighter,
  type NetFlow,
  type NetMe,
  type Target,
  type V3,
} from './strike';
import { createGfx, hexRgb, type Gfx, type RGB } from './strikeGfx';
import type { GameProps, Player } from './types';

/** Teamfarben: Gastgeber/du pink, der andere türkis */
const TEAM: Record<Side, string> = { p1: '#ff3d8b', p2: '#14b8d4' };
const TEAM_RGB: Record<Side, RGB> = { p1: hexRgb(TEAM.p1), p2: hexRgb(TEAM.p2) };
const KI_LEVEL = 0.38;

type Phase = 'wait' | 'count' | 'play' | 'over';

interface Flow {
  ph: Phase;
  cd: number;
  left: number;
  sudden: boolean;
  win: Side | null;
  overT: number;
}

interface HostMsg {
  f?: NetMe;
  fl?: NetFlow;
}
interface GuestMsg {
  f?: NetMe;
}

interface World {
  f: Record<Side, Fighter>;
  balls: Ball[];
  bot: Bot;
  flow: Flow;
  n: number;
  targets: Target[];
  tgT: number;
  score: number;
  t: number;
  gone: Record<Side, number>;
}

/** Farbspritzer auf dem Bildschirm (wenn man getroffen wird) */
interface ScreenSplat {
  x: number;
  y: number;
  r: number;
  t: number;
  max: number;
  seed: number;
}

interface Banner {
  text: string;
  sub?: string;
  t: number;
  color: string;
}

function newWorld(solo: boolean): World {
  return {
    f: { p1: newFighter(HOME.p1), p2: newFighter(HOME.p2) },
    balls: [],
    bot: newBot(),
    flow: { ph: 'count', cd: COUNT_T, left: solo ? SOLO_T : MATCH_T, sudden: false, win: null, overT: 0 },
    n: 0,
    targets: [],
    tgT: 0.6,
    score: 0,
    t: 0,
    gone: { p1: 0, p2: 0 },
  };
}

const seeded = (seed: number) => {
  let s = seed % 2147483647 || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
};

/** Ein Farbklecks aus Kreisen und Tropfnasen */
function paintBlob(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, seed: number) {
  const rnd = seeded(seed);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  for (let i = 0; i < 9; i++) {
    const a = rnd() * Math.PI * 2;
    const d = r * (0.6 + rnd() * 0.6);
    const rr = r * (0.25 + rnd() * 0.35);
    ctx.moveTo(x + Math.cos(a) * d + rr, y + Math.sin(a) * d);
    ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, rr, 0, Math.PI * 2);
  }
  for (let i = 0; i < 3; i++) {
    const dx = (rnd() - 0.5) * r * 1.2;
    const len = r * (0.6 + rnd() * 1.1);
    const w = r * (0.08 + rnd() * 0.06);
    ctx.rect(x + dx - w, y, w * 2, len);
    ctx.moveTo(x + dx + w * 1.4, y + len);
    ctx.arc(x + dx, y + len, w * 1.4, 0, Math.PI * 2);
  }
  ctx.fill();
}

const mmss = (s: number) => {
  const t = Math.max(0, Math.ceil(s));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

export function Strike({ mode, p1, p2, net, best, onEnd }: GameProps) {
  const online = mode === 'online' && !!net;
  const solo = mode === 'solo';
  const cpu = mode === 'cpu';
  const me: Side = online ? net!.me : 'p1';
  const them = otherSide(me);
  const players: Record<Side, Player> = { p1, p2 };
  const nameOf = (s: Side) => (players[s].cpu ? 'KI' : players[s].name);

  const [noGl, setNoGl] = useState(false);
  const [locked, setLocked] = useState(false);
  const [mouse, setMouse] = useState(false);

  const root = useRef<HTMLDivElement>(null);
  const view = useRef<HTMLDivElement>(null);
  const glCv = useRef<HTMLCanvasElement>(null);
  const hudCv = useRef<HTMLCanvasElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const fireEl = useRef<HTMLDivElement>(null);
  const gfx = useRef<Gfx | null>(null);
  const size = useRef({ w: 1, h: 1, dpr: 1, q: 1 });
  const perf = useRef({ acc: 0, n: 0 });

  const world = useRef<World>(newWorld(solo));
  if (online && world.current.flow.ph === 'count' && world.current.t === 0) world.current.flow.ph = 'wait';

  const inp = useRef({
    stick: null as number | null,
    mx: 0,
    my: 0,
    look: null as number | null,
    lx: 0,
    ly: 0,
    fire: null as number | null,
    fx: 0,
    fy: 0,
    dYaw: 0,
    dPitch: 0,
    mouseFire: false,
    reload: false,
    keys: new Set<string>(),
  });
  const hud = useRef({
    splats: [] as ScreenSplat[],
    hitT: 0,
    hurtT: 0,
    hurtFrom: 0,
    banner: null as Banner | null,
    lastCount: -1,
    onFoe: false,
    seed: 1,
    hint: 7,
    ph: '' as Phase | '',
  });

  const netRef = useRef(net);
  netRef.current = net;
  const endRef = useRef(onEnd);
  endRef.current = onEnd;
  const ended = useRef(false);
  const sim = useRef({
    seq: 0,
    netT: 0,
    lastN: -1,
    lastSeq: -1,
    heard: 0,
    pkt: null as NetMe | null,
    pktAt: 0,
    seenShot: 0,
    seenHit: 0,
    sent: [] as { b: Ball; at: number }[],
    hits: [] as { n: number; p: V3; at: number }[],
    hitN: 0,
    urgent: false,
  });

  useTouchLock(root);

  // ───── WebGL einrichten ─────
  useEffect(() => {
    const cv = glCv.current;
    const wrap = view.current;
    if (!cv || !wrap) return;
    let g: Gfx | null = null;
    try {
      g = createGfx(cv, [TEAM_RGB.p1, TEAM_RGB.p2]);
    } catch (e) {
      console.warn('Herz-Strike: kein WebGL', e);
      g = null;
    }
    if (!g) {
      setNoGl(true);
      return;
    }
    gfx.current = g;
    const fit = () => {
      const r = wrap.getBoundingClientRect();
      const s = size.current;
      s.w = Math.max(1, r.width);
      s.h = Math.max(1, r.height);
      s.dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(s.w * s.dpr * s.q);
      cv.height = Math.round(s.h * s.dpr * s.q);
      const hc = hudCv.current;
      if (hc) {
        hc.width = Math.round(s.w * s.dpr);
        hc.height = Math.round(s.h * s.dpr);
      }
      g!.resize(s.w, s.h);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    (size.current as { fit?: () => void }).fit = fit;
    if (import.meta.env.DEV) {
      const win = window as unknown as { __strike?: unknown; __strikes?: Record<string, unknown> };
      win.__strike = { world, inp, me };
      win.__strikes = { ...win.__strikes, [me]: { world, inp, me } };
    }
    return () => {
      ro.disconnect();
      g!.dispose();
      gfx.current = null;
    };
  }, []);

  // ───── Maus: Zeiger fangen ─────
  useEffect(() => {
    const onLock = () => setLocked(document.pointerLockElement === view.current);
    const onMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== view.current) return;
      inp.current.dYaw -= e.movementX * 0.0024;
      inp.current.dPitch -= e.movementY * 0.0024;
    };
    const onDown = (e: MouseEvent) => {
      if (document.pointerLockElement === view.current && e.button === 0) inp.current.mouseFire = true;
    };
    const onUp = () => {
      inp.current.mouseFire = false;
    };
    document.addEventListener('pointerlockchange', onLock);
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('pointerlockchange', onLock);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('mouseup', onUp);
      if (document.pointerLockElement) document.exitPointerLock?.();
    };
  }, []);

  // ───── Tastatur ─────
  useEffect(() => {
    const keys = inp.current.keys;
    const down = (e: KeyboardEvent) => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(k)) e.preventDefault();
      if (k === 'r') inp.current.reload = true;
      keys.add(k);
    };
    const up = (e: KeyboardEvent) => keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    const blur = () => keys.clear();
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  /** Bogenmaß je Pixel beim Wischen */
  const lookSens = () => 2.5 / Math.max(260, size.current.w);

  // ───── Blick: Wischen im Bild ─────
  const viewHandlers = {
    onPointerDown: (e: RPointerEvent<HTMLDivElement>) => {
      unlockAudio();
      if (e.pointerType === 'mouse') {
        setMouse(true);
        const el = view.current;
        if (el && document.pointerLockElement !== el && el.requestPointerLock) {
          try {
            const r = el.requestPointerLock() as unknown as Promise<void> | undefined;
            r?.catch?.(() => undefined);
          } catch {
            // Ohne Zeigerfang: einfach mit gedrückter Maus ziehen
          }
        }
        if (document.pointerLockElement === el) return;
      }
      const i = inp.current;
      if (i.look !== null) return;
      i.look = e.pointerId;
      i.lx = e.clientX;
      i.ly = e.clientY;
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    onPointerMove: (e: RPointerEvent<HTMLDivElement>) => {
      const i = inp.current;
      if (i.look !== e.pointerId) return;
      const k = lookSens();
      i.dYaw -= (e.clientX - i.lx) * k;
      i.dPitch -= (e.clientY - i.ly) * k;
      i.lx = e.clientX;
      i.ly = e.clientY;
    },
    onPointerUp: (e: RPointerEvent<HTMLDivElement>) => {
      if (inp.current.look === e.pointerId) inp.current.look = null;
    },
    onPointerCancel: (e: RPointerEvent<HTMLDivElement>) => {
      if (inp.current.look === e.pointerId) inp.current.look = null;
    },
  };

  // ───── Stick: laufen ─────
  const stickMove = (el: HTMLDivElement, x: number, y: number) => {
    const r = el.getBoundingClientRect();
    const rad = r.width / 2;
    let dx = (x - (r.left + rad)) / (rad * 0.62);
    let dy = (y - (r.top + rad)) / (rad * 0.62);
    const l = Math.hypot(dx, dy);
    if (l > 1) {
      dx /= l;
      dy /= l;
    }
    inp.current.mx = dx;
    inp.current.my = -dy;
    const k = knob.current;
    if (k) {
      k.style.transform = `translate(${dx * rad * 0.5}px, ${dy * rad * 0.5}px)`;
      k.classList.add('on');
    }
  };
  const stickEnd = () => {
    const i = inp.current;
    i.stick = null;
    i.mx = 0;
    i.my = 0;
    const k = knob.current;
    if (k) {
      k.style.transform = '';
      k.classList.remove('on');
    }
  };
  const stickHandlers = {
    onPointerDown: (e: RPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      unlockAudio();
      inp.current.stick = e.pointerId;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      stickMove(e.currentTarget, e.clientX, e.clientY);
    },
    onPointerMove: (e: RPointerEvent<HTMLDivElement>) => {
      if (inp.current.stick === e.pointerId) stickMove(e.currentTarget, e.clientX, e.clientY);
    },
    onPointerUp: (e: RPointerEvent<HTMLDivElement>) => {
      if (inp.current.stick === e.pointerId) stickEnd();
    },
    onPointerCancel: (e: RPointerEvent<HTMLDivElement>) => {
      if (inp.current.stick === e.pointerId) stickEnd();
    },
  };

  // ───── Feuerknopf: halten = schießen, dabei ziehen = zielen ─────
  const fireHandlers = {
    onPointerDown: (e: RPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      unlockAudio();
      const i = inp.current;
      i.fire = e.pointerId;
      i.fx = e.clientX;
      i.fy = e.clientY;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      e.currentTarget.classList.add('on');
    },
    onPointerMove: (e: RPointerEvent<HTMLDivElement>) => {
      const i = inp.current;
      if (i.fire !== e.pointerId) return;
      const k = lookSens();
      i.dYaw -= (e.clientX - i.fx) * k;
      i.dPitch -= (e.clientY - i.fy) * k;
      i.fx = e.clientX;
      i.fy = e.clientY;
    },
    onPointerUp: (e: RPointerEvent<HTMLDivElement>) => {
      if (inp.current.fire === e.pointerId) inp.current.fire = null;
      e.currentTarget.classList.remove('on');
    },
    onPointerCancel: (e: RPointerEvent<HTMLDivElement>) => {
      if (inp.current.fire === e.pointerId) inp.current.fire = null;
      e.currentTarget.classList.remove('on');
    },
  };
  const reloadHandlers = {
    onPointerDown: (e: RPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      inp.current.reload = true;
    },
  };

  // ───── Ereignisse: Ton, Effekte, Anzeige ─────
  const g = () => gfx.current;

  const onShot = (b: Ball, mine: boolean) => {
    const team = TEAM_RGB[b.side];
    // Beim eigenen Schuss kein Farbnebel direkt vor der Nase
    if (!mine) g()?.burst([b.p[0], b.p[1], b.p[2]], team, 4, 1.4);
    if (mine) {
      noise(55, 0.05, 900, 260);
      tone(170, 70, 'triangle', 0.05, 80);
    } else {
      const f = world.current.f[me];
      const d = Math.hypot(b.p[0] - f.x, b.p[2] - f.z);
      noise(50, 0.035 * Math.max(0.2, 1 - d / 30), 800, 260);
    }
  };

  const splatWorld = (b: Ball, p: V3, n: V3) => {
    g()?.splat(p, n, TEAM_RGB[b.side], 0.36);
    g()?.burst([p[0] + n[0] * 0.05, p[1] + n[1] * 0.05, p[2] + n[2] * 0.05], TEAM_RGB[b.side], 7, 2.2);
    const f = world.current.f[me];
    const d = Math.hypot(p[0] - f.x, p[2] - f.z);
    if (d < 14) noise(60, 0.03 * (1 - d / 14), 520, 180);
  };

  /** Mich hat etwas getroffen (online: vom anderen Handy gemeldet) */
  const gotHit = (w: World, p: V3, by: Side) => {
    const f = w.f[me];
    if (!f.alive || f.shield > 0) return;
    stain(f, p);
    const out = takeHit(f);
    const h = hud.current;
    h.hurtT = 1;
    h.hurtFrom = Math.atan2(p[0] - f.x, p[2] - f.z);
    for (let i = 0; i < (out ? 7 : 2); i++) {
      // Nicht mitten aufs Fadenkreuz: Kleckse landen eher am Rand
      const a = Math.random() * Math.PI * 2;
      const d = 0.22 + Math.random() * 0.3;
      h.splats.push({ x: 0.5 + Math.cos(a) * d, y: 0.5 + Math.sin(a) * d * 0.9, r: 0.07 + Math.random() * 0.08 + (out ? 0.05 : 0), t: out ? 2.2 : 1.3, max: out ? 2.2 : 1.3, seed: ++h.seed * 977 });
    }
    noise(150, 0.09, 420, 110);
    buzz(out ? [40, 60, 80] : 35);
    g()?.burst([f.x, 1.3, f.z], TEAM_RGB[by], out ? 30 : 10, 3.5);
    if (out) {
      knockedOut(w, me, by);
      h.banner = { text: 'Voll erwischt! 💦', sub: 'Gleich geht’s weiter …', t: 2, color: TEAM[by] };
      tone(320, 380, 'triangle', 0.06, 120);
    }
  };

  /** Jemand ist voller Farbe: Effekte am Boden */
  const knockedOut = (w: World, side: Side, by: Side) => {
    const f = w.f[side];
    g()?.splat([f.x, 0.01, f.z], [0, 1, 0], TEAM_RGB[by], 1.1);
    g()?.burst([f.x, 1.1, f.z], TEAM_RGB[by], 26, 4.5);
    g()?.burst([f.x, 1.6, f.z], [1, 0.42, 0.62], 10, 2.2, true);
  };

  /** Mein Schuss hat getroffen */
  const scored = (w: World, side: Side, p: V3, out: boolean) => {
    const h = hud.current;
    h.hitT = 0.3;
    tone(1250, 60, 'sine', 0.06);
    window.setTimeout(() => tone(1660, 80, 'sine', 0.05), 55);
    g()?.burst(p, TEAM_RGB[me], 12, 3);
    if (out) {
      knockedOut(w, side, me);
      h.banner = { text: 'Volltreffer! 💘', sub: '+1 Punkt', t: 1.6, color: TEAM[me] };
      sfx.point();
    }
  };

  // ───── Online ─────
  const receive = (w: World, now: number) => {
    const n = netRef.current;
    const s = sim.current;
    if (!n) return;
    let msg: HostMsg | GuestMsg | undefined;
    if (me === 'p1') {
      const last = n.acts[n.acts.length - 1];
      if (last && last.n !== s.lastN) {
        s.lastN = last.n;
        msg = last.a as GuestMsg;
      }
    } else if (n.shared && n.shared.seq !== s.lastSeq) {
      s.lastSeq = n.shared.seq;
      msg = n.shared.st as HostMsg;
    }
    if (!msg) return;
    s.heard = now;
    if (msg.f) {
      s.pkt = msg.f;
      s.pktAt = now;
      for (const sh of [...msg.f.sb].sort((a, b) => a[0] - b[0])) {
        if (sh[0] <= s.seenShot) continue;
        s.seenShot = sh[0];
        const b: Ball = { n: sh[0], side: them, p: [sh[1], sh[2], sh[3]], v: [sh[4], sh[5], sh[6]], t: 0, real: false };
        w.balls.push(b);
        onShot(b, false);
      }
      for (const ht of [...msg.f.ht].sort((a, b) => a[0] - b[0])) {
        if (ht[0] <= s.seenHit) continue;
        s.seenHit = ht[0];
        gotHit(w, [ht[1], ht[2], ht[3]], them);
      }
    }
    const fl = (msg as HostMsg).fl;
    if (me === 'p2' && fl) {
      const flow = w.flow;
      if (fl.ph === 'count' && flow.ph === 'wait') flow.ph = 'count';
      if (fl.ph === 'play' && (flow.ph === 'wait' || flow.ph === 'count')) flow.ph = 'play';
      flow.cd = fl.cd;
      flow.left = fl.lt;
      flow.sudden = !!fl.sd;
      if (fl.ph === 'over' && flow.ph !== 'over') {
        flow.ph = 'over';
        flow.win = fl.win ?? null;
        flow.overT = 0;
      }
    }
  };

  const transmit = (w: World, now: number, dt: number) => {
    const n = netRef.current;
    const s = sim.current;
    if (!n) return;
    s.netT -= dt;
    if (s.netT > 0 && !(s.urgent && s.netT < NET_EVERY - 0.03)) return;
    s.netT = NET_EVERY;
    s.urgent = false;
    s.sent = s.sent.filter((o) => now - o.at < 1200).slice(-10);
    s.hits = s.hits.filter((o) => now - o.at < 1600).slice(-6);
    const f = packMe(
      w.f[me],
      s.sent.map((o) => o.b),
      s.hits,
    );
    if (me === 'p1') {
      const fl: NetFlow = { ph: w.flow.ph, cd: Math.round(w.flow.cd * 10) / 10, lt: Math.round(w.flow.left * 10) / 10, sd: w.flow.sudden ? 1 : 0 };
      if (w.flow.win) fl.win = w.flow.win;
      n.publish({ seq: ++s.seq, st: { f, fl } satisfies HostMsg, ack: 0 });
    } else n.pushAct({ f } satisfies GuestMsg, 1);
  };

  // ───── Spielschleife ─────
  useLoop((dtRaw) => {
    const gx = gfx.current;
    if (!gx || gx.lost()) return;
    const dt = Math.min(dtRaw, 1 / 30);
    const now = performance.now();
    const w = world.current;
    const flow = w.flow;
    const i = inp.current;
    const h = hud.current;
    const mine = w.f[me];
    const foe = solo ? null : w.f[them];
    w.t += dt;
    h.hint = Math.max(0, h.hint - dt);

    if (online) receive(w, now);

    // ── Blick ──
    const keys = i.keys;
    if (keys.has('ArrowLeft')) i.dYaw += dt * 2.4;
    if (keys.has('ArrowRight')) i.dYaw -= dt * 2.4;
    // Zielhilfe am Handy: über dem Gegner wird der Blick träger und zieht leicht mit
    let assistYaw = 0;
    let assistPitch = 0;
    h.onFoe = false;
    if (foe && foe.alive && mine.alive) {
      const eye: V3 = [mine.x, EYE, mine.z];
      const toYaw = Math.atan2(foe.x - mine.x, foe.z - mine.z);
      const dist = Math.hypot(foe.x - mine.x, foe.z - mine.z);
      const toPitch = Math.atan2(1.2 - EYE, dist);
      let dy = toYaw - mine.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const dp = toPitch - mine.pitch;
      const cone = 0.09 + 0.6 / Math.max(3, dist);
      if (Math.abs(dy) < cone && Math.abs(dp) < cone * 1.3 && !locked && los(eye, [foe.x, 1.2, foe.z])) {
        const k = i.fire !== null || i.mouseFire ? 4.5 : 1.6;
        assistYaw = dy * Math.min(1, dt * k);
        assistPitch = dp * Math.min(1, dt * k);
        i.dYaw *= 0.6;
        i.dPitch *= 0.6;
      }
      // Liegt das Fadenkreuz auf dem Gegner?
      const d = dir3(mine.yaw, mine.pitch);
      const far: V3 = [eye[0] + d[0] * 60, eye[1] + d[1] * 60, eye[2] + d[2] * 60];
      const wall = segWorld(eye, far);
      const tb = segBody(eye, far, foe.x, foe.z);
      h.onFoe = tb !== null && (!wall || wall.t > tb);
    }
    if (mine.alive) {
      mine.yaw += i.dYaw + assistYaw;
      mine.pitch = Math.max(-1.15, Math.min(1.15, mine.pitch + i.dPitch + assistPitch));
    }
    i.dYaw = 0;
    i.dPitch = 0;

    // ── Ablauf ──
    const playing = flow.ph === 'play';
    const host = !online || me === 'p1';
    if (flow.ph === 'wait') {
      if (online && me === 'p1' && sim.current.heard) {
        flow.ph = 'count';
        flow.cd = COUNT_T;
      }
    } else if (flow.ph === 'count') {
      if (host) flow.cd -= dt;
      const c = Math.ceil(flow.cd);
      if (c !== h.lastCount && c > 0) {
        h.lastCount = c;
        tone(c === 1 ? 660 : 520, 120, 'square', 0.05);
      }
      if (host && flow.cd <= 0) flow.ph = 'play';
    } else if (flow.ph === 'over') {
      flow.overT += dt;
      if (flow.overT > 2.4 && !ended.current) {
        ended.current = true;
        if (solo) endRef.current({ score: w.score });
        else endRef.current({ winner: flow.win ?? 'draw' });
        return;
      }
    }

    // ── Bewegen ──
    let mx = i.mx;
    let my = i.my;
    if (keys.has('w') || keys.has('ArrowUp')) my += 1;
    if (keys.has('s') || keys.has('ArrowDown')) my -= 1;
    if (keys.has('a')) mx -= 1;
    if (keys.has('d')) mx += 1;
    const [fx, fz] = fwd(mine.yaw);
    const [rx, rz] = rightOf(mine.yaw);
    const canMove = playing || flow.ph === 'wait';
    moveFighter(mine, canMove ? fx * my + rx * mx : 0, canMove ? fz * my + rz * mx : 0, dt);
    const tick = tickFighter(mine, dt);
    if (tick === 'reloaded') tone(820, 45, 'square', 0.03);
    if (tick === 'respawn') {
      respawn(mine, pickSpawn(foe));
      w.gone[me] = 0;
      h.splats = [];
    }

    // ── Schießen ──
    const wantFire = i.fire !== null || i.mouseFire || keys.has(' ') || keys.has('f');
    if (i.reload) {
      i.reload = false;
      if (startReload(mine)) tone(480, 45, 'square', 0.03);
    }
    if (playing && wantFire && mine.alive) {
      if (mine.ammo <= 0 && mine.reload <= 0) {
        if (startReload(mine)) tone(480, 45, 'square', 0.03);
      } else {
        const b = fire(mine, me, ++w.n);
        if (b) {
          w.balls.push(b);
          onShot(b, true);
          if (online) {
            sim.current.sent.push({ b: { ...b, p: [...b.p] as V3, v: [...b.v] as V3 }, at: now });
            sim.current.urgent = true;
          }
          if (mine.ammo === 0) window.setTimeout(() => startReload(mine) && tone(480, 45, 'square', 0.03), 200);
        } else w.n--;
      }
    }

    // ── KI ──
    if (cpu && foe) {
      if (playing) {
        const o = botThink(w.bot, foe, mine, dt, Math.random, KI_LEVEL);
        moveFighter(foe, o.mx, o.mz, dt, SPEED * 0.92);
        if (o.reload) startReload(foe);
        if (o.fire) {
          const b = fire(foe, them, ++w.n, Math.random, 0.012);
          if (b) {
            w.balls.push(b);
            onShot(b, false);
          }
        }
      } else moveFighter(foe, 0, 0, dt);
      if (tickFighter(foe, dt) === 'respawn') {
        respawn(foe, pickSpawn(mine));
        w.gone[them] = 0;
        w.bot = newBot();
      }
    }

    // ── Online: den anderen nachführen ──
    if (online && foe) {
      const s = sim.current;
      const wasAlive = foe.alive;
      if (s.pkt) followMe(foe, s.pkt, (now - s.pktAt) / 1000, dt);
      if (wasAlive && !foe.alive) w.gone[them] = 0.001;
      if (!wasAlive && foe.alive) w.gone[them] = 0;
      if (!ended.current && flow.ph !== 'over' && s.heard && (now - s.heard) / 1000 > NET_TIMEOUT) {
        ended.current = true;
        endRef.current({ winner: me });
        return;
      }
    }

    // ── Zielschießen ──
    if (solo) {
      for (let k = w.targets.length - 1; k >= 0; k--) {
        const tg = w.targets[k];
        if (tg.hit) {
          tg.up = Math.max(0, tg.up - dt * 4);
          if (tg.up <= 0) w.targets.splice(k, 1);
          continue;
        }
        tg.up = Math.min(1, tg.up + dt * 5);
        if (playing) tg.life -= dt;
        if (tg.life <= 0) {
          tg.hit = true;
        }
      }
      if (playing) {
        w.tgT -= dt;
        const alive = w.targets.filter((t) => !t.hit).length;
        if (w.tgT <= 0 && alive < 3) {
          if (spawnTarget(w.targets, [mine.x, mine.z])) tone(300, 60, 'triangle', 0.03, 600);
          w.tgT = 0.5 + Math.random() * 0.8;
        }
      }
    }

    // ── Kugeln ──
    const bodies: Partial<Record<Side, Fighter | null>> = solo ? {} : { p1: w.f.p1, p2: w.f.p2 };
    for (let k = w.balls.length - 1; k >= 0; k--) {
      const b = w.balls[k];
      const hit = stepBall(b, dt, bodies, w.targets);
      if (!hit) continue;
      w.balls.splice(k, 1);
      if (hit.k === 'world') splatWorld(b, hit.p, hit.n);
      else if (hit.k === 'target') {
        const tg = w.targets[hit.i];
        tg.hit = true;
        w.score += tg.gold ? 3 : 1;
        h.hitT = 0.3;
        tone(tg.gold ? 1568 : 1250, 70, 'sine', 0.06);
        window.setTimeout(() => tone(tg.gold ? 2093 : 1660, 90, 'sine', 0.05), 60);
        gx.burst(hit.p, TEAM_RGB[me], 14, 3);
        if (tg.gold) gx.burst(hit.p, [1, 0.8, 0.25], 10, 2, true);
        gx.splat([hit.p[0] + Math.sin(tg.yaw) * 0.03, hit.p[1], hit.p[2] + Math.cos(tg.yaw) * 0.03], [Math.sin(tg.yaw), 0, Math.cos(tg.yaw)], TEAM_RGB[me], 0.22);
      } else if (hit.k === 'body') {
        const victim = w.f[hit.side];
        gx.burst(hit.p, TEAM_RGB[b.side], 10, 2.6);
        if (!b.real) continue;
        if (online) {
          // Mein Treffer am anderen: melden, das andere Handy zieht das Herz ab
          if (hit.side !== them || victim.shield > 0 || !victim.alive) continue;
          const s = sim.current;
          s.hits.push({ n: ++s.hitN, p: hit.p, at: now });
          s.urgent = true;
          stain(victim, hit.p);
          scored(w, them, hit.p, victim.hp <= 1);
        } else if (hit.side === me) gotHit(w, hit.p, them);
        else {
          stain(victim, hit.p);
          const out = takeHit(victim);
          if (victim.shield <= 0 || out) scored(w, them, hit.p, out);
          if (out) w.gone[them] = 0.001;
        }
      }
    }
    for (const side of ['p1', 'p2'] as Side[]) {
      const f = w.f[side];
      if (!f.alive) w.gone[side] = Math.min(1, Math.max(0.001, w.gone[side]) + dt * 3);
    }

    // ── Entscheidung ──
    if (playing && host) {
      flow.left -= dt;
      if (solo) {
        if (flow.left <= 0) {
          flow.left = 0;
          flow.ph = 'over';
          flow.overT = 0;
          sfx.win();
          h.banner = { text: 'Zeit um! ⏱', sub: `${w.score} Treffer`, t: 2.4, color: TEAM[me] };
        }
      } else {
        if (flow.left <= 0 && !flow.sudden && scoreOf(w.f, 'p1') === scoreOf(w.f, 'p2')) {
          flow.sudden = true;
          h.banner = { text: 'Verlängerung!', sub: 'Der nächste Punkt gewinnt', t: 2, color: '#ffb000' };
          tone(880, 300, 'triangle', 0.06, 440);
        }
        flow.left = Math.max(0, flow.left);
        const win = decide(w.f, flow.left <= 0);
        if (win) {
          flow.ph = 'over';
          flow.win = win;
          flow.overT = 0;
        }
      }
    }
    // Wechsel im Ablauf (auch die, die vom Gastgeber kommen)
    if (flow.ph !== h.ph) {
      if (flow.ph === 'play') {
        tone(1046, 260, 'square', 0.05);
        h.banner = { text: solo ? 'Los! 🎯' : 'Los! 💥', t: 0.9, color: TEAM[me] };
      }
      if (flow.ph === 'over' && !solo) {
        const iWon = flow.win === me;
        h.banner = { text: iWon ? 'Gewonnen! 🏆' : `${nameOf(them)} gewinnt!`, sub: `${scoreOf(w.f, me)} : ${scoreOf(w.f, them)}`, t: 2.4, color: iWon ? TEAM[me] : TEAM[them] };
        if (iWon) sfx.win();
        else sfx.lose();
      }
      h.ph = flow.ph;
    }

    if (online) transmit(w, now, dt);

    // ── Zeichnen ──
    gx.stepBits(dt);
    const moving = Math.min(1, Math.hypot(mine.vx, mine.vz) / SPEED);
    const deadLift = mine.alive ? 0 : Math.min(1, (2.2 - mine.deadT) * 1.4);
    const eye: V3 = [mine.x, EYE + Math.abs(Math.sin(mine.walk * 2.6)) * 0.035 * moving + deadLift * 1.3, mine.z];
    const fighters = solo
      ? []
      : (['p1', 'p2'] as Side[]).filter((s) => s !== me).map((s) => ({ f: w.f[s], team: TEAM_RGB[s], other: TEAM_RGB[otherSide(s)], gone: w.gone[s] }));
    gx.render({
      eye,
      yaw: mine.yaw,
      pitch: mine.alive ? mine.pitch : Math.max(-0.9, mine.pitch - deadLift * 0.5),
      fighters,
      balls: w.balls.map((b) => ({ p: b.p, c: TEAM_RGB[b.side] })),
      targets: w.targets,
      vm: { team: TEAM_RGB[me], kick: mine.kick, reload: mine.reload > 0 ? 1 - mine.reload / RELOAD : 0, bob: mine.walk * 2.6, moving, show: mine.alive },
      t: w.t,
    });
    drawHud(w, dt);

    // Ruckelt es, wird mit weniger Pixeln gerechnet.
    const q = perf.current;
    q.acc += dtRaw;
    q.n++;
    if (q.n >= 90) {
      const avg = q.acc / q.n;
      q.acc = 0;
      q.n = 0;
      const s = size.current;
      if (avg > 1 / 42 && s.q > 0.6) {
        s.q = Math.max(0.6, s.q - 0.15);
        (s as { fit?: () => void }).fit?.();
      }
    }
  }, !noGl);

  // ───── Anzeige ─────
  const drawHud = (w: World, dt: number) => {
    const cv = hudCv.current;
    const gx = gfx.current;
    if (!cv || !gx) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    const { w: W, h: H, dpr } = size.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const h = hud.current;
    const mine = w.f[me];
    const flow = w.flow;
    const cx = W / 2;
    const cy = H / 2;
    ctx.lineJoin = 'round';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const text = (s: string, x: number, y: number, px: number, fill = '#fff', align: CanvasTextAlign = 'center') => {
      ctx.font = `900 ${px}px system-ui, -apple-system, "Segoe UI", sans-serif`;
      ctx.textAlign = align;
      ctx.lineWidth = Math.max(3, px * 0.2);
      ctx.strokeStyle = 'rgba(40, 10, 40, 0.6)';
      ctx.strokeText(s, x, y);
      ctx.fillStyle = fill;
      ctx.fillText(s, x, y);
    };

    // Farbe im Gesicht
    for (let k = h.splats.length - 1; k >= 0; k--) {
      const s = h.splats[k];
      s.t -= dt;
      if (s.t <= 0) {
        h.splats.splice(k, 1);
        continue;
      }
    }
    if (h.splats.length) {
      const by = TEAM[them];
      for (const s of h.splats) {
        ctx.globalAlpha = Math.min(0.82, (s.t / s.max) * 1.6);
        ctx.fillStyle = by;
        paintBlob(ctx, s.x * W, s.y * H, s.r * Math.min(W, H), s.seed);
      }
      ctx.globalAlpha = 1;
    }
    // Woher kam der Treffer?
    if (h.hurtT > 0) {
      h.hurtT -= dt;
      let a = h.hurtFrom - mine.yaw;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      const r = Math.min(W, H) * 0.3;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-a);
      ctx.strokeStyle = TEAM[them];
      ctx.globalAlpha = Math.min(1, h.hurtT * 1.5);
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, 0, r, -Math.PI / 2 - 0.35, -Math.PI / 2 + 0.35);
      ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    // Name über dem Gegner
    if (!solo) {
      const foe = w.f[them];
      if (foe.alive && los([mine.x, EYE, mine.z], [foe.x, 1.6, foe.z])) {
        const p = gx.project([foe.x, BODY_H + 0.42, foe.z]);
        if (p) {
          const d = Math.hypot(foe.x - mine.x, foe.z - mine.z);
          const px = Math.max(10, Math.min(15, 160 / d));
          text(nameOf(them), p[0], p[1] - px * 0.9, px, TEAM[them]);
          for (let k = 0; k < MAX_HP; k++) {
            ctx.fillStyle = k < foe.hp ? TEAM[them] : 'rgba(255,255,255,0.45)';
            heartPath(ctx, p[0] + (k - 1) * px * 1.05, p[1] + px * 0.25, px * 0.42);
            ctx.fill();
          }
        }
      }
    }

    // Fadenkreuz
    if (mine.alive && flow.ph !== 'over') {
      const spread = 7 + Math.min(1, Math.hypot(mine.vx, mine.vz) / SPEED) * 6 + mine.kick * 6;
      const col = h.onFoe ? TEAM[me] : '#ffffff';
      ctx.lineCap = 'round';
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        ctx.strokeStyle = 'rgba(40,10,40,0.55)';
        ctx.lineWidth = 4.5;
        ctx.beginPath();
        ctx.moveTo(cx + dx * spread, cy + dy * spread);
        ctx.lineTo(cx + dx * (spread + 8), cy + dy * (spread + 8));
        ctx.stroke();
        ctx.strokeStyle = col;
        ctx.lineWidth = 2.2;
        ctx.stroke();
      }
      ctx.fillStyle = col;
      if (h.onFoe) {
        heartPath(ctx, cx, cy, 4.2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(cx, cy, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
      if (h.hitT > 0) {
        h.hitT -= dt;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3;
        ctx.globalAlpha = Math.min(1, h.hitT * 5);
        for (const [dx, dy] of [
          [1, 1],
          [-1, 1],
          [1, -1],
          [-1, -1],
        ]) {
          ctx.beginPath();
          ctx.moveTo(cx + dx * 6, cy + dy * 6);
          ctx.lineTo(cx + dx * 13, cy + dy * 13);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
    }

    // Oben: Punkte und Zeit
    const top = 22;
    if (solo) {
      text(`🎯 ${w.score}`, 14, top, 20, '#fff', 'left');
      text(`⏱ ${mmss(flow.left)}`, W - 14, top, 20, flow.left < 10 ? '#ffd36e' : '#fff', 'right');
      if (best !== undefined) text(`🏆 ${best}`, cx, top, 15, 'rgba(255,255,255,0.9)');
    } else {
      const sMe = scoreOf(w.f, me);
      const sThem = scoreOf(w.f, them);
      const pill = (x: number, side: Side, score: number, align: 'l' | 'r') => {
        const label = `${nameOf(side)}`;
        ctx.font = '800 13px system-ui, -apple-system, sans-serif';
        const tw = Math.min(110, ctx.measureText(label).width);
        const bw = tw + 52;
        const bx = align === 'l' ? x : x - bw;
        ctx.fillStyle = 'rgba(30, 10, 40, 0.45)';
        ctx.beginPath();
        ctx.roundRect(bx, top - 15, bw, 30, 15);
        ctx.fill();
        ctx.fillStyle = TEAM[side];
        ctx.beginPath();
        ctx.roundRect(align === 'l' ? bx : bx + bw - 34, top - 15, 34, 30, 15);
        ctx.fill();
        text(String(score), align === 'l' ? bx + 17 : bx + bw - 17, top + 1, 18);
        ctx.fillStyle = '#fff';
        ctx.font = '800 13px system-ui, -apple-system, sans-serif';
        ctx.textAlign = align === 'l' ? 'left' : 'right';
        ctx.fillText(label, align === 'l' ? bx + 40 : bx + bw - 40, top + 1, 110);
      };
      pill(10, me, sMe, 'l');
      pill(W - 10, them, sThem, 'r');
      text(flow.sudden ? '⚡' : mmss(flow.left), cx, top, 17, flow.left < 20 && !flow.sudden ? '#ffd36e' : '#fff');
      text(`bis ${WIN}`, cx, top + 17, 10, 'rgba(255,255,255,0.8)');
    }

    // Unten: Herzen und Farbkugeln
    if (!solo) {
      for (let k = 0; k < MAX_HP; k++) {
        const x = 22 + k * 26;
        const y = H - 24;
        ctx.fillStyle = 'rgba(40,10,40,0.45)';
        heartPath(ctx, x, y + 1.5, 11.5);
        ctx.fill();
        ctx.fillStyle = k < mine.hp ? TEAM[me] : 'rgba(255,255,255,0.35)';
        heartPath(ctx, x, y, 10);
        ctx.fill();
      }
    }
    if (mine.alive) {
      const x = W - 16;
      const y = H - 24;
      if (mine.reload > 0) {
        const p = 1 - mine.reload / RELOAD;
        ctx.strokeStyle = 'rgba(40,10,40,0.45)';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(x - 14, y, 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(x - 14, y, 12, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
        ctx.stroke();
        text('Lädt …', x - 34, y, 14, '#fff', 'right');
      } else {
        text(`${mine.ammo}`, x - 30, y, 24, mine.ammo <= 3 ? '#ffd36e' : '#fff', 'right');
        text(`/${MAG}`, x - 26, y + 3, 13, 'rgba(255,255,255,0.85)', 'left');
        if (mine.ammo === 0 && Math.floor(w.t * 3) % 2 === 0) text('Nachladen! 🔄', cx, cy + 46, 15, '#ffd36e');
      }
    }

    // Wartet, Countdown, Banner
    if (flow.ph === 'wait') {
      ctx.fillStyle = 'rgba(30,10,40,0.45)';
      ctx.fillRect(0, cy - 34, W, 68);
      text(`Warte auf ${nameOf(them)} …`, cx, cy - 6, 20);
      text('Lauf dich schon mal warm 🏃', cx, cy + 18, 13, 'rgba(255,255,255,0.9)');
    } else if (flow.ph === 'count') {
      const c = Math.max(1, Math.ceil(flow.cd));
      const f = flow.cd - Math.floor(flow.cd);
      text(String(c), cx, cy - 40, 54 + f * 26, TEAM[me]);
      text(solo ? `${SOLO_T} Sekunden: Triff die Pappherzen!` : `Wer zuerst ${WIN} Punkte hat, gewinnt`, cx, cy + 6, 14);
      if (!mouse) {
        text('Stick: laufen · Im Bild wischen: umsehen', cx, cy + 30, 12, 'rgba(255,255,255,0.92)');
        text('💥 halten: schießen – dabei ziehen zum Zielen', cx, cy + 48, 12, 'rgba(255,255,255,0.92)');
      }
    }
    if (h.banner) {
      const b = h.banner;
      b.t -= dt;
      if (b.t <= 0) h.banner = null;
      else {
        const a = Math.min(1, b.t * 4);
        ctx.globalAlpha = a;
        text(b.text, cx, cy - 70, 26, b.color);
        if (b.sub) text(b.sub, cx, cy - 44, 14);
        ctx.globalAlpha = 1;
      }
    }
    if (!mine.alive && flow.ph === 'play') text(`Gleich geht’s weiter … ${Math.ceil(mine.deadT)}`, cx, cy + 30, 15);
    if (h.hint > 0 && mouse && !locked && flow.ph !== 'over') {
      ctx.globalAlpha = Math.min(1, h.hint);
      text('Klick ins Bild: Maus zielt, Klick schießt · WASD laufen · R nachladen', cx, H - 58, 11);
      ctx.globalAlpha = 1;
    }
  };

  if (noGl) {
    return (
      <div className="hs-nogl">
        <div className="hs-nogl-emoji">🎯</div>
        <p>Dein Gerät kann leider kein 3D (WebGL) darstellen – Herz-Strike braucht das. Probier es auf einem anderen Handy oder im aktuellen Browser.</p>
      </div>
    );
  }

  return (
    <div ref={root} className="hs">
      <div ref={view} className="hs-view" {...viewHandlers}>
        <canvas ref={glCv} className="hs-gl" />
        <canvas ref={hudCv} className="hs-hud" />
      </div>
      <div className="hs-pad">
        <div className="hs-stick" {...stickHandlers} aria-label="Stick: laufen">
          <div ref={knob} className="hs-knob" style={{ ['--pc' as string]: TEAM[me] }} />
        </div>
        <div className="hs-help">Im Bild wischen: umsehen</div>
        <div className="hs-btns">
          <div className="hs-reload" {...reloadHandlers} aria-label="Nachladen">
            🔄
          </div>
          <div ref={fireEl} className="hs-fire" style={{ ['--pc' as string]: TEAM[me] }} {...fireHandlers} aria-label="Schießen (halten und ziehen zum Zielen)">
            <b>💥</b>
            <small>Halten &amp; ziehen</small>
          </div>
        </div>
      </div>
    </div>
  );
}
