import { otherSide, type Side } from './logic';
import type { Rnd, TurnDef } from './turn';

export type HairColor = 'schwarz' | 'braun' | 'blond' | 'rot' | 'grau' | 'keine';
export type HairStyle = 'kurz' | 'lang' | 'locken' | 'dutt' | 'zopf' | 'glatze';

export interface FaceSpec {
  name: string;
  /** Hautton 0 (hell) bis 4 (dunkel) */
  skin: number;
  hair: HairColor;
  style: HairStyle;
  glasses: boolean;
  hat: boolean;
  beard: 'keiner' | 'vollbart' | 'schnurrbart';
  earrings: boolean;
  freckles: boolean;
  /** Lacht mit Zähnen */
  smile: boolean;
  eyes: 'braun' | 'blau' | 'gruen';
  /** Farbe des Oberteils – nur Optik */
  shirt: string;
}

const F = (
  name: string,
  skin: number,
  hair: HairColor,
  style: HairStyle,
  glasses: 0 | 1,
  hat: 0 | 1,
  beard: FaceSpec['beard'],
  earrings: 0 | 1,
  freckles: 0 | 1,
  smile: 0 | 1,
  eyes: FaceSpec['eyes'],
  shirt: string,
): FaceSpec => ({ name, skin, hair, style, glasses: !!glasses, hat: !!hat, beard, earrings: !!earrings, freckles: !!freckles, smile: !!smile, eyes, shirt });

export const FACES: FaceSpec[] = [
  F('Anna', 1, 'blond', 'lang', 0, 0, 'keiner', 1, 1, 1, 'blau', '#ff6b9d'),
  F('Ben', 2, 'braun', 'kurz', 1, 0, 'vollbart', 0, 0, 0, 'braun', '#4f7dff'),
  F('Clara', 0, 'rot', 'locken', 0, 0, 'keiner', 1, 1, 1, 'gruen', '#2fbf71'),
  F('David', 3, 'schwarz', 'kurz', 0, 1, 'keiner', 0, 0, 1, 'braun', '#ff9f1c'),
  F('Emma', 2, 'braun', 'zopf', 1, 0, 'keiner', 0, 0, 1, 'gruen', '#9b5de5'),
  F('Felix', 1, 'blond', 'kurz', 0, 0, 'schnurrbart', 0, 1, 0, 'blau', '#00bbf9'),
  F('Greta', 0, 'grau', 'dutt', 1, 0, 'keiner', 1, 0, 0, 'blau', '#f15bb5'),
  F('Hannes', 2, 'keine', 'glatze', 0, 0, 'vollbart', 0, 0, 1, 'braun', '#3a86ff'),
  F('Ida', 4, 'schwarz', 'locken', 0, 0, 'keiner', 1, 0, 1, 'braun', '#ffbe0b'),
  F('Jonas', 1, 'rot', 'kurz', 1, 0, 'keiner', 0, 1, 1, 'gruen', '#06d6a0'),
  F('Karla', 3, 'braun', 'lang', 0, 1, 'keiner', 0, 0, 0, 'braun', '#ef476f'),
  F('Leo', 4, 'schwarz', 'locken', 0, 0, 'vollbart', 0, 0, 0, 'braun', '#118ab2'),
  F('Mia', 1, 'blond', 'zopf', 0, 1, 'keiner', 1, 1, 1, 'blau', '#ff8fab'),
  F('Nico', 0, 'braun', 'kurz', 0, 0, 'keiner', 1, 0, 1, 'blau', '#8338ec'),
  F('Olga', 1, 'grau', 'kurz', 1, 0, 'keiner', 0, 0, 1, 'gruen', '#fb5607'),
  F('Paul', 0, 'grau', 'kurz', 0, 1, 'schnurrbart', 0, 0, 0, 'blau', '#2ec4b6'),
  F('Rosa', 3, 'rot', 'lang', 0, 0, 'keiner', 1, 0, 0, 'gruen', '#e63946'),
  F('Samir', 3, 'schwarz', 'kurz', 1, 0, 'vollbart', 0, 0, 1, 'braun', '#457b9d'),
  F('Tina', 2, 'blond', 'kurz', 0, 0, 'keiner', 0, 1, 0, 'braun', '#f72585'),
  F('Udo', 1, 'keine', 'glatze', 1, 0, 'schnurrbart', 0, 0, 1, 'blau', '#4cc9f0'),
  F('Vera', 4, 'braun', 'dutt', 0, 0, 'keiner', 1, 0, 1, 'braun', '#7209b7'),
  F('Willi', 2, 'rot', 'locken', 0, 1, 'vollbart', 0, 1, 1, 'blau', '#f4a261'),
  F('Yara', 3, 'schwarz', 'lang', 1, 0, 'keiner', 1, 0, 1, 'braun', '#2a9d8f'),
  F('Zoe', 0, 'braun', 'locken', 0, 0, 'keiner', 0, 1, 0, 'blau', '#ffafcc'),
];

