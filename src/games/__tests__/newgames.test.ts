import { describe, expect, it } from 'vitest';
import { c4Def, memoryDef, tttDef } from '../classic';
import { candidates, FACES, guessWhoDef, QUESTIONS, type GuessWhoState } from '../guesswho';
import { otherSide, type Side } from '../logic';
import { dice, LUDO_GOAL, LUDO_HOME, LUDO_TRACK, ludoAbs, ludoDef, ludoMoves, type LudoState } from '../ludo';
import { matchView, type ArcadeDoc } from '../online';
import { analyzeMeld, bestMelds, discardError, freshValue, meldError, rommeDef, type RCard, type RommeState } from '../romme';
import { catPoints, fold, judge, slfDef, slfTotals, type SlfRound, type SlfState } from '../slf';
import type { InitCtx, Rnd, TurnDef } from '../turn';
import { unoDeck, unoDef, unoPlayable, type UnoCard, type UnoState } from '../uno';

/** Deterministischer Zufall für reproduzierbare Partien */
function seeded(seed: number): Rnd {
  let x = seed >>> 0 || 1;
  return () => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return ((x >>> 0) % 1_000_000) / 1_000_000;
  };
}

/** KI gegen KI bis zum Ende – jeder Zug muss erlaubt sein. */
function selfPlay<S, A>(def: TurnDef<S, A>, seed: number, maxSteps = 4000, ctx: Partial<InitCtx> = {}) {
  const rnd = seeded(seed);
  let s = def.init({ mode: 'cpu', starter: seed % 2 ? 'p2' : 'p1', rnd, ...ctx });
  for (let step = 0; step < maxSteps; step++) {
    const out = def.outcome(s);
    if (out) return { s, out, step };
    const auto = def.auto?.(s);
    if (auto) {
      const next = def.apply(s, auto.action, auto.by, rnd);
      expect(next, 'automatischer Schritt').not.toBeNull();
      s = next!;
      continue;
    }
    const t = def.turn(s);
    const sides: Side[] = t === 'both' ? ['p1', 'p2'] : t ? [t] : [];
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
  throw new Error('Partie endet nicht');
}

describe('Spielmotor: Klassiker als Regel-Funktionen', () => {
  it('Tic-Tac-Toe und Vier gewinnt laufen KI gegen KI zu Ende', () => {
    for (let seed = 1; seed <= 10; seed++) {
      expect(selfPlay(tttDef, seed).out).toBeTruthy();
      expect(selfPlay(c4Def, seed).out).toBeTruthy();
    }
  });

  it('verbietet Züge außer der Reihe und auf besetzte Felder', () => {
    const s = tttDef.init({ mode: 'duo', starter: 'p1', rnd: Math.random });
    expect(tttDef.apply(s, 4, 'p2', Math.random)).toBeNull();
    const s2 = tttDef.apply(s, 4, 'p1', Math.random)!;
    expect(tttDef.apply(s2, 4, 'p2', Math.random)).toBeNull();
    expect(tttDef.turn(s2)).toBe('p2');
  });

  it('Memory: die KI findet alle Pärchen, nicht passende Karten drehen sich zurück', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const { s } = selfPlay(memoryDef, seed);
      expect(s.owner.every(Boolean)).toBe(true);
      expect(s.open).toEqual([]);
    }
    const s = memoryDef.init({ mode: 'duo', starter: 'p1', rnd: seeded(3) });
    const a = 0;
    const b = s.deck.findIndex((e, i) => i !== a && e !== s.deck[a]);
    let t = memoryDef.apply(s, { t: 'flip', i: a }, 'p1', Math.random)!;
    t = memoryDef.apply(t, { t: 'flip', i: b }, 'p1', Math.random)!;
    expect(memoryDef.apply(t, { t: 'flip', i: 5 }, 'p1', Math.random)).toBeNull();
    expect(memoryDef.auto!(t)?.by).toBe('p1');
    t = memoryDef.apply(t, { t: 'resolve' }, 'p1', Math.random)!;
    expect(t.turn).toBe('p2');
    expect(t.open).toEqual([]);
  });
});

