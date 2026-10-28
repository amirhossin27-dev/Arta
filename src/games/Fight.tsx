import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react';
import { cls } from '../lib/hooks';
import { buzz, noise, tone, useLoop } from './engine';
import {
  FLASH_T,
  NET_TIMEOUT,
  POWER_MAX,
  applyBlow,
  followFlow,
  followNet,
  kiInput,
  newKi,
  newWorld,
  packFighter,
  packFlow,
  stepWorld,
  type Blow,
  type Fx,
  type Input,
  type NetF,
  type NetFlow,
  type StepOpts,
  type World,
} from './fight';
import { drawHud, drawPortrait, drawPreview, drawWorld, newGfx, resizeGfx, spawnFx, STAGES, type Gfx, type HudNames, type StageId } from './fightGfx';
import { FIGHTERS, fighterById, type FighterDef } from './fighters';
import { otherSide, type Side } from './logic';
import type { GameProps, Player } from './types';

/** Nur im Test-Build: Die Welt ist von außen erreichbar (Powerbalken füllen, Zustand prüfen). */
const TEST = import.meta.env.VITE_FIGHT_TEST === '1';

/** So oft geht der eigene Kämpfer online raus (Sekunden) */
const NET_EVERY = 0.075;
/** Nach dem letzten K.O. noch kurz jubeln lassen, dann kommt das Ergebnis */
const OVER_WAIT = 2.6;
const STORE = 'arta.fight.v1';

interface Picks {
  p1: string;
  p2: string;
  mine?: string;
}

function loadPicks(): Picks {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? '{}') as Partial<Picks>;
    return { p1: fighterById(v.p1).id, p2: fighterById(v.p2 ?? FIGHTERS[1]?.id).id, mine: v.mine && fighterById(v.mine).id };
  } catch {
    return { p1: FIGHTERS[0].id, p2: (FIGHTERS[1] ?? FIGHTERS[0]).id };
  }
}

function savePicks(p: Partial<Picks>) {
  try {
    localStorage.setItem(STORE, JSON.stringify({ ...loadPicks(), ...p }));
  } catch {
    // ohne Speicher wählt man eben nächstes Mal neu
  }
}

/** Auswahl während der Kämpferwahl (online) */
interface Sel {
  pk: string;
  rdy: boolean;
}

/** Was der Gastgeber schickt */
interface HostMsg {
  sel?: Sel;
  pk?: [string, string];
  fl?: NetFlow;
  f?: NetF;
}

/** Was der Gast schickt */
interface GuestMsg {
  sel?: Sel;
  f?: NetF;
}

interface Pad {
  x: -1 | 0 | 1;
  up: boolean;
  stick: number | null;
  jump: boolean;
  punch: boolean;
  kick: boolean;
  special: boolean;
}

const newPad = (): Pad => ({ x: 0, up: false, stick: null, jump: false, punch: false, kick: false, special: false });

type Btn = 'punch' | 'kick' | 'special';

const TIPS = [
  '🕹️ Stick: laufen · nach oben schieben: springen',
  '🛡️ Weg vom Gegner halten = blocken',
  '👊 Schlag mehrmals tippen = Kombo, dann 🦶 Tritt',
  '⚡ Balken voll? Spezialattacke!',
];

function Stars({ n }: { n: number }) {
  return (
    <span className="fg-stars">
      {[1, 2, 3, 4, 5].map((i) => (
        <i key={i} className={cls(i <= n && 'on')} />
      ))}
    </span>
  );
}

function Portrait({ def, alt }: { def: FighterDef; alt: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) drawPortrait(ref.current, def, alt, Math.min(2, window.devicePixelRatio || 1));
  }, [def, alt]);
  return <canvas ref={ref} className="fg-portrait-cv" />;
}

function FighterCard({ def, side, player }: { def: FighterDef; side: Side; player: Player }) {
  return (
    <div className={cls('fg-card', side)} style={{ '--fc': def.aura } as CSSProperties}>
      <div className="fg-card-head">
        <b>
          {def.emoji} {def.name}
        </b>
        <span>{def.title}</span>
      </div>
      <div className="fg-stat">
        <span>Kraft</span>
        <Stars n={def.stats.kraft} />
      </div>
      <div className="fg-stat">
        <span>Tempo</span>
        <Stars n={def.stats.tempo} />
      </div>
      <div className="fg-stat">
        <span>Ausdauer</span>
        <Stars n={def.stats.ausdauer} />
      </div>
      <p className="fg-special">
        <b>⚡ {def.special.name}</b> {def.special.text}
      </p>
      <p className="fg-card-player">
        {player.emoji} {player.name}
      </p>
    </div>
  );
}

