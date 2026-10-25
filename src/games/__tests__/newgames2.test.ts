import { describe, expect, it } from 'vitest';
import { allSunk, battleCpuShot, battleDef, FLEET, isSunk, randomFleet, SEA, validFleet, type BattleState, type Fleet } from '../battleship';
import { checkersDef, checkersMoves, playMove, type CheckersState } from '../checkers';
import { CHESS_START, chessBestMove, chessDef, legalMoves, makeMove, san, type ChessState, type Pos } from '../chess';
import { FIT_EXERCISES, FIT_MAX, fitAmount, fitDef } from '../fitdice';
import { addRandom, canMove, slide, type Tile } from '../Game2048';
import { BONUS, bonusOf, catScore, kniffelDef, sheetFull, total, type KniffelState, type Sheet } from '../kniffel';
import type { Side } from '../logic';
import { mauDef, mauPlayable, type MauState } from '../maumau';
import { layMines, MS_COLS, MS_MINES, MS_ROWS, msWon, neighbors, reveal } from '../Minesweeper';
import { muehleDef, muehleMoves, phaseOf, removable, type MuehleState } from '../muehle';
import type { RCard } from '../romme';
import type { InitCtx, Rnd, TurnDef } from '../turn';

function seeded(seed: number): Rnd {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 1_000_000) / 1_000_000;
  };
}

/** KI gegen KI – jeder Zug muss erlaubt sein. Ohne Ende nach maxSteps: `out` bleibt null. */
function selfPlay<S, A>(def: TurnDef<S, A>, seed: number, maxSteps = 4000, ctx: Partial<InitCtx> = {}) {
  const rnd = seeded(seed);
  let s = def.init({ mode: 'cpu', starter: seed % 2 ? 'p2' : 'p1', rnd, ...ctx });
  for (let step = 0; step < maxSteps; step++) {
    const out = def.outcome(s);
    if (out) return { s, out, step };
    const t = def.turn(s);
    if (!t) return { s, out: null, step };
    const sides: Side[] = t === 'both' ? ['p1', 'p2'] : [t];
    let moved = false;
    for (const side of sides) {
      const a = def.cpu!(s, side, rnd);
      if (a === null) continue;
      const next = def.apply(s, a, side, rnd);
      expect(next, `Zug von ${side}: ${JSON.stringify(a)}`).not.toBeNull();
      s = next!;
      moved = true;
      break;
    }
    if (!moved) throw new Error('Niemand kann ziehen');
  }
  return { s, out: null, step: maxSteps };
}

const ctx = (mode: InitCtx['mode'] = 'cpu', starter: Side = 'p1', seed = 1): InitCtx => ({ mode, starter, rnd: seeded(seed) });

// ───── Schach ─────

/** Feldnummer aus „e4“ (0 = a8) */
const sq = (name: string) => (8 - Number(name[1])) * 8 + 'abcdefgh'.indexOf(name[0]);