export interface Question {
  id: string;
  short: string;
  emoji: string;
  text: string;
  test: (f: FaceSpec) => boolean;
}

export const QUESTIONS: Question[] = [
  { id: 'brille', short: 'Brille?', emoji: '👓', text: 'Trägt deine Person eine Brille?', test: (f) => f.glasses },
  { id: 'hut', short: 'Hut?', emoji: '🎩', text: 'Trägt deine Person einen Hut?', test: (f) => f.hat },
  { id: 'bart', short: 'Bart?', emoji: '🧔', text: 'Hat deine Person einen Bart?', test: (f) => f.beard !== 'keiner' },
  { id: 'schnurrbart', short: 'Schnurrbart?', emoji: '👨', text: 'Hat deine Person einen Schnurrbart?', test: (f) => f.beard === 'schnurrbart' },
  { id: 'lang', short: 'Lange Haare?', emoji: '💁', text: 'Hat deine Person lange Haare?', test: (f) => f.style === 'lang' || f.style === 'zopf' },
  { id: 'locken', short: 'Locken?', emoji: '🌀', text: 'Hat deine Person Locken?', test: (f) => f.style === 'locken' },
  { id: 'glatze', short: 'Glatze?', emoji: '🥚', text: 'Hat deine Person eine Glatze?', test: (f) => f.style === 'glatze' },
  { id: 'dutt', short: 'Dutt oder Zopf?', emoji: '🍩', text: 'Trägt deine Person einen Dutt oder Zopf?', test: (f) => f.style === 'dutt' || f.style === 'zopf' },
  { id: 'blond', short: 'Blond?', emoji: '👱', text: 'Hat deine Person blonde Haare?', test: (f) => f.hair === 'blond' },
  { id: 'braun', short: 'Braune Haare?', emoji: '🟫', text: 'Hat deine Person braune Haare?', test: (f) => f.hair === 'braun' },
  { id: 'schwarz', short: 'Schwarze Haare?', emoji: '⬛', text: 'Hat deine Person schwarze Haare?', test: (f) => f.hair === 'schwarz' },
  { id: 'rot', short: 'Rote Haare?', emoji: '🦊', text: 'Hat deine Person rote Haare?', test: (f) => f.hair === 'rot' },
  { id: 'grau', short: 'Graue Haare?', emoji: '🧓', text: 'Hat deine Person graue Haare?', test: (f) => f.hair === 'grau' },
  { id: 'ohrringe', short: 'Ohrringe?', emoji: '💎', text: 'Trägt deine Person Ohrringe?', test: (f) => f.earrings },
  { id: 'sommersprossen', short: 'Sommersprossen?', emoji: '✨', text: 'Hat deine Person Sommersprossen?', test: (f) => f.freckles },
  { id: 'zaehne', short: 'Zeigt Zähne?', emoji: '😁', text: 'Lacht deine Person mit Zähnen?', test: (f) => f.smile },
  { id: 'blau', short: 'Blaue Augen?', emoji: '🔵', text: 'Hat deine Person blaue Augen?', test: (f) => f.eyes === 'blau' },
  { id: 'gruen', short: 'Grüne Augen?', emoji: '🟢', text: 'Hat deine Person grüne Augen?', test: (f) => f.eyes === 'gruen' },
];

