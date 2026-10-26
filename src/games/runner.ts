/**
 * Tempel-Lauf: Strecke, Sprünge, Hindernisse – reine Logik in Metern.
 * Die Strecke besteht aus geraden Stücken; am Ende jedes Stücks muss man links oder rechts abbiegen.
 */

export const LANE = 1.15;
/** halbe Wegbreite */
export const HALF = 1.8;
export const GRAVITY = 24;
export const JUMP_V = 8;
export const SLIDE_T = 0.72;
/** So früh vor der Kreuzung darf man schon abbiegen */
export const TURN_WINDOW = 7.5;

export type Heading = 0 | 1 | 2 | 3;
/** Vorwärts-Richtung je Himmelsrichtung (x, z) */
export const FWD: readonly [number, number][] = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
];
export const rightOf = (h: Heading): [number, number] => FWD[(h + 1) % 4];

export type ObsKind = 'log' | 'arch' | 'block' | 'gap';

export interface Obstacle {
  kind: ObsKind;
  d: number;
  len: number;
  /** blockierte Spuren (-1, 0, 1) – nur bei Steinblöcken */
  lanes: number[];
  done?: boolean;
}

export interface Heart {
  d: number;
  lane: number;
  y: number;
  got?: boolean;
}

export type DecorKind = 'pillar' | 'palm' | 'torch' | 'idol';

export interface Decor {
  kind: DecorKind;
  d: number;
  side: -1 | 1;
}

export interface Seg {
  x: number;
  z: number;
  h: Heading;
  len: number;
  /** -1 = links abbiegen, 1 = rechts */
  turn: -1 | 1;
  obs: Obstacle[];
  hearts: Heart[];
  decor: Decor[];
}

type Rnd = () => number;

export function segEnd(s: Seg): [number, number] {
  return [s.x + FWD[s.h][0] * s.len, s.z + FWD[s.h][1] * s.len];
}

/** Weltposition auf einem Stück: d nach vorn, side nach rechts */
export function segPoint(s: Seg, d: number, side: number): [number, number] {
  const [fx, fz] = FWD[s.h];
  const [rx, rz] = rightOf(s.h);
  return [s.x + fx * d + rx * side, s.z + fz * d + rz * side];
}

/**
 * Neues Streckenstück. `k` = laufende Nummer (Schwierigkeit), `prev` = das Stück davor.
 * Die letzten Meter vor der Kreuzung bleiben frei, damit man in Ruhe abbiegen kann.
 */
export function makeSeg(prev: Seg | null, k: number, rnd: Rnd = Math.random): Seg {
  const diff = Math.min(1, k / 14);
  let x = 0;
  let z = 0;
  let h: Heading = 0;
  if (prev) {
    [x, z] = segEnd(prev);
    h = ((prev.h + prev.turn + 4) % 4) as Heading;
  }
  const len = prev ? Math.round(46 + rnd() * (44 - diff * 14)) : 80;
  const turn: -1 | 1 = rnd() < 0.5 ? -1 : 1;
  const seg: Seg = { x, z, h, len, turn, obs: [], hearts: [], decor: [] };

  // Hindernisse
  let d = prev ? 12 + rnd() * 6 : 38;
  const stop = len - TURN_WINDOW - 5;
  while (d < stop) {
    const r = rnd();
    let kind: ObsKind;
    if (r < 0.28) kind = 'log';
    else if (r < 0.52) kind = 'arch';
    else if (r < 0.82) kind = 'block';
    else kind = k < 1 ? 'log' : 'gap';
    const o: Obstacle = { kind, d, len: kind === 'gap' ? 2.6 : kind === 'block' ? 1 : 0.7, lanes: [] };
    if (kind === 'block') {
      const lanes = [-1, 0, 1].sort(() => rnd() - 0.5);
      o.lanes = lanes.slice(0, rnd() < 0.35 + diff * 0.3 ? 2 : 1);
    }
    seg.obs.push(o);
    // Herzen: über Stämme im Bogen, sonst eine Reihe in einer freien Spur
    if (rnd() < 0.7) {
      const free = [-1, 0, 1].filter((l) => !o.lanes.includes(l));
      const lane = free[Math.floor(rnd() * free.length)];
      if (kind === 'log' || kind === 'gap') {
        for (let i = -2; i <= 2; i++) seg.hearts.push({ d: d + i * 1.4, lane, y: 0.7 + (1 - (i * i) / 5) * 0.9 });
      } else {
        for (let i = 0; i < 5; i++) seg.hearts.push({ d: d + 4 + i * 1.6, lane, y: 0.7 });
      }
    }
    d += 15 - diff * 5 + rnd() * (11 - diff * 4);
  }
  // Deko am Rand
  for (let dd = 4; dd < len - 2; dd += 7 + rnd() * 5) {
    const r = rnd();
    const kind: DecorKind = r < 0.35 ? 'pillar' : r < 0.65 ? 'palm' : r < 0.9 ? 'torch' : 'idol';
    seg.decor.push({ kind, d: dd, side: rnd() < 0.5 ? -1 : 1 });
    if (rnd() < 0.45) seg.decor.push({ kind: rnd() < 0.5 ? 'palm' : 'torch', d: dd + 2, side: rnd() < 0.5 ? -1 : 1 });
  }
  return seg;
}