describe('Mensch ärgere dich nicht', () => {
  it('hat ein gültiges Spielbrett', () => {
    expect(LUDO_TRACK).toHaveLength(40);
    const all = [...LUDO_TRACK, ...LUDO_GOAL.p1, ...LUDO_GOAL.p2, ...LUDO_HOME.p1, ...LUDO_HOME.p2].map(([x, y]) => `${x},${y}`);
    expect(new Set(all).size).toBe(all.length);
    // Nachbarfelder liegen direkt nebeneinander
    LUDO_TRACK.forEach(([x, y], i) => {
      const [nx, ny] = LUDO_TRACK[(i + 1) % 40];
      expect(Math.abs(nx - x) + Math.abs(ny - y)).toBe(1);
    });
    // Zieleinlauf schließt an das letzte Feld vor dem Start an
    expect(LUDO_TRACK[39]).toEqual([5, 10]);
    expect(LUDO_GOAL.p1[0]).toEqual([5, 9]);
    expect(LUDO_TRACK[19]).toEqual([5, 0]);
    expect(LUDO_GOAL.p2[0]).toEqual([5, 1]);
  });

  const base = (): LudoState => ({ ...ludoDef.init({ mode: 'duo', starter: 'p1', rnd: Math.random }) });

  it('bei einer 6 muss eine Figur raus, Startfeld wird geräumt', () => {
    const s: LudoState = { ...base(), pos: { p1: [5, -1, -1, -1], p2: [0, -1, -1, -1] } };
    expect(ludoMoves(s, 'p1', 6)).toEqual([1]);
    const s2: LudoState = { ...base(), pos: { p1: [0, 7, -1, -1], p2: [0, -1, -1, -1] } };
    expect(ludoMoves(s2, 'p1', 3)).toEqual([0]);
  });

  it('wirft gegnerische Figuren raus und würfelt nach einer 6 nochmal', () => {
    // p2 steht auf Feld 23 (relativ 3 → absolut 23), p1 auf relativ 20 (absolut 20)
    const s: LudoState = { ...base(), pos: { p1: [20, 40, 41, 42], p2: [3, -1, -1, -1] } };
    expect(ludoAbs('p2', 3)).toBe(23);
    const rolled = ludoDef.apply(s, { t: 'roll' }, 'p1', dice(3))!;
    expect(rolled.phase).toBe('move');
    const moved = ludoDef.apply(rolled, { t: 'move', i: 0 }, 'p1', Math.random)!;
    expect(moved.pos.p2[0]).toBe(-1);
    expect(moved.turn).toBe('p2');
    const six = ludoDef.apply({ ...s, pos: { p1: [10, 40, 41, 42], p2: [0, -1, -1, -1] } }, { t: 'roll' }, 'p1', dice(6))!;
    const again = ludoDef.apply(six, { t: 'move', i: 0 }, 'p1', Math.random)!;
    expect(again.turn).toBe('p1');
    expect(again.phase).toBe('roll');
  });

  it('gibt drei Versuche, wenn keine Figur laufen kann, und überspringt im Ziel nicht', () => {
    const s: LudoState = { ...base(), pos: { p1: [-1, -1, -1, 43], p2: [0, -1, -1, -1] }, tries: 3 };
    let t = ludoDef.apply(s, { t: 'roll' }, 'p1', dice(2))!;
    expect(t.turn).toBe('p1');
    expect(t.tries).toBe(2);
    t = ludoDef.apply(t, { t: 'roll' }, 'p1', dice(2))!;
    t = ludoDef.apply(t, { t: 'roll' }, 'p1', dice(2))!;
    expect(t.turn).toBe('p2');
    const g: LudoState = { ...base(), pos: { p1: [38, 41, -1, -1], p2: [0, -1, -1, -1] } };
    expect(ludoMoves(g, 'p1', 4)).not.toContain(0); // 38+4 = 42, müsste über 41 springen
    expect(ludoMoves(g, 'p1', 2)).toContain(0); // 40 ist frei
  });

  it('KI gegen KI: jemand bringt alle Figuren ins Ziel', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const { s, out } = selfPlay(ludoDef, seed, 6000);
      expect(s.pos[out as Side].every((p) => p >= 40)).toBe(true);
    }
  });
});

