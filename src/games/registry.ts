export type GameId =
  | 'uno'
  | 'maumau'
  | 'romme'
  | 'kniffel'
  | 'ludo'
  | 'solitaire'
  | 'fitdice'
  | 'chess'
  | 'checkers'
  | 'muehle'
  | 'battleship'
  | 'connect4'
  | 'tictactoe'
  | 'slf'
  | 'guesswho'
  | 'memory'
  | 'kart'
  | 'fight'
  | 'strike'
  | 'pong'
  | 'reaction'
  | 'tetris'
  | 'invaders'
  | 'flappy'
  | 'g2048'
  | 'minesweeper'
  | 'snake'
  | 'breakout'
  | 'ballz'
  | 'runner'
  | 'amor'
  | 'muncher'
  | 'hopper'
  | 'simon';

/** duo: zu zweit an einem Handy · cpu: gegen die KI 🤖 · online: jeder am eigenen Handy · solo: allein auf Highscore-Jagd */
export type GameMode = 'duo' | 'cpu' | 'online' | 'solo';

export type GameCategory = 'karten' | 'brett' | 'raten' | 'action' | 'arcade';

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
    id: 'maumau',
    name: 'Mau-Mau',
    emoji: '♣️',
    tagline: 'Der deutsche Kartenklassiker mit 32 Karten',
    rules:
      'Leg eine Karte gleicher Farbe oder gleichen Werts. Eine 7 heißt: der andere zieht 2 – außer er legt selbst eine 7, dann zieht der nächste 4. Eine 8 lässt den anderen aussetzen. Der Bube passt immer, und du wünschst dir eine Farbe. Wer nicht kann, zieht eine Karte. Wer zuerst alle Karten los ist, gewinnt: Mau-Mau!',
    modes: ['duo', 'online', 'cpu'],
    category: 'karten',
    minutes: '4 Min',
    colors: ['#2b59c3', '#5ec2ff'],
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
    id: 'kniffel',
    name: 'Kniffel',
    emoji: '🎲',
    tagline: 'Würfeln, halten, nochmal würfeln – volle Hütte!',
    rules:
      'Pro Zug darfst du bis zu dreimal würfeln. Tippe Würfel an, um sie zu halten. Danach trägst du das Ergebnis in ein freies Feld ein – oben zählen nur die passenden Augen (ab 63 gibt es 35 Bonus), unten Pasch, Full House, Straßen, Kniffel und Chance. Nach 13 Runden gewinnt, wer mehr Punkte hat. Allein jagst du deinen Rekord.',
    modes: ['duo', 'online', 'cpu', 'solo'],
    category: 'karten',
    minutes: '10 Min',
    colors: ['#c2185b', '#ff8a65'],
    scoreLabel: 'Punkte',
  },
  {
    id: 'ludo',
    name: 'Mensch ärgere dich nicht',
    emoji: '🏁',
    tagline: 'Würfeln, rauswerfen, ärgern – und trotzdem lieb haben',
    rules:
      'Mit einer 6 kommt eine Figur aufs Spielfeld, nach einer 6 würfelst du nochmal. Landest du auf einer gegnerischen Figur, fliegt sie raus. Wer zuerst alle vier Figuren im Ziel hat, gewinnt. Damit es schneller geht, steht zu Beginn schon eine Figur draußen.',
    modes: ['duo', 'online', 'cpu'],
    category: 'karten',
    minutes: '10 Min',
    colors: ['#e63946', '#f4c430'],
  },
  {
    id: 'solitaire',
    name: 'Solitär',
    emoji: '♦️',
    tagline: 'Die Patience zum Entspannen – alle Karten nach Farbe ablegen',
    rules:
      'Leg Karten absteigend und abwechselnd rot/schwarz aufeinander, auf freie Plätze dürfen nur Könige. Oben sammelst du jede Farbe vom Ass bis zum König. Tippe den Stapel an, um eine Karte zu ziehen. Eine Karte antippen legt sie automatisch an den besten Platz, du kannst sie aber auch ziehen. Liegt alles offen, legt „Automatisch fertig“ den Rest ab. Es zählt die Zeit – je schneller, desto besser.',
    modes: ['solo'],
    category: 'karten',
    minutes: '6 Min',
    colors: ['#16804a', '#e0245e'],
    scoreLabel: 'Sek.',
    lowerIsBetter: true,
  },
  {
    id: 'fitdice',
    name: 'Fitness-Würfel',
    emoji: '💪',
    tagline: 'Würfeln, schwitzen – wer zuerst schlappmacht, verliert',
    rules:
      'Ein Würfel bestimmt die Übung, der zweite die Menge. Abwechselnd würfelt ihr und macht die Übung – mit jeder Runde wird es ein Viertel mehr. Wer nicht mehr kann, tippt auf „Ich kann nicht mehr“ und hat verloren. Schafft ihr beide 8 Runden, ist es unentschieden. Allein zählt, wie viele Runden du durchhältst.',
    modes: ['duo', 'online', 'cpu', 'solo'],
    category: 'karten',
    minutes: '10 Min',
    colors: ['#ff6b35', '#ffd23f'],
    scoreLabel: 'Runden',
  },
  {
    id: 'chess',
    name: 'Schach',
    emoji: '♟️',
    tagline: 'Das königliche Spiel – mit allen Regeln',
    rules:
      'Tippe eine Figur an, die möglichen Felder leuchten auf. Mit Rochade, en passant und Umwandlung. Wer den König mattsetzt, gewinnt; Patt, dreifache Wiederholung und 50 Züge ohne Schlagen sind unentschieden. Wer in einer Runde anfängt, spielt Weiß.',
    modes: ['duo', 'online', 'cpu'],
    category: 'brett',
    minutes: '15 Min',
    colors: ['#5d4037', '#d7a86e'],
  },
  {
    id: 'checkers',
    name: 'Dame',
    emoji: '⚫',
    tagline: 'Schräg ziehen, überspringen, zur Dame werden',
    rules:
      'Steine ziehen schräg nach vorn. Geschlagen wird durch Überspringen – auch rückwärts – und Schlagen ist Pflicht, mehrere Sprünge hintereinander inklusive. Wer die letzte Reihe erreicht, wird zur Dame und darf beliebig weit ziehen. Wer keinen Stein mehr hat oder nicht mehr ziehen kann, verliert.',
    modes: ['duo', 'online', 'cpu'],
    category: 'brett',
    minutes: '8 Min',
    colors: ['#8d2b2b', '#e9b872'],
  },
  {
    id: 'muehle',
    name: 'Mühle',
    emoji: '⚪',
    tagline: 'Drei in einer Reihe – und schon ist ein Stein weg',
    rules:
      'Erst setzt jeder abwechselnd seine 9 Steine, dann wird entlang der Linien gezogen. Drei eigene Steine in einer Linie sind eine Mühle – dann nimmst du dem anderen einen Stein weg. Mit nur noch 3 Steinen darfst du springen. Wer 2 Steine hat oder nicht mehr ziehen kann, verliert.',
    modes: ['duo', 'online', 'cpu'],
    category: 'brett',
    minutes: '8 Min',
    colors: ['#6d4c2e', '#c8a165'],
  },
  {
    id: 'battleship',
    name: 'Schiffe versenken',
    emoji: '🚢',
    tagline: 'Treffer, versenkt! Wer findet zuerst die ganze Flotte?',
    rules:
      'Jeder stellt seine Flotte auf (5, 4, 3, 3 und 2 Felder, Schiffe berühren sich nicht). Dann schießt ihr abwechselnd aufs Meer des anderen – bei einem Treffer darfst du gleich nochmal. Wer zuerst alle Schiffe versenkt, gewinnt.',
    modes: ['duo', 'online', 'cpu'],
    category: 'brett',
    minutes: '8 Min',
    colors: ['#0b4f8a', '#4fc3f7'],
  },
  {
    id: 'connect4',
    name: 'Vier gewinnt',
    emoji: '🔴',
    tagline: 'Steine fallen lassen, Vierer bauen',
    rules: 'Tippt auf eine Spalte, um euren Stein fallen zu lassen. Vier in einer Reihe gewinnen – auch schräg!',
    modes: ['duo', 'online', 'cpu'],
    category: 'brett',
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
    category: 'brett',
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
    id: 'fight',
    name: 'Herz-Fighter',
    emoji: '🥊',
    tagline: 'Prügeln mit Liebe – Kampfspiel wie Street Fighter, mit Spezialattacken',
    rules:
      'Zwei Gewinnrunden, jede dauert 60 Sekunden. Mit dem Stick läufst du, nach oben gedrückt springst du. 👊 Schlag mehrmals tippen ergibt eine Kombo, 🦶 Tritt trifft weiter und härter. Wer vom Gegner weg hält, blockt. Treffer laden den Powerbalken – ist er voll, leuchtet ⚡ Spezial: Kai schickt die Phönix-Flamme, Mila stürmt als Donnersturm los. Wer zuerst K.O. geht oder nach Ablauf der Zeit weniger Energie hat, verliert die Runde.',
    modes: ['duo', 'online', 'cpu'],
    category: 'action',
    minutes: '3 Min',
    colors: ['#ff3d6e', '#7a3cff'],
  },
  {
    id: 'strike',
    name: 'Herz-Strike',
    emoji: '🎯',
    tagline: 'Paintball-Duell in 3D – wie Counter-Strike, nur mit Farbe statt Kugeln',
    rules:
      'Ein Duell in der Arta-Arena mit bunten Luftkissen als Deckung. Mit dem Stick läufst du, durch Wischen im Bild schaust du dich um. 💥 halten schießt Farbkugeln – ziehst du dabei den Finger, zielst du gleichzeitig. Nach 12 Schuss wird nachgeladen (🔄 geht auch früher). Drei Treffer, und man ist voller Farbe: Der andere bekommt einen Punkt, und es geht kurz darauf am Rand weiter. Wer zuerst 5 Punkte hat, gewinnt; nach 4 Minuten gewinnt, wer vorn liegt. Allein trainierst du beim Zielschießen: 60 Sekunden, jedes Pappherz zählt, goldene dreifach. Am Computer: Klick ins Bild, dann zielt die Maus und WASD läuft.',
    modes: ['online', 'cpu', 'solo'],
    category: 'action',
    minutes: '4 Min',
    colors: ['#ff3d8b', '#14b8d4'],
    scoreLabel: 'Treffer',
  },
  {
    id: 'kart',
    name: 'Herz-Kart',
    emoji: '🏎️',
    tagline: 'Kart-Rennen auf dem Herz-Ring – mit Turbo-Pilz, Banane und Herzpfeil',
    rules:
      'Drei Runden auf dem Herz-Ring – wer zuerst im Ziel ist, gewinnt. Gas gibt dein Kart von selbst, du lenkst mit ◀ und ▶. Hältst du eine Kurve lange gedrückt, driftest du und es sprühen Funken – beim Loslassen gibt’s einen Mini-Turbo. Fahr durch die ?-Boxen: 🍄 Turbo-Pilz gibt Tempo, 🍌 Bananen legst du hinter dich, 💘 der Herzpfeil fliegt dem anderen hinterher und bringt ihn ins Schleudern. Item einsetzen mit der Taste in der Mitte. Auf der Wiese wird’s langsam, orange Felder geben Schub. Zu zweit an einem Handy sitzt ihr euch gegenüber, allein fährst du Zeitfahren auf Rekordjagd.',
    modes: ['duo', 'online', 'cpu', 'solo'],
    category: 'action',
    minutes: '2 Min',
    colors: ['#ff4f81', '#ffb347'],
    scoreLabel: 'Sek.',
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
    id: 'tetris',
    name: 'Herz-Tetris',
    emoji: '🧩',
    tagline: 'Klötzchen drehen, Reihen räumen – wie auf dem Game Boy',
    rules:
      'Wische nach links oder rechts zum Schieben, tippe zum Drehen und wische nach unten, um den Stein fallen zu lassen – oder nutze die Knöpfe. Volle Reihen verschwinden. Alle 10 Reihen wird es schneller. Vorbei ist es, wenn der Stapel oben anstößt.',
    modes: ['solo'],
    category: 'arcade',
    minutes: '4 Min',
    colors: ['#3949ab', '#26c6da'],
    scoreLabel: 'Punkte',
  },
  {
    id: 'invaders',
    name: 'Herz-Invaders',
    emoji: '👾',
    tagline: 'Space Invaders – verteidige die Erde mit Herzen',
    rules:
      'Zieh den Finger, um dein Raumschiff zu steuern – es schießt von selbst Herzen ab. Triff alle Invader, bevor sie unten ankommen, und weich ihren Schüssen aus. Du hast 3 Leben, jede Welle wird schneller.',
    modes: ['solo'],
    category: 'arcade',
    minutes: '3 Min',
    colors: ['#1b1b3a', '#7c4dff'],
    scoreLabel: 'Punkte',
  },
  {
    id: 'flappy',
    name: 'Flappy Herz',
    emoji: '💘',
    tagline: 'Tippen, flattern, durch die Lücke!',
    rules: 'Tippe irgendwo hin, damit das Herz nach oben flattert. Flieg durch die Lücken zwischen den Säulen – jede Säule gibt einen Punkt. Nicht anstoßen!',
    modes: ['solo'],
    category: 'arcade',
    minutes: '1 Min',
    colors: ['#43a047', '#81d4fa'],
    scoreLabel: 'Säulen',
  },
  {
    id: 'g2048',
    name: '2048',
    emoji: '🔢',
    tagline: 'Zahlen zusammenschieben bis zur 2048',
    rules: 'Wische in eine Richtung – alle Kacheln rutschen mit. Zwei gleiche Zahlen verschmelzen zu einer doppelt so großen. Jede Verschmelzung gibt Punkte. Schaffst du die 2048? Vorbei ist es, wenn nichts mehr geht.',
    modes: ['solo'],
    category: 'arcade',
    minutes: '5 Min',
    colors: ['#f57c00', '#ffd54f'],
    scoreLabel: 'Punkte',
  },
  {
    id: 'minesweeper',
    name: 'Minesweeper',
    emoji: '💣',
    tagline: 'Alle Felder aufdecken – nur nicht die Minen',
    rules:
      'Tippe ein Feld, um es aufzudecken. Die Zahl sagt, wie viele Minen daneben liegen. Mit dem Fahnen-Knopf (oder lange drücken) markierst du Minen. Wer alle sicheren Felder aufdeckt, gewinnt – je schneller, desto besser.',
    modes: ['solo'],
    category: 'arcade',
    minutes: '3 Min',
    colors: ['#546e7a', '#b0bec5'],
    scoreLabel: 'Sek.',
    lowerIsBetter: true,
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
    id: 'runner',
    name: 'Tempel-Lauf',
    emoji: '🏃',
    tagline: 'Endlos-Lauf durch den Dschungeltempel – wie Temple Run',
    rules:
      'Du rennst über einen alten Tempelpfad, das Knuddelmonster immer hinter dir. Wische nach links oder rechts, um die Spur zu wechseln, nach oben zum Springen und nach unten zum Rutschen. Über Baumstämme und Lücken springst du, unter Steintoren rutschst du durch, um Steinblöcke läufst du herum. An jeder Kreuzung musst du in Pfeilrichtung wischen – sonst geht es in den Abgrund. Stolperst du, holt dich das Monster ein – beim zweiten Mal wirst du geknuddelt. Jeder Meter zählt, jedes Herz 5 Punkte extra.',
    modes: ['solo'],
    category: 'action',
    minutes: '3 Min',
    colors: ['#e2557f', '#f2a14e'],
    scoreLabel: 'Punkte',
  },
  {
    id: 'amor',
    name: 'Amors Pfeile',
    emoji: '🏹',
    tagline: 'Schießbude wie Moorhuhn – mit Liebespfeilen statt Schrot',
    rules:
      'Du bist Amor: Tippe auf die Vögel, und dein Pfeil macht sie unsterblich verliebt – mit Herzaugen flattern sie davon. Kleine Vögel weit hinten bringen 25 Punkte, die mittleren 10, die großen vorn 5. Goldvögel geben 50, Herzballons 15. Im Köcher sind 8 Pfeile – tippe auf 🏹, um nachzuladen. Halte den linken oder rechten Rand gedrückt, um die Landschaft zu schwenken. In der Landschaft verstecken sich noch ein paar Überraschungen. Du hast 90 Sekunden.',
    modes: ['solo'],
    category: 'action',
    minutes: '2 Min',
    colors: ['#ff6f91', '#845ec2'],
    scoreLabel: 'Punkte',
  },
  {
    id: 'muncher',
    name: 'Herz-Mampfer',
    emoji: '👻',
    tagline: 'Herzchen futtern, Grummelgeistern ausweichen – wie Pac-Man',
    rules:
      'Wische in eine Richtung (oder nutz die Pfeile) – Mampfi läuft weiter, bis eine Wand kommt, und biegt an der nächsten Abzweigung ab. Futtere alle Herzchen im Labyrinth. Die vier Grummelgeister jagen dich, jeder auf seine Art. Ein großes ❤️ ist ein Liebestrank: Kurz werden die Geister blau und du kannst sie verputzen. Ab und zu taucht unter dem Geisterhaus ein Naschi auf. Durch den Tunnel an der Seite kommst du auf der anderen Seite raus. Du hast 3 Leben.',
    modes: ['solo'],
    category: 'arcade',
    minutes: '4 Min',
    colors: ['#ff2f78', '#4057ff'],
    scoreLabel: 'Punkte',
  },
  {
    id: 'hopper',
    name: 'Herz-Hüpfer',
    emoji: '🦘',
    tagline: 'Hüpf von Wolke zu Wolke immer höher – wie Doodle Jump',
    rules:
      'Hüpfi springt von selbst. Halte die linke oder rechte Bildschirmhälfte gedrückt (oder schalte „Neigen“ ein und kipp das Handy), um zu lenken – wer an einer Seite rausläuft, kommt auf der anderen wieder rein. Rosa Wolken tragen dich, blaue wandern hin und her, weiße lösen sich nach einem Sprung auf und Waffelkekse zerbröseln. Federn und Herzballons schießen dich nach oben. Spring den Grummelwolken auf den Kopf – nur nicht seitlich berühren! Fällst du unten raus, ist Schluss.',
    modes: ['solo'],
    category: 'arcade',
    minutes: '3 Min',
    colors: ['#ff6fa5', '#ffb36b'],
    scoreLabel: 'Meter',
  },
  {
    id: 'ballz',
    name: 'Ball-Blitz',
    emoji: '☄️',
    tagline: 'Zielen, abfeuern, Blöcke zerschmettern – jede Runde ein Ball mehr',
    rules:
      'Leg den Finger aufs Feld und ziel – die gepunktete Linie zeigt den Weg. Beim Loslassen fliegen alle Bälle hintereinander los und prallen an Wänden und Blöcken ab. Jeder Treffer zieht dem Block einen Punkt ab, bei 0 zerplatzt er. Fang die 💗-Ringe für einen Ball mehr, ⚡-Ringe treffen eine ganze Reihe oder Spalte. Nach jeder Runde rutschen die Blöcke eine Reihe tiefer – kommt einer unten an, ist Schluss.',
    modes: ['solo'],
    category: 'arcade',
    minutes: '5 Min',
    colors: ['#ff4f9a', '#6b5cff'],
    scoreLabel: 'Runden',
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
  karten: { emoji: '🃏', title: 'Karten & Würfel', text: 'Die Klassiker vom Spieleabend – online, an einem Handy oder gegen die KI' },
  brett: { emoji: '♟️', title: 'Brett & Strategie', text: 'Schach, Dame, Mühle und Co. – Köpfchen ist gefragt' },
  raten: { emoji: '🧠', title: 'Rätseln & Raten', text: 'Wer weiß mehr, wer merkt sich mehr?' },
  action: { emoji: '💥', title: 'Action & 3D', text: 'Kämpfen, rasen, zielen – auch online, jeder am eigenen Handy' },
  arcade: { emoji: '🕹️', title: 'Arcade', text: 'Schnelle Runden und Klassiker – gegenüber am Handy oder allein auf Rekordjagd' },
};
