import { otherSide, type Side } from './logic';
import type { Rnd, TurnDef } from './turn';
import { shuffle } from './uno';

/**
 * Rommé zu zweit: zwei Blätter à 52 Karten plus 4 Joker, 13 Karten auf die Hand.
 * Erstes Auslegen mindestens 40 Punkte, Ass zählt 11 (in A-2-3 nur 1), Bilder 10.
 */

export type Suit = 'S' | 'H' | 'D' | 'C';

export interface RCard {
  id: number;
  /** J = Joker */
  s: Suit | 'J';
  /** 1 = Ass … 13 = König, Joker 0 */
  r: number;
}

export interface Meld {
  id: number;
  cards: RCard[];
  by: Side;
}

export const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
export const SUIT_SYMBOL: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const FIRST_MELD = 40;
const HAND = 13;

export const isJoker = (c: RCard) => c.s === 'J';
export const rankLabel = (r: number) => ({ 1: 'A', 11: 'B', 12: 'D', 13: 'K', 14: 'A' })[r] ?? String(r);
export const cardLabel = (c: RCard) => (isJoker(c) ? 'Joker' : `${SUIT_SYMBOL[c.s as Suit]}${rankLabel(c.r)}`);

/** Punkte einer Karte auf der Hand (Strafpunkte am Ende). */
export const handValue = (c: RCard) => (isJoker(c) ? 20 : c.r === 1 ? 11 : Math.min(c.r, 10));
/** Punktwert eines Rangs in einer Auslage (1 = Ass unten, 14 = Ass oben). */
const rankValue = (r: number) => (r === 1 ? 1 : r === 14 ? 11 : Math.min(r, 10));

export function rommeDeck(): RCard[] {
  const cards: RCard[] = [];
  let id = 0;
  for (let deck = 0; deck < 2; deck++) for (const s of SUITS) for (let r = 1; r <= 13; r++) cards.push({ id: id++, s, r });
  for (let k = 0; k < 4; k++) cards.push({ id: id++, s: 'J', r: 0 });
  return cards;
}

export interface MeldInfo {
  kind: 'set' | 'run';
  /** In Lege-Reihenfolge, Joker an ihrer Stelle */
  cards: RCard[];
  /** Rang, den jede Karte vertritt (für die Anzeige der Joker) */
  ranks: number[];
  value: number;
}

/** Ist das ein gültiger Satz oder eine gültige Reihe? */
export function analyzeMeld(cards: RCard[]): MeldInfo | null {
  if (cards.length < 3) return null;
  const nat = cards.filter((c) => !isJoker(c));
  const jokers = cards.filter(isJoker);
  if (nat.length < 2) return null;
  // Satz: gleicher Rang, verschiedene Farben, höchstens vier
  if (cards.length <= 4 && nat.every((c) => c.r === nat[0].r) && new Set(nat.map((c) => c.s)).size === nat.length) {
    const r = nat[0].r;
    return { kind: 'set', cards: [...nat, ...jokers], ranks: cards.map(() => r), value: (r === 1 ? 11 : rankValue(r)) * cards.length };
  }
  // Reihe: gleiche Farbe, aufeinanderfolgend, Ass unten (1) oder oben (14), nicht ums Eck
  if (!nat.every((c) => c.s === nat[0].s)) return null;
  const hasAce = nat.some((c) => c.r === 1);
  for (const aceHigh of hasAce ? [false, true] : [false]) {
    const placed = nat.map((c) => ({ c, r: c.r === 1 && aceHigh ? 14 : c.r })).sort((a, b) => a.r - b.r);
    if (new Set(placed.map((p) => p.r)).size !== placed.length) continue;
    let lo = placed[0].r;
    let hi = placed[placed.length - 1].r;
    const gaps = hi - lo + 1 - placed.length;
    if (gaps > jokers.length) continue;
    let extra = jokers.length - gaps;
    while (extra > 0 && hi < 14 && hi - lo + 1 < 13) {
      hi++;
      extra--;
    }
    while (extra > 0 && lo > 1 && hi - lo + 1 < 13) {
      lo--;
      extra--;
    }
    if (extra > 0) continue;
    const ordered: RCard[] = [];
    const ranks: number[] = [];
    let j = 0;
    for (let r = lo; r <= hi; r++) {
      const p = placed.find((x) => x.r === r);
      ordered.push(p ? p.c : jokers[j++]);
      ranks.push(r);
    }
    return { kind: 'run', cards: ordered, ranks, value: ranks.reduce((sum, r) => sum + rankValue(r), 0) };
  }
  return null;
}

