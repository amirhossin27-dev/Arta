import { fighterById, type FighterDef } from './fighters';
import { otherSide, type Side } from './logic';

/**
 * Herz-Fighter: die Spiellogik ohne Grafik. Welt-Einheiten: x von links nach rechts (0 … STAGE_W),
 * y = Höhe über dem Boden. Ein Kämpfer ist gut 160 Einheiten groß.
 */

export const STAGE_W = 1200;
/** So nah kommt die Körpermitte an den Arenarand */
export const EDGE = 46;
/** Weiter dürfen die beiden nicht auseinander (die Kamera muss beide zeigen) */
export const MAX_GAP = 600;
/** Mindestabstand der Körper */
export const BODY_W = 54;
export const GRAVITY = 2800;
export const ROUND_TIME = 60;
export const WIN_ROUNDS = 2;
export const MAX_ROUNDS = 5;
export const POWER_MAX = 100;
export const START_X = 165;
/** „Runde 1 … Kampf!“ */
export const INTRO_T = 2.3;
/** Nach dem K.O. bis zur nächsten Runde */
export const KO_T = 3.4;
/** So lange steht die Welt still, wenn jemand seine Spezialattacke zündet */
export const FLASH_T = 0.8;

const WALK = 235;
const BACK = 175;
const JUMP_X = 255;
/** Tasten, die etwas zu früh gedrückt werden, zählen trotzdem noch so lange */
const BUFFER = 0.16;
const DOWN_T = 0.62;
const RISE_T = 0.36;
const MAX_JUGGLE = 3;

// ───────────────────────── Typen ─────────────────────────

export type MoveId = 'p1' | 'p2' | 'p3' | 'k' | 'ap' | 'ak';
export type State = 'idle' | 'walk' | 'back' | 'block' | 'bstun' | 'jump' | 'attack' | 'hit' | 'air' | 'held' | 'down' | 'rise' | 'special' | 'ko' | 'win' | 'tired';
export type SpPhase = 'flash' | 'go' | 'lock' | 'end';
export type Phase = 'intro' | 'fight' | 'ko' | 'over';

export interface MoveDef {
  startup: number;
  active: number;
  recovery: number;
  dmg: number;
  /** Trefferzone vor der Körpermitte (near … reach) und über den Füßen (y0 … y1) */
  near: number;
  reach: number;
  y0: number;
  y1: number;
  stun: number;
  bstun: number;
  push: number;
  /** Treffer-Stopp: Beide frieren kurz ein, damit der Schlag „sitzt“. */
  hs: number;
  kind: 'l' | 'h';
  kd?: boolean;
  la?: number;
  /** Schwung nach vorn während des Schlags */
  lunge?: number;
  /** Darauf lässt sich der Angriff verketten (Kombo) */
  next?: MoveId[];
  air?: boolean;
}

/** Die Grundangriffe – jeder Kämpfer verändert sie mit Kraft, Tempo und Reichweite. */
export const MOVES: Record<MoveId, MoveDef> = {
  p1: { startup: 0.06, active: 0.06, recovery: 0.13, dmg: 38, near: 10, reach: 82, y0: 100, y1: 142, stun: 0.33, bstun: 0.18, push: 110, hs: 0.055, kind: 'l', lunge: 50, next: ['p2', 'k'] },
  p2: { startup: 0.07, active: 0.06, recovery: 0.16, dmg: 44, near: 10, reach: 88, y0: 94, y1: 136, stun: 0.35, bstun: 0.2, push: 130, hs: 0.06, kind: 'l', lunge: 90, next: ['p3', 'k'] },
  p3: { startup: 0.11, active: 0.08, recovery: 0.32, dmg: 76, near: 0, reach: 86, y0: 70, y1: 168, stun: 0.5, bstun: 0.26, push: 240, hs: 0.1, kind: 'h', kd: true, la: 820, lunge: 120 },
  k: { startup: 0.14, active: 0.08, recovery: 0.27, dmg: 84, near: 20, reach: 114, y0: 55, y1: 122, stun: 0.46, bstun: 0.25, push: 320, hs: 0.1, kind: 'h', lunge: 60 },
  ap: { startup: 0.05, active: 0.22, recovery: 0.05, dmg: 56, near: 0, reach: 80, y0: 50, y1: 126, stun: 0.38, bstun: 0.2, push: 130, hs: 0.06, kind: 'l', air: true },
  ak: { startup: 0.07, active: 0.3, recovery: 0.05, dmg: 70, near: 10, reach: 100, y0: 0, y1: 76, stun: 0.42, bstun: 0.22, push: 190, hs: 0.08, kind: 'h', air: true },
};

/** Ein Treffer, wie er beim Getroffenen ankommt – online geht er genau so übers Netz. */
export interface Blow {
  /** Laufende Nummer des Angreifers (online: schon angewendete werden übersprungen) */
  n: number;
  dmg: number;
  chip: number;
  stun: number;
  bstun: number;
  push: number;
  /** In diese Richtung fliegt der Getroffene (Blickrichtung des Angreifers) */
  dir: 1 | -1;
  kd: 0 | 1;
  la: number;
  /** Festhalten (Ansturm): So lange kann sich der Getroffene nicht rühren */
  hold: number;
  k: 'l' | 'h' | 's';
  hs: number;
  x: number;
  y: number;
}

export interface Input {
  /** Gehaltene Richtung: -1 links, 1 rechts */
  x: -1 | 0 | 1;
  /** Gerade gedrückt (nur in diesem Bild) */
  jump: boolean;
  punch: boolean;
  kick: boolean;
  special: boolean;
}

export const NO_INPUT: Input = { x: 0, jump: false, punch: false, kick: false, special: false };

export interface SpecialRun {
  ph: SpPhase;
  t: number;
  /** Geschoss: schon abgefeuert · Ansturm: nächster Treffer */
  i: number;
  miss: boolean;
}

