import type { Side } from './logic';
import type { GameMode } from './registry';

export interface Player {
  name: string;
  emoji: string;
  color: string;
  cpu: boolean;
}

/** Solo: `failed` = Runde verloren (z. B. Mine erwischt) – dann zählt die Zeit nicht als Rekord. */
export type GameOutcome = { winner: Side | 'draw' } | { score: number; failed?: boolean };

/** Der gemeinsame Spielstand einer Online-Runde, wie er in der Datenbank liegt. */
export interface NetSnap {
  seq: number;
  st: unknown;
  /** Bis zu welcher Nummer der Gastgeber die Züge des Gasts schon übernommen hat. */
  ack: number;
}

/** Verbindung eines Spiels zur Online-Partie (siehe online.ts). */
export interface NetLink {
  /** Welche Seite dieses Handy spielt: Gastgeber = p1, Gast = p2. */
  me: Side;
  shared: NetSnap | null;
  /** Züge des Gasts in Phasen, in denen beide gleichzeitig spielen. */
  acts: { n: number; a: unknown }[];
  publish(snap: NetSnap): void;
  pushAct(a: unknown): void;
}

export interface GameProps {
  mode: GameMode;
  /** Unten sitzt du (im Solo-Modus: wer gerade spielt). Online ist p1 der Gastgeber. */
  p1: Player;
  /** Oben: dein Schatz oder die KI 🤖 */
  p2: Player;
  /** Wer die Runde beginnt – wechselt von Runde zu Runde. */
  starter: Side;
  /** Bisheriger Rekord (Solo) */
  best?: number;
  /** Nur online */
  net?: NetLink;
  onEnd: (outcome: GameOutcome) => void;
}
