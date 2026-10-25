import { otherSide, type Side } from './logic';
import type { Rnd, TurnDef } from './turn';

export type UnoColor = 'r' | 'y' | 'g' | 'b';
/** Zahlen 0–9, S = Aussetzen, R = Richtungswechsel, D = +2, W = Farbwahl, F = +4 */
export type UnoValue = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'S' | 'R' | 'D' | 'W' | 'F';

export interface UnoCard {
  id: number;
  c: UnoColor | 'w';
  v: UnoValue;
}

export const UNO_COLORS: UnoColor[] = ['r', 'y', 'g', 'b'];
export const UNO_COLOR_NAME: Record<UnoColor, string> = { r: 'Rot', y: 'Gelb', g: 'Grün', b: 'Blau' };
export const UNO_COLOR_EMOJI: Record<UnoColor, string> = { r: '🟥', y: '🟨', g: '🟩', b: '🟦' };
const HAND = 7;

export function shuffle<T>(list: T[], rnd: Rnd): T[] {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Das klassische Blatt: 108 Karten. */
export function unoDeck(): UnoCard[] {
  const cards: UnoCard[] = [];
  let id = 0;
  for (const c of UNO_COLORS) {
    cards.push({ id: id++, c, v: '0' });
    for (const v of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'S', 'R', 'D'] as UnoValue[]) {
      cards.push({ id: id++, c, v }, { id: id++, c, v });
    }
  }
  for (let k = 0; k < 4; k++) cards.push({ id: id++, c: 'w', v: 'W' }, { id: id++, c: 'w', v: 'F' });
  return cards;
}

export const unoLabel = (card: UnoCard) => ({ S: '⊘', R: '⇄', D: '+2', W: '★', F: '+4' })[card.v as 'S'] ?? card.v;

export function unoName(card: UnoCard): string {
  const v = { S: 'Aussetzen', R: 'Richtungswechsel', D: '+2', W: 'Farbwahl', F: '+4' }[card.v as 'S'] ?? card.v;
  return card.c === 'w' ? v : `${UNO_COLOR_NAME[card.c]} ${v}`;
}

export interface UnoState {
  draw: UnoCard[];
  pile: UnoCard[];
  hands: Record<Side, UnoCard[]>;
  turn: Side;
  /** Aktuelle Farbe (nach Farbwahl-Karten nicht die der Karte) */
  color: UnoColor;
  /** Diese Runde gezogene Karte, die noch gespielt werden darf */
  drawn: number | null;
  last?: { by: Side; kind: 'play' | 'draw' | 'pass'; card?: UnoCard; penalty?: number };
  winner?: Side;
}

export type UnoAction = { t: 'play'; id: number; color?: UnoColor } | { t: 'draw' } | { t: 'pass' };

export const unoTop = (s: UnoState) => s.pile[s.pile.length - 1];

export function unoPlayable(s: UnoState, card: UnoCard): boolean {
  if (s.drawn !== null && card.id !== s.drawn) return false;
  if (card.c === 'w') return true;
  const top = unoTop(s);
  return card.c === s.color || (top.c !== 'w' && card.v === top.v);
}

/** Zieht n Karten; ist der Stapel leer, wird die Ablage (ohne oberste Karte) neu gemischt. */
function take(s: UnoState, side: Side, n: number, rnd: Rnd): { s: UnoState; got: UnoCard[] } {
  let draw = s.draw;
  let pile = s.pile;
  const got: UnoCard[] = [];
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

export const unoDef: TurnDef<UnoState, UnoAction> = {
  init({ starter, rnd }) {
    const deck = shuffle(unoDeck(), rnd);
    const p1 = deck.splice(0, HAND);
    const p2 = deck.splice(0, HAND);
    // Erste Karte: eine Zahl, damit niemand gleich aussetzen muss.
    const first = deck.findIndex((c) => /\d/.test(c.v));
    const [top] = deck.splice(first, 1);
    return { draw: deck, pile: [top], hands: { p1, p2 }, turn: starter, color: top.c as UnoColor, drawn: null };
  },
  turn: (s) => (s.winner ? null : s.turn),
  apply(s, a, by, rnd) {
    if (s.winner || by !== s.turn) return null;
    const opp = otherSide(by);
    if (a.t === 'draw') {
      if (s.drawn !== null) return null;
      const { s: next, got } = take(s, by, 1, rnd);
      const card = got[0];
      const last = { by, kind: 'draw' as const };
      if (card && unoPlayable({ ...next, drawn: card.id }, card)) return { ...next, drawn: card.id, last };
      return { ...next, turn: opp, drawn: null, last };
    }
    if (a.t === 'pass') {
      if (s.drawn === null) return null;
      return { ...s, turn: opp, drawn: null, last: { by, kind: 'pass' } };
    }
    const card = s.hands[by].find((c) => c.id === a.id);
    if (!card || !unoPlayable(s, card)) return null;
    if (card.c === 'w' && (!a.color || !UNO_COLORS.includes(a.color))) return null;
    let next: UnoState = {
      ...s,
      hands: { ...s.hands, [by]: s.hands[by].filter((c) => c.id !== card.id) },
      pile: [...s.pile, card],
      color: card.c === 'w' ? a.color! : card.c,
      drawn: null,
      last: { by, kind: 'play', card },
    };
    if (!next.hands[by].length) return { ...next, winner: by };
    // Zu zweit wirken Aussetzen und Richtungswechsel gleich: Der andere setzt aus.
    const penalty = card.v === 'D' ? 2 : card.v === 'F' ? 4 : 0;
    if (penalty) next = { ...take(next, opp, penalty, rnd).s, last: { by, kind: 'play', card, penalty } };
    const again = penalty > 0 || card.v === 'S' || card.v === 'R';
    return { ...next, turn: again ? by : opp };
  },
  outcome: (s) => s.winner ?? null,
  cpu(s, side, rnd) {
    if (s.turn !== side || s.winner) return null;
    const hand = s.hands[side];
    const playable = hand.filter((c) => unoPlayable(s, c));
    if (!playable.length) return s.drawn !== null ? { t: 'pass' } : { t: 'draw' };
    const oppCards = s.hands[otherSide(side)].length;
    const score = (c: UnoCard) => {
      let v = c.c === 'w' ? -10 : /\d/.test(c.v) ? Number(c.v) / 2 : 3;
      if (c.v === 'F') v = oppCards <= 2 ? 12 : -14;
      if ((c.v === 'D' || c.v === 'S' || c.v === 'R') && oppCards <= 3) v += 8;
      // Farbe behalten, von der man viele hat
      if (c.c !== 'w') v += hand.filter((h) => h.c === c.c).length * 0.8;
      return v + rnd();
    };
    const card = playable.map((c) => ({ c, v: score(c) })).reduce((a, b) => (b.v > a.v ? b : a)).c;
    return card.c === 'w' ? { t: 'play', id: card.id, color: unoBestColor(hand.filter((c) => c.id !== card.id), rnd) } : { t: 'play', id: card.id };
  },
  cpuDelay: () => 800 + Math.random() * 500,
  viewer: (s) => (s.winner ? null : s.turn),
  endDelay: 1300,
};

/** Die Farbe, von der man die meisten Karten hat. */
export function unoBestColor(hand: UnoCard[], rnd: Rnd = Math.random): UnoColor {
  const count = (c: UnoColor) => hand.filter((h) => h.c === c).length;
  const max = Math.max(...UNO_COLORS.map(count));
  const best = UNO_COLORS.filter((c) => count(c) === max);
  return best[Math.floor(rnd() * best.length)];
}