export interface Fighter {
  side: Side;
  def: FighterDef;
  alt: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  face: 1 | -1;
  hp: number;
  maxHp: number;
  power: number;
  st: State;
  t: number;
  /** Dauer von Treffer-, Block- und Liegezuständen */
  dur: number;
  mv: MoveId | null;
  /** Der laufende Angriff hat getroffen (oder wurde geblockt) */
  hit: boolean;
  airUsed: boolean;
  inv: number;
  hold: -1 | 0 | 1;
  buf: { p: number; k: number; s: number; j: number };
  /** Treffer in Folge, die dieser Kämpfer eingesteckt hat (Schaden sinkt in langen Kombos) */
  combo: number;
  /** Kombo-Anzeige des Angreifers */
  shown: number;
  shownT: number;
  jug: number;
  bounced: boolean;
  stop: number;
  sp: SpecialRun | null;
  /** Online: Nummer des letzten eigenen Treffers und Zähler der Spezialattacken */
  n: number;
  flashes: number;
  /** Zähler der Angriffe (damit die KI jeden neuen erkennt) */
  atk: number;
}

export interface Projectile {
  id: number;
  owner: Side;
  x: number;
  y: number;
  vx: number;
  w: number;
  h: number;
  hits: number;
  cd: number;
  slow: number;
  t: number;
}

export type FxKind = 'hit' | 'block' | 'swing' | 'jump' | 'land' | 'down' | 'super' | 'shoot' | 'pop' | 'clash' | 'dash' | 'ko' | 'round' | 'fight' | 'time';

/** Ereignisse für Grafik und Ton – die Anzeige holt sie nach jedem Schritt ab. */
export interface Fx {
  k: FxKind;
  side: Side;
  x: number;
  y: number;
  p?: 'l' | 'h' | 's';
  dir?: number;
}

export interface World {
  f: Record<Side, Fighter>;
  proj: Projectile[];
  ph: Phase;
  phT: number;
  round: number;
  clock: number;
  wins: Record<Side, number>;
  roundWin: Side | 'draw' | null;
  winner: Side | 'draw' | null;
  timeUp: boolean;
  perfect: boolean;
  flash: { side: Side; t: number } | null;
  slow: number;
  pid: number;
  fx: Fx[];
}

export interface StepOpts {
  /** Diese Kämpfer rechnet dieses Handy selbst – lokal beide, online nur den eigenen. */
  local: Side[];
  /** Rundenablauf (Uhr, K.O., nächste Runde): lokal und beim Gastgeber */
  flow: boolean;
  /** Online: Treffer gegen den Kämpfer auf dem anderen Handy */
  send?: (b: Blow) => void;
}

// ───────────────────────── Aufbau ─────────────────────────

export function newFighter(side: Side, def: FighterDef, alt = false): Fighter {
  const f: Fighter = {
    side,
    def,
    alt,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    face: 1,
    hp: def.hp,
    maxHp: def.hp,
    power: 0,
    st: 'idle',
    t: 0,
    dur: 0,
    mv: null,
    hit: false,
    airUsed: false,
    inv: 0,
    hold: 0,
    buf: { p: 0, k: 0, s: 0, j: 0 },
    combo: 0,
    shown: 0,
    shownT: 0,
    jug: 0,
    bounced: false,
    stop: 0,
    sp: null,
    n: 0,
    flashes: 0,
    atk: 0,
  };
  resetFighter(f);
  return f;
}

/** Neue Runde: zurück an den Start, volle Energie – der Powerbalken bleibt. */
export function resetFighter(f: Fighter) {
  f.x = STAGE_W / 2 + (f.side === 'p1' ? -START_X : START_X);
  f.y = 0;
  f.vx = 0;
  f.vy = 0;
  f.face = f.side === 'p1' ? 1 : -1;
  f.hp = f.maxHp;
  f.st = 'idle';
  f.t = 0;
  f.dur = 0;
  f.mv = null;
  f.hit = false;
  f.inv = 0;
  f.buf = { p: 0, k: 0, s: 0, j: 0 };
  f.combo = 0;
  f.shown = 0;
  f.shownT = 0;
  f.jug = 0;
  f.bounced = false;
  f.stop = 0;
  f.sp = null;
}

export function newWorld(id1: string, id2: string): World {
  const a = fighterById(id1);
  const b = fighterById(id2);
  return {
    f: { p1: newFighter('p1', a), p2: newFighter('p2', b, a.id === b.id) },
    proj: [],
    ph: 'intro',
    phT: 0,
    round: 1,
    clock: ROUND_TIME,
    wins: { p1: 0, p2: 0 },
    roundWin: null,
    winner: null,
    timeUp: false,
    perfect: false,
    flash: null,
    slow: 0,
    pid: 0,
    fx: [{ k: 'round', side: 'p1', x: STAGE_W / 2, y: 0 }],
  };
}

// ───────────────────────── Hilfen ─────────────────────────

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

function set(f: Fighter, st: State) {
  if (f.st !== st) {
    f.st = st;
    f.t = 0;
  }
}

function fx(w: World, k: FxKind, side: Side, x: number, y: number, p?: Fx['p'], dir?: number) {
  w.fx.push({ k, side, x, y, p, dir });
}

/** Ein Grundangriff mit den Eigenheiten des Kämpfers */
export function moveOf(def: FighterDef, id: MoveId): MoveDef {
  const m = MOVES[id];
  return { ...m, startup: m.startup * def.quick, recovery: m.recovery * def.quick, dmg: Math.round(m.dmg * def.power), reach: m.reach * def.reach };
}

export const moveTime = (m: MoveDef) => m.startup + m.active + m.recovery;

/** Kann gerade frei handeln (laufen, springen, angreifen) */
export const actionable = (f: Fighter) => f.st === 'idle' || f.st === 'walk' || f.st === 'back' || f.st === 'block';

export function vulnerable(f: Fighter): boolean {
  if (f.st === 'down' || f.st === 'rise' || f.st === 'ko' || f.inv > 0) return false;
  return !(f.st === 'air' && f.jug >= MAX_JUGGLE);
}

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export function hurtBox(f: Fighter): Box | null {
  if (!vulnerable(f)) return null;
  const h = f.st === 'air' ? 112 : f.st === 'block' || f.st === 'bstun' ? 140 : 152;
  return { x0: f.x - 27, x1: f.x + 27, y0: f.y, y1: f.y + h };
}

