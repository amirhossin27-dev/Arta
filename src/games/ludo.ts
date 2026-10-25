import { otherSide, type Side } from './logic';
import type { Rnd, TurnDef } from './turn';

/**
 * Mensch ärgere dich nicht für zwei: Spielbrett 11×11, 40 Felder im Kreis.
 * Position einer Figur: -1 = im Haus, 0–39 = Schritte ab dem eigenen Startfeld, 40–43 = Ziel.
 */

type XY = [number, number];

/** Laufweg im Uhrzeigersinn, beginnend beim Startfeld von p1 (unten). */
export const LUDO_TRACK: XY[] = [
  [4, 10], [4, 9], [4, 8], [4, 7], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6], [0, 5],
  [0, 4], [1, 4], [2, 4], [3, 4], [4, 4], [4, 3], [4, 2], [4, 1], [4, 0], [5, 0],
  [6, 0], [6, 1], [6, 2], [6, 3], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [10, 5],
  [10, 6], [9, 6], [8, 6], [7, 6], [6, 6], [6, 7], [6, 8], [6, 9], [6, 10], [5, 10],
];

export const LUDO_GOAL: Record<Side, XY[]> = {
  p1: [[5, 9], [5, 8], [5, 7], [5, 6]],
  p2: [[5, 1], [5, 2], [5, 3], [5, 4]],
};

export const LUDO_HOME: Record<Side, XY[]> = {
  p1: [[0, 9], [1, 9], [0, 10], [1, 10]],
  p2: [[9, 0], [10, 0], [9, 1], [10, 1]],
};

/** Die beiden unbenutzten Ecken – nur Deko, damit das Brett wie ein echtes aussieht. */
export const LUDO_SPARE_HOMES: XY[][] = [
  [[0, 0], [1, 0], [0, 1], [1, 1]],
  [[9, 9], [10, 9], [9, 10], [10, 10]],
];

const OFFSET: Record<Side, number> = { p1: 0, p2: 20 };
const GOAL_START = 40;
const LAST = 43;

export interface LudoState {
  pos: Record<Side, number[]>;
  turn: Side;
  phase: 'roll' | 'move';
  roll: number | null;
  /** Würfelversuche, wenn keine Figur ziehen kann (dann drei). */
  tries: number;
  /** Zähler, damit der Würfel auch bei gleicher Zahl neu rollt. */
  rolls: number;
  last?: { by: Side; roll: number; note?: string };
  winner?: Side;
}

export type LudoAction = { t: 'roll' } | { t: 'move'; i: number };

/** Feld auf dem Rundweg (0–39) oder `null` (Haus/Ziel). */
export function ludoAbs(side: Side, rel: number): number | null {
  return rel >= 0 && rel < GOAL_START ? (rel + OFFSET[side]) % 40 : null;
}

export function ludoCell(side: Side, rel: number, i: number): XY {
  if (rel < 0) return LUDO_HOME[side][i];
  if (rel >= GOAL_START) return LUDO_GOAL[side][rel - GOAL_START];
  return LUDO_TRACK[ludoAbs(side, rel)!];
}

function target(s: LudoState, side: Side, i: number, n: number): number | null {
  const own = s.pos[side];
  const rel = own[i];
  if (rel < 0) return n === 6 && !own.includes(0) ? 0 : null;
  const t = rel + n;
  if (t > LAST) return null;
  if (t >= GOAL_START) {
    // Im Ziel wird nicht übersprungen.
    for (let k = Math.max(rel + 1, GOAL_START); k <= t; k++) if (own.includes(k)) return null;
    return t;
  }
  return own.includes(t) ? null : t;
}

/** Erlaubte Züge – mit den klassischen Pflichten „Bei 6 raus“ und „Startfeld räumen“. */
export function ludoMoves(s: LudoState, side: Side, n: number): number[] {
  const own = s.pos[side];
  const all = own.map((_, i) => i).filter((i) => target(s, side, i, n) !== null);
  const inHouse = own.some((p) => p < 0);
  if (n === 6 && inHouse) {
    const enter = all.filter((i) => own[i] < 0);
    if (enter.length) return enter.slice(0, 1);
  }
  const onStart = own.indexOf(0);
  if (inHouse && onStart >= 0 && all.includes(onStart)) return [onStart];
  return all;
}

/** Kann überhaupt noch eine Figur laufen? Sonst gibt es drei Würfelversuche. */
function triesFor(pos: number[]): number {
  if (pos.some((p) => p >= 0 && p < GOAL_START)) return 1;
  const stuck = pos.every((p) => p < 0 || pos.filter((q) => q > p).length === LAST - p);
  return stuck ? 3 : 1;
}

function nextTurn(s: LudoState, side: Side): LudoState {
  return { ...s, turn: side, phase: 'roll', roll: null, tries: triesFor(s.pos[side]) };
}

