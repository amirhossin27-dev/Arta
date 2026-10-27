/** Solitär (Klondike, eine Karte ziehen): reine Spiellogik */

export type SSuit = 'H' | 'D' | 'S' | 'C';

export interface SCard {
  id: number;
  s: SSuit;
  r: number;
  up: boolean;
}

export interface SolState {
  stock: SCard[];
  waste: SCard[];
  found: SCard[][];
  tab: SCard[][];
}

export type Where = { k: 'waste' } | { k: 'found'; i: number } | { k: 'tab'; i: number };
export type Target = { k: 'found'; i: number } | { k: 'tab'; i: number };

export const S_SUITS: SSuit[] = ['H', 'D', 'S', 'C'];
export const SUIT_CHAR: Record<SSuit, string> = { H: '♥', D: '♦', S: '♠', C: '♣' };
export const isRed = (c: { s: SSuit }) => c.s === 'H' || c.s === 'D';
export const rankText = (r: number) => ({ 1: 'A', 11: 'B', 12: 'D', 13: 'K' })[r] ?? String(r);

type Rnd = () => number;

export function solDeal(rnd: Rnd = Math.random): SolState {
  const deck: SCard[] = [];
  let id = 0;
  for (const s of S_SUITS) for (let r = 1; r <= 13; r++) deck.push({ id: id++, s, r, up: false });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const tab: SCard[][] = [];
  for (let i = 0; i < 7; i++) {
    const pile = deck.splice(0, i + 1);
    pile[pile.length - 1].up = true;
    tab.push(pile);
  }
  return { stock: deck, waste: [], found: [[], [], [], []], tab };
}

export const cloneSol = (s: SolState): SolState => ({
  stock: s.stock.map((c) => ({ ...c })),
  waste: s.waste.map((c) => ({ ...c })),
  found: s.found.map((p) => p.map((c) => ({ ...c }))),
  tab: s.tab.map((p) => p.map((c) => ({ ...c }))),
});

const top = <T>(a: T[]) => a[a.length - 1];

export function canFound(card: SCard, pile: SCard[]): boolean {
  const t = top(pile);
  return t ? t.s === card.s && card.r === t.r + 1 : card.r === 1;
}

export function canTab(card: SCard, pile: SCard[]): boolean {
  const t = top(pile);
  return t ? t.up && isRed(t) !== isRed(card) && card.r === t.r - 1 : card.r === 13;
}

/** Die Karten, die ab `idx` aus dieser Lage mitgenommen werden (null = darf man nicht greifen) */
export function pickUp(s: SolState, from: Where, idx?: number): SCard[] | null {
  if (from.k === 'waste') return s.waste.length ? [top(s.waste)] : null;
  if (from.k === 'found') return s.found[from.i].length ? [top(s.found[from.i])] : null;
  const pile = s.tab[from.i];
  const i = idx ?? pile.length - 1;
  if (i < 0 || i >= pile.length || !pile[i].up) return null;
  const run = pile.slice(i);
  for (let k = 1; k < run.length; k++) if (isRed(run[k]) === isRed(run[k - 1]) || run[k].r !== run[k - 1].r - 1) return null;
  return run;
}

export function canDrop(s: SolState, cards: SCard[], to: Target): boolean {
  if (!cards.length) return false;
  if (to.k === 'found') return cards.length === 1 && canFound(cards[0], s.found[to.i]);
  return canTab(cards[0], s.tab[to.i]);
}

function source(s: SolState, from: Where): SCard[] {
  return from.k === 'waste' ? s.waste : from.k === 'found' ? s.found[from.i] : s.tab[from.i];
}

/** Zug ausführen (neuer Zustand) oder null, wenn er nicht geht */
export function solMove(s: SolState, from: Where, count: number, to: Target): SolState | null {
  if (from.k !== 'waste' && from.k === to.k && from.i === to.i) return null;
  const src = source(s, from);
  const cards = from.k === 'tab' ? pickUp(s, from, src.length - count) : count === 1 ? pickUp(s, from) : null;
  if (!cards || !canDrop(s, cards, to)) return null;
  const n = cloneSol(s);
  const nsrc = source(n, from);
  const moved = nsrc.splice(nsrc.length - count, count);
  (to.k === 'found' ? n.found[to.i] : n.tab[to.i]).push(...moved);
  if (from.k === 'tab') {
    const t = top(n.tab[from.i]);
    if (t) t.up = true;
  }
  return n;
}

/** Vom Stapel ziehen – ist er leer, kommt der Ablagestapel umgedreht zurück. */
export function solDraw(s: SolState): SolState | null {
  if (!s.stock.length && !s.waste.length) return null;
  const n = cloneSol(s);
  if (n.stock.length) {
    const c = n.stock.pop()!;
    c.up = true;
    n.waste.push(c);
  } else {
    n.stock = n.waste.reverse().map((c) => ({ ...c, up: false }));
    n.waste = [];
  }
  return n;
}

/** Wohin mit der angetippten Karte? Erst auf die Ablage oben, sonst auf eine passende Reihe. */
export function bestTarget(s: SolState, from: Where, count: number): Target | null {
  const src = source(s, from);
  const cards = src.slice(src.length - count);
  if (!cards.length) return null;
  if (count === 1 && from.k !== 'found') {
    const i = s.found.findIndex((p) => canFound(cards[0], p));
    if (i >= 0) return { k: 'found', i };
  }
  const first = cards[0];
  // Ein König, der schon ganz unten liegt, muss nicht auf ein anderes leeres Feld.
  const kingAlone = from.k === 'tab' && first.r === 13 && src.length === count;
  let empty: Target | null = null;
  for (let i = 0; i < 7; i++) {
    if (from.k === 'tab' && from.i === i) continue;
    if (!canTab(first, s.tab[i])) continue;
    if (s.tab[i].length) return { k: 'tab', i };
    if (!empty && !kingAlone) empty = { k: 'tab', i };
  }
  return empty;
}

export const solWon = (s: SolState) => s.found.every((p) => p.length === 13);

/** Alles aufgedeckt und der Stapel leer: dann kann der Rest von selbst abgelegt werden. */
export const canAutoFinish = (s: SolState) => !s.stock.length && !s.waste.length && s.tab.every((p) => p.every((c) => c.up)) && !solWon(s);

/** Nächster Zug fürs automatische Ablegen */
export function autoStep(s: SolState): SolState | null {
  let best: { from: Where; r: number } | null = null;
  const options: Where[] = [{ k: 'waste' }, ...s.tab.map((_, i) => ({ k: 'tab' as const, i }))];
  for (const from of options) {
    const src = source(s, from);
    const c = top(src);
    if (!c || !c.up) continue;
    if (!s.found.some((p) => canFound(c, p))) continue;
    if (!best || c.r < best.r) best = { from, r: c.r };
  }
  if (!best) return null;
  const c = top(source(s, best.from));
  const i = s.found.findIndex((p) => canFound(c, p));
  return solMove(s, best.from, 1, { k: 'found', i });
}