export function hitBox(f: Fighter, m: MoveDef): Box {
  const a = f.x + f.face * m.near;
  const b = f.x + f.face * m.reach;
  return { x0: Math.min(a, b), x1: Math.max(a, b), y0: f.y + m.y0, y1: f.y + m.y1 };
}

export const overlap = (a: Box, b: Box | null) => !!b && a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/** Blockt, wer am Boden steht und vom Angreifer weg hält. */
export function canBlock(f: Fighter, dir: 1 | -1): boolean {
  if (f.y > 0) return false;
  const ok = f.st === 'idle' || f.st === 'walk' || f.st === 'back' || f.st === 'block' || f.st === 'bstun';
  return ok && f.hold === dir;
}

/** Kommt gerade etwas auf diesen Kämpfer zu? (Dann wird aus Rückwärtslaufen eine Deckung.) */
export function threatened(w: World, f: Fighter, o: Fighter): boolean {
  const dx = Math.abs(o.x - f.x);
  if (o.st === 'attack' && dx < 230) return true;
  if (o.st === 'special' && o.sp && o.sp.ph !== 'end' && dx < 700) return true;
  return w.proj.some((p) => p.owner !== f.side && Math.sign(f.x - p.x) === Math.sign(p.vx) && Math.abs(f.x - p.x) < 330);
}

function faceOther(f: Fighter, o: Fighter) {
  const d = o.x - f.x;
  if (Math.abs(d) > 2) f.face = d > 0 ? 1 : -1;
}

// ───────────────────────── Treffer ─────────────────────────

/** Einen Treffer anwenden. Entscheidet selbst, ob geblockt wurde – online also immer auf dem Handy des Getroffenen. */
export function applyBlow(w: World, v: Fighter, b: Blow): 'hit' | 'block' | 'miss' {
  if (!vulnerable(v)) return 'miss';
  if (canBlock(v, b.dir)) {
    v.hp = Math.max(0, v.hp - b.chip);
    v.st = 'bstun';
    v.t = 0;
    v.dur = b.bstun;
    v.vx = b.dir * b.push * 0.75;
    v.mv = null;
    v.stop = b.hs * 0.7;
    v.power = Math.min(POWER_MAX, v.power + 4);
    fx(w, 'block', v.side, b.x, b.y, b.k, b.dir);
    if (v.hp <= 0) knockOut(w, v, b);
    return 'block';
  }
  const inCombo = v.st === 'hit' || v.st === 'air' || v.st === 'held';
  v.combo = inCombo ? v.combo + 1 : 0;
  const scale = Math.max(b.k === 's' ? 0.7 : 0.45, 1 - 0.1 * v.combo);
  const dmg = Math.max(1, Math.round(b.dmg * scale));
  v.hp = Math.max(0, v.hp - dmg);
  v.power = Math.min(POWER_MAX, v.power + dmg * 0.12);
  v.stop = b.hs;
  v.mv = null;
  v.sp = null;
  fx(w, 'hit', v.side, b.x, b.y, b.k, b.dir);
  if (v.hp <= 0) knockOut(w, v, b);
  else if (b.hold > 0) {
    v.st = 'held';
    v.t = 0;
    v.dur = b.hold;
    v.vx = 0;
    v.vy = 0;
  } else if (b.kd || b.la > 0 || v.y > 0) {
    if (v.y > 0) v.jug++;
    v.st = 'air';
    v.t = 0;
    v.vy = b.la || (v.y > 0 ? 420 : 520);
    v.vx = b.dir * Math.max(b.push, 160);
    v.y = Math.max(v.y, 1);
    v.bounced = false;
  } else {
    v.st = 'hit';
    v.t = 0;
    v.dur = b.stun;
    v.vx = b.dir * b.push;
  }
  return 'hit';
}

function knockOut(w: World, v: Fighter, b: Blow) {
  v.st = 'ko';
  v.t = 0;
  v.vy = 760;
  v.vx = b.dir * 330;
  v.y = Math.max(v.y, 1);
  v.bounced = false;
  v.sp = null;
  v.mv = null;
  fx(w, 'ko', v.side, v.x, v.y + 90);
}

/** Angreifer trifft: lokal direkt anwenden, online ans andere Handy schicken (und schon mal so tun). */
function strike(w: World, att: Fighter, vic: Fighter, b: Blow, opts: StepOpts, ranged = false): 'hit' | 'block' | 'miss' {
  b.n = ++att.n;
  let res: 'hit' | 'block' | 'miss';
  if (opts.local.includes(vic.side)) res = applyBlow(w, vic, b);
  else {
    opts.send?.(b);
    res = vic.st === 'block' || vic.st === 'bstun' ? 'block' : 'hit';
    fx(w, res === 'block' ? 'block' : 'hit', vic.side, b.x, b.y, b.k, b.dir);
  }
  if (res === 'miss') return res;
  if (!ranged) {
    att.hit = true;
    att.stop = res === 'hit' ? b.hs : b.hs * 0.6;
    // In der Ecke prallt der Angreifer zurück, sonst ließe sich der andere festnageln.
    const wall = b.dir > 0 ? vic.x > STAGE_W - EDGE - 8 : vic.x < EDGE + 8;
    if (wall && att.y <= 0 && att.st === 'attack') att.vx = -b.dir * b.push * 0.6;
  }
  if (b.k !== 's') att.power = Math.min(POWER_MAX, att.power + (res === 'hit' ? b.dmg * 0.2 : 3));
  if (res === 'hit') {
    att.shown = att.shownT > 0 ? att.shown + 1 : 1;
    att.shownT = 0.85;
  }
  return res;
}

function blowOf(f: Fighter, m: MoveDef): Blow {
  return {
    n: 0,
    dmg: m.dmg,
    chip: 0,
    stun: m.stun,
    bstun: m.bstun,
    push: m.push,
    dir: f.face,
    kd: m.kd ? 1 : 0,
    la: m.la ?? 0,
    hold: 0,
    k: m.kind,
    hs: m.hs,
    x: f.x + f.face * m.reach * 0.82,
    y: f.y + (m.y0 + m.y1) / 2,
  };
}

// ───────────────────────── Angriffe ─────────────────────────