function fen(f: string): Pos {
  const [placement, turn, castle, ep] = f.split(' ');
  let board = '';
  for (const ch of placement.replace(/\//g, '')) board += /\d/.test(ch) ? '.'.repeat(Number(ch)) : ch;
  return { board, turn: turn as 'w' | 'b', castle: castle === '-' ? '' : castle, ep: ep && ep !== '-' ? sq(ep) : -1, half: 0 };
}

function perft(p: Pos, depth: number): number {
  if (depth === 0) return 1;
  let n = 0;
  for (const m of legalMoves(p)) n += perft(makeMove(p, m), depth - 1);
  return n;
}

function chessFrom(f: string, white: Side = 'p1'): ChessState {
  const p = fen(f);
  return { ...chessDef.init(ctx('duo', white)), ...p, seen: [] };
}

const move = (s: ChessState, from: string, to: string, by: Side, promo?: 'q' | 'r' | 'b' | 'n') => chessDef.apply(s, { t: 'move', from: sq(from), to: sq(to), promo }, by, Math.random);

describe('Schach', () => {
  it('erzeugt genau die richtigen Züge (Perft-Zahlen)', () => {
    expect(perft({ board: CHESS_START, turn: 'w', castle: 'KQkq', ep: -1, half: 0 }, 3)).toBe(8902);
    // „Kiwipete“: Rochaden, Fesselungen, en passant
    expect(perft(fen('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq -'), 2)).toBe(2039);
    expect(perft(fen('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - -'), 3)).toBe(2812);
    // Umwandlungen und Rochade unter Schach
    expect(perft(fen('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq -'), 3)).toBe(9467);
  });

  it('erkennt das Narrenmatt', () => {
    let s = chessDef.init(ctx('duo', 'p1'));
    s = move(s, 'f2', 'f3', 'p1')!;
    s = move(s, 'e7', 'e5', 'p2')!;
    s = move(s, 'g2', 'g4', 'p1')!;
    s = move(s, 'd8', 'h4', 'p2')!;
    expect(s.result).toEqual({ winner: 'p2', reason: 'matt' });
    expect(s.last?.san).toBe('Dh4#');
    expect(chessDef.outcome(s)).toBe('p2');
  });

  it('lässt keine falschen Züge oder Züge außer der Reihe zu', () => {
    const s = chessDef.init(ctx('duo', 'p2'));
    // p2 spielt Weiß
    expect(move(s, 'e2', 'e4', 'p1')).toBeNull();
    expect(move(s, 'e2', 'e5', 'p2')).toBeNull();
    expect(move(s, 'e2', 'e4', 'p2')).not.toBeNull();
  });

  it('kennt Rochade, en passant und Umwandlung', () => {
    const castle = fen('r3k2r/8/8/8/8/8/8/R3K2R w KQkq -');
    const kingMoves = legalMoves(castle).filter((m) => m.from === sq('e1')).map((m) => m.to);
    expect(kingMoves).toContain(sq('g1'));
    expect(kingMoves).toContain(sq('c1'));
    const after = makeMove(castle, { from: sq('e1'), to: sq('g1') });
    expect(after.board[sq('f1')]).toBe('R');
    expect(after.board[sq('h1')]).toBe('.');
    expect(after.castle).toBe('kq');
    expect(san(castle, { from: sq('e1'), to: sq('c1') })).toBe('O-O-O');

    // Rochade durch ein bedrohtes Feld ist verboten
    const blocked = fen('r3k2r/8/8/8/8/8/5r2/R3K2R w KQkq -');
    expect(legalMoves(blocked).some((m) => m.from === sq('e1') && m.to === sq('g1'))).toBe(false);

    const ep = fen('4k3/8/8/3pP3/8/8/8/4K3 w - d6');
    const exd6 = legalMoves(ep).find((m) => m.from === sq('e5') && m.to === sq('d6'));
    expect(exd6).toBeTruthy();
    expect(makeMove(ep, exd6!).board[sq('d5')]).toBe('.');

    const promo = fen('8/P7/8/8/8/8/k7/4K3 w - -');
    const promos = legalMoves(promo).filter((m) => m.from === sq('a7'));
    expect(promos.map((m) => m.promo).sort()).toEqual(['b', 'n', 'q', 'r']);
    expect(makeMove(promo, promos.find((m) => m.promo === 'n')!).board[sq('a8')]).toBe('N');
  });

  it('erkennt Patt, zu wenig Material und Aufgabe', () => {
    const patt = move(chessFrom('k7/8/8/2Q5/8/8/8/7K w - -'), 'c5', 'b6', 'p1')!;
    expect(patt.result).toEqual({ winner: 'draw', reason: 'patt' });

    const bare = move(chessFrom('k7/8/8/8/8/8/1q6/K7 w - -'), 'a1', 'b2', 'p1')!;
    expect(bare.result).toEqual({ winner: 'draw', reason: 'material' });

    const s = chessDef.init(ctx('online', 'p1'));
    expect(chessDef.apply(s, { t: 'resign' }, 'p1', Math.random)?.result).toEqual({ winner: 'p2', reason: 'aufgabe' });
  });

  it('die KI findet ein Matt in einem Zug', () => {
    const p = fen('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - -');
    expect(chessBestMove(p, 3, seeded(1), 0)).toMatchObject({ from: sq('d1'), to: sq('d8') });
  });

  it('KI gegen KI zieht nur erlaubte Züge', () => {
    const { s } = selfPlay(chessDef, 3, 16);
    expect(s.moves).toBeGreaterThan(10);
  });
});

// ───── Dame ─────

function board(pieces: Record<number, string>): string {
  return Array.from({ length: 64 }, (_, i) => pieces[i] ?? '.').join('');
}
/** Feld aus Zeile/Spalte (0 = oben links) */
const at = (r: number, c: number) => r * 8 + c;

describe('Dame', () => {
  it('Schlagen ist Pflicht – auch rückwärts', () => {
    const b = board({ [at(5, 2)]: 'w', [at(4, 3)]: 'b', [at(5, 6)]: 'w' });
    expect(checkersMoves(b, 'w')).toEqual([{ path: [at(5, 2), at(3, 4)], caps: [at(4, 3)] }]);
    const back = board({ [at(3, 4)]: 'w', [at(4, 3)]: 'b' });
    expect(checkersMoves(back, 'w')).toEqual([{ path: [at(3, 4), at(5, 2)], caps: [at(4, 3)] }]);
  });

  it('Mehrfachsprung und Umwandlung zur Dame', () => {
    const b = board({ [at(7, 0)]: 'w', [at(6, 1)]: 'b', [at(4, 3)]: 'b' });
    const [m] = checkersMoves(b, 'w');
    expect(m).toEqual({ path: [at(7, 0), at(5, 2), at(3, 4)], caps: [at(6, 1), at(4, 3)] });
    const promo = playMove(board({ [at(1, 2)]: 'w' }), { path: [at(1, 2), at(0, 1)], caps: [] });
    expect(promo[at(0, 1)]).toBe('W');
  });

  it('Damen ziehen und schlagen über weite Strecken', () => {
    const quiet = checkersMoves(board({ [at(7, 0)]: 'W' }), 'w');
    expect(quiet.map((m) => m.path[1])).toContain(at(0, 7));
    const jump = checkersMoves(board({ [at(7, 0)]: 'W', [at(3, 4)]: 'b' }), 'w');
    expect(jump.map((m) => m.path[1]).sort((x, y) => x - y)).toEqual([at(0, 7), at(1, 6), at(2, 5)]);
  });

  it('wer nicht mehr ziehen kann, verliert', () => {
    const s: CheckersState = { ...checkersDef.init(ctx('duo', 'p2')), board: board({ [at(5, 2)]: 'w', [at(4, 3)]: 'b' }) };
    const next = checkersDef.apply(s, { path: [at(5, 2), at(3, 4)] }, 'p2', Math.random)!;
    expect(next.winner).toBe('p2');
    expect(checkersDef.apply(s, { path: [at(5, 2), at(4, 1)] }, 'p2', Math.random)).toBeNull();
  });

  it('KI gegen KI spielt zu Ende', () => {
    for (let seed = 1; seed <= 2; seed++) expect(selfPlay(checkersDef, seed, 400).out).toBeTruthy();
  });
});

// ───── Mühle ─────

function mill(cells: Record<number, Side>, extra: Partial<MuehleState> = {}): MuehleState {
  const b = Array<Side | null>(24).fill(null);
  for (const [i, v] of Object.entries(cells)) b[Number(i)] = v;
  return { ...muehleDef.init(ctx('duo')), board: b, hand: { p1: 0, p2: 0 }, ...extra };
}

describe('Mühle', () => {
  it('eine geschlossene Mühle erlaubt einen Stein zu nehmen – aber keinen aus einer Mühle', () => {
    let s = mill({ 0: 'p1', 1: 'p1', 3: 'p2', 4: 'p2', 5: 'p2', 23: 'p2' }, { hand: { p1: 5, p2: 4 } });
    s = muehleDef.apply(s, { t: 'place', at: 2 }, 'p1', Math.random)!;
    expect(s.removing).toBe(true);
    expect(s.turn).toBe('p1');
    expect(removable(s.board, 'p1')).toEqual([23]);
    expect(muehleDef.apply(s, { t: 'remove', at: 4 }, 'p1', Math.random)).toBeNull();
    s = muehleDef.apply(s, { t: 'remove', at: 23 }, 'p1', Math.random)!;
    expect(s.board[23]).toBeNull();
    expect(s.turn).toBe('p2');
    expect(s.removing).toBe(false);
  });

  it('nur Nachbarfelder – mit drei Steinen darf man springen', () => {
    const s = mill({ 0: 'p1', 9: 'p1', 14: 'p1', 22: 'p1', 3: 'p2', 4: 'p2', 7: 'p2' });
    expect(phaseOf(s, 'p1')).toBe('move');
    expect(muehleDef.apply(s, { t: 'move', from: 0, to: 20 }, 'p1', Math.random)).toBeNull();
    expect(muehleDef.apply(s, { t: 'move', from: 0, to: 1 }, 'p1', Math.random)).not.toBeNull();
    const fly = { ...s, turn: 'p2' as Side };
    expect(phaseOf(fly, 'p2')).toBe('fly');
    expect(muehleMoves(fly).some((m) => m.t === 'move' && m.from === 3 && m.to === 20)).toBe(true);
  });

  it('mit zwei Steinen oder ohne Zug ist das Spiel verloren', () => {
    let s = mill({ 0: 'p1', 1: 'p1', 14: 'p1', 3: 'p2', 4: 'p2', 7: 'p2' });
    s = muehleDef.apply(s, { t: 'move', from: 14, to: 2 }, 'p1', Math.random)!;
    expect(s.removing).toBe(true);
    s = muehleDef.apply(s, { t: 'remove', at: 3 }, 'p1', Math.random)!;
    expect(s.winner).toBe('p1');

    // p2 ist nach dem Zug von p1 komplett eingesperrt
    const stuck = mill({ 0: 'p2', 1: 'p2', 2: 'p2', 9: 'p2', 4: 'p1', 14: 'p1', 10: 'p1', 22: 'p1' });
    const after = muehleDef.apply(stuck, { t: 'move', from: 22, to: 21 }, 'p1', Math.random)!;
    expect(after.winner).toBe('p1');
  });

  it('KI gegen KI spielt zu Ende', () => {
    for (let seed = 1; seed <= 2; seed++) expect(selfPlay(muehleDef, seed, 600).out).toBeTruthy();
  });
});

// ───── Schiffe versenken ─────

describe('Schiffe versenken', () => {
  it('zufällige Flotten sind immer gültig', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const f = randomFleet(seeded(seed));
      expect(validFleet(f)).toBe(true);
      expect(f.map((x) => x.length).sort()).toEqual([...FLEET].sort());
    }
  });

  it('lehnt falsche Aufstellungen ab', () => {
    const ok: Fleet = [
      [0, 1, 2, 3, 4],
      [20, 21, 22, 23],
      [40, 41, 42],
      [60, 61, 62],
      [80, 81],
    ];
    expect(validFleet(ok)).toBe(true);
    // Schiffe berühren sich
    expect(validFleet([[0, 1, 2, 3, 4], [10, 11, 12, 13], ...ok.slice(2)])).toBe(false);
    // Über den Rand in die nächste Zeile
    expect(validFleet([[7, 8, 9, 10, 11], ...ok.slice(1)])).toBe(false);
    // Falsche Größen oder Lücken
    expect(validFleet([[0, 1, 2, 3], ...ok.slice(1)])).toBe(false);
    expect(validFleet([[0, 1, 2, 3, 5], ...ok.slice(1)])).toBe(false);
    expect(validFleet('quatsch')).toBe(false);
  });

  it('Treffer heißt nochmal schießen, versenkt wird gemeldet', () => {
    const fleet: Fleet = [
      [0, 1, 2, 3, 4],
      [20, 21, 22, 23],
      [40, 41, 42],
      [60, 61, 62],
      [80, 81],
    ];
    let s: BattleState = battleDef.init(ctx('online', 'p1'));
    expect(battleDef.turn(s)).toBe('both');
    s = battleDef.apply(s, { t: 'ready', fleet }, 'p2', Math.random)!;
    expect(battleDef.turn(s)).toBe('p1');
    s = battleDef.apply(s, { t: 'ready', fleet }, 'p1', Math.random)!;
    expect(s.phase).toBe('battle');

    s = battleDef.apply(s, { t: 'shoot', at: 80 }, 'p1', Math.random)!;
    expect(s.last).toMatchObject({ hit: true });
    expect(s.turn).toBe('p1');
    s = battleDef.apply(s, { t: 'shoot', at: 81 }, 'p1', Math.random)!;
    expect(s.last).toMatchObject({ hit: true, sunk: 2 });
    expect(battleDef.apply(s, { t: 'shoot', at: 81 }, 'p1', Math.random)).toBeNull();
    s = battleDef.apply(s, { t: 'shoot', at: 99 }, 'p1', Math.random)!;
    expect(s.turn).toBe('p2');
    expect(battleDef.apply(s, { t: 'shoot', at: 5 }, 'p1', Math.random)).toBeNull();
  });

  it('zu zweit an einem Handy stellt erst der eine, dann der andere auf', () => {
    const s = battleDef.init(ctx('duo', 'p2'));
    expect(battleDef.turn(s)).toBe('p1');
    const next = battleDef.apply(s, { t: 'ready', fleet: randomFleet(seeded(4)) }, 'p1', Math.random)!;
    expect(battleDef.turn(next)).toBe('p2');
    expect(battleDef.viewer!(next)).toBe('p2');
  });

  it('die KI schießt nie doppelt und nie neben versenkte Schiffe', () => {
    const rnd = seeded(9);
    const fleet = randomFleet(rnd);
    const shots: number[] = [];
    while (!allSunk(fleet, shots)) {
      const shot = battleCpuShot(fleet, shots, rnd);
      expect(shots).not.toContain(shot);
      for (const ship of fleet.filter((x) => isSunk(x, shots))) {
        const touching = ship.some((c) => Math.abs((c % SEA) - (shot % SEA)) <= 1 && Math.abs(Math.floor(c / SEA) - Math.floor(shot / SEA)) <= 1);
        expect(touching).toBe(false);
      }
      shots.push(shot);
    }
    expect(shots.length).toBeLessThan(SEA * SEA);
  });

  it('KI gegen KI spielt zu Ende', () => {
    for (let seed = 1; seed <= 5; seed++) expect(selfPlay(battleDef, seed).out).toBeTruthy();
  });
});