describe('Uno', () => {
  it('hat 108 Karten', () => {
    const deck = unoDeck();
    expect(deck).toHaveLength(108);
    expect(new Set(deck.map((c) => c.id)).size).toBe(108);
    expect(deck.filter((c) => c.c === 'w')).toHaveLength(8);
  });

  const state = (hand: UnoCard[], top: UnoCard, extra: Partial<UnoState> = {}): UnoState => ({
    draw: unoDeck().slice(0, 20),
    pile: [top],
    hands: { p1: hand, p2: [{ id: 900, c: 'r', v: '1' }, { id: 901, c: 'r', v: '2' }] },
    turn: 'p1',
    color: top.c === 'w' ? 'r' : top.c,
    drawn: null,
    ...extra,
  });

  it('passt nach Farbe, Wert oder als Farbwahl', () => {
    const s = state([], { id: 1, c: 'g', v: '7' });
    expect(unoPlayable(s, { id: 2, c: 'g', v: '2' })).toBe(true);
    expect(unoPlayable(s, { id: 3, c: 'b', v: '7' })).toBe(true);
    expect(unoPlayable(s, { id: 4, c: 'b', v: '8' })).toBe(false);
    expect(unoPlayable(s, { id: 5, c: 'w', v: 'F' })).toBe(true);
  });

  it('+2 lässt den anderen ziehen und aussetzen, Farbwahl braucht eine Farbe', () => {
    const s = state([{ id: 10, c: 'g', v: 'D' }, { id: 11, c: 'w', v: 'W' }, { id: 12, c: 'y', v: '3' }], { id: 1, c: 'g', v: '7' });
    const t = unoDef.apply(s, { t: 'play', id: 10 }, 'p1', Math.random)!;
    expect(t.hands.p2).toHaveLength(4);
    expect(t.turn).toBe('p1');
    expect(unoDef.apply(t, { t: 'play', id: 11 }, 'p1', Math.random)).toBeNull();
    const w = unoDef.apply(t, { t: 'play', id: 11, color: 'y' }, 'p1', Math.random)!;
    expect(w.color).toBe('y');
    expect(w.turn).toBe('p2');
  });

  it('gezogene Karte: legen oder behalten', () => {
    const s = state([{ id: 12, c: 'y', v: '3' }], { id: 1, c: 'g', v: '7' }, { draw: [{ id: 50, c: 'g', v: '9' }] });
    const t = unoDef.apply(s, { t: 'draw' }, 'p1', Math.random)!;
    expect(t.drawn).toBe(50);
    expect(t.turn).toBe('p1');
    expect(unoDef.apply(t, { t: 'play', id: 12 }, 'p1', Math.random)).toBeNull();
    expect(unoDef.apply(t, { t: 'pass' }, 'p1', Math.random)!.turn).toBe('p2');
    const u = unoDef.apply({ ...s, draw: [{ id: 51, c: 'b', v: '1' }] }, { t: 'draw' }, 'p1', Math.random)!;
    expect(u.turn).toBe('p2');
  });

  it('KI gegen KI: jemand legt die letzte Karte', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { s, out } = selfPlay(unoDef, seed);
      expect(s.hands[out as Side]).toHaveLength(0);
      expect(s.draw.length + s.pile.length + s.hands.p1.length + s.hands.p2.length).toBe(108);
    }
  });
});