export interface RommeState {
  stock: RCard[];
  pile: RCard[];
  hands: Record<Side, RCard[]>;
  melds: Meld[];
  /** Hat die Erstauslage (40 Punkte) schon geschafft */
  out: Record<Side, boolean>;
  turn: Side;
  phase: 'draw' | 'play';
  /** In diesem Zug neu ausgelegte Kombinationen (zählen für die 40) */
  fresh: number[];
  /** Stand zu Beginn des Zugs – für „Zurücknehmen“ */
  undo?: { hand: RCard[]; melds: Meld[] };
  /** Von der Ablage genommen – darf nicht gleich wieder abgeworfen werden */
  took: number | null;
  nextId: number;
  last?: { by: Side; kind: 'stock' | 'pile' | 'discard'; card?: RCard };
  winner?: Side | 'draw';
}

export type RommeAction =
  | { t: 'draw'; from: 'stock' | 'pile' }
  | { t: 'meld'; ids: number[] }
  | { t: 'layoff'; ids: number[]; meld: number }
  | { t: 'undo' }
  | { t: 'discard'; id: number };

export const rommeTop = (s: RommeState): RCard | undefined => s.pile[s.pile.length - 1];

/** Punkte, die in diesem Zug neu ausgelegt wurden. */
export function freshValue(s: RommeState): number {
  return s.melds.filter((m) => s.fresh.includes(m.id)).reduce((sum, m) => sum + (analyzeMeld(m.cards)?.value ?? 0), 0);
}

const pickCards = (hand: RCard[], ids: number[]) => {
  const cards = ids.map((id) => hand.find((c) => c.id === id));
  return cards.every(Boolean) && new Set(ids).size === ids.length ? (cards as RCard[]) : null;
};

/** Fehlermeldung (für die Oberfläche) oder `null`, wenn das Auslegen geht. */
export function meldError(s: RommeState, side: Side, ids: number[]): string | null {
  if (s.phase !== 'play') return 'Erst eine Karte ziehen.';
  const cards = pickCards(s.hands[side], ids);
  if (!cards || cards.length < 3) return 'Wähle mindestens 3 Karten.';
  const info = analyzeMeld(cards);
  if (!info) return 'Das ist weder ein Satz noch eine Reihe.';
  if (cards.length === s.hands[side].length && !s.out[side] && freshValue(s) + info.value < FIRST_MELD) return `Für die Erstauslage fehlen noch ${FIRST_MELD - freshValue(s) - info.value} Punkte.`;
  return null;
}

export function layoffError(s: RommeState, side: Side, ids: number[], meldId: number): string | null {
  if (s.phase !== 'play') return 'Erst eine Karte ziehen.';
  const cards = pickCards(s.hands[side], ids);
  const meld = s.melds.find((m) => m.id === meldId);
  if (!cards || !cards.length || !meld) return 'Wähle Karten zum Anlegen.';
  const own = s.fresh.includes(meldId);
  if (!own && !s.out[side] && freshValue(s) < FIRST_MELD) return `Anlegen geht erst nach deiner Erstauslage (${FIRST_MELD} Punkte).`;
  if (!analyzeMeld([...meld.cards, ...cards])) return 'Passt hier nicht dran.';
  if (cards.length === s.hands[side].length && !s.out[side] && freshValue(s) < FIRST_MELD) return `Für die Erstauslage fehlen noch Punkte.`;
  return null;
}

export function discardError(s: RommeState, side: Side, id: number): string | null {
  if (s.phase !== 'play') return 'Erst eine Karte ziehen.';
  if (!s.hands[side].some((c) => c.id === id)) return 'Wähle eine Karte zum Abwerfen.';
  if (id === s.took && s.hands[side].length > 1) return 'Die gerade aufgenommene Karte darfst du nicht gleich wieder abwerfen.';
  if (!s.out[side] && s.fresh.length && freshValue(s) < FIRST_MELD)
    return `Deine Erstauslage hat erst ${freshValue(s)} von ${FIRST_MELD} Punkten – leg mehr aus oder nimm sie zurück.`;
  return null;
}

/** Hand leer → gewonnen (die Erstauslage-Regel wurde vorher geprüft). */
function finishIfEmpty(s: RommeState, side: Side): RommeState {
  if (s.hands[side].length) return s;
  return { ...s, winner: side, out: { ...s.out, [side]: true } };
}

function sortMeld(cards: RCard[]): RCard[] {
  return analyzeMeld(cards)?.cards ?? cards;
}

