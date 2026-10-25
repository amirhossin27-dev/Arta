import { otherSide, type Side } from './logic';
import type { Rnd, TurnDef } from './turn';

/**
 * Schach mit allen Regeln: Rochade, en passant, Umwandlung, Schach, Matt, Patt,
 * 50-Züge-Regel, dreifache Wiederholung und zu wenig Material.
 * Brett als Text aus 64 Zeichen, Feld 0 = a8 oben links, 63 = h1 unten rechts.
 * Großbuchstaben = Weiß, Kleinbuchstaben = Schwarz, „.“ = leer.
 */

export type Color = 'w' | 'b';
export type Promo = 'q' | 'r' | 'b' | 'n';

export const CHESS_START = 'rnbqkbnrpppppppp' + '.'.repeat(32) + 'PPPPPPPPRNBQKBNR';

export interface Pos {
  board: string;
  turn: Color;
  /** Noch mögliche Rochaden, z. B. „KQkq“ */
  castle: string;
  /** Feld, auf dem en passant geschlagen werden kann, sonst -1 */
  ep: number;
  /** Halbzüge seit dem letzten Bauernzug oder Schlagen */
  half: number;
}

export interface CMove {
  from: number;
  to: number;
  promo?: Promo;
}

export type ChessEnd = 'matt' | 'patt' | 'remis50' | 'wiederholung' | 'material' | 'aufgabe';

export interface ChessState extends Pos {
  /** Wer Weiß spielt */
  white: Side;
  /** Stellungen seit dem letzten Bauernzug/Schlagen (für die Wiederholung) */
  seen: string[];
  last: (CMove & { san: string }) | null;
  moves: number;
  result?: { winner: Side | 'draw'; reason: ChessEnd };
}

export type ChessAction = { t: 'move'; from: number; to: number; promo?: Promo } | { t: 'resign' };

const isWhite = (p: string) => p >= 'A' && p <= 'Z';
export const pieceColor = (p: string): Color | null => (p === '.' ? null : isWhite(p) ? 'w' : 'b');
const row = (i: number) => i >> 3;
const col = (i: number) => i & 7;
const on = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;

export const squareName = (i: number) => 'abcdefgh'[col(i)] + (8 - row(i));

const KNIGHT = [
  [-2, -1],
  [-2, 1],
  [-1, -2],
  [-1, 2],
  [1, -2],
  [1, 2],
  [2, -1],
  [2, 1],
];
const KING = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
];
const DIAG = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];
const ORTHO = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

/** Wird Feld `sq` von Farbe `by` angegriffen? */
export function attacked(b: string, sq: number, by: Color): boolean {
  const r = row(sq);
  const c = col(sq);
  const up = (p: string) => (by === 'w' ? p.toUpperCase() : p.toLowerCase());
  // Bauern greifen schräg nach vorn an – also von hinten aus Sicht des Felds.
  const pr = by === 'w' ? r + 1 : r - 1;
  for (const dc of [-1, 1]) if (on(pr, c + dc) && b[pr * 8 + c + dc] === up('p')) return true;
  for (const [dr, dc] of KNIGHT) if (on(r + dr, c + dc) && b[(r + dr) * 8 + c + dc] === up('n')) return true;
  for (const [dr, dc] of KING) if (on(r + dr, c + dc) && b[(r + dr) * 8 + c + dc] === up('k')) return true;
  for (const [dirs, a, q] of [
    [DIAG, up('b'), up('q')],
    [ORTHO, up('r'), up('q')],
  ] as const) {
    for (const [dr, dc] of dirs) {
      let rr = r + dr;
      let cc = c + dc;
      while (on(rr, cc)) {
        const p = b[rr * 8 + cc];
        if (p !== '.') {
          if (p === a || p === q) return true;
          break;
        }
        rr += dr;
        cc += dc;
      }
    }
  }
  return false;
}

export function inCheck(b: string, color: Color): boolean {
  const k = b.indexOf(color === 'w' ? 'K' : 'k');
  return k >= 0 && attacked(b, k, color === 'w' ? 'b' : 'w');
}

