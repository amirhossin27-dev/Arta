import { alive } from '../lib/stats';
import type { AppData, PersonId } from '../lib/types';
import { GAME_BY_ID, GAMES, type GameId } from './registry';

/** Spieler 1 sitzt unten (du), Spieler 2 oben (dein Schatz oder Arta 🤖). */
export type Side = 'p1' | 'p2';
export type Cell = Side | null;

export const otherSide = (s: Side): Side => (s === 'p1' ? 'p2' : 'p1');

type Rnd = () => number;

function pick<T>(items: readonly T[], rnd: Rnd): T {
  return items[Math.floor(rnd() * items.length)];
}

// ───────────────────────── Tic-Tac-Toe ─────────────────────────

const TTT_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export function tttResult(b: Cell[]): { winner: Side | 'draw'; line?: number[] } | null {
  for (const line of TTT_LINES) {
    const [x, y, z] = line;
    if (b[x] && b[x] === b[y] && b[x] === b[z]) return { winner: b[x]!, line };
  }
  return b.every(Boolean) ? { winner: 'draw' } : null;
}

function tttScore(b: Cell[], me: Side, turn: Side, depth: number): number {
  const r = tttResult(b);
  if (r) return r.winner === 'draw' ? 0 : r.winner === me ? 10 - depth : depth - 10;
  const scores: number[] = [];
  b.forEach((c, i) => {
    if (c) return;
    b[i] = turn;
    scores.push(tttScore(b, me, otherSide(turn), depth + 1));
    b[i] = null;
  });
  return turn === me ? Math.max(...scores) : Math.min(...scores);
}

/** Perfekter Zug per Minimax; bei Gleichstand zufällig unter den besten. */
export function tttBestMove(board: Cell[], me: Side, rnd: Rnd = Math.random): number {
  // Leeres Brett: Mitte oder Ecke ist immer optimal – spart die volle Suche.
  if (board.every((c) => !c)) return pick([0, 2, 4, 6, 8], rnd);
  const b = board.slice();
  let best = -Infinity;
  let moves: number[] = [];
  b.forEach((c, i) => {
    if (c) return;
    b[i] = me;
    const s = tttScore(b, me, otherSide(me), 1);
    b[i] = null;
    if (s > best) {
      best = s;
      moves = [i];
    } else if (s === best) moves.push(i);
  });
  return pick(moves, rnd);
}

/** Arta spielt meistens perfekt, aber nicht immer – sonst wäre es kein Spaß. */
export function tttCpuMove(board: Cell[], me: Side, rnd: Rnd = Math.random): number {
  const empty = board.flatMap((c, i) => (c ? [] : [i]));
  if (rnd() < 0.22) return pick(empty, rnd);
  return tttBestMove(board, me, rnd);
}

// ───────────────────────── Vier gewinnt ─────────────────────────

export const C4_COLS = 7;
export const C4_ROWS = 6;

/** Index = Zeile * 7 + Spalte, Zeile 0 ist oben. */
export function c4Empty(): Cell[] {
  return Array(C4_COLS * C4_ROWS).fill(null);
}

export function c4LandingRow(b: Cell[], col: number): number {
  for (let row = C4_ROWS - 1; row >= 0; row--) {
    if (!b[row * C4_COLS + col]) return row;
  }
  return -1;
}

export function c4Drop(b: Cell[], col: number, side: Side): { board: Cell[]; row: number } | null {
  const row = c4LandingRow(b, col);
  if (row < 0) return null;
  const board = b.slice();
  board[row * C4_COLS + col] = side;
  return { board, row };
}

const C4_DIRS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
];

/** Alle Vierer-Fenster des Bretts (für Gewinnprüfung und Bewertung). */
const C4_WINDOWS: number[][] = (() => {
  const out: number[][] = [];
  for (let r = 0; r < C4_ROWS; r++) {
    for (let c = 0; c < C4_COLS; c++) {
      for (const [dr, dc] of C4_DIRS) {
        const cells: number[] = [];
        for (let k = 0; k < 4; k++) {
          const rr = r + dr * k;
          const cc = c + dc * k;
          if (rr < 0 || rr >= C4_ROWS || cc < 0 || cc >= C4_COLS) break;
          cells.push(rr * C4_COLS + cc);
        }
        if (cells.length === 4) out.push(cells);
      }
    }
  }
  return out;
})();

export function c4Winner(b: Cell[]): { winner: Side; cells: number[] } | null {
  for (const w of C4_WINDOWS) {
    const s = b[w[0]];
    if (s && b[w[1]] === s && b[w[2]] === s && b[w[3]] === s) {
      // Längere Reihen komplett hervorheben
      const cells = new Set(w);
      for (const w2 of C4_WINDOWS) if (w2.every((i) => b[i] === s) && w2.some((i) => cells.has(i))) w2.forEach((i) => cells.add(i));
      return { winner: s, cells: [...cells] };
    }
  }
  return null;
}