function startMove(w: World, f: Fighter, id: MoveId) {
  f.st = 'attack';
  f.t = 0;
  f.mv = id;
  f.hit = false;
  f.atk++;
  f.buf.p = 0;
  f.buf.k = 0;
  if (!MOVES[id].air) faceOtherIfKnown(w, f);
  fx(w, 'swing', f.side, f.x, f.y + 110, MOVES[id].kind);
}

function faceOtherIfKnown(w: World, f: Fighter) {
  faceOther(f, w.f[otherSide(f.side)]);
}

function stepAttack(w: World, f: Fighter, o: Fighter, dt: number, opts: StepOpts) {
  const m = moveOf(f.def, f.mv!);
  const t = f.t;
  if (!m.air) {
    if (t < m.startup + m.active) f.vx = f.face * (m.lunge ?? 0) * (t < m.startup ? 0.4 : 1);
    else f.vx *= Math.exp(-dt * 12);
  }
  if (!f.hit && t >= m.startup && t < m.startup + m.active && overlap(hitBox(f, m), hurtBox(o))) strike(w, f, o, blowOf(f, m), opts);
  if (!m.air && t >= m.startup) {
    const b = f.buf;
    if (b.s > 0 && f.hit && f.power >= POWER_MAX) return startSpecial(w, f);
    const np: MoveId | null = f.mv === 'p1' ? 'p2' : f.mv === 'p2' ? 'p3' : null;
    if (b.p > 0 && np && m.next?.includes(np)) return startMove(w, f, np);
    if (b.k > 0 && m.next?.includes('k')) return startMove(w, f, 'k');
  }
  if (t >= moveTime(m)) {
    f.mv = null;
    if (m.air) f.st = 'jump';
    else set(f, 'idle');
  }
}

// ───────────────────────── Spezialattacken ─────────────────────────

export function startSpecial(w: World, f: Fighter) {
  f.power = 0;
  f.st = 'special';
  f.t = 0;
  f.mv = null;
  f.vx = 0;
  f.hit = false;
  f.buf.s = 0;
  f.buf.p = 0;
  f.buf.k = 0;
  f.sp = { ph: 'flash', t: 0, i: 0, miss: false };
  f.flashes++;
  faceOtherIfKnown(w, f);
  w.flash = { side: f.side, t: FLASH_T };
  fx(w, 'super', f.side, f.x, f.y + 90);
}

/** Zeitpunkte der Ansturm-Treffer nach dem ersten (Sekunden ab dem Festhalten) */
export const RUSH_TIMES = [0.12, 0.24, 0.36, 0.5, 0.72];
const RUSH_DASH = 0.34;

function endSpecial(f: Fighter) {
  f.sp = null;
  set(f, 'idle');
}

function stepSpecial(w: World, f: Fighter, o: Fighter, dt: number, opts: StepOpts) {
  const sp = f.sp;
  if (!sp) return endSpecial(f);
  sp.t += dt;
  const sd = f.def.special;
  if (sd.kind === 'projectile') {
    if (sp.ph === 'go') {
      if (sp.i === 0 && sp.t >= 0.12) {
        sp.i = 1;
        w.proj.push({ id: ++w.pid, owner: f.side, x: f.x + f.face * 70, y: f.y + 92, vx: f.face * sd.speed, w: 104, h: 82, hits: sd.hits, cd: 0, slow: 0, t: 0 });
        fx(w, 'shoot', f.side, f.x + f.face * 70, f.y + 92, 's', f.face);
      }
      if (sp.t >= 0.62) endSpecial(f);
    }
    return;
  }
  // Ansturm
  if (sp.ph === 'go') {
    f.inv = 0.05;
    f.vx = f.face * sd.speed;
    if (sp.t < 0.02) fx(w, 'dash', f.side, f.x, f.y + 80, 's', f.face);
    const near = (o.x - f.x) * f.face;
    if (near > -20 && near < 82 && Math.abs(o.y - f.y) < 130 && vulnerable(o)) {
      const res = strike(w, f, o, rushBlow(f, o, 0), opts);
      f.vx = 0;
      if (res === 'block') {
        sp.ph = 'end';
        sp.t = 0;
        sp.miss = true;
        f.vx = -f.face * 380;
      } else {
        sp.ph = 'lock';
        sp.t = 0;
        sp.i = 0;
        f.x = o.x - f.face * 64;
      }
    } else if (sp.t >= RUSH_DASH) {
      sp.ph = 'end';
      sp.t = 0;
      sp.miss = true;
      f.vx = f.face * 240;
    }
  } else if (sp.ph === 'lock') {
    f.vx = 0;
    while (sp.i < RUSH_TIMES.length && sp.t >= RUSH_TIMES[sp.i]) {
      sp.i++;
      const last = sp.i === RUSH_TIMES.length;
      strike(w, f, o, rushBlow(f, o, sp.i), opts);
      if (last) {
        f.vy = 620;
        f.y = Math.max(f.y, 1);
      }
    }
    if (sp.i >= RUSH_TIMES.length && sp.t >= RUSH_TIMES[RUSH_TIMES.length - 1] + 0.12) {
      sp.ph = 'end';
      sp.t = 0;
    }
  } else if (sp.ph === 'end') {
    f.vx *= Math.exp(-dt * 6);
    if (f.y <= 0 && sp.t >= (sp.miss ? 0.5 : 0.3)) endSpecial(f);
  }
}

function rushBlow(f: Fighter, o: Fighter, i: number): Blow {
  const sd = f.def.special;
  const last = i === RUSH_TIMES.length;
  return {
    n: 0,
    dmg: last ? sd.last : sd.dmg,
    chip: i === 0 ? sd.chip : Math.round(sd.chip / 3),
    stun: 0.3,
    bstun: i === 0 ? 0.42 : 0.2,
    push: last ? 260 : i === 0 ? 220 : 0,
    dir: f.face,
    kd: last ? 1 : 0,
    la: last ? 960 : 0,
    hold: last ? 0 : 0.6,
    k: 's',
    hs: last ? 0.14 : 0.045,
    x: o.x - f.face * 6,
    y: o.y + 80 + ((i * 37) % 50) - 25,
  };
}

