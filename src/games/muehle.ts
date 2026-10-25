import { otherSide, type Side } from './logic';
import type { Rnd, TurnDef } from './turn';

/**
 * Mühle: Jeder setzt 9 Steine, danach wird entlang der Linien gezogen, mit 3 Steinen darf man
 * springen. Wer eine Mühle schließt, nimmt dem anderen einen Stein (aus einer Mühle nur, wenn
 * es nicht anders geht). Wer nur noch 2 Steine hat oder nicht mehr ziehen kann, verliert.
 */

/** Lage der 24 Punkte im 7×7-Raster [Zeile, Spalte] */
export const MILL_POINTS: [number, number][] = [
  [0, 0], [0, 3], [0, 6],
  [1, 1], [1, 3], [1, 5],
  [2, 2], [2, 3], [2, 4],
  [3, 0], [3, 1], [3, 2], [3, 4], [3, 5], [3, 6],
  [4, 2], [4, 3], [4, 4],
  [5, 1], [5, 3], [5, 5],
  [6, 0], [6, 3], [6, 6],
];

export const MILLS: number[][] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11], [12, 13, 14], [15, 16, 17], [18, 19, 20], [21, 22, 23],
  [0, 9, 21], [3, 10, 18], [6, 11, 15], [1, 4, 7], [16, 19, 22], [8, 12, 17], [5, 13, 20], [2, 14, 23],
];

export const MILL_ADJ: number[][] = MILL_POINTS.map((_, i) => {
  const out = new Set<number>();
  for (const [a, b, c] of MILLS) {
    if (i === a || i === c) out.add(b);
    if (i === b) {
      out.add(a);
      out.add(c);
    }
  }
  return [...out];
});

export const MILL_STONES = 9;

type Cell = Side | null;

export interface MuehleState {
  board: Cell[];
  hand: Record<Side, number>;
  turn: Side;
  /** Wer am Zug ist, hat gerade eine Mühle geschlossen und nimmt einen Stein. */
  removing: boolean;
  /** Halbzüge ohne Schlagen nach dem Setzen (60 = unentschieden) */
  quiet: number;
  last: { by: Side; from?: number; to?: number; removed?: number } | null;
  winner?: Side | 'draw';
}

export type MuehleAction = { t: 'place'; at: number } | { t: 'move'; from: number; to: number } | { t: 'remove'; at: number };

export const onBoard = (b: Cell[], side: Side) => b.filter((c) => c === side).length;
export const inMill = (b: Cell[], i: number) => !!b[i] && MILLS.some((m) => m.includes(i) && m.every((j) => b[j] === b[i]));
export const phaseOf = (s: MuehleState, side: Side): 'place' | 'move' | 'fly' => (s.hand[side] > 0 ? 'place' : onBoard(s.board, side) === 3 ? 'fly' : 'move');

/** Welche Steine darf `side` gerade wegnehmen? */
export function removable(b: Cell[], side: Side): number[] {
  const opp = otherSide(side);
  const theirs = b.flatMap((c, i) => (c === opp ? [i] : []));
  const free = theirs.filter((i) => !inMill(b, i));
  return free.length ? free : theirs;
}

export function muehleMoves(s: MuehleState): MuehleAction[] {
  const side = s.turn;
  if (s.removing) return removable(s.board, side).map((at) => ({ t: 'remove', at }));
  const empty = s.board.flatMap((c, i) => (c ? [] : [i]));
  const phase = phaseOf(s, side);
  if (phase === 'place') return empty.map((at) => ({ t: 'place', at }));
  const out: MuehleAction[] = [];
  s.board.forEach((c, from) => {
    if (c !== side) return;
    for (const to of phase === 'fly' ? empty : MILL_ADJ[from].filter((j) => !s.board[j])) out.push({ t: 'move', from, to });
  });
  return out;
}

const closes = (b: Cell[], at: number) => MILLS.some((m) => m.includes(at) && m.every((j) => b[j] === b[at]));

const same = (a: MuehleAction, b: MuehleAction) =>
  a.t === b.t && (a.t === 'move' ? b.t === 'move' && a.from === b.from && a.to === b.to : a.at === (b as { at: number }).at);

