import { otherSide, type Side } from './logic';
import type { Rnd, TurnDef } from './turn';

/**
 * Dame nach deutschen Regeln: Steine ziehen schräg vorwärts, schlagen vorwärts und rückwärts,
 * es herrscht Schlagzwang (mehrfaches Schlagen muss zu Ende gezogen werden) und die Dame zieht
 * und schlägt über beliebig viele freie Felder. Brett als Text, Feld 0 = oben links.
 * w/W = Weiß (unten, Stein/Dame), b/B = Schwarz (oben).
 */

export type DColor = 'w' | 'b';

export interface DMove {
  /** Startfeld und alle Landefelder */
  path: number[];
  /** Geschlagene Steine */
  caps: number[];
}

export interface CheckersState {
  board: string;
  white: Side;
  turn: DColor;
  /** Halbzüge ohne Schlagen und ohne Steinzug (50 = unentschieden) */
  quiet: number;
  last: DMove | null;
  winner?: Side | 'draw';
}

export type CheckersAction = { path: number[] };

const row = (i: number) => i >> 3;
const col = (i: number) => i & 7;
const on = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;
const DIRS = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];

export const dark = (i: number) => (row(i) + col(i)) % 2 === 1;
export const dColor = (p: string): DColor | null => (p === 'w' || p === 'W' ? 'w' : p === 'b' || p === 'B' ? 'b' : null);
const isKing = (p: string) => p === 'W' || p === 'B';

export function checkersStart(): string {
  let b = '';
  for (let i = 0; i < 64; i++) b += !dark(i) ? '.' : row(i) <= 2 ? 'b' : row(i) >= 5 ? 'w' : '.';
  return b;
}

function captures(b: string[], at: number, piece: string, taken: number[], path: number[], out: DMove[]) {
  const me = dColor(piece);
  const r = row(at);
  const c = col(at);
  let found = false;
  for (const [dr, dc] of DIRS) {
    if (isKing(piece)) {
      let rr = r + dr;
      let cc = c + dc;
      while (on(rr, cc) && b[rr * 8 + cc] === '.') {
        rr += dr;
        cc += dc;
      }
      if (!on(rr, cc)) continue;
      const mid = rr * 8 + cc;
      if (dColor(b[mid]) === me || taken.includes(mid)) continue;
      rr += dr;
      cc += dc;
      while (on(rr, cc) && b[rr * 8 + cc] === '.') {
        found = true;
        const land = rr * 8 + cc;
        captures(b, land, piece, [...taken, mid], [...path, land], out);
        rr += dr;
        cc += dc;
      }
    } else {
      if (!on(r + 2 * dr, c + 2 * dc)) continue;
      const mid = (r + dr) * 8 + c + dc;
      const land = (r + 2 * dr) * 8 + c + 2 * dc;
      const victim = dColor(b[mid]);
      if (!victim || victim === me || taken.includes(mid) || b[land] !== '.') continue;
      found = true;
      captures(b, land, piece, [...taken, mid], [...path, land], out);
    }
  }
  if (!found && taken.length) out.push({ path, caps: taken });
}

export function checkersMoves(board: string, turn: DColor): DMove[] {
  const b = board.split('');
  const caps: DMove[] = [];
  for (let i = 0; i < 64; i++) {
    if (dColor(b[i]) !== turn) continue;
    const piece = b[i];
    b[i] = '.'; // Der ziehende Stein blockiert seinen Weg nicht.
    captures(b, i, piece, [], [i], caps);
    b[i] = piece;
  }
  if (caps.length) return caps;
  const out: DMove[] = [];
  const fwd = turn === 'w' ? -1 : 1;
  for (let i = 0; i < 64; i++) {
    if (dColor(b[i]) !== turn) continue;
    for (const [dr, dc] of DIRS) {
      if (isKing(b[i])) {
        let rr = row(i) + dr;
        let cc = col(i) + dc;
        while (on(rr, cc) && b[rr * 8 + cc] === '.') {
          out.push({ path: [i, rr * 8 + cc], caps: [] });
          rr += dr;
          cc += dc;
        }
      } else if (dr === fwd && on(row(i) + dr, col(i) + dc) && b[(row(i) + dr) * 8 + col(i) + dc] === '.') {
        out.push({ path: [i, (row(i) + dr) * 8 + col(i) + dc], caps: [] });
      }
    }
  }
  return out;
}