export function Fight({ mode, p1, p2, starter, net, onEnd }: GameProps) {
  const online = mode === 'online' && !!net;
  const duo = mode === 'duo';
  const cpu = mode === 'cpu';
  const me: Side = online ? net!.me : 'p1';
  const them = otherSide(me);
  const players: Record<Side, Player> = { p1, p2 };
  /** Wer an diesem Handy Knöpfe hat */
  const pads: Side[] = duo ? ['p1', 'p2'] : [me];
  const stage: StageId = starter === 'p1' ? 'dach' : 'tempel';

  const [picks, setPicks] = useState<Picks>(() => {
    const p = loadPicks();
    if (online) {
      const mine = p.mine ?? (me === 'p1' ? p.p1 : p.p2);
      return { p1: mine, p2: mine };
    }
    return p;
  });
  const [ready, setReady] = useState(false);
  const [phase, setPhase] = useState<'select' | 'fight'>('select');
  const [tip, setTip] = useState(0);
  const [, setTick] = useState(0);

  const netRef = useRef(net);
  netRef.current = net;
  const endRef = useRef(onEnd);
  endRef.current = onEnd;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const world = useRef<World>(newWorld(picks.p1, picks.p2));
  const gfx = useRef<Gfx>(newGfx(stage, world.current));
  const ki = useRef(newKi());
  const padState = useRef<Record<Side, Pad>>({ p1: newPad(), p2: newPad() });
  const keys = useRef(new Set<string>());
  const ended = useRef(false);

  // Online
  const sim = useRef({
    seq: 0,
    netT: 0,
    lastN: -1,
    lastSeq: -1,
    pkt: null as NetF | null,
    pktAt: 0,
    heard: 0,
    seenBlow: 0,
    flashes: -1,
    outbox: [] as { b: Blow; at: number }[],
    remoteSel: null as Sel | null,
    urgent: false,
  });

  const arena = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const size = useRef({ w: 0, h: 0, dpr: 1, scale: 1 });
  const perf = useRef({ acc: 0, n: 0 });
  const powerEls = useRef<Partial<Record<Side, HTMLDivElement | null>>>({});
  const knobEls = useRef<Partial<Record<Side, HTMLDivElement | null>>>({});


  useEffect(() => {
    if (!TEST) return;
    (window as unknown as { __fight?: unknown }).__fight = { world: () => world.current, phase: () => phaseRef.current };
  }, []);

  // Online wählt jeder nur seinen eigenen Kämpfer – den anderen zeigt das Handy des Partners an.
  const remoteSel = sim.current.remoteSel;
  const shown: Record<Side, string> = online
    ? ({ [me]: picks.p1, [them]: remoteSel?.pk ?? picks.p1 } as Record<Side, string>)
    : { p1: picks.p1, p2: picks.p2 };

  // Die Vorschau zeigt die aktuelle Wahl.
  useEffect(() => {
    if (phase !== 'select') return;
    world.current = newWorld(shown.p1, shown.p2);
    world.current.fx = [];
    gfx.current = newGfx(stage, world.current);
    fit();
  }, [shown.p1, shown.p2, phase]);

  // Leinwand an den Platz anpassen
  const fit = () => {
    const el = arena.current;
    const cv = canvas.current;
    if (!el || !cv) return;
    const r = el.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    const dpr = Math.max(0.75, Math.min(2, window.devicePixelRatio || 1) * size.current.scale);
    size.current = { ...size.current, w: r.width, h: r.height, dpr };
    cv.width = Math.round(r.width * dpr);
    cv.height = Math.round(r.height * dpr);
    resizeGfx(gfx.current, r.width, r.height);
  };
  useEffect(() => {
    fit();
    const ro = new ResizeObserver(fit);
    if (arena.current) ro.observe(arena.current);
    return () => ro.disconnect();
  }, []);

  // Tastatur: Pfeile/WASD laufen und springen, J/F Schlag, K/G Tritt, L/H Spezial – zu zweit spielt P2 mit den Pfeilen und 1/2/3.
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (k.startsWith('arrow') || k === ' ') e.preventDefault();
      if (e.repeat) return;
      keys.current.add(k);
      const p2keys = duo;
      const a = padState.current[duo ? 'p1' : me];
      const b = padState.current[duo ? 'p2' : me];
      if (k === 'w' || (!p2keys && (k === 'arrowup' || k === ' '))) a.jump = true;
      if (k === 'f' || k === 'j') (p2keys && k === 'j' ? b : a).punch = true;
      if (k === 'g' || k === 'k') (p2keys && k === 'k' ? b : a).kick = true;
      if (k === 'h' || k === 'l') (p2keys && k === 'l' ? b : a).special = true;
      if (p2keys) {
        if (k === 'arrowup') b.jump = true;
        if (k === '1') b.punch = true;
        if (k === '2') b.kick = true;
        if (k === '3') b.special = true;
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, []);

  useEffect(() => {
    if (phase !== 'fight') return;
    const id = window.setInterval(() => setTip((t) => t + 1), 2600);
    return () => window.clearInterval(id);
  }, [phase]);

  /** Eingabe einer Seite für dieses Bild (gedrückte Knöpfe zählen nur einmal) */
  const readInput = (side: Side): Input => {
    const p = padState.current[side];
    const k = keys.current;
    const solo = !duo;
    const isA = side === 'p1' || solo;
    const left = (isA && k.has('a')) || ((solo || side === 'p2') && k.has('arrowleft'));
    const right = (isA && k.has('d')) || ((solo || side === 'p2') && k.has('arrowright'));
    let x: -1 | 0 | 1 = p.x;
    if (left !== right) x = left ? -1 : 1;
    const inp: Input = { x, jump: p.jump, punch: p.punch, kick: p.kick, special: p.special };
    p.jump = p.punch = p.kick = p.special = false;
    return inp;
  };

  // ───── Kämpferwahl ─────
  const pick = (side: Side, id: string) => {
    if (online) {
      setPicks({ p1: id, p2: id });
      savePicks({ mine: id });
      setReady(false);
    } else {
      setPicks((p) => {
        const next = { ...p, [side]: id };
        savePicks({ p1: next.p1, p2: next.p2 });
        return next;
      });
    }
    tone(880, 50, 'triangle', 0.04);
  };

  const begin = (id1: string, id2: string) => {
    world.current = newWorld(id1, id2);
    gfx.current = newGfx(stage, world.current);
    fit();
    ki.current = newKi();
    setPhase('fight');
    phaseRef.current = 'fight';
  };

  const startLocal = () => {
    savePicks({ p1: picks.p1, p2: picks.p2 });
    begin(picks.p1, picks.p2);
  };

  // ───── Ton und Rütteln ─────
  const sound = (e: Fx) => {
    const mine = pads.includes(e.side);
    switch (e.k) {
      case 'hit':
        if (e.p === 'l') {
          noise(70, 0.12, 1600, 500);
          tone(170, 60, 'square', 0.035, 90);
        } else {
          noise(140, 0.16, 900, 160);
          tone(110, 140, 'sawtooth', 0.06, 45);
        }
        if (mine) buzz(e.p === 'l' ? 14 : [24, 30, 24]);
        break;
      case 'block':
        tone(1300, 45, 'triangle', 0.04, 900);
        noise(40, 0.05, 3000);
        break;
      case 'swing':
        noise(e.p === 'h' ? 120 : 80, 0.03, 600, 2400);
        break;
      case 'jump':
        tone(320, 90, 'triangle', 0.03, 560);
        break;
      case 'land':
        noise(60, 0.05, 300);
        break;
      case 'down':
        noise(220, 0.14, 260, 60);
        tone(80, 180, 'sawtooth', 0.05, 40);
        if (mine && e.p === 'h') buzz(30);
        break;
      case 'super':
        tone(180, 700, 'sawtooth', 0.05, 1400);
        window.setTimeout(() => tone(1400, 220, 'square', 0.04, 2200), 420);
        break;
      case 'shoot':
        noise(500, 0.12, 500, 2400);
        tone(140, 400, 'sawtooth', 0.05, 80);
        break;
      case 'dash':
        tone(2000, 260, 'square', 0.03, 300);
        noise(260, 0.1, 4000, 800);
        break;
      case 'pop':
      case 'clash':
        noise(380, 0.16, 700, 80);
        tone(70, 380, 'sawtooth', 0.07, 30);
        break;
      case 'ko':
        noise(700, 0.18, 400, 50);
        tone(64, 900, 'sawtooth', 0.08, 30);
        if (mine) buzz([60, 40, 90]);
        break;
      case 'round':
        tone(660, 140, 'square', 0.04);
        break;
      case 'fight':
        tone(523, 110, 'square', 0.05);
        window.setTimeout(() => tone(1046, 260, 'square', 0.05), 110);
        break;
      case 'time':
        tone(880, 380, 'triangle', 0.06, 440);
        break;
    }
  };

  // ───── Online ─────
  const send = (b: Blow) => {
    const s = sim.current;
    s.outbox.push({ b, at: performance.now() });
    s.urgent = true;
  };

  const opts: StepOpts = online ? { local: [me], flow: me === 'p1', send } : { local: ['p1', 'p2'], flow: true };

  /** Neuen Stand vom anderen Handy aufnehmen */
  const receive = (now: number) => {
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
    if (msg.sel && (msg.sel.pk !== s.remoteSel?.pk || msg.sel.rdy !== s.remoteSel?.rdy)) {
      s.remoteSel = msg.sel;
      setTick((t) => t + 1);
    }
    if (me === 'p2') {
      const h = msg as HostMsg;
      if (h.pk && phaseRef.current === 'select') begin(h.pk[0], h.pk[1]);
      if (h.fl && phaseRef.current === 'fight') followFlow(world.current, h.fl);
    }
    if (msg.f && phaseRef.current === 'fight') {
      const cur = world.current;
      s.pkt = msg.f;
      s.pktAt = now;
      const mine = cur.f[me];
      for (const b of [...msg.f.bl].sort((x, y) => x.n - y.n)) {
        if (b.n <= s.seenBlow) continue;
        s.seenBlow = b.n;
        applyBlow(cur, mine, b);
      }
      if (s.flashes < 0) s.flashes = msg.f.fl;
      else if (msg.f.fl > s.flashes) {
        s.flashes = msg.f.fl;
        if (!cur.flash) {
          cur.flash = { side: them, t: FLASH_T };
          cur.fx.push({ k: 'super', side: them, x: cur.f[them].x, y: cur.f[them].y + 90 });
        }
      }
    }
  };

  const transmit = (w: World, now: number, dt: number) => {
    const n = netRef.current;
    const s = sim.current;
    if (!n) return;
    s.netT -= dt;
    if (s.netT > 0 && !(s.urgent && s.netT < NET_EVERY - 0.035)) return;
    s.netT = NET_EVERY;
    s.urgent = false;
    s.outbox = s.outbox.filter((o) => now - o.at < 1500).slice(-8);
    if (phaseRef.current === 'select') {
      const sel: Sel = { pk: picks.p1, rdy: ready };
      if (me === 'p1') n.publish({ seq: ++s.seq, st: { sel } satisfies HostMsg, ack: 0 });
      else n.pushAct({ sel } satisfies GuestMsg, 1);
      return;
    }
    const f = packFighter(w, w.f[me], s.outbox.map((o) => o.b));
    if (me === 'p1') n.publish({ seq: ++s.seq, st: { pk: [w.f.p1.def.id, w.f.p2.def.id], fl: packFlow(w), f } satisfies HostMsg, ack: 0 });
    else n.pushAct({ f } satisfies GuestMsg, 1);
  };

  // Gastgeber: Beide sind bereit → los.
  useEffect(() => {
    if (!online || me !== 'p1' || phase !== 'select') return;
    const r = sim.current.remoteSel;
    if (ready && r?.rdy && r.pk) begin(picks.p1, r.pk);
  });

  // ───── Spielschleife ─────
  useLoop((dtRaw) => {
    const cv = canvas.current;
    const ctx = cv?.getContext('2d');
    const now = performance.now();
    const dt = Math.min(dtRaw, 1 / 30);
    if (online) {
      receive(now);
      transmit(world.current, now, dt);
    }
    const w = world.current;
    const g = gfx.current;

    if (phaseRef.current === 'select') {
      if (ctx && size.current.w) {
        ctx.setTransform(size.current.dpr, 0, 0, size.current.dpr, 0, 0);
        drawPreview(ctx, g, w, dt);
      }
      return;
    }

    // Eingaben
    const inputs: Partial<Record<Side, Input>> = {};
    for (const side of pads) inputs[side] = readInput(side);
    if (cpu) inputs.p2 = kiInput(w, 'p2', ki.current, Math.random, dt);

    // Online: den anderen Kämpfer nachführen
    if (online) {
      const s = sim.current;
      if (s.pkt) followNet(w, w.f[them], s.pkt, (now - s.pktAt) / 1000, dt);
      if (!ended.current && w.ph !== 'over' && s.heard && (now - s.heard) / 1000 > NET_TIMEOUT) {
        ended.current = true;
        endRef.current({ winner: me });
        return;
      }
    }

    stepWorld(w, inputs, dt, opts);
    for (const e of w.fx) {
      spawnFx(g, w, e);
      sound(e);
    }
    w.fx = [];

    if (ctx && size.current.w) {
      ctx.setTransform(size.current.dpr, 0, 0, size.current.dpr, 0, 0);
      drawWorld(ctx, g, w, dt);
      drawHud(ctx, g, w, names);
    }

    // Ruckelt es, wird mit weniger Pixeln und ohne Spiegelung gerechnet.
    const q = perf.current;
    q.acc += dtRaw;
    q.n++;
    if (q.acc >= 1.5) {
      const avg = q.acc / q.n;
      if (avg > 1 / 42 && size.current.scale > 0.55) {
        size.current.scale *= 0.8;
        g.mirror = false;
        fit();
      }
      q.acc = 0;
      q.n = 0;
    }

    // Spezial-Knopf: Ladestand
    for (const side of pads) {
      const el = powerEls.current[side];
      if (!el) continue;
      const pw = w.f[side].power;
      el.style.setProperty('--pw', String(Math.min(1, pw / POWER_MAX)));
      el.classList.toggle('full', pw >= POWER_MAX);
    }

    if (w.ph === 'over' && w.phT > OVER_WAIT && !ended.current) {
      ended.current = true;
      endRef.current({ winner: w.winner ?? 'draw' });
    }
  }, true);

  // ───── Touch-Steuerung ─────
  const stickMove = (side: Side, el: HTMLElement, clientX: number, clientY: number) => {
    const r = el.getBoundingClientRect();
    const dx = (clientX - (r.left + r.width / 2)) / (r.width / 2);
    const dy = (clientY - (r.top + r.height / 2)) / (r.height / 2);
    const p = padState.current[side];
    p.x = dx < -0.25 ? -1 : dx > 0.25 ? 1 : 0;
    const up = dy < -0.42;
    if (up && !p.up) p.jump = true;
    p.up = up;
    const knob = knobEls.current[side];
    if (knob) {
      const len = Math.hypot(dx, dy);
      const k = len > 1 ? 1 / len : 1;
      knob.style.transform = `translate(${dx * k * 58}%, ${dy * k * 58}%)`;
      knob.classList.add('on');
    }
  };
  const stickEnd = (side: Side) => {
    const p = padState.current[side];
    p.stick = null;
    p.x = 0;
    p.up = false;
    const knob = knobEls.current[side];
    if (knob) {
      knob.style.transform = '';
      knob.classList.remove('on');
    }
  };
  const stickHandlers = (side: Side) => ({
    onPointerDown: (e: RPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      padState.current[side].stick = e.pointerId;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      stickMove(side, e.currentTarget, e.clientX, e.clientY);
    },
    onPointerMove: (e: RPointerEvent<HTMLDivElement>) => {
      if (padState.current[side].stick !== e.pointerId) return;
      stickMove(side, e.currentTarget, e.clientX, e.clientY);
    },
    onPointerUp: (e: RPointerEvent<HTMLDivElement>) => {
      if (padState.current[side].stick === e.pointerId) stickEnd(side);
    },
    onPointerCancel: (e: RPointerEvent<HTMLDivElement>) => {
      if (padState.current[side].stick === e.pointerId) stickEnd(side);
    },
  });
  const btnHandlers = (side: Side, b: Btn) => ({
    onPointerDown: (e: RPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      padState.current[side][b] = true;
      e.currentTarget.classList.add('on');
    },
    onPointerUp: (e: RPointerEvent<HTMLDivElement>) => e.currentTarget.classList.remove('on'),
    onPointerCancel: (e: RPointerEvent<HTMLDivElement>) => e.currentTarget.classList.remove('on'),
    onPointerLeave: (e: RPointerEvent<HTMLDivElement>) => e.currentTarget.classList.remove('on'),
  });

  const tag = (p: Player) => (p.cpu ? 'KI 🤖' : `${p.name} ${p.emoji}`);
  const names: HudNames = { p1: { name: p1.name, tag: tag(p1) }, p2: { name: p2.name, tag: tag(p2) } };

  // ───── Anzeige ─────
  const rows: Side[] = ['p1', 'p2'];
  const editable = (side: Side) => (online ? side === me && !ready : true);
  const waitingFor = online && ready && !remoteSel?.rdy;

  return (
    <div className={cls('fg', phase, duo ? 'duo' : 'single')}>
      <div ref={arena} className="fg-arena">
        <canvas ref={canvas} className="fg-canvas" />
        {phase === 'select' && (
          <div className="fg-vs-layer">
            {rows.map((side) => {
              const unknown = online && side === them && !remoteSel;
              const def = fighterById(shown[side]);
              return (
                <span key={side} className={cls('fg-vs-name', side === 'p1' ? 'left' : 'right')}>
                  <b>{unknown ? '?' : def.name}</b>
                  <small>{unknown ? 'wählt noch …' : def.title}</small>
                </span>
              );
            })}
            <span className="fg-vs">VS</span>
            <span className="fg-stage-name">
              {STAGES[stage].emoji} {STAGES[stage].name}
            </span>
          </div>
        )}
        {phase === 'fight' && world.current.round === 1 && (world.current.ph === 'intro' || (world.current.ph === 'fight' && world.current.phT < 6)) && (
          <div key={tip} className="fg-tip">
            {TIPS[tip % TIPS.length]}
          </div>
        )}
      </div>

      {phase === 'select' && (
        <div className="fg-select" data-free>
          {rows.map((side) => {
            const pl = players[side];
            const can = editable(side);
            const val = shown[side];
            const unknown = online && side === them && !remoteSel;
            return (
              <div key={side} className={cls('fg-row', !can && 'locked')} style={{ '--pc': pl.color } as CSSProperties}>
                <span className="fg-row-label">
                  {pl.cpu ? '🤖 KI kämpft mit' : online && side === them ? `${pl.emoji} ${pl.name} wählt` : `${pl.emoji} ${pl.name}${duo ? '' : ' wählt'}`}
                </span>
                <div className="fg-portraits">
                  {FIGHTERS.map((def) => {
                    const on = !unknown && val === def.id;
                    const alt = side === 'p2' && shown.p1 === def.id && on;
                    return (
                      <button key={def.id} type="button" className={cls('fg-portrait', on && 'on')} disabled={!can} onClick={() => pick(side, def.id)} aria-pressed={on}>
                        <Portrait def={def} alt={alt} />
                        <b>{def.name}</b>
                      </button>
                    );
                  })}
                  <span className="fg-more">Bald mehr Kämpfer …</span>
                </div>
              </div>
            );
          })}

          <div className="fg-cards">
            {rows.map((side) => (online && side === them && !remoteSel ? <div key={side} className="fg-card wait">⏳ {players[side].name} wählt noch …</div> : <FighterCard key={side} def={fighterById(shown[side])} side={side} player={players[side]} />))}
          </div>

          <ul className="fg-howto">
            {TIPS.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>

          {online ? (
            <button className="btn primary big block" onClick={() => setReady((r) => !r)}>
              {ready ? (waitingFor ? `⏳ Warte auf ${players[them].name} …` : '✔ Bereit') : '🔥 Bereit zum Kampf!'}
            </button>
          ) : (
            <button className="btn primary big block" onClick={startLocal}>
              🔥 Kampf!
            </button>
          )}
          {online && remoteSel?.rdy && !ready && <p className="fg-ready-note">🔥 {players[them].name} ist bereit!</p>}
        </div>
      )}

      {phase === 'fight' && (
        <div className="fg-pads">
          {pads.map((side) => (
            <div key={side} className={cls('fg-pad', side)} style={{ '--pc': players[side].color } as CSSProperties}>
              <div className="fg-stick" {...stickHandlers(side)} aria-label="Stick: laufen und springen">
                <span className="fg-stick-up">▲</span>
                <span className="fg-stick-l">◀</span>
                <span className="fg-stick-r">▶</span>
                <div className="fg-knob" ref={(el) => void (knobEls.current[side] = el)} />
              </div>
              <div className="fg-btns">
                <div className="fg-btn sp" ref={(el) => void (powerEls.current[side] = el)} {...btnHandlers(side, 'special')} aria-label="Spezialattacke">
                  <span>⚡</span>
                  <small>Spezial</small>
                </div>
                <div className="fg-btn punch" {...btnHandlers(side, 'punch')} aria-label="Schlag">
                  <span>👊</span>
                  <small>Schlag</small>
                </div>
                <div className="fg-btn kick" {...btnHandlers(side, 'kick')} aria-label="Tritt">
                  <span>🦶</span>
                  <small>Tritt</small>
                </div>
              </div>
              {duo && (
                <div className="fg-pad-name">
                  {players[side].emoji} {players[side].name}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