function step(s: MuehleState, a: MuehleAction, by: Side, check = true): MuehleState | null {
  if (s.winner || by !== s.turn) return null;
  if (check && !muehleMoves(s).some((m) => same(m, a))) return null;
  const opp = otherSide(by);
  const board = s.board.slice();
  if (a.t === 'remove') {
    board[a.at] = null;
    const next: MuehleState = { ...s, board, removing: false, turn: opp, quiet: 0, last: { ...(s.last ?? { by }), by, removed: a.at } };
    return settle(next);
  }
  let hand = s.hand;
  let at: number;
  if (a.t === 'place') {
    board[a.at] = by;
    hand = { ...hand, [by]: hand[by] - 1 };
    at = a.at;
  } else {
    board[a.from] = null;
    board[a.to] = by;
    at = a.to;
  }
  const placing = s.hand.p1 + s.hand.p2 > 0;
  const last = a.t === 'place' ? { by, to: a.at } : { by, from: a.from, to: a.to };
  if (closes(board, at)) return { ...s, board, hand, removing: true, last };
  return settle({ ...s, board, hand, turn: opp, quiet: placing ? 0 : s.quiet + 1, last });
}

/** Hat der, der jetzt dran ist, schon verloren? */
function settle(s: MuehleState): MuehleState {
  const side = s.turn;
  const opp = otherSide(side);
  if (s.hand[side] === 0 && onBoard(s.board, side) < 3) return { ...s, winner: opp };
  if (!muehleMoves(s).length) return { ...s, winner: opp };
  if (s.quiet >= 60) return { ...s, winner: 'draw' };
  return s;
}

// ───── KI ─────

function evaluate(s: MuehleState, me: Side): number {
  if (s.winner) return s.winner === 'draw' ? 0 : s.winner === me ? 10_000 : -10_000;
  const opp = otherSide(me);
  const stones = (x: Side) => onBoard(s.board, x) + s.hand[x];
  let v = (stones(me) - stones(opp)) * 120;
  for (const m of MILLS) {
    const mine = m.filter((j) => s.board[j] === me).length;
    const theirs = m.filter((j) => s.board[j] === opp).length;
    if (mine === 3) v += 25;
    if (theirs === 3) v -= 25;
    if (mine === 2 && theirs === 0) v += 18;
    if (theirs === 2 && mine === 0) v -= 22;
  }
  if (s.hand.p1 + s.hand.p2 === 0) {
    const mob = (x: Side) => muehleMoves({ ...s, turn: x, removing: false }).length;
    v += (mob(me) - mob(opp)) * 4;
  }
  if (s.removing) v += s.turn === me ? 100 : -100;
  return v;
}

function search(s: MuehleState, depth: number, me: Side, alpha: number, beta: number): number {
  if (depth === 0 || s.winner) return evaluate(s, me);
  const moves = muehleMoves(s);
  const maximize = s.turn === me;
  let best = maximize ? -Infinity : Infinity;
  for (const m of moves) {
    const next = step(s, m, s.turn, false);
    if (!next) continue;
    // Wegnehmen gehört zum gleichen Zug – dafür keine Tiefe verbrauchen.
    const v = search(next, s.removing ? depth : depth - 1, me, alpha, beta);
    if (maximize) {
      best = Math.max(best, v);
      alpha = Math.max(alpha, v);
    } else {
      best = Math.min(best, v);
      beta = Math.min(beta, v);
    }
    if (beta <= alpha) break;
  }
  return best;
}

export function muehleBestMove(s: MuehleState, depth = 3, rnd: Rnd = Math.random, noise = 8): MuehleAction | null {
  const moves = muehleMoves(s);
  if (!moves.length) return null;
  const me = s.turn;
  let best = moves[0];
  let bestV = -Infinity;
  for (const m of moves) {
    const next = step(s, m, me, false);
    if (!next) continue;
    const v = search(next, s.removing ? depth : depth - 1, me, -Infinity, Infinity) + (rnd() - 0.5) * 2 * noise;
    if (v > bestV) {
      bestV = v;
      best = m;
    }
  }
  return best;
}

export const muehleDef: TurnDef<MuehleState, MuehleAction> = {
  init: ({ starter }) => ({ board: Array(24).fill(null), hand: { p1: MILL_STONES, p2: MILL_STONES }, turn: starter, removing: false, quiet: 0, last: null }),
  turn: (s) => (s.winner ? null : s.turn),
  apply: (s, a, by) => step(s, a, by),
  outcome: (s) => s.winner ?? null,
  cpu(s, side, rnd) {
    if (s.winner || s.turn !== side) return null;
    // Wer springen darf, hat sehr viele Züge – dann reichen zwei Halbzüge.
    const flying = phaseOf(s, 'p1') === 'fly' || phaseOf(s, 'p2') === 'fly';
    return muehleBestMove(s, flying ? 2 : 3, rnd);
  },
  cpuDelay: (s) => (s.removing ? 700 : 600),
  endDelay: 1500,
};
