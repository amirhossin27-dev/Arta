import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../lib/random';
import { actions, emptyData, getData, getDevice } from '../../lib/store';
import { buildPayload, mergeData } from '../../lib/sync';
import type { AppData, GameStat } from '../../lib/types';
import {
  C4_COLS,
  c4CpuMove,
  c4Drop,
  c4Empty,
  c4Full,
  c4Winner,
  duelTotals,
  gameSummary,
  isBetter,
  memoryDeck,
  tttBestMove,
  tttCpuMove,
  tttResult,
  type Cell,
  type Side,
} from '../logic';
import { GAMES } from '../registry';

const X = 'p1' as const;
const O = 'p2' as const;
const _ = null;

describe('Tic-Tac-Toe', () => {
  it('erkennt Sieg, Gewinnlinie und Unentschieden', () => {
    expect(tttResult([X, X, X, _, O, O, _, _, _])).toEqual({ winner: 'p1', line: [0, 1, 2] });
    expect(tttResult([O, X, X, _, O, X, _, _, O])?.winner).toBe('p2');
    expect(tttResult([X, O, X, X, O, O, O, X, X])).toEqual({ winner: 'draw' });
    expect(tttResult([X, _, _, _, _, _, _, _, _])).toBeNull();
  });

  it('gewinnt sofort, wenn möglich, und blockt sonst', () => {
    expect(tttBestMove([O, O, _, X, X, _, _, _, _], 'p2')).toBe(2);
    expect(tttBestMove([X, X, _, _, O, _, _, _, _], 'p2')).toBe(2);
  });

  it('Arta macht nur gültige Züge', () => {
    const rnd = mulberry32(7);
    const board: Cell[] = [X, O, X, _, O, _, _, X, _];
    for (let i = 0; i < 50; i++) expect(board[tttCpuMove(board, 'p2', rnd)]).toBeNull();
  });

  it('perfektes Spiel gegen sich selbst endet unentschieden', () => {
    const rnd = mulberry32(42);
    let b: Cell[] = Array(9).fill(null);
    let turn: Side = 'p1';
    while (!tttResult(b)) {
      b = b.slice();
      b[tttBestMove(b, turn, rnd)] = turn;
      turn = turn === 'p1' ? 'p2' : 'p1';
    }
    expect(tttResult(b)?.winner).toBe('draw');
  });
});

describe('Vier gewinnt', () => {
  const play = (cols: number[]) => {
    let b = c4Empty();
    let side: Side = 'p1';
    for (const c of cols) {
      b = c4Drop(b, c, side)!.board;
      side = side === 'p1' ? 'p2' : 'p1';
    }
    return b;
  };

  it('Steine fallen nach unten und volle Spalten nehmen nichts mehr an', () => {
    const d = c4Drop(c4Empty(), 3, 'p1')!;
    expect(d.row).toBe(5);
    let b = d.board;
    for (let i = 0; i < 5; i++) b = c4Drop(b, 3, 'p2')!.board;
    expect(c4Drop(b, 3, 'p1')).toBeNull();
  });

  it('erkennt waagerecht, senkrecht und diagonal', () => {
    expect(c4Winner(play([0, 0, 1, 1, 2, 2, 3]))?.winner).toBe('p1');
    expect(c4Winner(play([0, 1, 0, 1, 0, 1, 0]))?.winner).toBe('p1');
    // Diagonale von links unten nach rechts oben für p1
    const diag = play([0, 1, 1, 2, 2, 3, 2, 3, 3, 6, 3]);
    expect(c4Winner(diag)?.winner).toBe('p1');
    expect(c4Winner(diag)?.cells).toHaveLength(4);
    expect(c4Winner(play([0, 1, 2]))).toBeNull();
  });

  it('Arta nutzt Gewinnchancen und blockt Drohungen', () => {
    // p2 hat drei unten in Spalte 0–2 → gewinnt mit 3
    const win = play([6, 0, 6, 1, 5, 2]);
    expect(c4CpuMove(win, 'p2', 4, mulberry32(1))).toBe(3);
    // p1 droht mit drei unten in Spalte 1–3 (0 und 4 offen) → Arta muss eine Seite schließen
    const threat = play([1, 6, 2, 6, 3]);
    expect([0, 4]).toContain(c4CpuMove(threat, 'p2', 4, mulberry32(2)));
  });

  it('erkennt ein volles Brett', () => {
    expect(c4Full(c4Empty())).toBe(false);
    expect(c4Full(Array(C4_COLS * 6).fill('p1'))).toBe(true);
  });
});

