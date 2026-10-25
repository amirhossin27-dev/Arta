import { otherSide, type Side } from './logic';
import { SUIT_SYMBOL, SUITS, type RCard, type Suit } from './romme';
import type { Rnd, TurnDef } from './turn';
import { shuffle } from './uno';

/**
 * Mau-Mau mit 32 Karten (7 bis Ass). Gleiche Farbe oder gleicher Wert passt.
 * 7: der andere zieht 2 (mit einer 7 weitergeben, dann 4 …), 8: der andere setzt aus,
 * Bube: passt immer und man wünscht sich eine Farbe. Wer zuerst keine Karten mehr hat, gewinnt.
 */

export const MAU_HAND = 5;
export const MAU_RANKS = [7, 8, 9, 10, 11, 12, 13, 1];
export const SUIT_NAME: Record<Suit, string> = { C: 'Kreuz', S: 'Pik', H: 'Herz', D: 'Karo' };
const RANK_NAME: Record<number, string> = { 1: 'Ass', 11: 'Bube', 12: 'Dame', 13: 'König' };

export const mauName = (c: RCard) => `${SUIT_NAME[c.s as Suit]} ${RANK_NAME[c.r] ?? c.r}`;
export const mauSymbol = (s: Suit) => SUIT_SYMBOL[s];

export function mauDeck(): RCard[] {
  let id = 0;
  return SUITS.flatMap((s) => MAU_RANKS.map((r) => ({ id: id++, s, r })));
}

export interface MauState {
  draw: RCard[];
  pile: RCard[];
  hands: Record<Side, RCard[]>;
  turn: Side;
  /** Gewünschte Farbe nach einem Buben */
  wish: Suit | null;
  /** Offene Strafkarten durch Siebenen */
  penalty: number;
  /** Gerade gezogene Karte, die noch gelegt werden darf */
  drawn: number | null;
  last: { by: Side; kind: 'play' | 'draw' | 'pass'; card?: RCard; got?: number } | null;
  winner?: Side;
}

export type MauAction = { t: 'play'; id: number; wish?: Suit } | { t: 'draw' } | { t: 'pass' };

export const mauTop = (s: MauState) => s.pile[s.pile.length - 1];

export function mauPlayable(s: MauState, c: RCard): boolean {
  if (s.drawn !== null && c.id !== s.drawn) return false;
  if (s.penalty > 0) return c.r === 7;
  if (c.r === 11) return true;
  const top = mauTop(s);
  if (s.wish) return c.s === s.wish;
  return c.s === top.s || c.r === top.r;
}

function take(s: MauState, side: Side, n: number, rnd: Rnd): { s: MauState; got: RCard[] } {
  let draw = s.draw;
  let pile = s.pile;
  const got: RCard[] = [];
  for (let k = 0; k < n; k++) {
    if (!draw.length && pile.length > 1) {
      draw = shuffle(pile.slice(0, -1), rnd);
      pile = pile.slice(-1);
    }
    const card = draw[draw.length - 1];
    if (!card) break;
    draw = draw.slice(0, -1);
    got.push(card);
  }
  return { s: { ...s, draw, pile, hands: { ...s.hands, [side]: [...s.hands[side], ...got] } }, got };
}

export function mauBestSuit(hand: RCard[], rnd: Rnd = Math.random): Suit {
  const count = (x: Suit) => hand.filter((c) => c.s === x && c.r !== 11).length;
  const max = Math.max(...SUITS.map(count));
  const best = SUITS.filter((x) => count(x) === max);
  return best[Math.floor(rnd() * best.length)];
}

export const mauDef: TurnDef<MauState, MauAction> = {
  init({ starter, rnd }) {
    const deck = shuffle(mauDeck(), rnd);
    const p1 = deck.splice(0, MAU_HAND);
    const p2 = deck.splice(0, MAU_HAND);
    // Erste Karte ohne Sonderwirkung
    const first = deck.findIndex((c) => c.r !== 7 && c.r !== 8 && c.r !== 11);
    const [top] = deck.splice(first, 1);
    return { draw: deck, pile: [top], hands: { p1, p2 }, turn: starter, wish: null, penalty: 0, drawn: null, last: null };
  },
  turn: (s) => (s.winner ? null : s.turn),
  apply(s, a, by, rnd) {
    if (s.winner || by !== s.turn) return null;
    const opp = otherSide(by);
    if (a.t === 'draw') {
      if (s.drawn !== null) return null;
      if (s.penalty > 0) {
        const { s: next, got } = take(s, by, s.penalty, rnd);
        return { ...next, penalty: 0, turn: opp, last: { by, kind: 'draw', got: got.length } };
      }
      const { s: next, got } = take(s, by, 1, rnd);
      const card = got[0];
      const last = { by, kind: 'draw' as const, got: got.length };
      if (card && mauPlayable({ ...next, drawn: card.id }, card)) return { ...next, drawn: card.id, last };
      return { ...next, drawn: null, turn: opp, last };
    }
    if (a.t === 'pass') {
      if (s.drawn === null) return null;
      return { ...s, drawn: null, turn: opp, last: { by, kind: 'pass' } };
    }
    const card = s.hands[by].find((c) => c.id === a.id);
    if (!card || !mauPlayable(s, card)) return null;
    if (card.r === 11 && (!a.wish || !SUITS.includes(a.wish))) return null;
    const next: MauState = {
      ...s,
      hands: { ...s.hands, [by]: s.hands[by].filter((c) => c.id !== card.id) },
      pile: [...s.pile, card],
      wish: card.r === 11 ? a.wish! : null,
      penalty: card.r === 7 ? s.penalty + 2 : 0,
      drawn: null,
      last: { by, kind: 'play', card },
    };
    if (!next.hands[by].length) return { ...next, winner: by };
    // Acht: Der andere setzt aus – zu zweit ist man also gleich nochmal dran.
    return { ...next, turn: card.r === 8 ? by : opp };
  },
  outcome: (s) => s.winner ?? null,
  cpu(s, side, rnd) {
    if (s.winner || s.turn !== side) return null;
    const hand = s.hands[side];
    const playable = hand.filter((c) => mauPlayable(s, c));
    if (!playable.length) return s.drawn !== null ? { t: 'pass' } : { t: 'draw' };
    const oppCards = s.hands[otherSide(side)].length;
    const score = (c: RCard) => {
      let v = c.r === 11 ? -8 : 2;
      if (c.r === 7) v += oppCards <= 2 ? 9 : 3;
      if (c.r === 8) v += 4;
      // Farben loswerden, von denen man viele hat
      v += hand.filter((h) => h.s === c.s).length * 0.9;
      if (hand.length === 1) v += 20;
      return v + rnd();
    };
    const card = playable.map((c) => ({ c, v: score(c) })).reduce((x, y) => (y.v > x.v ? y : x)).c;
    return card.r === 11 ? { t: 'play', id: card.id, wish: mauBestSuit(hand.filter((c) => c.id !== card.id), rnd) } : { t: 'play', id: card.id };
  },
  cpuDelay: () => 800 + Math.random() * 400,
  viewer: (s) => (s.winner ? null : s.turn),
  endDelay: 1300,
};