export type RunEvent = 'jump' | 'slide' | 'lane' | 'turn' | 'heart' | 'stumble' | 'crash' | 'fall' | 'caught';

export interface RunState {
  segs: Seg[];
  /** Index des aktuellen Stücks in segs */
  si: number;
  d: number;
  lane: number;
  laneX: number;
  y: number;
  vy: number;
  slide: number;
  speed: number;
  slow: number;
  t: number;
  dist: number;
  hearts: number;
  /** Solange > 0, ist das Knuddelmonster dicht hinter dir */
  chase: number;
  /** Am Anfang taucht es nur kurz auf (ohne Gefahr) */
  intro: number;
  dead: null | 'fall' | 'crash' | 'caught';
  deadT: number;
  made: number;
  /** Gerade abgebogen (für die Kamera): alte Blickrichtung und Zeit */
  turnFrom: number;
  turnT: number;
}

export function newRun(rnd: Rnd = Math.random): RunState {
  const segs = [makeSeg(null, 0, rnd)];
  segs.push(makeSeg(segs[0], 1, rnd));
  segs.push(makeSeg(segs[1], 2, rnd));
  return {
    segs,
    si: 0,
    d: 2,
    lane: 0,
    laneX: 0,
    y: 0,
    vy: 0,
    slide: 0,
    speed: 9.5,
    slow: 0,
    t: 0,
    dist: 0,
    hearts: 0,
    chase: 0,
    intro: 3,
    dead: null,
    deadT: 0,
    made: 3,
    turnFrom: 0,
    turnT: 1,
  };
}

export interface RunInput {
  side?: -1 | 1;
  jump?: boolean;
  slide?: boolean;
}

export const yawOf = (h: Heading) => (h * Math.PI) / 2;

export function runScore(st: RunState) {
  return Math.floor(st.dist) + st.hearts * 5;
}

