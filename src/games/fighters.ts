import type { Pose, PoseKey } from './fightGfx';

/**
 * Die Kämpfer von Herz-Fighter. Ein neuer Kämpfer ist ein neuer Eintrag in FIGHTERS:
 * Werte, Aussehen und eine Spezialattacke. Die Spezialattacke nutzt eine der Arten aus
 * fight.ts (Geschoss oder Ansturm) – wer eine ganz neue Art will, ergänzt sie dort in `stepSpecial`.
 * Eigene Bewegungen gehen über `poses`: Die überschreiben einzelne Gelenkwinkel der Grundposen.
 */

export type SpecialKind = 'projectile' | 'rush';

export interface SpecialDef {
  kind: SpecialKind;
  name: string;
  /** Kurzbeschreibung für die Kämpferwahl */
  text: string;
  /** Treffer insgesamt; jeder bis auf den letzten macht `dmg`, der letzte `last` und wirft um. */
  hits: number;
  dmg: number;
  last: number;
  /** Schaden pro Treffer, wenn geblockt wird */
  chip: number;
  /** Geschoss: Fluggeschwindigkeit · Ansturm: Sprinttempo */
  speed: number;
  /** Kern- und Außenfarbe der Effekte */
  color: string;
  color2: string;
}

export interface FighterLook {
  skin: string;
  hair: string;
  hairStyle: 'spiky' | 'ponytail';
  /** Oberteil: Kampfanzug-Weste oder kurze Sportjacke */
  top: string;
  topStyle: 'gi' | 'crop';
  /** Kragen, Säume, Streifen */
  trim: string;
  pants: string;
  /** Weite Kampfanzug-Hose oder enge Leggings */
  pantsStyle: 'wide' | 'tight';
  belt: string;
  gloves: string;
  shoes: string;
  /** Stirnband mit flatternden Enden */
  band?: string;
}

export interface FighterDef {
  id: string;
  name: string;
  /** Beiname, z. B. „Die Flammenfaust“ */
  title: string;
  emoji: string;
  bio: string;
  hp: number;
  /** Lauftempo (1 = normal) */
  speed: number;
  /** Schaden der normalen Angriffe (1 = normal) */
  power: number;
  /** Sprungkraft nach oben */
  jump: number;
  /** Anlauf und Erholung der normalen Angriffe (kleiner = schneller) */
  quick: number;
  /** Reichweite der normalen Angriffe (1 = normal) */
  reach: number;
  /** Für die Kämpferwahl, je 1–5 */
  stats: { kraft: number; tempo: number; ausdauer: number };
  look: FighterLook;
  /** Andere Farben, wenn beide denselben Kämpfer nehmen */
  alt: Partial<FighterLook>;
  /** Farbe der Aura, wenn der Powerbalken voll ist */
  aura: string;
  poses?: Partial<Record<PoseKey, Partial<Pose>>>;
  special: SpecialDef;
}

export const FIGHTERS: FighterDef[] = [
  {
    id: 'kai',
    name: 'Kai',
    title: 'Die Flammenfaust',
    emoji: '🔥',
    bio: 'Karate-Meister mit Herz aus Feuer. Schlägt hart, steht sicher – und wenn der Balken voll ist, fliegt der Phönix.',
    hp: 1000,
    speed: 1,
    power: 1.06,
    jump: 940,
    quick: 1,
    reach: 1,
    stats: { kraft: 5, tempo: 3, ausdauer: 4 },
    look: {
      skin: '#e7b48f',
      hair: '#1c1420',
      hairStyle: 'spiky',
      top: '#e2343f',
      topStyle: 'gi',
      trim: '#ffd6a0',
      pants: '#f3ece4',
      pantsStyle: 'wide',
      belt: '#151018',
      gloves: '#c81f2c',
      shoes: '#3a2a2a',
      band: '#ff3346',
    },
    alt: { top: '#2f3542', trim: '#ff8f3d', pants: '#363b48', gloves: '#ff8f3d', band: '#ff8f3d', hair: '#e8e2d6' },
    aura: '#ff7a2e',
    special: {
      kind: 'projectile',
      name: 'Phönix-Flamme',
      text: 'Ein Feuervogel fegt über die Arena – fünf Treffer, der letzte wirft um.',
      hits: 5,
      dmg: 42,
      last: 74,
      chip: 9,
      speed: 560,
      color: '#fff1a8',
      color2: '#ff5a1f',
    },
  },
  {
    id: 'mila',
    name: 'Mila',
    title: 'Der Blitz',
    emoji: '⚡',
    bio: 'Kickboxerin, schneller als ihr Schatten. Weniger Kraft, dafür lange Beine – und ein Ansturm wie ein Gewitter.',
    hp: 930,
    speed: 1.2,
    power: 0.94,
    jump: 990,
    quick: 0.86,
    reach: 1.08,
    stats: { kraft: 3, tempo: 5, ausdauer: 3 },
    look: {
      skin: '#f2c9a8',
      hair: '#3a1e46',
      hairStyle: 'ponytail',
      top: '#1fb7e8',
      topStyle: 'crop',
      trim: '#e9fbff',
      pants: '#1b1d33',
      pantsStyle: 'tight',
      belt: '#ffe14a',
      gloves: '#f4f7ff',
      shoes: '#f4f7ff',
    },
    alt: { top: '#b04cff', trim: '#ffe7ff', hair: '#ffcf5a', belt: '#ff5fa2', pants: '#2a1838' },
    aura: '#54e1ff',
    poses: {
      guard: { tor: 4, hd: -2, fs: 26, fe: 116, bs: 6, be: 126, fh: 28, fk: -30, bh: -22, bk: -6 },
      win: { tor: 2, hd: 8, fs: 150, fe: 52, bs: -24, be: 104, fh: 10, fk: -4, bh: -20, bk: 0 },
      kick: { tor: -30, fh: 108, fk: -2 },
    },
    special: {
      kind: 'rush',
      name: 'Donnersturm',
      text: 'Als Blitz quer durch die Arena – wer getroffen wird, steckt sechs Schläge ein.',
      hits: 6,
      dmg: 30,
      last: 96,
      chip: 36,
      speed: 1450,
      color: '#f2fdff',
      color2: '#38c8ff',
    },
  },
];

export const FIGHTER_BY_ID: Record<string, FighterDef> = Object.fromEntries(FIGHTERS.map((f) => [f.id, f]));

export const fighterById = (id: string | undefined): FighterDef => (id && FIGHTER_BY_ID[id]) || FIGHTERS[0];

/** Farben eines Kämpfers – bei gleicher Wahl bekommt die zweite Seite die Zweitfarben. */
export const lookOf = (def: FighterDef, alt: boolean): FighterLook => (alt ? { ...def.look, ...def.alt } : def.look);