function pseudoMoves(p: Pos): CMove[] {
  const { board: b, turn } = p;
  const out: CMove[] = [];
  const enemy = (q: string) => q !== '.' && pieceColor(q) !== turn;
  const push = (from: number, to: number) => {
    if ((b[from] === 'P' && row(to) === 0) || (b[from] === 'p' && row(to) === 7)) for (const promo of ['q', 'r', 'b', 'n'] as Promo[]) out.push({ from, to, promo });
    else out.push({ from, to });
  };
  for (let i = 0; i < 64; i++) {
    const pc = b[i];
    if (pc === '.' || pieceColor(pc) !== turn) continue;
    const r = row(i);
    const c = col(i);
    const kind = pc.toLowerCase();
    if (kind === 'p') {
      const dir = turn === 'w' ? -1 : 1;
      const start = turn === 'w' ? 6 : 1;
      if (on(r + dir, c) && b[(r + dir) * 8 + c] === '.') {
        push(i, (r + dir) * 8 + c);
        if (r === start && b[(r + 2 * dir) * 8 + c] === '.') out.push({ from: i, to: (r + 2 * dir) * 8 + c });
      }
      for (const dc of [-1, 1]) {
        if (!on(r + dir, c + dc)) continue;
        const to = (r + dir) * 8 + c + dc;
        if (enemy(b[to]) || to === p.ep) push(i, to);
      }
    } else if (kind === 'n' || kind === 'k') {
      for (const [dr, dc] of kind === 'n' ? KNIGHT : KING) {
        if (!on(r + dr, c + dc)) continue;
        const to = (r + dr) * 8 + c + dc;
        if (b[to] === '.' || enemy(b[to])) out.push({ from: i, to });
      }
      if (kind === 'k') {
        const opp: Color = turn === 'w' ? 'b' : 'w';
        const home = turn === 'w' ? 60 : 4;
        const [K, Q] = turn === 'w' ? ['K', 'Q'] : ['k', 'q'];
        if (i === home && !attacked(b, home, opp)) {
          if (p.castle.includes(K) && b[home + 1] === '.' && b[home + 2] === '.' && !attacked(b, home + 1, opp) && !attacked(b, home + 2, opp)) out.push({ from: i, to: home + 2 });
          if (p.castle.includes(Q) && b[home - 1] === '.' && b[home - 2] === '.' && b[home - 3] === '.' && !attacked(b, home - 1, opp) && !attacked(b, home - 2, opp)) out.push({ from: i, to: home - 2 });
        }
      }
    } else {
      const dirs = kind === 'b' ? DIAG : kind === 'r' ? ORTHO : [...DIAG, ...ORTHO];
      for (const [dr, dc] of dirs) {
        let rr = r + dr;
        let cc = c + dc;
        while (on(rr, cc)) {
          const to = rr * 8 + cc;
          if (b[to] === '.') out.push({ from: i, to });
          else {
            if (enemy(b[to])) out.push({ from: i, to });
            break;
          }
          rr += dr;
          cc += dc;
        }
      }
    }
  }
  return out;
}

const CORNER_RIGHT: Record<number, string> = { 63: 'K', 56: 'Q', 7: 'k', 0: 'q' };

/** Zug ausführen (ohne Prüfung, ob er erlaubt ist). */
export function makeMove(p: Pos, m: CMove): Pos {
  const b = p.board.split('');
  const pc = b[m.from];
  const kind = pc.toLowerCase();
  const captured = b[m.to] !== '.' || (kind === 'p' && m.to === p.ep);
  b[m.to] = m.promo ? (p.turn === 'w' ? m.promo.toUpperCase() : m.promo) : pc;
  b[m.from] = '.';
  if (kind === 'p' && m.to === p.ep) b[m.to + (p.turn === 'w' ? 8 : -8)] = '.';
  if (kind === 'k' && Math.abs(m.to - m.from) === 2) {
    // Rochade: Turm springt über den König
    const rookFrom = m.to > m.from ? m.from + 3 : m.from - 4;
    const rookTo = m.to > m.from ? m.from + 1 : m.from - 1;
    b[rookTo] = b[rookFrom];
    b[rookFrom] = '.';
  }
  let castle = p.castle;
  if (kind === 'k') castle = castle.replace(p.turn === 'w' ? /[KQ]/g : /[kq]/g, '');
  for (const sq of [m.from, m.to]) if (CORNER_RIGHT[sq]) castle = castle.replace(CORNER_RIGHT[sq], '');
  const ep = kind === 'p' && Math.abs(m.to - m.from) === 16 ? (m.from + m.to) / 2 : -1;
  return { board: b.join(''), turn: p.turn === 'w' ? 'b' : 'w', castle, ep, half: kind === 'p' || captured ? 0 : p.half + 1 };
}

export function legalMoves(p: Pos): CMove[] {
  return pseudoMoves(p).filter((m) => !inCheck(makeMove(p, m).board, p.turn));
}

const posKey = (p: Pos) => `${p.board}${p.turn}${p.castle}${p.ep}`;

function insufficient(b: string): boolean {
  const rest = b.replace(/[.kK]/g, '');
  return rest === '' || (rest.length === 1 && /[nbNB]/.test(rest));
}