function stepProjectiles(w: World, dt: number, opts: StepOpts) {
  for (const p of [...w.proj]) {
    if (!opts.local.includes(p.owner) || !w.proj.includes(p)) continue;
    const owner = w.f[p.owner];
    const sd = owner.def.special;
    p.slow -= dt;
    p.x += p.vx * dt * (p.slow > 0 ? 0.12 : 1);
    p.t += dt;
    p.cd -= dt;
    // Zwei Geschosse heben sich gegenseitig auf.
    const rival = w.proj.find((q) => q.owner !== p.owner && Math.abs(q.x - p.x) < (q.w + p.w) / 2 && Math.abs(q.y - p.y) < (q.h + p.h) / 2);
    if (rival) {
      w.proj = w.proj.filter((q) => q !== p && (q !== rival || !opts.local.includes(q.owner)));
      fx(w, 'clash', p.owner, (p.x + rival.x) / 2, p.y);
      continue;
    }
    const o = w.f[otherSide(p.owner)];
    const box = { x0: p.x - p.w / 2, x1: p.x + p.w / 2, y0: p.y - p.h / 2, y1: p.y + p.h / 2 };
    if (p.cd <= 0 && overlap(box, hurtBox(o))) {
      p.hits--;
      const last = p.hits <= 0;
      const dir = (p.vx > 0 ? 1 : -1) as 1 | -1;
      strike(
        w,
        owner,
        o,
        {
          n: 0,
          dmg: last ? sd.last : sd.dmg,
          chip: sd.chip,
          stun: 0.32,
          bstun: 0.22,
          push: last ? 300 : 40,
          dir,
          kd: last ? 1 : 0,
          la: last ? 720 : 0,
          hold: 0,
          k: 's',
          hs: last ? 0.12 : 0.04,
          x: o.x - dir * 18,
          y: p.y,
        },
        opts,
        true,
      );
      p.cd = 0.09;
      p.slow = last ? 0 : 0.11;
      if (last) {
        w.proj = w.proj.filter((q) => q !== p);
        fx(w, 'pop', p.owner, p.x, p.y);
      }
      continue;
    }
    if (p.x < -150 || p.x > STAGE_W + 150) w.proj = w.proj.filter((q) => q !== p);
  }
}

// ───────────────────────── Ein Kämpfer, ein Schritt ─────────────────────────

function stepFighter(w: World, f: Fighter, o: Fighter, inp: Input, dt: number, opts: StepOpts) {
  const b = f.buf;
  b.p = inp.punch ? BUFFER : Math.max(0, b.p - dt);
  b.k = inp.kick ? BUFFER : Math.max(0, b.k - dt);
  b.s = inp.special ? BUFFER : Math.max(0, b.s - dt);
  b.j = inp.jump ? BUFFER : Math.max(0, b.j - dt);
  f.hold = inp.x;
  if (f.shownT > 0) {
    f.shownT -= dt;
    if (f.shownT <= 0) f.shown = 0;
  }
  if (f.stop > 0) {
    f.stop -= dt;
    return;
  }
  f.t += dt;
  if (f.inv > 0) f.inv = Math.max(0, f.inv - dt);
  const fight = w.ph === 'fight';
  const def = f.def;

  switch (f.st) {
    case 'idle':
    case 'walk':
    case 'back':
    case 'block': {
      faceOther(f, o);
      if ((w.ph === 'ko' || w.ph === 'over') && w.phT > 1.2) {
        if (w.roundWin === f.side) set(f, 'win');
        else if (w.timeUp && w.roundWin !== 'draw') set(f, 'tired');
      }
      if (!actionable(f)) break;
      if (fight && b.s > 0 && f.power >= POWER_MAX) startSpecial(w, f);
      else if (fight && b.j > 0) {
        f.st = 'jump';
        f.t = 0;
        f.vy = def.jump;
        f.vx = inp.x * JUMP_X * def.speed;
        f.airUsed = false;
        b.j = 0;
        fx(w, 'jump', f.side, f.x, 0);
      } else if (fight && b.p > 0) startMove(w, f, 'p1');
      else if (fight && b.k > 0) startMove(w, f, 'k');
      else {
        const dir = fight ? inp.x : 0;
        if (dir === 0) {
          set(f, 'idle');
          f.vx = 0;
        } else if (dir === f.face) {
          set(f, 'walk');
          f.vx = dir * WALK * def.speed;
        } else if (threatened(w, f, o)) {
          set(f, 'block');
          f.vx = 0;
        } else {
          set(f, 'back');
          f.vx = dir * BACK * def.speed;
        }
      }
      break;
    }
    case 'jump':
      if (fight && !f.airUsed && (b.p > 0 || b.k > 0)) {
        f.airUsed = true;
        startMove(w, f, b.k > 0 ? 'ak' : 'ap');
      }
      break;
    case 'attack':
      stepAttack(w, f, o, dt, opts);
      break;
    case 'hit':
    case 'bstun':
      f.vx *= Math.exp(-dt * 8);
      if (f.y > 0 && f.st === 'hit') {
        f.st = 'air';
        f.t = 0;
      } else if (f.t >= f.dur) {
        set(f, 'idle');
        f.combo = 0;
      }
      break;
    case 'held':
      f.vx = 0;
      f.vy = 0;
      if (f.t >= f.dur) {
        if (f.y > 0) set(f, 'air');
        else {
          set(f, 'idle');
          f.combo = 0;
        }
      }
      break;
    case 'air':
      f.vx *= Math.exp(-dt * 0.6);
      break;
    case 'down':
      f.vx *= Math.exp(-dt * 7);
      if (f.t >= f.dur) {
        set(f, 'rise');
        f.dur = RISE_T;
        f.inv = RISE_T + 0.12;
      }
      break;
    case 'rise':
      f.vx = 0;
      if (f.t >= f.dur) {
        set(f, 'idle');
        f.combo = 0;
        f.jug = 0;
      }
      break;
    case 'special':
      stepSpecial(w, f, o, dt, opts);
      break;
    case 'ko':
      f.vx *= Math.exp(-dt * (f.y > 0 ? 0.5 : 6));
      break;
    case 'win':
    case 'tired':
      f.vx = 0;
      break;
  }

  // Schwerkraft – außer beim Festhalten in der Luft und während des Ansturms
  const hang = f.st === 'held' || (f.st === 'special' && f.sp?.ph === 'go' && f.def.special.kind === 'rush');
  if ((f.y > 0 || f.vy > 0) && !hang) {
    f.vy -= GRAVITY * dt;
    f.y += f.vy * dt;
    if (f.y <= 0) land(w, f);
  }
  f.x += f.vx * dt;
  keepInside(f, o);
}