export function c4Full(b: Cell[]): boolean {
  return b.slice(0, C4_COLS).every(Boolean);
}

function c4Evaluate(b: Cell[], me: Side): number {
  const opp = otherSide(me);
  let score = 0;
  for (let r = 0; r < C4_ROWS; r++) if (b[r * C4_COLS + 3] === me) score += 3;
  for (const w of C4_WINDOWS) {
    let mine = 0;
    let theirs = 0;
    for (const i of w) {
      if (b[i] === me) mine++;
      else if (b[i] === opp) theirs++;
    }
    if (mine && theirs) continue;
    if (mine === 3) score += 5;
    else if (mine === 2) score += 2;
    if (theirs === 3) score -= 4;
    else if (theirs === 2) score -= 1;
  }
  return score;
}

const C4_ORDER = [3, 2, 4, 1, 5, 0, 6];

function c4Negamax(b: Cell[], side: Side, depth: number, alpha: number, beta: number): number {
  if (c4Full(b)) return 0;
  if (depth === 0) return c4Evaluate(b, side);
  let best = -Infinity;
  for (const col of C4_ORDER) {
    const d = c4Drop(b, col, side);
    if (!d) continue;
    const score = c4Winner(d.board) ? 1000 + depth : -c4Negamax(d.board, otherSide(side), depth - 1, -beta, -alpha);
    if (score > best) best = score;
    if (best > alpha) alpha = best;
    if (alpha >= beta) break;
  }
  return best;
}

/** Arta denkt ein paar Züge voraus – stark genug zum Ärgern, schwach genug zum Schlagen. */
export function c4CpuMove(b: Cell[], me: Side, depth = 4, rnd: Rnd = Math.random): number {
  let best = -Infinity;
  let moves: number[] = [];
  for (const col of C4_ORDER) {
    const d = c4Drop(b, col, me);
    if (!d) continue;
    const score = c4Winner(d.board) ? 10_000 : -c4Negamax(d.board, otherSide(me), depth - 1, -Infinity, Infinity);
    if (score > best) {
      best = score;
      moves = [col];
    } else if (score === best) moves.push(col);
  }
  return pick(moves, rnd);
}

// ───────────────────────── Memory ─────────────────────────

export const MEMORY_EMOJIS = ['💋', '🌹', '🍓', '🥂', '💍', '🍫', '🧸', '💌', '🌙', '🦋', '🍕', '🎈', '🌻', '🍒', '🐝', '🎁', '☕', '🍩', '🌈', '🎵', '🏝️', '🚲'];

export function memoryDeck(pairs: number, rnd: Rnd = Math.random): string[] {
  const pool = MEMORY_EMOJIS.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const deck = [...pool.slice(0, pairs), ...pool.slice(0, pairs)];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// ───────────────────────── Bilanz ─────────────────────────

export interface GameSummary {
  best: Partial<Record<PersonId, number>>;
  wins: Record<PersonId, number>;
  draws: number;
  plays: number;
}

/** Fasst die Zeilen aller Geräte zusammen: Siege werden addiert, Rekorde verglichen. */
export function gameSummary(d: AppData, game: GameId): GameSummary {
  const lower = GAME_BY_ID[game]?.lowerIsBetter ?? false;
  const out: GameSummary = { best: {}, wins: { a: 0, b: 0 }, draws: 0, plays: 0 };
  for (const s of alive(d.games)) {
    if (s.game !== game) continue;
    out.draws += s.draws || 0;
    out.plays += s.plays || 0;
    for (const p of ['a', 'b'] as const) {
      out.wins[p] += s.wins?.[p] ?? 0;
      const v = s.best?.[p];
      if (typeof v !== 'number') continue;
      const cur = out.best[p];
      if (cur === undefined || (lower ? v < cur : v > cur)) out.best[p] = v;
    }
  }
  return out;
}

/** Gesamtbilanz aller Duelle (für die Krone 👑). */
export function duelTotals(d: AppData): { wins: Record<PersonId, number>; draws: number; plays: number } {
  const out = { wins: { a: 0, b: 0 }, draws: 0, plays: 0 };
  for (const g of GAMES) {
    const s = gameSummary(d, g.id);
    out.wins.a += s.wins.a;
    out.wins.b += s.wins.b;
    out.draws += s.draws;
    out.plays += s.plays;
  }
  return out;
}

/** Ist `a` ein besserer Wert als `b`? */
export function isBetter(game: GameId, a: number, b: number | undefined): boolean {
  if (b === undefined) return true;
  return GAME_BY_ID[game].lowerIsBetter ? a < b : a > b;
}