describe('Rommé', () => {
  let id = 1000;
  const c = (s: 'S' | 'H' | 'D' | 'C' | 'J', r: number): RCard => ({ id: id++, s, r });
  const J = () => c('J', 0);

  it('erkennt Sätze und Reihen – auch mit Joker und Ass oben/unten', () => {
    expect(analyzeMeld([c('S', 7), c('H', 7), c('D', 7)])?.kind).toBe('set');
    expect(analyzeMeld([c('S', 7), c('S', 7), c('D', 7)])).toBeNull();
    expect(analyzeMeld([c('H', 4), c('H', 5), c('H', 6)])?.value).toBe(15);
    expect(analyzeMeld([c('H', 1), c('H', 2), c('H', 3)])?.value).toBe(6);
    expect(analyzeMeld([c('H', 12), c('H', 13), c('H', 1)])?.value).toBe(31);
    expect(analyzeMeld([c('H', 13), c('H', 1), c('H', 2)])).toBeNull();
    const withJoker = analyzeMeld([c('C', 9), J(), c('C', 11)]);
    expect(withJoker?.ranks).toEqual([9, 10, 11]);
    expect(analyzeMeld([c('C', 9), J(), J()])).toBeNull();
    expect(analyzeMeld([c('S', 5), c('H', 5), c('D', 5), c('C', 5), J()])).toBeNull();
  });

  it('verlangt 40 Punkte für die Erstauslage', () => {
    const hand = [c('H', 4), c('H', 5), c('H', 6), c('S', 13), c('H', 13), c('D', 13), c('C', 2)];
    const s: RommeState = { ...rommeDef.init({ mode: 'duo', starter: 'p1', rnd: seeded(1) }), phase: 'play', hands: { p1: hand, p2: [] }, undo: { hand, melds: [] } };
    const run = hand.slice(0, 3).map((x) => x.id);
    const t = rommeDef.apply(s, { t: 'meld', ids: run }, 'p1', Math.random)!;
    expect(freshValue(t)).toBe(15);
    expect(discardError(t, 'p1', hand[6].id)).toMatch(/40/);
    const t2 = rommeDef.apply(t, { t: 'meld', ids: hand.slice(3, 6).map((x) => x.id) }, 'p1', Math.random)!;
    expect(freshValue(t2)).toBe(45);
    const t3 = rommeDef.apply(t2, { t: 'discard', id: hand[6].id }, 'p1', Math.random)!;
    expect(t3.out.p1).toBe(true);
    expect(t3.winner).toBe('p1');
    // Zurücknehmen bringt alles auf die Hand zurück
    const back = rommeDef.apply(t, { t: 'undo' }, 'p1', Math.random)!;
    expect(back.hands.p1).toHaveLength(7);
    expect(back.melds).toHaveLength(0);
    expect(meldError(s, 'p1', [hand[0].id, hand[3].id, hand[6].id])).toBeTruthy();
  });

  it('die KI findet Kombinationen in der Hand', () => {
    const hand = [c('S', 9), c('S', 10), c('S', 11), c('H', 2), c('D', 2), c('C', 2), c('H', 13)];
    const melds = bestMelds(hand);
    expect(melds).toHaveLength(2);
  });

  it('KI gegen KI: eine Partie endet und keine Karte geht verloren', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const { s } = selfPlay(rommeDef, seed, 8000);
      const total = s.stock.length + s.pile.length + s.hands.p1.length + s.hands.p2.length + s.melds.reduce((n, m) => n + m.cards.length, 0);
      expect(total).toBe(108);
      for (const m of s.melds) expect(analyzeMeld(m.cards), JSON.stringify(m.cards)).not.toBeNull();
    }
  });
});

describe('Wer ist wer?', () => {
  it('jedes Gesicht ist eindeutig und jede Frage teilt die Runde', () => {
    const keys = FACES.map((f) => QUESTIONS.map((q) => (q.test(f) ? 1 : 0)).join(''));
    expect(new Set(keys).size).toBe(FACES.length);
    for (const q of QUESTIONS) {
      const yes = FACES.filter(q.test).length;
      expect(yes, q.id).toBeGreaterThan(1);
      expect(yes, q.id).toBeLessThan(FACES.length - 1);
    }
  });

  it('beantwortet Fragen ehrlich und klappt passende Gesichter um', () => {
    const s: GuessWhoState = { ...guessWhoDef.init({ mode: 'duo', starter: 'p1', rnd: seeded(5) }), secret: { p1: 0, p2: 1 } };
    const t = guessWhoDef.apply(s, { t: 'ask', q: 'brille' }, 'p1', Math.random)!;
    // Ben (Index 1) trägt eine Brille → alle ohne Brille klappen um
    expect(t.asked[0].yes).toBe(true);
    expect(candidates(t, 'p1').every((i) => FACES[i].glasses)).toBe(true);
    expect(t.turn).toBe('p2');
    const wrong = guessWhoDef.apply(t, { t: 'guess', face: 5 }, 'p2', Math.random)!;
    expect(wrong.winner).toBe('p1');
  });

  it('KI gegen KI endet mit einem richtigen oder falschen Tipp', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { s } = selfPlay(guessWhoDef, seed);
      expect(s.guess).toBeDefined();
    }
  });
});