// ───── Kniffel ─────

describe('Kniffel', () => {
  it('zählt die Kategorien richtig', () => {
    expect(catScore('threes', [3, 3, 1, 3, 6])).toBe(9);
    expect(catScore('three', [4, 4, 4, 1, 2])).toBe(15);
    expect(catScore('four', [4, 4, 4, 1, 2])).toBe(0);
    expect(catScore('full', [2, 3, 2, 3, 3])).toBe(25);
    expect(catScore('full', [2, 3, 2, 3, 4])).toBe(0);
    expect(catScore('small', [1, 2, 3, 4, 6])).toBe(30);
    expect(catScore('small', [1, 2, 3, 5, 6])).toBe(0);
    expect(catScore('large', [6, 2, 3, 4, 5])).toBe(40);
    expect(catScore('kniffel', [5, 5, 5, 5, 5])).toBe(50);
    expect(catScore('chance', [1, 2, 3, 4, 6])).toBe(16);
  });

  it('Bonus ab 63 Punkten oben', () => {
    const sheet: Sheet = { ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18 };
    expect(bonusOf(sheet)).toBe(BONUS);
    expect(total(sheet)).toBe(63 + BONUS);
    expect(bonusOf({ ...sheet, sixes: 12 })).toBe(0);
  });

  it('höchstens dreimal würfeln, gehaltene Würfel bleiben liegen', () => {
    const rnd = seeded(5);
    let s: KniffelState = kniffelDef.init(ctx('duo'));
    expect(kniffelDef.apply(s, { t: 'score', cat: 'chance' }, 'p1', rnd)).toBeNull();
    s = kniffelDef.apply(s, { t: 'roll', hold: [true, true, true, true, true] }, 'p1', rnd)!;
    const first = s.dice.slice();
    s = kniffelDef.apply(s, { t: 'roll', hold: [true, false, true, false, false] }, 'p1', rnd)!;
    expect(s.dice[0]).toBe(first[0]);
    expect(s.dice[2]).toBe(first[2]);
    s = kniffelDef.apply(s, { t: 'roll', hold: [false, false, false, false, false] }, 'p1', rnd)!;
    expect(kniffelDef.apply(s, { t: 'roll', hold: [false, false, false, false, false] }, 'p1', rnd)).toBeNull();
    s = kniffelDef.apply(s, { t: 'score', cat: 'chance' }, 'p1', rnd)!;
    expect(s.turn).toBe('p2');
    expect(s.rolls).toBe(0);
    expect(s.sheets.p1.chance).toBe(s.dice.reduce((a, b) => a + b, 0));
  });

  it('KI gegen KI füllt beide Zettel', () => {
    for (let seed = 1; seed <= 3; seed++) {
      const { s, out } = selfPlay(kniffelDef, seed);
      expect(out).toBeTruthy();
      expect(sheetFull(s.sheets.p1) && sheetFull(s.sheets.p2)).toBe(true);
    }
  });

  it('allein: 13 Züge, dann ist Schluss', () => {
    const { s, out } = selfPlay(kniffelDef, 2, 400, { mode: 'solo' });
    expect(out).toBeNull();
    expect(sheetFull(s.sheets.p1)).toBe(true);
    // Die KI-Strategie schafft im Schnitt deutlich mehr als Zufall
    expect(total(s.sheets.p1)).toBeGreaterThan(120);
  });
});

