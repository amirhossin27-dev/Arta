import type { Side } from './logic';
import type { GameMode } from './registry';

export interface Player {
  name: string;
  emoji: string;
  color: string;
  cpu: boolean;
}

export type GameOutcome = { winner: Side | 'draw' } | { score: number };

export interface GameProps {
  mode: GameMode;
  /** Unten sitzt immer du (im Solo-Modus: wer gerade spielt). */
  p1: Player;
  /** Oben: dein Schatz oder Arta 🤖 */
  p2: Player;
  /** Wer die Runde beginnt – wechselt von Runde zu Runde. */
  starter: Side;
  /** Bisheriger Rekord (Solo) */
  best?: number;
  onEnd: (outcome: GameOutcome) => void;
}