function keepInside(f: Fighter, o: Fighter) {
  f.x = clamp(f.x, EDGE, STAGE_W - EDGE);
  const gap = f.x - o.x;
  if (Math.abs(gap) > MAX_GAP) f.x = o.x + Math.sign(gap) * MAX_GAP;
}

function land(w: World, f: Fighter) {
  const vy = f.vy;
  f.y = 0;
  f.vy = 0;
  if ((f.st === 'air' || f.st === 'ko') && vy < -650 && !f.bounced) {
    // Einmal kurz aufprallen
    f.bounced = true;
    f.vy = -vy * 0.26;
    f.y = 0.01;
    fx(w, 'down', f.side, f.x, 0, 'h');
    return;
  }
  switch (f.st) {
    case 'jump':
      set(f, 'idle');
      f.vx = 0;
      fx(w, 'land', f.side, f.x, 0);
      break;
    case 'attack':
      if (f.mv && MOVES[f.mv].air) {
        f.mv = null;
        set(f, 'idle');
        f.vx = 0;
        fx(w, 'land', f.side, f.x, 0);
      }
      break;
    case 'air':
      f.st = 'down';
      f.t = 0;
      f.dur = DOWN_T;
      fx(w, 'down', f.side, f.x, 0, f.bounced ? 'l' : 'h');
      break;
    case 'ko':
      if (!f.bounced) fx(w, 'down', f.side, f.x, 0, 'h');
      f.bounced = true;
      break;
    case 'hit':
      set(f, 'idle');
      break;
    case 'special':
      f.vx = 0;
      fx(w, 'land', f.side, f.x, 0);
      break;
  }
}

function pushApart(w: World, opts: StepOpts) {
  const a = w.f.p1;
  const b = w.f.p2;
  const lying = (f: Fighter) => f.st === 'down' || f.st === 'ko';
  if (lying(a) || lying(b) || Math.abs(a.y - b.y) > 100) return;
  const dx = b.x - a.x;
  const d = Math.abs(dx);
  if (d >= BODY_W) return;
  const s = dx === 0 ? a.face : Math.sign(dx);
  const over = BODY_W - d;
  const la = opts.local.includes('p1');
  const lb = opts.local.includes('p2');
  if (la && lb) {
    a.x -= (s * over) / 2;
    b.x += (s * over) / 2;
    // An der Wand schiebt der andere allein.
    if (a.x < EDGE || a.x > STAGE_W - EDGE) {
      a.x = clamp(a.x, EDGE, STAGE_W - EDGE);
      b.x = a.x + s * BODY_W;
    } else if (b.x < EDGE || b.x > STAGE_W - EDGE) {
      b.x = clamp(b.x, EDGE, STAGE_W - EDGE);
      a.x = b.x - s * BODY_W;
    }
  } else if (la) a.x = clamp(a.x - s * over, EDGE, STAGE_W - EDGE);
  else if (lb) b.x = clamp(b.x + s * over, EDGE, STAGE_W - EDGE);
}

// ───────────────────────── Rundenablauf ─────────────────────────

function endRound(w: World, rw: Side | 'draw', timeUp: boolean) {
  w.ph = 'ko';
  w.phT = 0;
  w.roundWin = rw;
  w.timeUp = timeUp;
  w.slow = timeUp ? 0 : 1.15;
  w.perfect = rw !== 'draw' && w.f[rw].hp >= w.f[rw].maxHp;
  if (rw !== 'draw') w.wins[rw]++;
  const done = w.wins.p1 >= WIN_ROUNDS || w.wins.p2 >= WIN_ROUNDS || w.round >= MAX_ROUNDS;
  w.winner = done ? (w.wins.p1 === w.wins.p2 ? 'draw' : w.wins.p1 > w.wins.p2 ? 'p1' : 'p2') : null;
  if (timeUp) fx(w, 'time', 'p1', STAGE_W / 2, 0);
}

export function nextRound(w: World) {
  w.round++;
  w.ph = 'intro';
  w.phT = 0;
  w.clock = ROUND_TIME;
  w.roundWin = null;
  w.timeUp = false;
  w.perfect = false;
  w.proj = [];
  w.slow = 0;
  w.flash = null;
  resetFighter(w.f.p1);
  resetFighter(w.f.p2);
  fx(w, 'round', 'p1', STAGE_W / 2, 0);
}

function stepFlow(w: World, dt: number) {
  w.phT += dt;
  if (w.ph === 'intro') {
    if (w.phT >= INTRO_T) {
      w.ph = 'fight';
      w.phT = 0;
      fx(w, 'fight', 'p1', STAGE_W / 2, 0);
    }
  } else if (w.ph === 'fight') {
    w.clock = Math.max(0, w.clock - dt);
    const ka = w.f.p1.hp <= 0;
    const kb = w.f.p2.hp <= 0;
    if (ka || kb) endRound(w, ka && kb ? 'draw' : ka ? 'p2' : 'p1', false);
    else if (w.clock <= 0) {
      const ra = w.f.p1.hp / w.f.p1.maxHp;
      const rb = w.f.p2.hp / w.f.p2.maxHp;
      endRound(w, Math.abs(ra - rb) < 0.001 ? 'draw' : ra > rb ? 'p1' : 'p2', true);
    }
  } else if (w.ph === 'ko' && w.phT >= KO_T) {
    if (w.winner) {
      w.ph = 'over';
      w.phT = 0;
    } else nextRound(w);
  }
}

