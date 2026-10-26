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

/** Aussehen im Anime-Stil: Körperbau, Frisur, Gesicht und Kleidung */
export interface FighterLook {
  /** Kräftig mit breiten Schultern oder schlank und drahtig */
  build: 'broad' | 'slim';
  skin: string;
  hair: string;
  /** Wilde Stachelfrisur oder hoher Pferdeschwanz mit Pony */
  hairStyle: 'spiky' | 'ponytail';
  eyes: string;
  /** Gesicht in Ruhe: breites Grinsen mit Zähnen oder ein Schmunzeln */
  smile: 'grin' | 'smirk';
  /** Oberteil: offene Weste (Brust frei) oder kurzes Top (Bauch frei) */
  top: string;
  topStyle: 'vest' | 'crop';
  /** Kanten, Säume, Schnalle */
  trim: string;
  pants: string;
  /** Weite Hose mit Wickeln am Knöchel oder enge Hose mit hohen Stiefeln */
  pantsStyle: 'wide' | 'tight';
  /** Schärpe bzw. Gürtel */
  belt: string;
  /** Bandagen bzw. Handschuhe */
  gloves: string;
  hands: 'wrap' | 'glove';
  shoes: string;
  /** Stirnband mit flatternden Enden */
  band?: string;
  /** Halstuch mit flatternden Enden */
  scarf?: string;
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
      build: 'broad',
      skin: '#f0bd94',
      hair: '#1b1526',
      hairStyle: 'spiky',
      eyes: '#ff8a2a',
      smile: 'grin',
      top: '#d02d3a',
      topStyle: 'vest',
      trim: '#ffc53d',
      pants: '#2b3050',
      pantsStyle: 'wide',
      belt: '#f4ead8',
      gloves: '#f7f1e6',
      hands: 'wrap',
      shoes: '#1d1922',
      band: '#ff3346',
    },
    alt: { top: '#2d3346', trim: '#ff8f3d', pants: '#5a2230', band: '#ff8f3d', hair: '#ece6da', eyes: '#46c2ff', belt: '#26212e' },
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
      build: 'slim',
      skin: '#f6d0b0',
      hair: '#3d2257',
      hairStyle: 'ponytail',
      eyes: '#22c4ff',
      smile: 'smirk',
      top: '#1fb7e8',
      topStyle: 'crop',
      trim: '#eafcff',
      pants: '#1d2038',
      pantsStyle: 'tight',
      belt: '#ffe14a',
      gloves: '#f4f7ff',
      hands: 'glove',
      shoes: '#f4f7ff',
      scarf: '#ffe14a',
    },
    alt: { top: '#b04cff', trim: '#ffe7ff', hair: '#ffcf5a', belt: '#ff5fa2', pants: '#2a1838', scarf: '#ff5fa2', eyes: '#c77dff' },
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
