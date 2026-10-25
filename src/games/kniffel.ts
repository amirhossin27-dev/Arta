import { otherSide, type Side } from './logic';
import type { Rnd, TurnDef } from './turn';

/** Kniffel: 5 Würfel, bis zu 3 Würfe pro Zug, 13 Felder auf dem Block. */

export type KCat = 'ones' | 'twos' | 'threes' | 'fours' | 'fives' | 'sixes' | 'three' | 'four' | 'full' | 'small' | 'large' | 'kniffel' | 'chance';

export const UPPER: KCat[] = ['ones', 'twos', 'threes', 'fours', 'fives', 'sixes'];
export const LOWER: KCat[] = ['three', 'four', 'full', 'small', 'large', 'kniffel', 'chance'];
export const KCATS: KCat[] = [...UPPER, ...LOWER];

export const KCAT_LABEL: Record<KCat, string> = {
  ones: 'Einser',
  twos: 'Zweier',
  threes: 'Dreier',
  fours: 'Vierer',
  fives: 'Fünfer',
  sixes: 'Sechser',
  three: 'Dreierpasch',
  four: 'Viererpasch',
  full: 'Full House',
  small: 'Kleine Straße',
  large: 'Große Straße',
  kniffel: 'Kniffel',
  chance: 'Chance',
};

export const KCAT_HINT: Record<KCat, string> = {
  ones: 'nur Einser zählen',
  twos: 'nur Zweier zählen',
  threes: 'nur Dreier zählen',
  fours: 'nur Vierer zählen',
  fives: 'nur Fünfer zählen',
  sixes: 'nur Sechser zählen',
  three: '3 gleiche – alle Augen',
  four: '4 gleiche – alle Augen',
  full: '3 + 2 gleiche – 25',
  small: '4 in Folge – 30',
  large: '5 in Folge – 40',
  kniffel: '5 gleiche – 50',
  chance: 'alle Augen',
};

export const BONUS_AT = 63;
export const BONUS = 35;

export type Sheet = Partial<Record<KCat, number>>;

export interface KniffelState {
  dice: number[];
  /** Würfe in diesem Zug (0–3) */
  rolls: number;
  /** Gehaltene Würfel vom letzten Wurf (nur zur Anzeige beim Schatz) */
  held: boolean[];
  sheets: Record<Side, Sheet>;
  turn: Side;
  solo: boolean;
  last: { by: Side; cat: KCat; pts: number } | null;
}

export type KniffelAction = { t: 'roll'; hold: boolean[] } | { t: 'score'; cat: KCat };

const sum = (d: number[]) => d.reduce((a, b) => a + b, 0);
const counts = (d: number[]) => [1, 2, 3, 4, 5, 6].map((f) => d.filter((x) => x === f).length);
const hasRun = (d: number[], n: number) => {
  const set = new Set(d);
  for (let start = 1; start + n - 1 <= 6; start++) if (Array.from({ length: n }, (_, k) => start + k).every((x) => set.has(x))) return true;
  return false;
};

export function catScore(cat: KCat, d: number[]): number {
  const c = counts(d);
  const max = Math.max(...c);
  const up = UPPER.indexOf(cat);
  if (up >= 0) return c[up] * (up + 1);
  switch (cat) {
    case 'three':
      return max >= 3 ? sum(d) : 0;
    case 'four':
      return max >= 4 ? sum(d) : 0;
    case 'full':
      return (c.includes(3) && c.includes(2)) || max === 5 ? 25 : 0;
    case 'small':
      return hasRun(d, 4) ? 30 : 0;
    case 'large':
      return hasRun(d, 5) ? 40 : 0;
    case 'kniffel':
      return max === 5 ? 50 : 0;
    default:
      return sum(d);
  }
}

export const upperSum = (s: Sheet) => UPPER.reduce((a, k) => a + (s[k] ?? 0), 0);
export const bonusOf = (s: Sheet) => (upperSum(s) >= BONUS_AT ? BONUS : 0);
export const total = (s: Sheet) => KCATS.reduce((a, k) => a + (s[k] ?? 0), 0) + bonusOf(s);
export const sheetFull = (s: Sheet) => KCATS.every((k) => s[k] !== undefined);

const roll = (dice: number[], hold: boolean[], rnd: Rnd) => dice.map((d, i) => (hold[i] ? d : 1 + Math.floor(rnd() * 6)));