/** Ein Bild weiterrechnen. `dt` in Sekunden. */
export function stepWorld(w: World, inputs: Partial<Record<Side, Input>>, dt: number, opts: StepOpts) {
  if (w.flash) {
    // Spezialattacke wird gezündet: Alles hält still, nur der Zünder holt Schwung.
    w.flash.t -= dt;
    const fl = w.f[w.flash.side];
    if (opts.local.includes(fl.side)) {
      fl.t += dt;
      if (fl.sp) fl.sp.t += dt;
    }
    if (w.flash.t <= 0) {
      w.flash = null;
      if (opts.local.includes(fl.side) && fl.sp?.ph === 'flash') {
        fl.sp.ph = 'go';
        fl.sp.t = 0;
      }
    }
    return;
  }
  let gdt = dt;
  if (w.slow > 0) {
    w.slow -= dt;
    gdt = dt * 0.3;
  }
  const fight = w.ph === 'fight';
  for (const side of opts.local) {
    stepFighter(w, w.f[side], w.f[otherSide(side)], (fight && inputs[side]) || NO_INPUT, gdt, opts);
  }
  pushApart(w, opts);
  stepProjectiles(w, gdt, opts);
  if (opts.flow) stepFlow(w, w.ph === 'fight' ? gdt : dt);
  else {
    // Gast: Der Gastgeber gibt den Takt vor, dazwischen läuft die Uhr hier weiter.
    w.phT += dt;
    if (w.ph === 'fight') w.clock = Math.max(0, w.clock - gdt);
  }
}

// ───────────────────────── KI ─────────────────────────

export interface Ki {
  cool: number;
  plan: 'none' | 'walk' | 'back' | 'wait' | 'guard';
  planT: number;
  seq: ('p' | 'k' | 'j')[];
  seqT: number;
  react: number;
  blockT: number;
  threat: string;
}

export const newKi = (): Ki => ({ cool: 0.6, plan: 'none', planT: 0, seq: [], seqT: 0, react: 0, blockT: 0, threat: '' });

function threatKey(w: World, f: Fighter, o: Fighter): string {
  const dx = Math.abs(o.x - f.x);
  if (o.st === 'attack' && o.mv && dx < 200) return `a${o.atk}`;
  if (o.st === 'special' && o.sp && o.sp.ph !== 'end' && dx < 650) return `s${o.flashes}`;
  const p = w.proj.find((q) => q.owner !== f.side && Math.sign(f.x - q.x) === Math.sign(q.vx) && Math.abs(f.x - q.x) < 300);
  return p ? `p${p.id}` : '';
}

/** Die KI: läuft heran, schlägt Kombos, blockt manchmal – gut, aber schlagbar. */
export function kiInput(w: World, side: Side, ki: Ki, rnd: () => number, dt: number): Input {
  const inp: Input = { x: 0, jump: false, punch: false, kick: false, special: false };
  if (w.ph !== 'fight' || w.flash) return inp;
  const f = w.f[side];
  const o = w.f[otherSide(side)];
  const dx = o.x - f.x;
  const dist = Math.abs(dx);
  const to = (dx === 0 ? f.face : Math.sign(dx)) as 1 | -1;
  ki.cool -= dt;
  ki.planT -= dt;
  ki.react -= dt;
  ki.blockT -= dt;

  // Gefahr erkennen – mit menschlicher Reaktionszeit
  const threat = threatKey(w, f, o);
  if (threat && threat !== ki.threat) {
    ki.threat = threat;
    const proj = threat.startsWith('p');
    if (proj && f.y <= 0 && rnd() < 0.4) {
      ki.seq = ['j'];
      ki.seqT = 0.12 + rnd() * 0.12;
    } else if (rnd() < (proj || threat.startsWith('s') ? 0.65 : 0.5)) {
      ki.react = 0.1 + rnd() * 0.14;
      ki.blockT = ki.react + 0.45;
    }
  } else if (!threat) ki.threat = '';
  if (ki.blockT > 0 && ki.react <= 0 && f.y <= 0) {
    inp.x = (-to) as -1 | 1;
    return inp;
  }

  // Laufende Kombo weiterdrücken
  if (ki.seq.length) {
    ki.seqT -= dt;
    if (ki.seqT <= 0) {
      const k = ki.seq.shift();
      if (k === 'p') inp.punch = true;
      else if (k === 'k') inp.kick = true;
      else if (k === 'j') {
        inp.jump = true;
        inp.x = dist > 160 ? to : 0;
      }
      ki.seqT = 0.12 + rnd() * 0.07;
    }
    return inp;
  }

  // Im Sprung: auf dem Weg nach unten zutreten
  if (f.st === 'jump' && !f.airUsed && f.vy < 120 && dist < 130) {
    inp.kick = true;
    return inp;
  }
  if (!actionable(f)) return inp;

  if (f.power >= POWER_MAX && rnd() < dt * 1.6) {
    const proj = f.def.special.kind === 'projectile';
    if ((proj && dist > 200 && o.y <= 0) || (!proj && dist < 460 && vulnerable(o))) {
      inp.special = true;
      return inp;
    }
  }
  // Gegen Sprünge
  if (o.y > 40 && dist < 150 && ki.cool <= 0 && rnd() < dt * 5) {
    ki.seq = ['p', 'p', 'p'];
    ki.seqT = 0;
    ki.cool = 0.8;
    return inp;
  }
  if (dist < 108 && ki.cool <= 0 && vulnerable(o)) {
    const r = rnd();
    if (r < 0.4) ki.seq = ['p', 'p', 'p'];
    else if (r < 0.62) ki.seq = ['p', 'k'];
    else if (r < 0.8) ki.seq = ['k'];
    else if (r < 0.92) {
      ki.plan = 'back';
      ki.planT = 0.3 + rnd() * 0.2;
    } else {
      ki.plan = 'guard';
      ki.planT = 0.4 + rnd() * 0.3;
    }
    ki.seqT = 0;
    ki.cool = 0.55 + rnd() * 0.75;
    return inp;
  }
  if (ki.planT <= 0) {
    const r = rnd();
    if (dist > 135) {
      if (r < 0.7) ki.plan = 'walk';
      else if (r < 0.84) ki.plan = 'wait';
      else if (dist > 170 && dist < 330) {
        ki.plan = 'none';
        ki.seq = ['j'];
        ki.seqT = 0;
      } else ki.plan = 'walk';
    } else ki.plan = r < 0.4 ? 'wait' : r < 0.7 ? 'guard' : r < 0.85 ? 'back' : 'walk';
    ki.planT = 0.25 + rnd() * 0.5;
  }
  if (ki.plan === 'walk') inp.x = to;
  else if (ki.plan === 'back' || ki.plan === 'guard') inp.x = (-to) as -1 | 1;
  return inp;
}

