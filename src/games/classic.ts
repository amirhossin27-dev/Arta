import { c4CpuMove, c4Drop, c4Empty, c4Full, c4Winner, C4_COLS, memoryDeck, otherSide, tttCpuMove, tttResult, type Cell, type Side } from './logic';
import type { TurnDef } from './turn';

// Die Klassiker als Regel-Funktionen – damit laufen sie an einem Handy, gegen die KI und online.

// ───── Tic-Tac-Toe ─────

export interface TttState {
  board: Cell[];
  turn: Side;
}

export const tttDef: TurnDef<TttState, number> = {
  init: ({ starter }) => ({ board: Array(9).fill(null), turn: starter }),
  turn: (s) => (tttResult(s.board) ? null : s.turn),
  apply(s, i, by) {
    if (by !== s.turn || s.board[i] !== null || i < 0 || i > 8 || tttResult(s.board)) return null;
    const board = s.board.slice();
    board[i] = by;
    return { board, turn: otherSide(by) };
  },
  outcome: (s) => tttResult(s.board)?.winner ?? null,
  cpu: (s, side, rnd) => tttCpuMove(s.board, side, rnd),
  cpuDelay: () => 520 + Math.random() * 300,
  endDelay: 1100,
};

// ───── Vier gewinnt ─────

export interface C4State {
  board: Cell[];
  turn: Side;
  last: number;
}

export const c4Def: TurnDef<C4State, number> = {
  init: ({ starter }) => ({ board: c4Empty(), turn: starter, last: -1 }),
  turn: (s) => (c4Winner(s.board) || c4Full(s.board) ? null : s.turn),
  apply(s, col, by) {
    if (by !== s.turn || c4Winner(s.board)) return null;
    const d = c4Drop(s.board, col, by);
    return d ? { board: d.board, turn: otherSide(by), last: d.row * C4_COLS + col } : null;
  },
  outcome: (s) => c4Winner(s.board)?.winner ?? (c4Full(s.board) ? 'draw' : null),
  cpu: (s, side, rnd) => c4CpuMove(s.board, side, 4, rnd),
  cpuDelay: () => 650 + Math.random() * 350,
  endDelay: 1400,
};

// ───── Memory ─────

export const MEMORY_PAIRS = 8;

export interface MemoryState {
  deck: string[];
  owner: (Side | null)[];
  open: number[];
  turn: Side;
  moves: number;
  solo: boolean;
  /** Welche Karten schon einmal offen lagen – das „Gedächtnis“ der KI. */
  seen: number[];
}

export type MemoryAction = { t: 'flip'; i: number } | { t: 'resolve' };

const memoryDone = (s: MemoryState) => s.owner.every(Boolean);

export const memoryDef: TurnDef<MemoryState, MemoryAction> = {
  init: ({ starter, mode, rnd }) => ({
    deck: memoryDeck(MEMORY_PAIRS, rnd),
    owner: Array(MEMORY_PAIRS * 2).fill(null),
    open: [],
    turn: mode === 'solo' ? 'p1' : starter,
    moves: 0,
    solo: mode === 'solo',
    seen: [],
  }),
  turn: (s) => (memoryDone(s) ? null : s.turn),
  apply(s, a, by) {
    if (by !== s.turn) return null;
    if (a.t === 'flip') {
      if (s.open.length === 2 || s.open.includes(a.i) || s.owner[a.i] || a.i < 0 || a.i >= s.deck.length) return null;
      const open = [...s.open, a.i];
      return { ...s, open, moves: open.length === 2 ? s.moves + 1 : s.moves, seen: s.seen.includes(a.i) ? s.seen : [...s.seen, a.i] };
    }
    if (s.open.length !== 2) return null;
    const [x, y] = s.open;
    if (s.deck[x] === s.deck[y]) return { ...s, open: [], owner: s.owner.map((o, k) => (k === x || k === y ? s.turn : o)) };
    return { ...s, open: [], turn: s.solo ? s.turn : otherSide(s.turn) };
  },
  outcome(s) {
    if (s.solo || !memoryDone(s)) return null;
    const p1 = s.owner.filter((o) => o === 'p1').length;
    const p2 = s.owner.length - p1;
    return p1 === p2 ? 'draw' : p1 > p2 ? 'p1' : 'p2';
  },
  auto(s) {
    if (s.open.length !== 2) return null;
    const match = s.deck[s.open[0]] === s.deck[s.open[1]];
    return { action: { t: 'resolve' }, by: s.turn, delay: match ? 450 : 950 };
  },
  cpu(s, side, rnd) {
    if (s.turn !== side || s.open.length === 2) return null;
    // Die KI merkt sich nicht alles – sonst wäre sie unschlagbar.
    const remembered = s.seen.filter((i) => !s.owner[i] && !s.open.includes(i) && rnd() < 0.7);
    const hidden = s.deck.map((_, i) => i).filter((i) => !s.owner[i] && !s.open.includes(i));
    const unknown = hidden.filter((i) => !s.seen.includes(i));
    const any = (list: number[]) => list[Math.floor(rnd() * list.length)];
    if (s.open.length === 1) {
      const first = s.open[0];
      const twin = remembered.find((i) => s.deck[i] === s.deck[first]);
      return { t: 'flip', i: twin ?? any(unknown.length ? unknown : hidden) };
    }
    for (const i of remembered) {
      if (remembered.some((j) => j !== i && s.deck[j] === s.deck[i])) return { t: 'flip', i };
    }
    return { t: 'flip', i: any(unknown.length ? unknown : hidden) };
  },
  cpuDelay: (s) => (s.open.length ? 650 : 850),
  endDelay: 900,
};