describe('Stadt Land Fluss', () => {
  it('prüft Anfangsbuchstaben und kennt viele Wörter', () => {
    expect(judge('stadt', 'M', 'München')).toBe('ok');
    expect(judge('stadt', 'M', 'muenchen')).toBe('ok');
    expect(judge('land', 'O', 'Österreich')).toBe('ok');
    expect(judge('beruf', 'A', 'Ärztin')).toBe('ok');
    expect(judge('beruf', 'F', 'Feuerwehrfrau')).toBe('ok');
    expect(judge('tier', 'M', 'Mausbär')).toBe('unknown');
    expect(judge('tier', 'M', 'Hund')).toBe('wrong');
    expect(judge('tier', 'M', '  ')).toBe('empty');
    expect(fold('Saarbrücken ')).toBe('saarbruecken');
  });

  it('vergibt 20 / 10 / 5 Punkte', () => {
    const r: SlfRound = {
      letter: 'B',
      answers: { p1: ['Berlin', 'Belgien', 'Bode', 'Bär', '', 'Bäcker'], p2: ['Bonn', 'Belgien', '', 'Hund', 'Ben', 'Bäcker'] },
      veto: { p1: [false, false, false, false, false, false], p2: [false, false, false, false, false, true] },
    };
    expect(catPoints(r, 0)).toEqual({ p1: 10, p2: 10 });
    expect(catPoints(r, 1)).toEqual({ p1: 5, p2: 5 });
    expect(catPoints(r, 2)).toEqual({ p1: 20, p2: 0 });
    expect(catPoints(r, 3)).toEqual({ p1: 20, p2: 0 });
    expect(catPoints(r, 4)).toEqual({ p1: 0, p2: 20 });
    expect(catPoints(r, 5)).toEqual({ p1: 20, p2: 0 });
  });

  it('wer zuerst fertig ist, startet die 10-Sekunden-Uhr', () => {
    const s = slfDef.init({ mode: 'online', starter: 'p1', rnd: seeded(2) });
    expect(slfDef.turn(s)).toBe('both');
    const t = slfDef.apply(s, { t: 'submit', answers: ['a', 'b', 'c', 'd', 'e', 'f'] }, 'p2', Math.random)!;
    expect(t.stopBy).toBe('p2');
    expect(t.stopAt).toBeGreaterThan(Date.now());
    expect(slfDef.auto!(t)?.by).toBe('p1');
    const r = slfDef.apply(t, { t: 'timeout' }, 'p1', Math.random)!;
    expect(r.phase).toBe('review');
    expect(r.rounds[0].answers.p1).toEqual(['', '', '', '', '', '']);
  });

  it('an einem Handy schreibt erst der eine, dann der andere', () => {
    let s: SlfState = slfDef.init({ mode: 'duo', starter: 'p2', rnd: seeded(4) });
    expect(slfDef.turn(s)).toBe('p2');
    expect(slfDef.apply(s, { t: 'submit', answers: [] }, 'p1', Math.random)).toBeNull();
    s = slfDef.apply(s, { t: 'submit', answers: [] }, 'p2', Math.random)!;
    expect(slfDef.turn(s)).toBe('p1');
    expect(s.stopAt).toBeNull();
    s = slfDef.apply(s, { t: 'submit', answers: [] }, 'p1', Math.random)!;
    expect(s.phase).toBe('review');
    s = slfDef.apply(s, { t: 'next' }, 'p1', Math.random)!;
    expect(s.phase).toBe('write');
    expect(s.first).toBe('p1');
  });

  it('gegen die KI: drei Buchstaben, dann ein Ergebnis', () => {
    const real = Date.now;
    let now = real();
    Date.now = () => (now += 61_000);
    try {
      const { s } = selfPlay(slfDef, 3, 200);
      expect(s.rounds).toHaveLength(3);
      const t = slfTotals(s);
      expect(t.p1 + t.p2).toBeGreaterThan(0);
    } finally {
      Date.now = real;
    }
  });
});

