import { otherSide, type Side } from './logic';
import type { Rnd, TurnDef } from './turn';

/**
 * Schiffe versenken auf 10 × 10 Feldern. Flotte: 5, 4, 3, 3, 2 – Schiffe dürfen sich nicht
 * berühren (auch nicht über Eck). Wer trifft, darf nochmal schießen.
 */

export const SEA = 10;
export const FLEET = [5, 4, 3, 3, 2];
export const SHIP_NAME: Record<number, string> = { 5: 'Schlachtschiff', 4: 'Kreuzer', 3: 'Zerstörer', 2: 'U-Boot' };

export type Fleet = number[][];

export interface BattleState {
  phase: 'setup' | 'battle';
  fleets: Record<Side, Fleet | null>;
  /** Schüsse, die diese Seite abgegeben hat */
  shots: Record<Side, number[]>;
  turn: Side;
  /** An einem Handy stellt erst der eine, dann der andere seine Flotte auf. */
  sequential: boolean;
  last: { by: Side; at: number; hit: boolean; sunk?: number } | null;
  winner?: Side;
}

export type BattleAction = { t: 'ready'; fleet: Fleet } | { t: 'shoot'; at: number };

const row = (i: number) => Math.floor(i / SEA);
const col = (i: number) => i % SEA;

export function around(i: number): number[] {
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      const r = row(i) + dr;
      const c = col(i) + dc;
      if ((dr || dc) && r >= 0 && r < SEA && c >= 0 && c < SEA) out.push(r * SEA + c);
    }
  return out;
}

/** Zufällige gültige Aufstellung */
export function randomFleet(rnd: Rnd): Fleet {
  for (;;) {
    const blocked = new Set<number>();
    const fleet: Fleet = [];
    let ok = true;
    for (const len of FLEET) {
      let placed = false;
      for (let tries = 0; tries < 200 && !placed; tries++) {
        const horiz = rnd() < 0.5;
        const r = Math.floor(rnd() * (horiz ? SEA : SEA - len + 1));
        const c = Math.floor(rnd() * (horiz ? SEA - len + 1 : SEA));
        const cells = Array.from({ length: len }, (_, k) => (horiz ? r * SEA + c + k : (r + k) * SEA + c));
        if (cells.some((x) => blocked.has(x))) continue;
        for (const x of cells) {
          blocked.add(x);
          around(x).forEach((y) => blocked.add(y));
        }
        fleet.push(cells);
        placed = true;
      }
      if (!placed) {
        ok = false;
        break;
      }
    }
    if (ok) return fleet;
  }
}

export function validFleet(f: unknown): f is Fleet {
  if (!Array.isArray(f) || f.length !== FLEET.length) return false;
  const lens = f.map((s) => (Array.isArray(s) ? s.length : 0)).sort((a, b) => b - a);
  if (lens.join() !== FLEET.join()) return false;
  const all = new Set<number>();
  for (const ship of f as number[][]) {
    if (!ship.every((x) => Number.isInteger(x) && x >= 0 && x < SEA * SEA)) return false;
    const s = ship.slice().sort((a, b) => a - b);
    const horiz = s.every((x) => row(x) === row(s[0])) && s.every((x, k) => x === s[0] + k);
    const vert = s.every((x) => col(x) === col(s[0])) && s.every((x, k) => x === s[0] + k * SEA);
    if (!horiz && !vert) return false;
    for (const x of s) all.add(x);
  }
  if (all.size !== FLEET.reduce((a, b) => a + b, 0)) return false;
  // Nicht berühren: Nachbarn eines Schiffs gehören nie zu einem anderen
  return (f as number[][]).every((ship, k) => ship.every((x) => around(x).every((y) => ship.includes(y) || !(f as number[][]).some((o, j) => j !== k && o.includes(y)))));
}

export const isSunk = (ship: number[], shots: number[]) => ship.every((x) => shots.includes(x));

/** Felder, die nach einem versenkten Schiff garantiert Wasser sind */
export function knownWater(fleet: Fleet, shots: number[]): Set<number> {
  const out = new Set<number>();
  for (const ship of fleet) if (isSunk(ship, shots)) ship.forEach((x) => around(x).forEach((y) => !ship.includes(y) && out.add(y)));
  return out;
}

export const allSunk = (fleet: Fleet, shots: number[]) => fleet.every((s) => isSunk(s, shots));

// ───── KI: erst suchen (Schachbrettmuster mit Wahrscheinlichkeiten), dann versenken ─────