/** Ein Zeitschritt. Gibt die Ereignisse zurück (für Töne und Effekte). */
export function runStep(st: RunState, dt: number, inp: RunInput, rnd: Rnd = Math.random): RunEvent[] {
  const ev: RunEvent[] = [];
  st.t += dt;
  st.turnT = Math.min(1, st.turnT + dt / 0.32);
  if (st.dead) {
    st.deadT += dt;
    if (st.dead === 'fall') {
      st.vy -= GRAVITY * dt;
      st.y += st.vy * dt;
      st.d += st.speed * 0.4 * dt;
    }
    return ev;
  }
  const seg = st.segs[st.si];

  // Wischen: an der Kreuzung abbiegen, sonst Spur wechseln
  if (inp.side) {
    if (st.d > seg.len - TURN_WINDOW && inp.side === seg.turn) {
      const over = st.d - seg.len;
      st.turnFrom = yawOf(seg.h);
      st.turnT = 0;
      st.si++;
      // Seitlicher Versatz in der neuen Richtung = wie weit man schon über die Mitte der Kreuzung ist
      st.laneX = Math.max(-LANE, Math.min(LANE, -over * seg.turn));
      st.lane = Math.round(st.laneX / LANE);
      st.d = 0;
      if (st.made - st.si < 3) {
        st.segs.push(makeSeg(st.segs[st.segs.length - 1], st.made, rnd));
        st.made++;
      }
      // Alte Stücke weit hinten wegräumen
      if (st.si > 2) {
        st.segs.splice(0, st.si - 2);
        st.si = 2;
      }
      ev.push('turn');
    } else {
      const lane = Math.max(-1, Math.min(1, st.lane + inp.side));
      if (lane !== st.lane) {
        st.lane = lane;
        ev.push('lane');
      }
    }
  }
  if (inp.jump && st.y <= 0.001) {
    st.vy = JUMP_V;
    st.slide = 0;
    ev.push('jump');
  }
  if (inp.slide) {
    if (st.y > 0.001) st.vy = Math.min(st.vy, -12);
    st.slide = SLIDE_T;
    ev.push('slide');
  }

  // Bewegung
  const target = 9.5 + Math.min(st.t, 150) * 0.075;
  st.speed += (target * (st.slow > 0 ? 0.7 : 1) - st.speed) * Math.min(1, dt * 2);
  st.slow = Math.max(0, st.slow - dt);
  st.chase = Math.max(0, st.chase - dt);
  st.intro = Math.max(0, st.intro - dt);
  const cur = st.segs[st.si];
  const step = st.speed * dt;
  const d0 = st.d;
  st.d += step;
  st.dist += step;
  const want = st.lane * LANE;
  st.laneX += Math.max(-dt * 11, Math.min(dt * 11, want - st.laneX));
  if (st.y > 0 || st.vy > 0) {
    st.vy -= GRAVITY * dt;
    st.y += st.vy * dt;
    if (st.y <= 0) {
      st.y = 0;
      st.vy = 0;
    }
  }
  st.slide = Math.max(0, st.slide - dt);

  // Hindernisse
  for (const o of cur.obs) {
    if (o.done) continue;
    const a = o.d - o.len / 2;
    const b = o.d + o.len / 2;
    if (st.d < a - 0.25 || d0 > b) continue;
    if (o.kind === 'gap') {
      if (st.d > a + 0.35 && st.d < b - 0.2 && st.y < 0.05) {
        st.dead = 'fall';
        st.vy = 0;
        ev.push('fall');
        return ev;
      }
      if (st.d > b) o.done = true;
      continue;
    }
    if (o.kind === 'block') {
      const hit = o.lanes.some((l) => Math.abs(st.laneX - l * LANE) < 0.75);
      if (hit && st.y < 1.35) {
        st.dead = 'crash';
        ev.push('crash');
        return ev;
      }
      if (st.d > b) o.done = true;
      continue;
    }
    // Stamm (springen) oder Tor (rutschen): nur einmal prüfen
    o.done = true;
    const ok = o.kind === 'log' ? st.y > 0.45 : st.slide > 0;
    if (!ok) {
      if (st.chase > 0) {
        st.dead = 'caught';
        ev.push('caught');
        return ev;
      }
      st.chase = 7;
      st.slow = 1.2;
      ev.push('stumble');
    }
  }

  // Herzen
  for (const ht of cur.hearts) {
    if (ht.got) continue;
    if (Math.abs(ht.d - st.d) > 0.9) continue;
    if (Math.abs(ht.lane * LANE - st.laneX) > 0.7) continue;
    const head = st.slide > 0 ? 0.8 : 1.7;
    if (ht.y < st.y - 0.2 || ht.y > st.y + head + 0.2) continue;
    ht.got = true;
    st.hearts++;
    ev.push('heart');
  }

  // Verpasste Kurve: über die Kante in den Abgrund
  if (st.d > cur.len + HALF - 0.3) {
    st.dead = 'fall';
    st.vy = 0;
    ev.push('fall');
  }
  return ev;
}