describe('Memory', () => {
  it('legt jedes Motiv genau zweimal aus', () => {
    const deck = memoryDeck(8, mulberry32(3));
    expect(deck).toHaveLength(16);
    const counts = new Map<string, number>();
    for (const e of deck) counts.set(e, (counts.get(e) ?? 0) + 1);
    expect(counts.size).toBe(8);
    expect([...counts.values()].every((n) => n === 2)).toBe(true);
  });
});

function stat(id: string, game: string, extra: Partial<GameStat>): GameStat {
  return { id, game, best: {}, wins: {}, draws: 0, plays: 0, lastAt: 0, updatedAt: 1, ...extra };
}

function withStats(...stats: GameStat[]): AppData {
  return { ...emptyData(), games: Object.fromEntries(stats.map((s) => [s.id, s])) };
}

describe('Spielbilanz', () => {
  it('addiert Siege über alle Geräte und nimmt den besten Rekord', () => {
    const d = withStats(
      stat('snake-dev1', 'snake', { best: { a: 12 }, plays: 3 }),
      stat('snake-dev2', 'snake', { best: { a: 9, b: 20 }, plays: 2 }),
      stat('tictactoe-dev1', 'tictactoe', { wins: { a: 2, b: 1 }, draws: 1, plays: 4 }),
      stat('tictactoe-dev2', 'tictactoe', { wins: { b: 3 }, plays: 3 }),
      stat('connect4-dev2', 'connect4', { wins: { a: 1 }, plays: 1 }),
    );
    expect(gameSummary(d, 'snake').best).toEqual({ a: 12, b: 20 });
    expect(gameSummary(d, 'tictactoe')).toEqual({ best: {}, wins: { a: 2, b: 4 }, draws: 1, plays: 7 });
    expect(duelTotals(d).wins).toEqual({ a: 3, b: 4 });
  });

  it('beim Memory zählen möglichst wenige Züge', () => {
    const d = withStats(stat('memory-1', 'memory', { best: { a: 14 } }), stat('memory-2', 'memory', { best: { a: 11, b: 18 } }));
    expect(gameSummary(d, 'memory').best).toEqual({ a: 11, b: 18 });
    expect(isBetter('memory', 10, 11)).toBe(true);
    expect(isBetter('snake', 10, 11)).toBe(false);
    expect(isBetter('snake', 1, undefined)).toBe(true);
  });

  it('übersteht kaputte Datensätze', () => {
    const broken = { id: 'x', game: 'snake', updatedAt: 1 } as unknown as GameStat;
    expect(gameSummary(withStats(broken), 'snake')).toEqual({ best: {}, wins: { a: 0, b: 0 }, draws: 0, plays: 0 });
  });

  it('trägt Runden ein und behält den besten Wert', () => {
    actions.recordGame('snake', { score: 8, player: 'a' });
    actions.recordGame('snake', { score: 5, player: 'a' });
    actions.recordGame('tictactoe', { winner: 'b' });
    actions.recordGame('tictactoe', { winner: 'draw' });
    actions.recordGame('memory', { score: 20, player: 'b', lowerIsBetter: true });
    actions.recordGame('memory', { score: 16, player: 'b', lowerIsBetter: true });
    const d = getData();
    expect(d.games[`snake-${getDevice().deviceId}`].plays).toBe(2);
    expect(gameSummary(d, 'snake').best.a).toBe(8);
    expect(gameSummary(d, 'tictactoe')).toMatchObject({ wins: { a: 0, b: 1 }, draws: 1 });
    expect(gameSummary(d, 'memory').best.b).toBe(16);
  });

  it('beim Sync gehen keine Siege verloren, weil jedes Gerät eigene Zeilen hat', () => {
    const phoneA = withStats(stat('pong-A', 'pong', { wins: { a: 2 }, plays: 2, updatedAt: 100 }));
    const phoneB = withStats(stat('pong-B', 'pong', { wins: { b: 1 }, plays: 1, updatedAt: 50 }));
    const payload = buildPayload(phoneB, 'b', 'B', '2026-10-25');
    const { data } = mergeData(phoneA, payload.data, 'a');
    expect(gameSummary(data, 'pong').wins).toEqual({ a: 2, b: 1 });
  });

  it('jedes Spiel hat eine passende Beschreibung', () => {
    for (const g of GAMES) {
      expect(g.modes.length).toBeGreaterThan(0);
      if (g.modes.includes('solo')) expect(g.scoreLabel).toBeTruthy();
    }
  });
});