export function battleCpuShot(fleet: Fleet, shots: number[], rnd: Rnd): number {
  const shot = new Set(shots);
  const water = knownWater(fleet, shots);
  const open = (i: number) => !shot.has(i) && !water.has(i);
  const hits = shots.filter((x) => fleet.some((s) => s.includes(x) && !isSunk(s, shots)));
  if (hits.length) {
    // Liegen schon zwei Treffer in einer Reihe, geht es an den Enden weiter.
    const sorted = hits.slice().sort((a, b) => a - b);
    const sameRow = sorted.length > 1 && sorted.every((x) => row(x) === row(sorted[0]));
    const sameCol = sorted.length > 1 && sorted.every((x) => col(x) === col(sorted[0]));
    let cand: number[] = [];
    if (sameRow) cand = [sorted[0] - 1, sorted[sorted.length - 1] + 1].filter((x) => x >= 0 && row(x) === row(sorted[0]));
    else if (sameCol) cand = [sorted[0] - SEA, sorted[sorted.length - 1] + SEA];
    cand = cand.filter((x) => x >= 0 && x < SEA * SEA && open(x));
    if (!cand.length) {
      for (const h of hits)
        for (const [dr, dc] of [
          [0, 1],
          [0, -1],
          [1, 0],
          [-1, 0],
        ]) {
          const r = row(h) + dr;
          const c = col(h) + dc;
          if (r >= 0 && r < SEA && c >= 0 && c < SEA && open(r * SEA + c)) cand.push(r * SEA + c);
        }
    }
    if (cand.length) return cand[Math.floor(rnd() * cand.length)];
  }
  // Wo passen die übrigen Schiffe noch hin?
  const left = fleet.filter((s) => !isSunk(s, shots)).map((s) => s.length);
  const heat = Array(SEA * SEA).fill(0);
  for (const len of left)
    for (let r = 0; r < SEA; r++)
      for (let c = 0; c < SEA; c++)
        for (const horiz of [true, false]) {
          if ((horiz ? c + len : r + len) > SEA) continue;
          const cells = Array.from({ length: len }, (_, k) => (horiz ? r * SEA + c + k : (r + k) * SEA + c));
          if (cells.every(open)) cells.forEach((x) => heat[x]++);
        }
  const options = heat.map((h, i) => ({ i, h: h * (0.75 + rnd() * 0.5) })).filter((o) => open(o.i) && o.h > 0);
  if (!options.length) {
    const any = Array.from({ length: SEA * SEA }, (_, i) => i).filter(open);
    return any[Math.floor(rnd() * any.length)];
  }
  return options.reduce((a, b) => (b.h > a.h ? b : a)).i;
}

export const battleDef: TurnDef<BattleState, BattleAction> = {
  init: ({ mode, starter }) => ({ phase: 'setup', fleets: { p1: null, p2: null }, shots: { p1: [], p2: [] }, turn: starter, sequential: mode === 'duo', last: null }),
  turn(s) {
    if (s.winner) return null;
    if (s.phase === 'battle') return s.turn;
    if (s.sequential) return s.fleets.p1 ? 'p2' : 'p1';
    if (!s.fleets.p1 && !s.fleets.p2) return 'both';
    return s.fleets.p1 ? 'p2' : 'p1';
  },
  apply(s, a, by) {
    if (s.winner) return null;
    if (a.t === 'ready') {
      if (s.phase !== 'setup' || s.fleets[by] || !validFleet(a.fleet)) return null;
      const fleets = { ...s.fleets, [by]: a.fleet };
      return { ...s, fleets, phase: fleets.p1 && fleets.p2 ? 'battle' : 'setup' };
    }
    if (s.phase !== 'battle' || by !== s.turn) return null;
    if (!Number.isInteger(a.at) || a.at < 0 || a.at >= SEA * SEA || s.shots[by].includes(a.at)) return null;
    const opp = otherSide(by);
    const fleet = s.fleets[opp]!;
    const shots = { ...s.shots, [by]: [...s.shots[by], a.at] };
    const ship = fleet.find((x) => x.includes(a.at));
    const sunk = ship && isSunk(ship, shots[by]) ? ship.length : undefined;
    const next: BattleState = { ...s, shots, turn: ship ? by : opp, last: { by, at: a.at, hit: !!ship, sunk } };
    return allSunk(fleet, shots[by]) ? { ...next, winner: by } : next;
  },
  outcome: (s) => s.winner ?? null,
  cpu(s, side, rnd) {
    if (s.winner) return null;
    if (s.phase === 'setup') return s.fleets[side] ? null : { t: 'ready', fleet: randomFleet(rnd) };
    if (s.turn !== side) return null;
    return { t: 'shoot', at: battleCpuShot(s.fleets[otherSide(side)]!, s.shots[side], rnd) };
  },
  cpuDelay: (s) => (s.phase === 'setup' ? 400 : 900),
  viewer(s) {
    if (s.winner) return null;
    if (s.phase === 'battle') return s.turn;
    return s.fleets.p1 ? 'p2' : 'p1';
  },
  endDelay: 2200,
};