export const ludoDef: TurnDef<LudoState, LudoAction> = {
  init: ({ starter }) => ({
    // Schneller zu zweit: Eine Figur steht schon auf dem Startfeld.
    pos: { p1: [0, -1, -1, -1], p2: [0, -1, -1, -1] },
    turn: starter,
    phase: 'roll',
    roll: null,
    tries: 1,
    rolls: 0,
  }),
  turn: (s) => (s.winner ? null : s.turn),
  apply(s, a, by, rnd) {
    if (s.winner || by !== s.turn) return null;
    if (a.t === 'roll') {
      if (s.phase !== 'roll') return null;
      const n = 1 + Math.floor(rnd() * 6);
      const base = { ...s, rolls: s.rolls + 1 };
      const moves = ludoMoves(s, by, n);
      if (moves.length) return { ...base, phase: 'move', roll: n, last: { by, roll: n } };
      if (n === 6) return { ...base, tries: 1, last: { by, roll: n, note: 'Kein Zug möglich – nochmal würfeln' } };
      if (s.tries > 1) return { ...base, tries: s.tries - 1, last: { by, roll: n, note: `Noch ${s.tries - 1}× versuchen` } };
      return { ...nextTurn(base, otherSide(by)), last: { by, roll: n, note: 'Kein Zug möglich' } };
    }
    if (s.phase !== 'move' || s.roll === null || !ludoMoves(s, by, s.roll).includes(a.i)) return null;
    const t = target(s, by, a.i, s.roll)!;
    const opp = otherSide(by);
    const pos = { ...s.pos, [by]: s.pos[by].map((p, k) => (k === a.i ? t : p)) };
    const abs = ludoAbs(by, t);
    let note: string | undefined;
    if (abs !== null) {
      const hit = s.pos[opp].findIndex((p) => ludoAbs(opp, p) === abs);
      if (hit >= 0) {
        pos[opp] = s.pos[opp].map((p, k) => (k === hit ? -1 : p));
        note = 'Rausgeworfen! 😈';
      }
    }
    if (!note && s.pos[by][a.i] < 0) note = 'Neue Figur im Spiel';
    if (!note && t >= GOAL_START && s.pos[by][a.i] < GOAL_START) note = 'Im Ziel! 🏁';
    const moved: LudoState = { ...s, pos, last: { by, roll: s.roll, note } };
    if (pos[by].every((p) => p >= GOAL_START)) return { ...moved, winner: by, phase: 'roll', roll: null };
    if (s.roll === 6) return { ...moved, phase: 'roll', roll: null, tries: 1 };
    return nextTurn(moved, opp);
  },
  outcome: (s) => s.winner ?? null,
  auto(s) {
    if (s.winner || s.phase !== 'move' || s.roll === null) return null;
    const moves = ludoMoves(s, s.turn, s.roll);
    return moves.length === 1 ? { action: { t: 'move', i: moves[0] }, by: s.turn, delay: 700 } : null;
  },
  cpu(s, side, rnd) {
    if (s.turn !== side || s.winner) return null;
    if (s.phase === 'roll') return { t: 'roll' };
    const moves = ludoMoves(s, side, s.roll!);
    if (!moves.length) return null;
    let best = moves[0];
    let bestScore = -Infinity;
    for (const i of moves) {
      const score = ludoMoveScore(s, side, i, s.roll!) + rnd() * 4;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    return { t: 'move', i: best };
  },
  cpuDelay: (s) => (s.phase === 'roll' ? 750 : 650),
  endDelay: 1500,
};

/** Kann der Gegner dieses Feld mit dem nächsten Wurf erreichen? */
function threatened(s: LudoState, side: Side, abs: number): boolean {
  const opp = otherSide(side);
  return s.pos[opp].some((p) => {
    if (p < 0) return abs === OFFSET[opp];
    const a = ludoAbs(opp, p);
    if (a === null) return false;
    const d = (abs - a + 40) % 40;
    return d >= 1 && d <= 6 && p + d < GOAL_START;
  });
}

/** Wie gut ist ein Zug? (Für die KI – schlagen, ins Ziel, Gefahr meiden.) */
export function ludoMoveScore(s: LudoState, side: Side, i: number, n: number): number {
  const from = s.pos[side][i];
  const t = target(s, side, i, n);
  if (t === null) return -Infinity;
  const opp = otherSide(side);
  const abs = ludoAbs(side, t);
  let score = t / 4;
  if (abs !== null) {
    const victim = s.pos[opp].find((p) => ludoAbs(opp, p) === abs);
    if (victim !== undefined) score += 50 + victim / 2;
    if (threatened(s, side, abs)) score -= 18;
  }
  if (t >= GOAL_START && from < GOAL_START) score += 40;
  if (from < 0) score += 30;
  const fromAbs = ludoAbs(side, from);
  if (fromAbs !== null && threatened(s, side, fromAbs)) score += 15;
  return score;
}

/** Für Tests: Würfel mit fester Zahlenfolge. */
export function dice(...rolls: number[]): Rnd {
  let k = 0;
  return () => (rolls[k++ % rolls.length] - 1) / 6 + 0.01;
}