const LETTER: Record<string, string> = { n: 'S', b: 'L', r: 'T', q: 'D', k: 'K' };

/** Zugschreibweise mit deutschen Figuren, z. B. „Sf3“, „exd5“, „O-O“, „e8=D+“. */
export function san(p: Pos, m: CMove): string {
  const pc = p.board[m.from].toLowerCase();
  let s: string;
  if (pc === 'k' && Math.abs(m.to - m.from) === 2) s = m.to > m.from ? 'O-O' : 'O-O-O';
  else {
    const capture = p.board[m.to] !== '.' || (pc === 'p' && m.to === p.ep);
    if (pc === 'p') s = (capture ? `${'abcdefgh'[col(m.from)]}x` : '') + squareName(m.to);
    else {
      const twins = legalMoves(p).filter((o) => o.to === m.to && o.from !== m.from && p.board[o.from] === p.board[m.from]);
      let dis = '';
      if (twins.length) dis = twins.some((o) => col(o.from) === col(m.from)) ? (twins.some((o) => row(o.from) === row(m.from)) ? squareName(m.from) : String(8 - row(m.from))) : 'abcdefgh'[col(m.from)];
      s = LETTER[pc] + dis + (capture ? 'x' : '') + squareName(m.to);
    }
    if (m.promo) s += `=${LETTER[m.promo]}`;
  }
  const next = makeMove(p, m);
  if (inCheck(next.board, next.turn)) s += legalMoves(next).length ? '+' : '#';
  return s;
}

export const colorOfSide = (s: ChessState, side: Side): Color => (s.white === side ? 'w' : 'b');
export const sideOfColor = (s: ChessState, c: Color): Side => (c === 'w' ? s.white : otherSide(s.white));

/** Geschlagene Figuren je Farbe (für die Anzeige neben dem Brett). */
export function capturedPieces(board: string): Record<Color, string[]> {
  const out: Record<Color, string[]> = { w: [], b: [] };
  for (const pc of 'qrbnp') {
    for (const c of ['w', 'b'] as Color[]) {
      const ch = c === 'w' ? pc.toUpperCase() : pc;
      const start = CHESS_START.split(ch).length - 1;
      const now = board.split(ch).length - 1;
      for (let k = now; k < start; k++) out[c].push(ch);
    }
  }
  return out;
}

// ───── KI: Alpha-Beta-Suche mit Figurenwerten und Feldtabellen ─────