// ───── Mau-Mau ─────

const card = (id: number, s: string, r: number): RCard => ({ id, s, r }) as RCard;

function mau(top: RCard, p1: RCard[], extra: Partial<MauState> = {}): MauState {
  const base = mauDef.init(ctx('duo'));
  return { ...base, pile: [top], hands: { p1, p2: [card(90, 'C', 9), card(91, 'C', 10)] }, turn: 'p1', ...extra };
}

describe('Mau-Mau', () => {
  it('Farbe oder Wert passend – Bube geht immer', () => {
    const s = mau(card(1, 'H', 9), []);
    expect(mauPlayable(s, card(2, 'H', 13))).toBe(true);
    expect(mauPlayable(s, card(3, 'S', 9))).toBe(true);
    expect(mauPlayable(s, card(4, 'S', 10))).toBe(false);
    expect(mauPlayable(s, card(5, 'S', 11))).toBe(true);
  });

  it('Siebenen stapeln sich, wer keine hat, zieht alle', () => {
    const rnd = seeded(3);
    let s = mau(card(1, 'H', 9), [card(2, 'H', 7), card(3, 'S', 10)]);
    s = mauDef.apply(s, { t: 'play', id: 2 }, 'p1', rnd)!;
    expect(s.penalty).toBe(2);
    expect(s.turn).toBe('p2');
    s = { ...s, hands: { ...s.hands, p2: [...s.hands.p2, card(4, 'C', 7)] } };
    expect(mauPlayable(s, card(90, 'C', 9))).toBe(false);
    s = mauDef.apply(s, { t: 'play', id: 4 }, 'p2', rnd)!;
    expect(s.penalty).toBe(4);
    const before = s.hands.p1.length;
    s = mauDef.apply(s, { t: 'draw' }, 'p1', rnd)!;
    expect(s.hands.p1.length).toBe(before + 4);
    expect(s.penalty).toBe(0);
    expect(s.turn).toBe('p2');
  });

  it('Acht: der andere setzt aus', () => {
    const s = mauDef.apply(mau(card(1, 'H', 9), [card(2, 'H', 8), card(3, 'S', 10)]), { t: 'play', id: 2 }, 'p1', Math.random)!;
    expect(s.turn).toBe('p1');
  });

  it('Bube braucht einen Farbwunsch, der dann gilt', () => {
    const s0 = mau(card(1, 'H', 9), [card(2, 'S', 11), card(3, 'S', 10)]);
    expect(mauDef.apply(s0, { t: 'play', id: 2 }, 'p1', Math.random)).toBeNull();
    const s = mauDef.apply(s0, { t: 'play', id: 2, wish: 'C' }, 'p1', Math.random)!;
    expect(s.wish).toBe('C');
    expect(mauPlayable(s, card(90, 'C', 9))).toBe(true);
    expect(mauPlayable(s, card(9, 'S', 11))).toBe(true);
    expect(mauPlayable(s, card(8, 'H', 13))).toBe(false);
  });

  it('gezogene Karte darf sofort gelegt werden – oder man gibt weiter', () => {
    const rnd = seeded(1);
    const s0 = mau(card(1, 'H', 9), [card(3, 'S', 10)], { draw: [card(5, 'C', 13), card(6, 'H', 12)] });
    const s = mauDef.apply(s0, { t: 'draw' }, 'p1', rnd)!;
    expect(s.drawn).toBe(6);
    expect(s.turn).toBe('p1');
    expect(mauPlayable(s, card(3, 'S', 10))).toBe(false);
    const passed = mauDef.apply(s, { t: 'pass' }, 'p1', rnd)!;
    expect(passed.turn).toBe('p2');
    expect(passed.drawn).toBeNull();
  });

  it('letzte Karte gewinnt', () => {
    const s = mauDef.apply(mau(card(1, 'H', 9), [card(2, 'H', 13)]), { t: 'play', id: 2 }, 'p1', Math.random)!;
    expect(mauDef.outcome(s)).toBe('p1');
  });

  it('KI gegen KI spielt zu Ende', () => {
    for (let seed = 1; seed <= 10; seed++) expect(selfPlay(mauDef, seed).out).toBeTruthy();
  });
});