export function playMove(board: string, m: DMove): string {
  const b = board.split('');
  const from = m.path[0];
  const to = m.path[m.path.length - 1];
  let piece = b[from];
  b[from] = '.';
  for (const c of m.caps) b[c] = '.';
  if (piece === 'w' && row(to) === 0) piece = 'W';
  if (piece === 'b' && row(to) === 7) piece = 'B';
  b[to] = piece;
  return b.join('');
}

export const sideOf = (s: CheckersState, c: DColor): Side => (c === 'w' ? s.white : otherSide(s.white));
export const colorOf = (s: CheckersState, side: Side): DColor => (s.white === side ? 'w' : 'b');
export const count = (board: string, c: DColor) => [...board].filter((p) => dColor(p) === c).length;

// ───── KI ─────

function evaluate(b: string): number {
  let v = 0;
  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (p === '.') continue;
    const r = row(i);
    const c = col(i);
    const center = c >= 2 && c <= 5 && r >= 2 && r <= 5 ? 6 : 0;
    if (p === 'w') v += 100 + (7 - r) * 5 + center + (r === 7 ? 8 : 0);
    else if (p === 'b') v -= 100 + r * 5 + center + (r === 0 ? 8 : 0);
    else if (p === 'W') v += 300 + center;
    else v -= 300 + center;
  }
  return v;
}

function negamax(board: string, turn: DColor, depth: number, alpha: number, beta: number): number {
  const moves = checkersMoves(board, turn);
  if (!moves.length) return -10_000 - depth;
  if (depth === 0) return (turn === 'w' ? 1 : -1) * evaluate(board);
  const next: DColor = turn === 'w' ? 'b' : 'w';
  // Schlagzüge zuerst, die meisten Steine vorne
  moves.sort((a, b) => b.caps.length - a.caps.length);
  for (const m of moves) {
    const v = -negamax(playMove(board, m), next, depth - 1, -beta, -alpha);
    if (v >= beta) return v;
    if (v > alpha) alpha = v;
  }
  return alpha;
}

export function checkersBestMove(board: string, turn: DColor, depth = 5, rnd: Rnd = Math.random, noise = 12): DMove | null {
  const moves = checkersMoves(board, turn);
  if (moves.length <= 1) return moves[0] ?? null;
  const next: DColor = turn === 'w' ? 'b' : 'w';
  let best = moves[0];
  let bestV = -Infinity;
  for (const m of moves) {
    const v = -negamax(playMove(board, m), next, depth - 1, -100_000, 100_000) + (rnd() - 0.5) * 2 * noise;
    if (v > bestV) {
      bestV = v;
      best = m;
    }
  }
  return best;
}

const samePath = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i]);

export const checkersDef: TurnDef<CheckersState, CheckersAction> = {
  init: ({ starter }) => ({ board: checkersStart(), white: starter, turn: 'w', quiet: 0, last: null }),
  turn: (s) => (s.winner ? null : sideOf(s, s.turn)),
  apply(s, a, by) {
    if (s.winner || sideOf(s, s.turn) !== by || !Array.isArray(a.path)) return null;
    const m = checkersMoves(s.board, s.turn).find((x) => samePath(x.path, a.path));
    if (!m) return null;
    const man = !isKing(s.board[m.path[0]]);
    const board = playMove(s.board, m);
    const turn: DColor = s.turn === 'w' ? 'b' : 'w';
    const quiet = m.caps.length || man ? 0 : s.quiet + 1;
    const next: CheckersState = { ...s, board, turn, quiet, last: m };
    if (!checkersMoves(board, turn).length) return { ...next, winner: by };
    if (quiet >= 50) return { ...next, winner: 'draw' };
    return next;
  },
  outcome: (s) => s.winner ?? null,
  cpu(s, side, rnd) {
    if (s.winner || sideOf(s, s.turn) !== side) return null;
    const m = checkersBestMove(s.board, s.turn, 5, rnd);
    return m ? { path: m.path } : null;
  },
  cpuDelay: () => 650,
  endDelay: 1600,
};
