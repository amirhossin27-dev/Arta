/**
 * Herz-Mampfer: Labyrinth-Logik (eigenes Labyrinth, eigene Figuren).
 * Koordinaten in Feldern; die Mitte eines Feldes liegt bei ganzen Zahlen.
 */

export const MAZE = [
  '###################',
  '#o..#.........#..o#',
  '#.#.#.#######.#.#.#',
  '#.#.............#.#',
  '#.#.##.##.##.##.#.#',
  '#......#...#......#',
  '###.##.#.#.#.##.###',
  '###.#.........#.###',
  '###.#.###-###.#.###',
  'T  ...#GGGGG#...  T',
  '###.#.#######.#.###',
  '###.#....P....#.###',
  '###.#.#######.#.###',
  '#........#........#',
  '#.##.###.#.###.##.#',
  '#o.#...........#.o#',
  '##.#.#.#####.#.#.##',
  '#....#...#...#....#',
  '#.######.#.######.#',
  '#.................#',
  '###################',
];

export const MW = MAZE[0].length;
export const MH = MAZE.length;

export type Dir = 0 | 1 | 2 | 3;
/** rechts, unten, links, oben */
export const DX = [1, 0, -1, 0];
export const DY = [0, 1, 0, -1];
export const opposite = (d: Dir) => ((d + 2) % 4) as Dir;

const find = (ch: string) => {
  for (let y = 0; y < MH; y++) {
    const x = MAZE[y].indexOf(ch);
    if (x >= 0) return { x, y };
  }
  throw new Error(ch);
};

export const START = find('P');
export const DOOR = find('-');
/** Feld direkt über der Tür – hier betreten und verlassen die Geister das Haus */
export const EXIT = { x: DOOR.x, y: DOOR.y - 1 };
export const HOUSE = { x: DOOR.x, y: DOOR.y + 1 };
export const TUNNEL_ROW = MAZE.findIndex((r) => r.includes('T'));

export const isWall = (x: number, y: number) => {
  if (y < 0 || y >= MH) return true;
  const c = MAZE[y][((x % MW) + MW) % MW];
  return c === '#';
};

/** Kann man von Feld (x,y) in Richtung d gehen? Die Tür ist nur für Geister auf dem Weg ins/aus dem Haus. */
export function canGo(x: number, y: number, d: Dir, door = false): boolean {
  const nx = x + DX[d];
  const ny = y + DY[d];
  if (ny < 0 || ny >= MH) return false;
  const c = MAZE[ny][((nx % MW) + MW) % MW];
  if (c === '#') return false;
  if (c === '-' || c === 'G') return door;
  return true;
}

export function dotGrid(): number[][] {
  // 0 = nichts, 1 = Herzchen, 2 = großes Herz (Liebestrank)
  return MAZE.map((r) => [...r].map((c) => (c === '.' ? 1 : c === 'o' ? 2 : 0)));
}

export const countDots = (g: number[][]) => g.reduce((s, r) => s + r.filter((v) => v > 0).length, 0);

export type GhostId = 0 | 1 | 2 | 3;
export const GHOSTS = [
  { name: 'Grummel', color: '#ff4d6d', corner: { x: MW - 2, y: -2 } },
  { name: 'Zicke', color: '#ff8fd8', corner: { x: 1, y: -2 } },
  { name: 'Schmolli', color: '#5ee7ff', corner: { x: MW - 1, y: MH } },
  { name: 'Brummi', color: '#ffb347', corner: { x: 0, y: MH } },
] as const;

export interface Pos {
  x: number;
  y: number;
}

/**
 * Wohin will der Geist? Rot jagt dich direkt, Rosa schneidet dir den Weg ab (4 Felder vor dir),
 * Türkis kommt über Eck (vom roten Geist aus gespiegelt), Orange jagt nur von Weitem.
 */
export function ghostTarget(id: GhostId, scatter: boolean, me: Pos, meDir: Dir, red: Pos, self: Pos): Pos {
  if (scatter) return GHOSTS[id].corner;
  if (id === 0) return me;
  if (id === 1) return { x: me.x + DX[meDir] * 4, y: me.y + DY[meDir] * 4 };
  if (id === 2) {
    const ax = me.x + DX[meDir] * 2;
    const ay = me.y + DY[meDir] * 2;
    return { x: ax * 2 - red.x, y: ay * 2 - red.y };
  }
  const d2 = (self.x - me.x) ** 2 + (self.y - me.y) ** 2;
  return d2 > 64 ? me : GHOSTS[3].corner;
}

/** An einer Kreuzung: die Richtung, die dem Ziel am nächsten kommt – Umkehren ist nicht erlaubt. */
export function chooseDir(x: number, y: number, cur: Dir, target: Pos, door = false, rnd?: () => number): Dir {
  const opts: Dir[] = [];
  for (const d of [3, 2, 1, 0] as Dir[]) {
    if (d === opposite(cur)) continue;
    if (canGo(x, y, d, door)) opts.push(d);
  }
  if (!opts.length) return opposite(cur);
  if (rnd) return opts[Math.floor(rnd() * opts.length)];
  let best = opts[0];
  let bestD = Infinity;
  for (const d of opts) {
    const nx = x + DX[d];
    const ny = y + DY[d];
    const dd = (nx - target.x) ** 2 + (ny - target.y) ** 2;
    if (dd < bestD) {
      bestD = dd;
      best = d;
    }
  }
  return best;
}

/** Abwechselnd Ausschwärmen und Jagen (Sekunden) – danach wird nur noch gejagt. */
export const MODE_TIMES = [7, 20, 7, 20, 5, 20, 5];

export function modeAt(t: number): 'scatter' | 'chase' {
  let acc = 0;
  for (let i = 0; i < MODE_TIMES.length; i++) {
    acc += MODE_TIMES[i];
    if (t < acc) return i % 2 === 0 ? 'scatter' : 'chase';
  }
  return 'chase';
}

/** Bonusfrüchte nach Level */
export const FRUITS = [
  { emoji: '🍓', pts: 100 },
  { emoji: '🍒', pts: 300 },
  { emoji: '🍫', pts: 500 },
  { emoji: '🧁', pts: 700 },
  { emoji: '🍰', pts: 1000 },
  { emoji: '💍', pts: 2000 },
];

export const frightTime = (level: number) => Math.max(2, 7.5 - level * 0.9);
export const speeds = (level: number) => {
  const k = Math.min(level - 1, 5) / 5;
  return { me: 7.4 + k * 1.6, ghost: 6.8 + k * 2.0, fright: 4.2, tunnel: 3.6, eyes: 15 };
};