describe('Online-Partie', () => {
  const doc = (by: 'a' | 'b', m: ArcadeDoc['m']): ArcadeDoc => ({ v: 1, by, at: 1, m });
  const host = { id: 'm1', game: 'uno' as const, host: 'a' as const, stake: null, since: Date.now(), ready: 0 };

  it('Gastgeber ist p1, Gast p2 – zusammen erst nach dem Annehmen', () => {
    const solo = matchView(doc('a', host), undefined, 'a')!;
    expect(solo.me).toBe('p1');
    expect(solo.together).toBe(false);
    expect(solo.left).toBe(false);
    const both = matchView(doc('a', host), doc('b', { ...host, joined: true }), 'a')!;
    expect(both.together).toBe(true);
    const guest = matchView(doc('b', { ...host, joined: true }), doc('a', host), 'b')!;
    expect(guest.me).toBe('p2');
    expect(guest.together).toBe(true);
    expect(matchView(doc('a', host), doc('b', { ...host, declined: true }), 'a')!.declined).toBe(true);
  });

  it('es gilt der Stand mit der höchsten Nummer', () => {
    const a = doc('a', { ...host, r: 0, seq: 3, st: 'host', ack: 0 });
    const b = doc('b', { ...host, joined: true, r: 0, seq: 4, st: 'gast', acts: [{ n: 1, r: 0, a: 'x' }, { n: 2, r: 1, a: 'y' }] });
    const v = matchView(a, b, 'a')!;
    expect(v.shared(0)).toEqual({ seq: 4, st: 'gast', ack: 0 });
    expect(v.shared(1)).toBeNull();
    expect(v.acts(0)).toEqual([{ n: 1, a: 'x' }]);
    // Gleichstand: Gastgeber gewinnt
    const tie = matchView(b, doc('a', { ...host, r: 0, seq: 4, st: 'host' }), 'b')!;
    expect(tie.shared(0)?.st).toBe('host');
  });

  it('erkennt, wenn der Schatz geht oder eine neue Partie beginnt', () => {
    const left = matchView(doc('a', host), doc('b', { ...host, joined: true, left: true }), 'a')!;
    expect(left.left).toBe(true);
    const other = matchView(doc('b', { ...host, joined: true }), doc('a', { ...host, id: 'm2' }), 'b')!;
    expect(other.left).toBe(true);
    expect(matchView(doc('a', { ...host, left: true }), undefined, 'a')).toBeNull();
  });

  it('beide Seiten kommen über die Kanäle zum selben Ergebnis (simuliert)', () => {
    // Zwei „Handys“ spielen Vier gewinnt, indem sie nur ihre Kanäle austauschen.
    const docs: Record<'a' | 'b', ArcadeDoc> = { a: doc('a', { ...host, game: 'connect4' }), b: doc('b', { ...host, game: 'connect4', joined: true }) };
    const write = (p: 'a' | 'b', snap: { seq: number; st: unknown }) => {
      docs[p] = { ...docs[p], m: { ...docs[p].m!, r: 0, seq: snap.seq, st: snap.st, ack: 0 } };
    };
    const rnd = seeded(9);
    write('a', { seq: 0, st: c4Def.init({ mode: 'online', starter: 'p1', rnd }) });
    for (let step = 0; step < 60; step++) {
      const v = matchView(docs.a, docs.b, 'a')!;
      const cur = v.shared(0)!;
      const s = cur.st as ReturnType<typeof c4Def.init>;
      if (c4Def.outcome(s)) break;
      const side = c4Def.turn(s) as Side;
      const next = c4Def.apply(s, c4Def.cpu!(s, side, rnd)!, side, rnd)!;
      write(side === 'p1' ? 'a' : 'b', { seq: cur.seq + 1, st: next });
    }
    const fromA = matchView(docs.a, docs.b, 'a')!.shared(0)!;
    const fromB = matchView(docs.b, docs.a, 'b')!.shared(0)!;
    expect(fromA).toEqual(fromB);
    expect(c4Def.outcome(fromA.st as ReturnType<typeof c4Def.init>)).toBeTruthy();
    expect(otherSide('p1')).toBe('p2');
  });
});
