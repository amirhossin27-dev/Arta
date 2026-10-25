export type GameId =
  | 'uno'
  | 'romme'
  | 'ludo'
  | 'connect4'
  | 'tictactoe'
  | 'slf'
  | 'guesswho'
  | 'memory'
  | 'pong'
  | 'reaction'
  | 'snake'
  | 'breakout'
  | 'simon';

/** duo: zu zweit an einem Handy · cpu: gegen die KI 🤖 · online: jeder am eigenen Handy · solo: allein auf Highscore-Jagd */
export type GameMode = 'duo' | 'cpu' | 'online' | 'solo';

export type GameCategory = 'karten' | 'raten' | 'arcade';

export interface GameMeta {
  id: GameId;
  name: string;
  emoji: string;
  tagline: string;
  rules: string;
  modes: GameMode[];
  category: GameCategory;
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
    id: 'uno',
    name: 'Uno',
    emoji: '🃏',
    tagline: 'Farbe oder Zahl – und wer zuerst alle Karten los ist, gewinnt',
    rules:
      'Leg eine Karte, die in Farbe oder Zahl zur obersten passt. Kannst du nicht, ziehst du eine. Aussetzen und Richtungswechsel lassen den anderen aussetzen, +2 und +4 schicken Strafkarten rüber, mit Farbwahl-Karten bestimmst du die Farbe. Wer zuerst keine Karten mehr hat, gewinnt.',
    modes: ['duo', 'online', 'cpu'],
    category: 'karten',
    minutes: '5 Min',
    colors: ['#ff3b3b', '#ffb000'],
  },
  {
    id: 'romme',
    name: 'Rommé',
    emoji: '♠️',
    tagline: 'Sätze und Reihen sammeln – der Kartenklassiker',
    rules:
      'Zieh eine Karte vom Stapel oder von der Ablage. Leg Sätze (3–4 gleiche Werte in verschiedenen Farben) oder Reihen (mind. 3 aufeinanderfolgende Karten einer Farbe) aus und leg an alles auf dem Tisch an. Dein erstes Auslegen muss mindestens 40 Punkte bringen. Am Ende jedes Zugs wirfst du eine Karte ab. Wer zuerst alle Karten los ist, gewinnt. Joker ersetzen jede Karte.',
    modes: ['duo', 'online', 'cpu'],
    category: 'karten',
    minutes: '10 Min',
    colors: ['#1f7a4d', '#4cc38a'],
  },
  {
    id: 'ludo',
    name: 'Mensch ärgere dich nicht',
    emoji: '🎲',
    tagline: 'Würfeln, rauswerfen, ärgern – und trotzdem lieb haben',
    rules:
      'Mit einer 6 kommt eine Figur aufs Spielfeld, nach einer 6 würfelst du nochmal. Landest du auf einer gegnerischen Figur, fliegt sie raus. Wer zuerst alle vier Figuren im Ziel hat, gewinnt. Damit es schneller geht, steht zu Beginn schon eine Figur draußen.',
    modes: ['duo', 'online', 'cpu'],
    category: 'karten',
    minutes: '10 Min',
    colors: ['#e63946', '#f4c430'],
  },
  {
    id: 'connect4',
    name: 'Vier gewinnt',
    emoji: '🔴',
    tagline: 'Steine fallen lassen, Vierer bauen',
    rules: 'Tippt auf eine Spalte, um euren Stein fallen zu lassen. Vier in einer Reihe gewinnen – auch schräg!',
    modes: ['duo', 'online', 'cpu'],
    category: 'karten',
    minutes: '3 Min',
    colors: ['#ff5d5d', '#ffc23d'],
  },
  {
    id: 'tictactoe',
    name: 'Tic-Tac-Toe',
    emoji: '⭕',
    tagline: 'Drei in einer Reihe – der Klassiker für zwischendurch',
    rules: 'Abwechselnd setzt ihr euer Zeichen. Wer zuerst drei in einer Reihe hat – waagerecht, senkrecht oder diagonal – gewinnt.',
    modes: ['duo', 'online', 'cpu'],
    category: 'karten',
    minutes: '1 Min',
    colors: ['#ff4f81', '#ff9a6b'],
  },
  {
    id: 'slf',
    name: 'Stadt Land Fluss',
    emoji: '🌍',
    tagline: 'Ein Buchstabe, sechs Kategorien, tickende Uhr',
    rules:
      'Zu jedem Buchstaben findet ihr eine Stadt, ein Land, einen Fluss, ein Tier, einen Namen und einen Beruf. Wer fertig ist, ruft „Stopp!“ – dann bleiben dem anderen noch 10 Sekunden. Allein-Treffer geben 20, verschiedene Antworten 10 und gleiche 5 Punkte. Drei Buchstaben, wer mehr Punkte hat, gewinnt.',
    modes: ['duo', 'online', 'cpu'],
    category: 'raten',
    minutes: '6 Min',
    colors: ['#2a9d8f', '#8ecae6'],
  },
  {
    id: 'guesswho',
    name: 'Wer ist wer?',
    emoji: '🕵️',
    tagline: 'Wer ist die geheime Person deines Schatzes?',
    rules:
      'Jeder bekommt eine geheime Person. Abwechselnd stellt ihr Ja-/Nein-Fragen („Trägt sie eine Brille?“) – alle Gesichter, die nicht passen, klappen automatisch um. Glaubst du es zu wissen, tippe auf „Raten“. Aber Vorsicht: Wer falsch rät, verliert.',
    modes: ['duo', 'online', 'cpu'],
    category: 'raten',
    minutes: '4 Min',
    colors: ['#6a4cff', '#c77dff'],
  },
  {
    id: 'memory',
    name: 'Pärchen-Memory',
    emoji: '💞',
    tagline: 'Findet die Pärchen – so wie ihr zwei',
    rules: 'Deckt immer zwei Karten auf. Passen sie zusammen, dürft ihr sie behalten und gleich nochmal. Wer am Ende mehr Pärchen hat, gewinnt.',
    modes: ['duo', 'online', 'cpu', 'solo'],
    category: 'raten',
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
    category: 'arcade',
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
    category: 'arcade',
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
    category: 'arcade',
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
    category: 'arcade',
    minutes: '3 Min',
    colors: ['#7c5cff', '#ff5dc8'],
    scoreLabel: 'Punkte',
  },
  {
    id: 'simon',
    name: 'Herz-Simon',
    emoji: '🎵',
    tagline: 'Merk dir die Melodie der Herzen',
    rules: 'Die Herzen spielen dir eine Melodie vor – tippe sie in der gleichen Reihenfolge nach. Jede Runde kommt eins dazu.',
    modes: ['solo'],
    category: 'arcade',
    minutes: '2 Min',
    colors: ['#1fa971', '#4fc3f7'],
    scoreLabel: 'Runden',
  },
];

export const GAME_BY_ID = Object.fromEntries(GAMES.map((g) => [g.id, g])) as Record<GameId, GameMeta>;

export const MODE_LABEL: Record<GameMode, string> = {
  duo: '👫 Ein Handy',
  cpu: '🤖 Gegen KI',
  online: '🌐 Online',
  solo: '🙋 Allein',
};

export const CATEGORY_INFO: Record<GameCategory, { emoji: string; title: string; text: string }> = {
  karten: { emoji: '🎲', title: 'Karten & Brett', text: 'Die Klassiker vom Spieleabend – online, an einem Handy oder gegen die KI' },
  raten: { emoji: '🧠', title: 'Rätseln & Raten', text: 'Wer weiß mehr, wer merkt sich mehr?' },
  arcade: { emoji: '🕹️', title: 'Arcade', text: 'Schnelle Retro-Runden – gegenüber am Handy oder allein auf Rekordjagd' },
};