export const rommeDef: TurnDef<RommeState, RommeAction> = {
  init({ starter, rnd }) {
    const deck = shuffle(rommeDeck(), rnd);
    const p1 = deck.splice(0, HAND);
    const p2 = deck.splice(0, HAND);
    const top = deck.splice(0, 1);
    return { stock: deck, pile: top, hands: { p1, p2 }, melds: [], out: { p1: false, p2: false }, turn: starter, phase: 'draw', fresh: [], took: null, nextId: 1 };
  },
  turn: (s) => (s.winner ? null : s.turn),
  apply(s, a, by, rnd) {
    if (s.winner || by !== s.turn) return null;
    const hand = s.hands[by];
    switch (a.t) {
      case 'draw': {
        if (s.phase !== 'draw') return null;
        let stock = s.stock;
        let pile = s.pile;
        let card: RCard | undefined;
        if (a.from === 'pile') {
          card = pile[pile.length - 1];
          if (!card) return null;
          pile = pile.slice(0, -1);
        } else {
          if (!stock.length) {
            if (pile.length <= 1) return { ...s, winner: 'draw' };
            stock = shuffle(pile.slice(0, -1), rnd);
            pile = pile.slice(-1);
          }
          card = stock[stock.length - 1];
          stock = stock.slice(0, -1);
        }
        const newHand = [...hand, card];
        return {
          ...s,
          stock,
          pile,
          hands: { ...s.hands, [by]: newHand },
          phase: 'play',
          fresh: [],
          took: a.from === 'pile' ? card.id : null,
          undo: { hand: newHand, melds: s.melds },
          last: { by, kind: a.from === 'pile' ? 'pile' : 'stock', card: a.from === 'pile' ? card : undefined },
        };
      }
      case 'meld': {
        if (meldError(s, by, a.ids)) return null;
        const cards = pickCards(hand, a.ids)!;
        const meld: Meld = { id: s.nextId, cards: sortMeld(cards), by };
        const next: RommeState = {
          ...s,
          hands: { ...s.hands, [by]: hand.filter((c) => !a.ids.includes(c.id)) },
          melds: [...s.melds, meld],
          fresh: [...s.fresh, meld.id],
          nextId: s.nextId + 1,
        };
        return finishIfEmpty(next, by);
      }
      case 'layoff': {
        if (layoffError(s, by, a.ids, a.meld)) return null;
        const cards = pickCards(hand, a.ids)!;
        const next: RommeState = {
          ...s,
          hands: { ...s.hands, [by]: hand.filter((c) => !a.ids.includes(c.id)) },
          melds: s.melds.map((m) => (m.id === a.meld ? { ...m, cards: sortMeld([...m.cards, ...cards]) } : m)),
        };
        return finishIfEmpty(next, by);
      }
      case 'undo': {
        if (s.phase !== 'play' || !s.undo) return null;
        return { ...s, hands: { ...s.hands, [by]: s.undo.hand }, melds: s.undo.melds, fresh: [] };
      }
      case 'discard': {
        if (discardError(s, by, a.id)) return null;
        const card = hand.find((c) => c.id === a.id)!;
        const out = s.out[by] || freshValue(s) >= FIRST_MELD;
        const next: RommeState = {
          ...s,
          hands: { ...s.hands, [by]: hand.filter((c) => c.id !== a.id) },
          pile: [...s.pile, card],
          out: { ...s.out, [by]: out },
          turn: otherSide(by),
          phase: 'draw',
          fresh: [],
          undo: undefined,
          took: null,
          last: { by, kind: 'discard', card },
        };
        return finishIfEmpty(next, by);
      }
    }
  },
  outcome: (s) => s.winner ?? null,
  cpu: (s, side, rnd) => rommeCpu(s, side, rnd),
  cpuDelay: (s) => (s.phase === 'draw' ? 900 : 1000),
  viewer: (s) => (s.winner ? null : s.turn),
  endDelay: 1600,
};

// ───── KI ─────

/** Mögliche Sätze und Reihen in einer Hand (ohne Überschneidungen zu prüfen). */
export function meldCandidates(hand: RCard[]): RCard[][] {
  const nat = hand.filter((c) => !isJoker(c));
  const jokers = hand.filter(isJoker);
  const out: RCard[][] = [];
  // Sätze
  for (let r = 1; r <= 13; r++) {
    const bySuit = new Map<string, RCard>();
    for (const c of nat) if (c.r === r && !bySuit.has(c.s)) bySuit.set(c.s, c);
    const set = [...bySuit.values()];
    if (set.length >= 3) out.push(set.slice(0, 4));
    else if (set.length === 2 && jokers.length) out.push([...set, jokers[0]]);
  }
  // Reihen: von jedem Startrang aus so weit wie möglich, Lücken höchstens mit Jokern
  for (const suit of SUITS) {
    const byRank = new Map<number, RCard>();
    for (const c of nat) if (c.s === suit && !byRank.has(c.r)) byRank.set(c.r, c);
    if (byRank.has(1)) byRank.set(14, byRank.get(1)!);
    for (let lo = 1; lo <= 12; lo++) {
      if (!byRank.has(lo)) continue;
      const run: RCard[] = [];
      let used = 0;
      for (let r = lo; r <= 14 && run.length < 13; r++) {
        const c = byRank.get(r);
        if (c && !run.includes(c)) run.push(c);
        else if (used < jokers.length && byRank.has(r + 1)) run.push(jokers[used++]);
        else break;
        if (run.length >= 3) out.push(run.slice());
      }
      if (run.length === 2 && used < jokers.length) out.push([...run, jokers[used]]);
    }
  }
  return out.filter((m) => analyzeMeld(m));
}