// ───── Fitness-Würfel ─────

describe('Fitness-Würfel', () => {
  it('die Menge wächst mit jeder geschafften Runde', () => {
    const squats = FIT_EXERCISES.findIndex((e) => e.name === 'Kniebeugen');
    const plank = FIT_EXERCISES.findIndex((e) => e.unit === 's');
    expect(fitAmount(squats, 4, 0)).toBe(12);
    expect(fitAmount(squats, 4, 2)).toBe(18);
    expect(fitAmount(plank, 3, 0)).toBe(30);
    expect(fitAmount(plank, 3, 1) % 5).toBe(0);
  });

  it('wer aufgibt, verliert – halten beide durch, ist es unentschieden', () => {
    const rnd = seeded(2);
    let s = fitDef.init(ctx('duo', 'p1'));
    expect(fitDef.apply(s, { t: 'done' }, 'p1', rnd)).toBeNull();
    s = fitDef.apply(s, { t: 'roll' }, 'p1', rnd)!;
    expect(s.dice).not.toBeNull();
    s = fitDef.apply(s, { t: 'done' }, 'p1', rnd)!;
    expect(s.turn).toBe('p2');
    s = fitDef.apply(s, { t: 'roll' }, 'p2', rnd)!;
    s = fitDef.apply(s, { t: 'quit' }, 'p2', rnd)!;
    expect(fitDef.outcome(s)).toBe('p1');

    let d = fitDef.init(ctx('duo', 'p1'));
    for (let k = 0; k < FIT_MAX * 2; k++) {
      d = fitDef.apply(d, { t: 'roll' }, d.turn, rnd)!;
      d = fitDef.apply(d, { t: 'done' }, d.turn, rnd)!;
    }
    expect(fitDef.outcome(d)).toBe('draw');
  });

  it('allein zählt, wie viele Runden man schafft', () => {
    const rnd = seeded(4);
    let s = fitDef.init(ctx('solo'));
    for (let k = 0; k < 12; k++) {
      s = fitDef.apply(s, { t: 'roll' }, 'p1', rnd)!;
      s = fitDef.apply(s, { t: 'done' }, 'p1', rnd)!;
    }
    expect(s.done.p1).toBe(12);
    expect(fitDef.outcome(s)).toBeNull();
    s = fitDef.apply(s, { t: 'quit' }, 'p1', rnd)!;
    expect(fitDef.turn(s)).toBeNull();
  });

  it('KI gegen KI endet', () => {
    for (let seed = 1; seed <= 10; seed++) expect(selfPlay(fitDef, seed).out).toBeTruthy();
  });
});

