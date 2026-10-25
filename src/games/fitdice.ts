import { otherSide, type Side } from './logic';
import type { TurnDef } from './turn';

/**
 * Fitness-Würfel: Ein Würfel bestimmt die Übung, der zweite die Menge. Abwechselnd würfeln
 * und machen – mit jeder Runde wird es mehr. Wer zuerst schlappmacht, verliert.
 */

export interface FitExercise {
  name: string;
  emoji: string;
  /** Wiederholungen bzw. Sekunden pro Würfelauge */
  per: number;
  unit: 'x' | 's';
  how: string;
}

export const FIT_EXERCISES: FitExercise[] = [
  { name: 'Kniebeugen', emoji: '🦵', per: 3, unit: 'x', how: 'Po nach hinten, Rücken gerade, Knie über den Zehen.' },
  { name: 'Liegestütze', emoji: '💪', per: 2, unit: 'x', how: 'Körper bleibt ein Brett – auf den Knien zählt auch.' },
  { name: 'Hampelmänner', emoji: '⭐', per: 5, unit: 'x', how: 'Springen, Arme über den Kopf, Beine auseinander.' },
  { name: 'Sit-ups', emoji: '🔥', per: 3, unit: 'x', how: 'Füße am Boden, Hände an die Schläfen, kein Schwung.' },
  { name: 'Ausfallschritte', emoji: '🚶', per: 2, unit: 'x', how: 'Je Bein – großer Schritt, hinteres Knie Richtung Boden.' },
  { name: 'Unterarmstütz', emoji: '🧱', per: 10, unit: 's', how: 'Ellbogen unter den Schultern, Bauch fest, Po nicht hoch.' },
];

/** Nach so vielen geschafften Runden pro Person endet es unentschieden. */
export const FIT_MAX = 8;

export interface FitState {
  turn: Side;
  /** Würfel für den aktuellen Zug: Übung (0–5) und Augen (1–6) */
  dice: { ex: number; pips: number } | null;
  done: Record<Side, number>;
  solo: boolean;
  quit: Side | null;
  last: { by: Side; ex: number; amount: number; ok: boolean } | null;
}

export type FitAction = { t: 'roll' } | { t: 'done' } | { t: 'quit' };

/** Menge für diese Runde – steigt mit jeder geschafften Runde um ein Viertel. */
export function fitAmount(ex: number, pips: number, level: number): number {
  const e = FIT_EXERCISES[ex];
  const raw = e.per * pips * (1 + 0.25 * level);
  return e.unit === 's' ? Math.round(raw / 5) * 5 : Math.round(raw);
}

export const fitLabel = (ex: number, amount: number) => {
  const e = FIT_EXERCISES[ex];
  return e.unit === 's' ? `${amount} Sek. ${e.name}` : `${amount} ${e.name}`;
};

export const fitCurrent = (s: FitState) => (s.dice ? fitAmount(s.dice.ex, s.dice.pips, s.done[s.turn]) : 0);

const over = (s: FitState) => s.quit !== null || (s.solo ? false : s.done.p1 >= FIT_MAX && s.done.p2 >= FIT_MAX);

export const fitDef: TurnDef<FitState, FitAction> = {
  init: ({ mode, starter }) => ({ turn: mode === 'solo' ? 'p1' : starter, dice: null, done: { p1: 0, p2: 0 }, solo: mode === 'solo', quit: null, last: null }),
  turn: (s) => (over(s) ? null : s.turn),
  apply(s, a, by, rnd) {
    if (over(s) || by !== s.turn) return null;
    if (a.t === 'roll') {
      if (s.dice) return null;
      return { ...s, dice: { ex: Math.floor(rnd() * 6), pips: 1 + Math.floor(rnd() * 6) } };
    }
    if (a.t === 'quit') return { ...s, quit: by, last: s.dice ? { by, ex: s.dice.ex, amount: fitCurrent(s), ok: false } : s.last };
    if (!s.dice) return null;
    const done = { ...s.done, [by]: s.done[by] + 1 };
    return { ...s, done, dice: null, turn: s.solo ? by : otherSide(by), last: { by, ex: s.dice.ex, amount: fitCurrent(s), ok: true } };
  },
  outcome(s) {
    if (s.solo) return null;
    if (s.quit) return otherSide(s.quit);
    return s.done.p1 >= FIT_MAX && s.done.p2 >= FIT_MAX ? 'draw' : null;
  },
  cpu(s, side, rnd) {
    if (over(s) || s.turn !== side) return null;
    if (!s.dice) return { t: 'roll' };
    // Die KI hält erstaunlich lange durch – aber nicht ewig.
    return rnd() < 0.03 + s.done[side] * 0.07 ? { t: 'quit' } : { t: 'done' };
  },
  cpuDelay: (s) => (s.dice ? 2600 : 900),
  endDelay: 1600,
};