const VALUE: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
// prettier-ignore
const PST: Record<string, number[]> = {
  p: [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
  n: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
  b: [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
  r: [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
  q: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
  k: [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20],
  e: [-50,-40,-30,-20,-20,-30,-40,-50, -30,-20,-10,0,0,-10,-20,-30, -30,-10,20,30,30,20,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,20,30,30,20,-10,-30, -30,-30,0,0,0,0,-30,-30, -50,-30,-30,-30,-30,-30,-30,-50],
};

/** Bewertung aus Sicht von Weiß (Hundertstel-Bauern). */
export function evaluate(b: string): number {
  let heavy = 0;
  for (let i = 0; i < 64; i++) if ('qQrRbBnN'.includes(b[i])) heavy += VALUE[b[i].toLowerCase()];
  const endgame = heavy <= 1600;
  let score = 0;
  for (let i = 0; i < 64; i++) {
    const pc = b[i];
    if (pc === '.') continue;
    const kind = pc.toLowerCase();
    const white = isWhite(pc);
    const table = PST[kind === 'k' && endgame ? 'e' : kind];
    const v = VALUE[kind] + table[white ? i : i ^ 56];
    score += white ? v : -v;
  }
  return score;
}

const MATE = 100_000;

function ordered(p: Pos, moves: CMove[]): CMove[] {
  const gain = (m: CMove) => {
    const victim = p.board[m.to];
    return (victim === '.' ? 0 : 10 * VALUE[victim.toLowerCase()] - VALUE[p.board[m.from].toLowerCase()]) + (m.promo === 'q' ? 800 : 0);
  };
  return moves.map((m) => ({ m, g: gain(m) })).sort((a, b) => b.g - a.g).map((x) => x.m);
}

function quiesce(p: Pos, alpha: number, beta: number, depth: number, stats: { nodes: number }): number {
  stats.nodes++;
  const stand = (p.turn === 'w' ? 1 : -1) * evaluate(p.board);
  if (stand >= beta || depth === 0) return stand;
  if (stand > alpha) alpha = stand;
  const captures = ordered(
    p,
    pseudoMoves(p).filter((m) => p.board[m.to] !== '.' || m.promo === 'q'),
  );
  for (const m of captures) {
    const next = makeMove(p, m);
    if (inCheck(next.board, p.turn)) continue;
    const v = -quiesce(next, -beta, -alpha, depth - 1, stats);
    if (v >= beta) return v;
    if (v > alpha) alpha = v;
  }
  return alpha;
}

function search(p: Pos, depth: number, alpha: number, beta: number, ply: number, stats: { nodes: number }): number {
  if (p.half >= 100) return 0;
  if (depth === 0) return quiesce(p, alpha, beta, 4, stats);
  stats.nodes++;
  let legal = false;
  for (const m of ordered(p, pseudoMoves(p))) {
    const next = makeMove(p, m);
    if (inCheck(next.board, p.turn)) continue;
    legal = true;
    const v = -search(next, depth - 1, -beta, -alpha, ply + 1, stats);
    if (v >= beta) return v;
    if (v > alpha) alpha = v;
  }
  if (!legal) return inCheck(p.board, p.turn) ? -MATE + ply : 0;
  return alpha;
}

function rootSearch(p: Pos, moves: CMove[], depth: number, rnd: Rnd, noise: number): { move: CMove; value: number; nodes: number } {
  const stats = { nodes: 0 };
  let move = moves[0];
  let value = -Infinity;
  for (const m of moves) {
    const v = -search(makeMove(p, m), depth - 1, -MATE - 1, MATE + 1, 1, stats) + (rnd() - 0.5) * 2 * noise;
    if (v > value) {
      value = v;
      move = m;
    }
  }
  return { move, value, nodes: stats.nodes };
}

/**
 * Bester Zug für die Seite am Zug. Rechnet zwei Halbzüge tief und einen dritten, wenn die
 * Stellung überschaubar ist – damit das Handy nicht ins Stocken kommt.
 * `noise` macht die KI menschlicher (Hundertstel-Bauern).
 */
export function chessBestMove(p: Pos, maxDepth = 3, rnd: Rnd = Math.random, noise = 18): CMove | null {
  const moves = ordered(p, legalMoves(p));
  if (!moves.length) return null;
  let best = rootSearch(p, moves, Math.min(2, maxDepth), rnd, noise);
  if (maxDepth >= 3 && best.nodes < 1500) best = rootSearch(p, moves, 3, rnd, noise);
  return best.move;
}

function finish(s: ChessState): ChessState {
  const moves = legalMoves(s);
  if (!moves.length) {
    if (inCheck(s.board, s.turn)) return { ...s, result: { winner: sideOfColor(s, s.turn === 'w' ? 'b' : 'w'), reason: 'matt' } };
    return { ...s, result: { winner: 'draw', reason: 'patt' } };
  }
  if (insufficient(s.board)) return { ...s, result: { winner: 'draw', reason: 'material' } };
  if (s.half >= 100) return { ...s, result: { winner: 'draw', reason: 'remis50' } };
  const key = posKey(s);
  if (s.seen.filter((k) => k === key).length >= 3) return { ...s, result: { winner: 'draw', reason: 'wiederholung' } };
  return s;
}

export const chessDef: TurnDef<ChessState, ChessAction> = {
  init: ({ starter }) => {
    const pos: Pos = { board: CHESS_START, turn: 'w', castle: 'KQkq', ep: -1, half: 0 };
    return { ...pos, white: starter, seen: [posKey(pos)], last: null, moves: 0 };
  },
  turn: (s) => (s.result ? null : sideOfColor(s, s.turn)),
  apply(s, a, by) {
    if (s.result || sideOfColor(s, s.turn) !== by) return null;
    if (a.t === 'resign') return { ...s, result: { winner: otherSide(by), reason: 'aufgabe' } };
    const m = legalMoves(s).find((x) => x.from === a.from && x.to === a.to && (x.promo ?? null) === (a.promo ?? (x.promo ? 'q' : null)));
    if (!m) return null;
    const next = makeMove(s, m);
    const seen = next.half === 0 ? [] : s.seen;
    return finish({ ...s, ...next, seen: [...seen, posKey(next)], last: { ...m, san: san(s, m) }, moves: s.moves + 1 });
  },
  outcome: (s) => s.result?.winner ?? null,
  cpu(s, side, rnd) {
    if (s.result || sideOfColor(s, s.turn) !== side) return null;
    // Eröffnung etwas abwechslungsreicher, danach tiefer rechnen.
    const m = chessBestMove(s, 3, rnd, s.moves < 6 ? 30 : 15);
    return m ? { t: 'move', from: m.from, to: m.to, promo: m.promo } : null;
  },
  cpuDelay: () => 450,
  endDelay: 1800,
};