// ───── 2048 & Minesweeper ─────

const row = (vals: number[], r = 0): Tile[] => vals.flatMap((v, c) => (v ? [{ id: r * 10 + c + 1, v, r, c }] : []));
const values = (tiles: Tile[], r = 0) => [0, 1, 2, 3].map((c) => tiles.find((t) => !t.gone && t.r === r && t.c === c)?.v ?? 0);

describe('2048', () => {
  it('schiebt und verschmilzt – jede Kachel nur einmal pro Zug', () => {
    let res = slide(row([2, 2, 2, 2]), 'left');
    expect(values(res.tiles)).toEqual([4, 4, 0, 0]);
    expect(res.gained).toBe(8);
    res = slide(row([4, 4, 8, 0]), 'left');
    expect(values(res.tiles)).toEqual([8, 8, 0, 0]);
    res = slide(row([2, 0, 2, 4]), 'right');
    expect(values(res.tiles)).toEqual([0, 0, 4, 4]);
    expect(slide(row([2, 4, 8, 16]), 'left').moved).toBe(false);
  });

  it('erkennt, wenn nichts mehr geht', () => {
    const full = [0, 1, 2, 3].flatMap((r) => row(r % 2 ? [4, 2, 4, 2] : [2, 4, 2, 4], r));
    expect(canMove(full)).toBe(false);
    expect(canMove(full.map((t) => (t.r === 0 && t.c === 0 ? { ...t, v: 4 } : t)))).toBe(true);
    expect(addRandom(full)).toHaveLength(16);
  });
});

describe('Minesweeper', () => {
  it('das erste Feld und seine Nachbarn sind nie vermint', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const first = (seed * 7) % (MS_COLS * MS_ROWS);
      const cells = layMines(first, seeded(seed));
      expect(cells.filter((c) => c.mine)).toHaveLength(MS_MINES);
      for (const i of [first, ...neighbors(first)]) expect(cells[i].mine).toBe(false);
      expect(cells[first].n).toBe(0);
    }
  });

  it('leere Felder decken ihre Umgebung mit auf', () => {
    const cells = layMines(0, seeded(3));
    const opened = reveal(cells, 0);
    expect(opened.filter((c) => c.open).length).toBeGreaterThan(4);
    expect(opened.some((c) => c.open && c.mine)).toBe(false);
    expect(msWon(cells.map((c) => ({ ...c, open: !c.mine })))).toBe(true);
    expect(msWon(opened)).toBe(false);
  });
});