// ───── KI ─────

/** Was ein Feld im Schnitt wert ist – darunter lohnt es sich kaum, es zu belegen. */
const PAR: Record<KCat, number> = { ones: 2, twos: 5, threes: 8, fours: 11, fives: 14, sixes: 17, three: 17, four: 10, full: 12, small: 18, large: 14, kniffel: 10, chance: 21 };

function bestValue(d: number[], sheet: Sheet): { cat: KCat; v: number } {
  let best: { cat: KCat; v: number } = { cat: 'chance', v: -Infinity };
  for (const cat of KCATS) {
    if (sheet[cat] !== undefined) continue;
    let v = catScore(cat, d) - PAR[cat];
    // Bonus im Blick behalten: Oben mindestens drei Gleiche anstreben
    const up = UPPER.indexOf(cat);
    if (up >= 0) v += (counts(d)[up] - 3) * (up + 1) * 0.6;
    if (v > best.v) best = { cat, v };
  }
  return best;
}

function holdValue(d: number[], hold: boolean[], sheet: Sheet, rnd: Rnd): number {
  const free = hold.filter((h) => !h).length;
  if (!free) return bestValue(d, sheet).v;
  const samples = free <= 2 ? 36 : 60;
  let acc = 0;
  for (let k = 0; k < samples; k++) acc += bestValue(roll(d, hold, rnd), sheet).v;
  return acc / samples;
}

export function kniffelCpu(s: KniffelState, side: Side, rnd: Rnd): KniffelAction {
  const sheet = s.sheets[side];
  if (s.rolls === 0) return { t: 'roll', hold: [false, false, false, false, false] };
  const stay = bestValue(s.dice, sheet);
  if (s.rolls < 3) {
    let bestHold: boolean[] | null = null;
    let bestV = stay.v;
    for (let mask = 0; mask < 31; mask++) {
      const hold = [0, 1, 2, 3, 4].map((i) => !!(mask & (1 << i)));
      const v = holdValue(s.dice, hold, sheet, rnd);
      if (v > bestV + 0.5) {
        bestV = v;
        bestHold = hold;
      }
    }
    if (bestHold) return { t: 'roll', hold: bestHold };
  }
  return { t: 'score', cat: stay.cat };
}

export const kniffelDef: TurnDef<KniffelState, KniffelAction> = {
  init: ({ mode, starter }) => ({
    dice: [1, 2, 3, 4, 5],
    rolls: 0,
    held: [false, false, false, false, false],
    sheets: { p1: {}, p2: {} },
    turn: mode === 'solo' ? 'p1' : starter,
    solo: mode === 'solo',
    last: null,
  }),
  turn: (s) => (sheetFull(s.sheets.p1) && (s.solo || sheetFull(s.sheets.p2)) ? null : s.turn),
  apply(s, a, by, rnd) {
    if (by !== s.turn || sheetFull(s.sheets[by])) return null;
    if (a.t === 'roll') {
      if (s.rolls >= 3 || !Array.isArray(a.hold) || a.hold.length !== 5) return null;
      const hold = s.rolls === 0 ? [false, false, false, false, false] : a.hold.map(Boolean);
      return { ...s, dice: roll(s.dice, hold, rnd), rolls: s.rolls + 1, held: hold };
    }
    if (s.rolls === 0 || !KCATS.includes(a.cat) || s.sheets[by][a.cat] !== undefined) return null;
    const pts = catScore(a.cat, s.dice);
    const sheets = { ...s.sheets, [by]: { ...s.sheets[by], [a.cat]: pts } };
    return { ...s, sheets, rolls: 0, held: [false, false, false, false, false], turn: s.solo ? by : otherSide(by), last: { by, cat: a.cat, pts } };
  },
  outcome(s) {
    if (s.solo || !sheetFull(s.sheets.p1) || !sheetFull(s.sheets.p2)) return null;
    const a = total(s.sheets.p1);
    const b = total(s.sheets.p2);
    return a === b ? 'draw' : a > b ? 'p1' : 'p2';
  },
  cpu: (s, side, rnd) => (s.turn === side ? kniffelCpu(s, side, rnd) : null),
  cpuDelay: (s) => (s.rolls === 0 ? 700 : 1100),
  endDelay: 2000,
};