// ───────────────────────── Online ─────────────────────────

/** Ein Kämpfer, wie er übers Netz geht: Jedes Handy schickt nur den eigenen. */
export interface NetF {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fc: 1 | -1;
  st: State;
  t: number;
  mv: MoveId | '';
  hp: number;
  pw: number;
  iv: 0 | 1;
  jg: number;
  sp: [SpPhase, number, number] | 0;
  /** Geschosse: id, x, y, vx, Treffer übrig */
  pr: [number, number, number, number, number][];
  /** Die letzten eigenen Treffer (doppelt geschickt schadet nicht, die Nummer zählt) */
  bl: Blow[];
  /** Wie oft schon eine Spezialattacke gezündet wurde */
  fl: number;
  cb: number;
}

const r1 = (v: number) => Math.round(v * 10) / 10;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

export function packFighter(w: World, f: Fighter, sent: Blow[]): NetF {
  return {
    x: r1(f.x),
    y: r1(f.y),
    vx: r1(f.vx),
    vy: r1(f.vy),
    fc: f.face,
    st: f.st,
    t: r3(f.t),
    mv: f.mv ?? '',
    hp: Math.round(f.hp),
    pw: r1(f.power),
    iv: f.inv > 0 ? 1 : 0,
    jg: f.jug,
    sp: f.sp ? [f.sp.ph, r3(f.sp.t), f.sp.i] : 0,
    pr: w.proj.filter((p) => p.owner === f.side).map((p) => [p.id, r1(p.x), r1(p.y), r1(p.vx), p.hits]),
    bl: sent,
    fl: f.flashes,
    cb: f.shown,
  };
}

/**
 * Den Kämpfer vom anderen Handy nachführen: Position weich hinterher, Zustand übernehmen.
 * `age`: wie alt die Nachricht schon ist (Sekunden).
 */
export function followNet(w: World, f: Fighter, p: NetF, age: number, dt: number) {
  const a = Math.min(age, 0.25);
  const air = p.y > 0 || p.vy > 0;
  const tx = clamp(p.x + p.vx * a, EDGE, STAGE_W - EDGE);
  const ty = air && p.st !== 'held' ? Math.max(0, p.y + p.vy * a - 0.5 * GRAVITY * a * a) : p.y;
  if (Math.abs(tx - f.x) > 140) f.x = tx;
  else f.x += (tx - f.x) * Math.min(1, dt * 16);
  f.y = Math.abs(ty - f.y) > 140 ? ty : f.y + (ty - f.y) * Math.min(1, dt * 18);
  f.vx = p.vx;
  f.vy = p.vy;
  f.face = p.fc;
  f.st = p.st;
  f.t = p.t + a;
  f.mv = p.mv || null;
  f.hp = p.hp;
  f.power = p.pw;
  f.inv = p.iv ? 0.05 : 0;
  f.jug = p.jg;
  f.shown = p.cb;
  f.sp = p.sp ? { ph: p.sp[0], t: p.sp[1] + a, i: p.sp[2], miss: false } : null;
  // Geschosse des anderen weiterfliegen lassen
  const mine = w.proj.filter((q) => q.owner !== f.side);
  const theirs = p.pr.map(([id, x, y, vx, hits]) => {
    const known = w.proj.find((q) => q.owner === f.side && q.id === id);
    const nx = x + vx * a;
    return { id, owner: f.side, x: known && Math.abs(known.x - nx) < 120 ? known.x + (nx - known.x) * Math.min(1, dt * 14) : nx, y, vx, w: 104, h: 82, hits, cd: 0, slow: 0, t: known ? known.t + dt : 0 };
  });
  w.proj = [...mine, ...theirs];
}

/** Der Rundenablauf, wie ihn der Gastgeber vorgibt */
export interface NetFlow {
  ph: Phase;
  pt: number;
  rd: number;
  ck: number;
  w: [number, number];
  rw: Side | 'draw' | '';
  win: Side | 'draw' | '';
  tu: 0 | 1;
  pf: 0 | 1;
}

export function packFlow(w: World): NetFlow {
  return {
    ph: w.ph,
    pt: r3(w.phT),
    rd: w.round,
    ck: r1(w.clock),
    w: [w.wins.p1, w.wins.p2],
    rw: w.roundWin ?? '',
    win: w.winner ?? '',
    tu: w.timeUp ? 1 : 0,
    pf: w.perfect ? 1 : 0,
  };
}

/** Gast: Rundenablauf übernehmen. Gibt `true` zurück, wenn eine neue Runde beginnt. */
export function followFlow(w: World, n: NetFlow): boolean {
  let fresh = false;
  if (n.rd > w.round) {
    w.round = n.rd - 1;
    nextRound(w);
    fresh = true;
  }
  if (n.ph === 'fight' && w.ph === 'intro') w.fx.push({ k: 'fight', side: 'p1', x: STAGE_W / 2, y: 0 });
  if (n.ph === 'ko' && w.ph === 'fight') {
    w.slow = n.tu ? 0 : 1.15;
    if (n.tu) w.fx.push({ k: 'time', side: 'p1', x: STAGE_W / 2, y: 0 });
  }
  w.ph = n.ph;
  if (Math.abs(w.phT - n.pt) > 0.25) w.phT = n.pt;
  if (Math.abs(w.clock - n.ck) > 0.6) w.clock = n.ck;
  w.wins = { p1: n.w[0], p2: n.w[1] };
  w.roundWin = n.rw || null;
  w.winner = n.win || null;
  w.timeUp = !!n.tu;
  w.perfect = !!n.pf;
  return fresh;
}

/** Ab so vielen Sekunden ohne Nachricht gilt das andere Handy als weg. */
export const NET_TIMEOUT = 10;