export const QUESTION_BY_ID = Object.fromEntries(QUESTIONS.map((q) => [q.id, q])) as Record<string, Question>;

export interface GuessWhoState {
  secret: Record<Side, number>;
  /** Umgeklappte Gesichter auf dem Brett jeder Seite */
  down: Record<Side, number[]>;
  turn: Side;
  asked: { by: Side; q: string; yes: boolean }[];
  guess?: { by: Side; face: number; right: boolean };
  winner?: Side;
}

export type GuessWhoAction = { t: 'ask'; q: string } | { t: 'guess'; face: number };

/** Gesichter, die auf dem Brett dieser Seite noch stehen */
export const candidates = (s: GuessWhoState, side: Side) => FACES.map((_, i) => i).filter((i) => !s.down[side].includes(i));

/** Wie viele noch stehende Gesichter würde die Frage mit „Ja“ treffen? */
export function split(s: GuessWhoState, side: Side, q: Question): { yes: number; no: number } {
  const c = candidates(s, side);
  const yes = c.filter((i) => q.test(FACES[i])).length;
  return { yes, no: c.length - yes };
}

export const guessWhoDef: TurnDef<GuessWhoState, GuessWhoAction> = {
  init({ starter, rnd }) {
    const a = Math.floor(rnd() * FACES.length);
    let b = Math.floor(rnd() * (FACES.length - 1));
    if (b >= a) b++;
    return { secret: { p1: a, p2: b }, down: { p1: [], p2: [] }, turn: starter, asked: [] };
  },
  turn: (s) => (s.winner ? null : s.turn),
  apply(s, a, by) {
    if (s.winner || by !== s.turn) return null;
    const opp = otherSide(by);
    if (a.t === 'ask') {
      const q = QUESTION_BY_ID[a.q];
      if (!q || s.asked.some((x) => x.by === by && x.q === a.q)) return null;
      const yes = q.test(FACES[s.secret[opp]]);
      const down = [...new Set([...s.down[by], ...FACES.map((_, i) => i).filter((i) => q.test(FACES[i]) !== yes)])];
      return { ...s, down: { ...s.down, [by]: down }, asked: [...s.asked, { by, q: a.q, yes }], turn: opp };
    }
    if (a.face < 0 || a.face >= FACES.length) return null;
    const right = a.face === s.secret[opp];
    return { ...s, guess: { by, face: a.face, right }, winner: right ? by : opp };
  },
  outcome: (s) => s.winner ?? null,
  cpu(s, side, rnd: Rnd) {
    if (s.turn !== side || s.winner) return null;
    const mine = candidates(s, side);
    const theirs = candidates(s, otherSide(side));
    if (mine.length === 1) return { t: 'guess', face: mine[0] };
    // Der Mensch ist kurz vorm Ziel → lieber raten als verlieren
    if (theirs.length === 1 && mine.length <= 4) return { t: 'guess', face: mine[Math.floor(rnd() * mine.length)] };
    const options = QUESTIONS.filter((q) => !s.asked.some((x) => x.by === side && x.q === q.id))
      .map((q) => ({ q, v: Math.min(split(s, side, q).yes, split(s, side, q).no) }))
      .filter((o) => o.v > 0)
      .sort((x, y) => y.v - x.v);
    if (!options.length) return { t: 'guess', face: mine[Math.floor(rnd() * mine.length)] };
    // Nicht immer die perfekte Frage – sonst gewinnt die KI zu oft
    const top = options.slice(0, Math.min(3, options.length));
    return { t: 'ask', q: top[Math.floor(rnd() * top.length)].q.id };
  },
  cpuDelay: () => 1300,
  viewer: (s) => (s.winner ? null : s.turn),
  endDelay: 2200,
};