/** Gierig die wertvollsten, sich nicht überschneidenden Kombinationen wählen. */
export function bestMelds(hand: RCard[]): RCard[][] {
  const chosen: RCard[][] = [];
  let rest = hand;
  for (;;) {
    const cands = meldCandidates(rest);
    if (!cands.length) return chosen;
    // Joker sparsam einsetzen: Kombinationen ohne Joker bevorzugen
    const best = cands.reduce((a, b) => {
      const va = analyzeMeld(a)!.value - a.filter(isJoker).length * 12;
      const vb = analyzeMeld(b)!.value - b.filter(isJoker).length * 12;
      return vb > va ? b : a;
    });
    chosen.push(best);
    rest = rest.filter((c) => !best.includes(c));
  }
}

const meldsValue = (melds: RCard[][]) => melds.reduce((sum, m) => sum + analyzeMeld(m)!.value, 0);

/** Wie nützlich ist eine Karte noch (Paare, Nachbarn)? Höher = behalten. */
function keepScore(c: RCard, hand: RCard[]): number {
  if (isJoker(c)) return 100;
  let score = -handValue(c) / 2;
  for (const o of hand) {
    if (o === c || isJoker(o)) continue;
    if (o.r === c.r && o.s !== c.s) score += 6;
    if (o.s === c.s) {
      const d = Math.min(Math.abs(o.r - c.r), c.r === 1 || o.r === 1 ? Math.abs((o.r === 1 ? 14 : o.r) - (c.r === 1 ? 14 : c.r)) : 99);
      if (d === 1) score += 6;
      else if (d === 2) score += 3;
    }
  }
  return score;
}

export function rommeCpu(s: RommeState, side: Side, rnd: Rnd): RommeAction | null {
  if (s.turn !== side || s.winner) return null;
  const hand = s.hands[side];
  if (s.phase === 'draw') {
    const top = rommeTop(s);
    if (top) {
      const before = meldsValue(bestMelds(hand));
      const after = bestMelds([...hand, top]);
      if (after.some((m) => m.includes(top)) && meldsValue(after) > before) return { t: 'draw', from: 'pile' };
      if (s.out[side] && s.melds.some((m) => analyzeMeld([...m.cards, top]))) return { t: 'draw', from: 'pile' };
    }
    return { t: 'draw', from: 'stock' };
  }
  const canLayoff = s.out[side] || freshValue(s) >= FIRST_MELD;
  const melds = bestMelds(hand).filter((m) => m.length < hand.length || canLayoff || freshValue(s) + analyzeMeld(m)!.value >= FIRST_MELD);
  if (melds.length && (s.out[side] || freshValue(s) + meldsValue(melds) >= FIRST_MELD)) {
    // Eine Karte zum Abwerfen übrig lassen, außer wir werden damit fertig
    const first = melds[0];
    if (first.length < hand.length || !meldError(s, side, first.map((c) => c.id))) return { t: 'meld', ids: first.map((c) => c.id) };
  }
  if (canLayoff) {
    for (const c of hand) {
      if (isJoker(c) && hand.length > 2) continue;
      if (hand.length === 1 && c.id !== s.took) break; // letzte Karte lieber abwerfen
      for (const m of s.melds) if (!layoffError(s, side, [c.id], m.id)) return { t: 'layoff', ids: [c.id], meld: m.id };
    }
  }
  if (!s.out[side] && s.fresh.length && freshValue(s) < FIRST_MELD) return { t: 'undo' };
  const options = hand.filter((c) => !discardError(s, side, c.id));
  if (!options.length) return null;
  const worst = options.map((c) => ({ c, v: keepScore(c, hand) + rnd() })).reduce((a, b) => (b.v < a.v ? b : a)).c;
  return { t: 'discard', id: worst.id };
}

/** Strafpunkte der Karten, die noch auf der Hand sind. */
export const penalty = (hand: RCard[]) => hand.reduce((sum, c) => sum + handValue(c), 0);
