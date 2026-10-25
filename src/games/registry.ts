export type GameId = 'tictactoe' | 'connect4' | 'memory' | 'pong' | 'reaction' | 'snake' | 'breakout' | 'simon';

/** duo: zwei Menschen an einem Handy · cpu: gegen Arta 🤖 · solo: allein auf Highscore-Jagd */
export type GameMode = 'duo' | 'cpu' | 'solo';

export interface GameMeta {
  id: GameId;
  name: string;
  emoji: string;
  tagline: string;
  rules: string;
  modes: GameMode[];
  minutes: string;
  /** Farbverlauf der Spielkachel */
  colors: [string, string];
  /** Einheit der Punktzahl im Solo-Modus, z. B. „Herzen“ */
  scoreLabel?: string;
  /** Beim Memory zählen möglichst wenige Züge. */
  lowerIsBetter?: boolean;
}

export const GAMES: GameMeta[] = [
  {
    id: 'tictactoe',
    name: 'Tic-Tac-Toe',
    emoji: '⭕',
    tagline: 'Drei in einer Reihe – der Klassiker für zwischendurch',
    rules: 'Abwechselnd setzt ihr euer Zeichen. Wer zuerst drei in einer Reihe hat – waagerecht, senkrecht oder diagonal – gewinnt.',
    modes: ['duo', 'cpu'],
    minutes: '1 Min',
    colors: ['#ff4f81', '#ff9a6b'],
  },
  {
    id: 'connect4',
    name: 'Vier gewinnt',
    emoji: '🔴',
    tagline: 'Steine fallen lassen, Vierer bauen',
    rules: 'Tippt auf eine Spalte, um euren Stein fallen zu lassen. Vier in einer Reihe gewinnen – auch schräg!',
    modes: ['duo', 'cpu'],
    minutes: '3 Min',
    colors: ['#ff5d5d', '#ffc23d'],
  },
  {
    id: 'memory',
    name: 'Pärchen-Memory',
    emoji: '🃏',
    tagline: 'Findet die Pärchen – so wie ihr zwei',
    rules: 'Deckt immer zwei Karten auf. Passen sie zusammen, dürft ihr sie behalten und gleich nochmal. Wer am Ende mehr Pärchen hat, gewinnt.',
    modes: ['duo', 'solo'],
    minutes: '2 Min',
    colors: ['#b86bff', '#ff6bcb'],
    scoreLabel: 'Züge',
    lowerIsBetter: true,
  },
  {
    id: 'pong',
    name: 'Pong-Duell',
    emoji: '🏓',
    tagline: 'Der Arcade-Urahn von 1972 – setzt euch gegenüber!',
    rules: 'Legt das Handy flach zwischen euch. Jeder steuert mit dem Finger den Schläger auf seiner Seite. Wer zuerst 5 Punkte hat, gewinnt.',
    modes: ['duo', 'cpu'],
    minutes: '2 Min',
    colors: ['#4f7dff', '#7fe0ff'],
  },
  {
    id: 'reaction',
    name: 'Blitz-Duell',
    emoji: '⚡',
    tagline: 'Wer tippt zuerst, wenn das Herz erscheint?',
    rules: 'Jeder legt einen Finger auf seine Hälfte. Sobald das 💗 erscheint: tippen! Wer zu früh tippt, schenkt den Punkt her. Wer zuerst 3 Punkte hat, gewinnt.',
    modes: ['duo', 'cpu'],
    minutes: '1 Min',
    colors: ['#ffb347', '#ff5d8f'],
  },
  {
    id: 'snake',
    name: 'Herz-Schlange',
    emoji: '🐍',
    tagline: 'Snake wie früher auf dem Tasten-Handy',
    rules: 'Wische über das Spielfeld oder nutze die Pfeile. Sammle Herzen, damit die Schlange wächst – aber fahr nicht gegen die Wand und beiß dich nicht selbst.',
    modes: ['solo'],
    minutes: '2 Min',
    colors: ['#5f8f1f', '#a7c957'],
    scoreLabel: 'Herzen',
  },
  {
    id: 'breakout',
    name: 'Herz-Breakout',
    emoji: '🧱',
    tagline: 'Mauer abräumen, Ball nicht fallen lassen',
    rules: 'Zieh den Finger über das Feld, um den Schläger zu bewegen, und tippe für den Abschlag. Räum alle Steine ab – du hast 3 Leben.',
    modes: ['solo'],
    minutes: '3 Min',
    colors: ['#7c5cff', '#ff5dc8'],
    scoreLabel: 'Punkte',
  },
  {
    id: 'simon',
    name: 'Herz-Simon',
    emoji: '🎵',
    tagline: 'Merk dir die Melodie der Herzen',
    rules: 'Arta spielt eine Folge von Herzen vor – tippe sie in der gleichen Reihenfolge nach. Jede Runde kommt eins dazu.',
    modes: ['solo'],
    minutes: '2 Min',
    colors: ['#1fa971', '#4fc3f7'],
    scoreLabel: 'Runden',
  },
];

export const GAME_BY_ID = Object.fromEntries(GAMES.map((g) => [g.id, g])) as Record<GameId, GameMeta>;

export const MODE_LABEL: Record<GameMode, string> = {
  duo: '👫 Zu zweit',
  cpu: '🤖 Gegen Arta',
  solo: '🙋 Allein',
};
