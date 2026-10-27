import type { Fertility, PhaseId, TtcStage } from '../lib/cycle';
import type { Flow } from '../lib/types';

// Platzhalter: {name} = Person mit Zyklus, {partner} = ihr Gegenüber.

export interface PhaseInfo {
  name: string;
  emoji: string;
  season: string;
  short: string;
  /** Was im Körper passiert. */
  body: string;
  /** Wie es sich oft anfühlt. */
  feel: string;
  sport: string;
  food: string;
  /** Tipps für die Person mit Zyklus. */
  self: string[];
  /** Tipps für das Gegenüber. */
  partner: string[];
}

export const PHASES: Record<PhaseId, PhaseInfo> = {
  menstruation: {
    name: 'Menstruation',
    emoji: '🩸',
    season: 'Innerer Winter',
    short: 'Zeit für Ruhe und Wärme',
    body: 'Die Gebärmutterschleimhaut wird abgestoßen, weil sich keine befruchtete Eizelle eingenistet hat. Östrogen und Progesteron sind jetzt am Tiefpunkt. Botenstoffe (Prostaglandine) lassen die Gebärmutter sich zusammenziehen – das sind die typischen Krämpfe.',
    feel: 'Oft weniger Energie, Unterleibs- oder Rückenschmerzen und Müdigkeit. Ab Tag 2 bis 3 wird es meist leichter.',
    sport: 'Sanft bewegen: Spazierengehen, Yoga oder Dehnen können Krämpfe lindern. Fühlt sich {name} fit, ist auch normales Training völlig okay.',
    food: 'Eisenreich essen, z. B. Linsen, Haferflocken, Spinat oder Kichererbsen – am besten zusammen mit Vitamin C (Paprika, Zitrusfrüchte), dann nimmt der Körper das Eisen besser auf. Warme Gerichte und Tee tun gut.',
    self: [
      'Wärmflasche oder Wärmepflaster auf den Bauch – Wärme entspannt die Muskulatur.',
      'Genug trinken: Wasser oder Kräutertee, z. B. Ingwer oder Kamille.',
      'Plane heute bewusst weniger ein – Ruhe ist gerade produktiv.',
      'Ein kurzer Spaziergang an der frischen Luft kann Krämpfe lindern.',
      'Gönn dir dein Lieblingsessen ohne schlechtes Gewissen.',
      'Geh früh schlafen – dein Körper leistet gerade eine Menge.',
      'Sag {partner}, was dir guttut. Gedankenlesen klappt selten. 😉',
    ],
    partner: [
      'Bring {name} eine Wärmflasche und einen Tee – ohne dass {name} fragen muss.',
      'Übernimm heute Abwasch, Einkauf oder Kochen.',
      'Kuscheln und Serienabend statt großer Pläne. 🛋️',
      'Frag einfach: „Was würde dir jetzt guttun?“',
      'Eine sanfte Rücken- oder Bauchmassage kann Wunder wirken.',
      'Lieblingssnack mitbringen – kleine Geste, große Wirkung. 🍫',
      'Keine Witze über Laune oder „die Tage“ – Verständnis ist sexy.',
    ],
  },
  follikel: {
    name: 'Follikelphase',
    emoji: '🌱',
    season: 'Innerer Frühling',
    short: 'Energie und Laune steigen',
    body: 'Nach der Periode steigt das Östrogen. Im Eierstock reift ein Eibläschen (Follikel) heran, und die Gebärmutterschleimhaut baut sich neu auf.',
    feel: 'Viele fühlen sich jetzt fitter, motivierter und offener für Neues. Die Haut ist oft besonders schön.',
    sport: 'Gute Zeit für Kraft- und Intervalltraining – intensive Einheiten steckt der Körper jetzt oft gut weg. Vielleicht klappt eine neue Bestleistung?',
    food: 'Frisch und eiweißreich: Gemüse, Vollkorn, Eier, Fisch, Tofu oder Hülsenfrüchte unterstützen den Aufbau.',
    self: [
      'Starte neue Projekte – Kopf und Körper sind jetzt oft voller Tatendrang.',
      'Plane ein knackiges Workout ein und schau, was geht. 💪',
      'Verabrede dich oder plant zu zweit etwas Neues.',
      'Probier ein neues Rezept aus – die Lust auf Neues ist jetzt oft groß.',
    ],
    partner: [
      'Plant ein aktives Date: Wandern, Radtour oder Klettern. 🚴',
      'Fordert euch beim Sport gegenseitig heraus – {name} hat jetzt oft viel Energie.',
      'Überrasch {name} mit einem spontanen Ausflug.',
      'Gute Phase für große Gespräche und gemeinsame Pläne.',
    ],
  },
  eisprung: {
    name: 'Eisprung',
    emoji: '🥚',
    season: 'Innerer Sommer',
    short: 'Die fruchtbarsten Tage',
    body: 'Ein Hormonschub (LH) lässt das reife Eibläschen platzen. Die Eizelle wandert in den Eileiter und ist etwa 12 bis 24 Stunden befruchtungsfähig. Das Östrogen ist am höchsten, der Zervixschleim wird klar und dehnbar wie rohes Eiweiß.',
    feel: 'Oft viel Energie, Selbstbewusstsein und Lust auf Nähe. Manche spüren ein kurzes Ziehen auf einer Seite des Unterbauchs (Mittelschmerz).',
    sport: 'Energie auf Höchststand: Laufen, Tanzen, Teamsport. Gut aufwärmen, dann darf es ruhig fordernd sein.',
    food: 'Viel Gemüse, Beeren und Ballaststoffe – und genug trinken.',
    self: [
      'Jetzt ist die Chance auf eine Schwangerschaft am größten – ob gewünscht oder nicht: plant entsprechend.',
      'Wichtiges Gespräch, Präsentation oder Date-Night? Deine Ausstrahlung ist jetzt oft besonders stark. ✨',
      'Achte auf deinen Körper: Klarer, dehnbarer Zervixschleim zeigt die fruchtbaren Tage an.',
    ],
    partner: [
      'Zeit für eine richtige Date-Night – und für Komplimente. 💃',
      'Bei Kinderwunsch: entspannt bleiben. Druck hilft niemandem, Nähe schon.',
      'Ohne Kinderwunsch: Verhütung jetzt besonders ernst nehmen.',
      'Sag {name} heute, warum du so verliebt bist. 😍',
    ],
  },
  luteal: {
    name: 'Lutealphase',
    emoji: '🍂',
    season: 'Innerer Herbst',
    short: 'Runterfahren und gut für sich sorgen',
    body: 'Aus dem leeren Eibläschen wird der Gelbkörper. Er bildet Progesteron, das die Schleimhaut auf eine mögliche Einnistung vorbereitet. Die Körpertemperatur steigt leicht (etwa 0,3 bis 0,5 °C), der Energiebedarf ist etwas höher. Nistet sich nichts ein, fallen die Hormone gegen Ende ab – dann kann PMS auftreten.',
    feel: 'Zuerst oft ruhig und ausgeglichen. In den letzten Tagen vor der Periode sind Blähbauch, Brustspannen, Heißhunger, Hautunreinheiten oder Stimmungsschwankungen möglich.',
    sport: 'Moderat bleiben: Pilates, Schwimmen, lockeres Laufen oder Krafttraining mit etwas weniger Intensität. Kurz vor der Periode lieber Yoga und Spaziergänge.',
    food: 'Komplexe Kohlenhydrate (Haferflocken, Vollkorn, Süßkartoffel) halten den Blutzucker stabil und dämpfen Heißhunger. Magnesiumreiches wie Nüsse, Bananen und Hülsenfrüchte tut gut. Etwas weniger Salz und Koffein kann gegen Wassereinlagerungen helfen.',
    self: [
      'Plane Puffer ein und sag auch mal Nein – du darfst dich zurückziehen.',
      'Gesunde Snacks griffbereit halten, dann hat der Heißhunger weniger Chance.',
      'Genug Schlaf ist jetzt Gold wert. 😴',
      'Ein warmes Bad oder ein ruhiger Abend mit Buch tut gut.',
      'Leg dir schon mal Binden, Tampons oder Tasse bereit.',
    ],
    partner: [
      'Extra Geduld: Ist {name} gereizt, liegt das oft an den Hormonen – nicht an dir.',
      'Gemütlichen Abend planen: kochen, Decke, Lieblingsfilm. 🍿',
      'Kleine Aufmerksamkeiten: ein Zettel, eine lange Umarmung, ein Lieblingssnack.',
      'Nimm {name} heute eine Aufgabe ab, die nervt.',
      'Zuhören statt Lösungen liefern. 💬',
    ],
  },
  spaet: {
    name: 'Periode überfällig',
    emoji: '⏳',
    season: 'Abwarten',
    short: 'Die Periode lässt auf sich warten',
    body: 'Die Periode kommt später als erwartet. Häufige Gründe sind Stress, Reisen, Krankheit, starke Gewichtsveränderungen oder sehr intensiver Sport – dann verschiebt sich der Eisprung. Natürlich kann auch eine Schwangerschaft dahinterstecken.',
    feel: 'Oft fühlt es sich an wie die Tage vor der Periode. Ein paar Tage Verspätung sind bei vielen ganz normal.',
    sport: 'Bewegung wie gewohnt, aber ohne Überlastung.',
    food: 'Regelmäßig und ausgewogen essen – und genug trinken.',
    self: [
      'Ein Schwangerschaftstest ist ab dem Tag der erwarteten Periode aussagekräftig – am besten mit Morgenurin.',
      'Stress kann den Zyklus verschieben – gönn dir bewusst Entspannung.',
      'Bleibt die Periode öfter oder länger aus, lass es bei deiner Frauenärztin abklären.',
    ],
    partner: [
      'Ruhig bleiben und für {name} da sein – egal, was dahintersteckt.',
      'Wenn {name} möchte: den Test gemeinsam machen und das Ergebnis zusammen anschauen.',
      'Sprecht offen darüber, was ihr euch wünscht. 💞',
    ],
  },
};

export const FERTILITY_LABEL: Record<Fertility, { label: string; emoji: string; text: string }> = {
  niedrig: { label: 'niedrig', emoji: '🌙', text: 'Eine Schwangerschaft ist unwahrscheinlicher – aber nicht ausgeschlossen.' },
  mittel: { label: 'mittel', emoji: '🌼', text: 'Fruchtbares Fenster: Spermien können bis zum Eisprung überleben.' },
  hoch: { label: 'hoch', emoji: '🌸', text: 'Die fruchtbarsten Tage rund um den Eisprung.' },
};

/** Im Kinderwunsch-Modus wird aus der Fruchtbarkeit eine Chance. */
export const CHANCE_LABEL: Record<Fertility, { label: string; emoji: string; text: string }> = {
  hoch: { label: 'Top-Chance', emoji: '🌸', text: 'Die besten Tage überhaupt: kurz vor und am Eisprung.' },
  mittel: { label: 'gute Chance', emoji: '🌼', text: 'Fruchtbares Fenster: Spermien können bis zu 5 Tage auf den Eisprung warten.' },
  niedrig: { label: 'geringe Chance', emoji: '🌙', text: 'Heute ist die Chance gering – Zeit für Nähe ganz ohne Hintergedanken.' },
};

export interface TtcStageInfo {
  emoji: string;
  /** Tipps für die Person mit Zyklus. */
  self: string[];
  /** Tipps für das Gegenüber. */
  partner: string[];
}

/** Tipps auf dem Weg zum Baby – je nachdem, wo ihr gerade im Zyklus steht. */
export const TTC_STAGES: Record<TtcStage, TtcStageInfo> = {
  periode: {
    emoji: '🌷',
    self: [
      'Es hat diesmal nicht geklappt – das ist völlig normal. Selbst bei perfektem Timing liegt die Chance pro Zyklus nur bei etwa 20 bis 30 %.',
      'Du darfst traurig sein. Und dann: Wärmflasche, Tee und ein Abend nur für euch.',
      'Folsäure weiter nehmen – sie wirkt am besten, wenn sie schon vor der Schwangerschaft eingenommen wird.',
      'Plant schon mal etwas Schönes für das fruchtbare Fenster – lieber ein Date als ein Termin.',
    ],
    partner: [
      'Sag {name}, dass ihr ein Team seid – egal, wie lange es dauert. 💞',
      'Kein „Nächstes Mal klappt’s bestimmt“ – lieber zuhören und in den Arm nehmen.',
      'Übernimm heute das Kochen und macht es euch gemütlich.',
      'Auch du zählst: wenig Alkohol, nicht rauchen, gut schlafen – Spermien reifen etwa zweieinhalb Monate.',
    ],
  },
  vorher: {
    emoji: '🌱',
    self: [
      'Ovulationstests bereitlegen: Ab ein paar Tagen vor dem Fenster einmal täglich testen, am besten nachmittags.',
      'Achte auf deinen Zervixschleim: Wird er klar und dehnbar wie rohes Eiweiß, ist der Eisprung nah.',
      'Bewegung, buntes Essen und genug Schlaf – dein Körper bereitet gerade eine Eizelle vor.',
      'Nähe ist auch jetzt schön – Spermien können bis zu 5 Tage auf den Eisprung warten.',
    ],
    partner: [
      'Plant schon mal ein Date für das fruchtbare Fenster – romantisch statt nach Stoppuhr. 🕯️',
      'Heiße Bäder, Sauna und den Laptop auf dem Schoß meiden – Spermien mögen es kühl.',
      'Obst, Gemüse, Nüsse und Fisch tun auch deinen Spermien gut.',
      'Überrasch {name} mit einer kleinen Aufmerksamkeit – Vorfreude ist die schönste Freude.',
    ],
  },
  fenster: {
    emoji: '🌸',
    self: [
      'Alle 1 bis 2 Tage im Fenster reicht völlig – öfter muss nicht sein.',
      'Ovulationstest positiv? Dann sind heute und die nächsten 2 Tage eure besten Tage.',
      'Danach ruhig noch ein paar Minuten kuschelnd liegen bleiben – ganz ohne Kopfstand. 😉',
      'Gleitgel? Dann nur spermienfreundliches – normales kann die Spermien ausbremsen.',
      'Kein Druck: Entspannte Nähe ist besser als ein perfekter Plan.',
    ],
    partner: [
      'Macht es romantisch statt pflichtbewusst: Kerzen, Musik, Handy weg. 🕯️',
      'Kein Leistungsdruck – lacht zusammen und sagt euch, was ihr euch wünscht.',
      'Heute lieber keinen Alkohol und früh nach Hause. 😏',
      'Komplimente, Hand halten, kuscheln – Nähe beginnt lange vor dem Schlafzimmer.',
    ],
  },
  warten: {
    emoji: '🤞',
    self: [
      'Jetzt heißt es Geduld: Ein Test ist erst ab dem Tag der erwarteten Periode aussagekräftig.',
      'Ziehen oder Brustspannen kann alles bedeuten – auch PMS. Versuch, nicht jedes Zeichen zu deuten.',
      'Leb einfach schon ein bisschen so, als wärst du schwanger: kein Alkohol, kein Rauchen, Folsäure nehmen.',
      'Lenk dich ab: Plant etwas Schönes, macht Sport, trefft Freunde.',
    ],
    partner: [
      'Die Wartezeit ist für {name} oft nervenaufreibend – sei geduldig, liebevoll und sorg für Ablenkung.',
      'Plant zusammen etwas für die Wartezeit: Ausflug, Kochabend oder Spieleabend. 🎲',
      'Nicht ständig fragen „Und, spürst du was?“ – einfach da sein.',
      'Schick {name} eine kleine Botschaft: „Egal, was kommt – ich liebe dich.“ 💌',
    ],
  },
  test: {
    emoji: '🧪',
    self: [
      'Am zuverlässigsten ist der Test mit Morgenurin.',
      'Negativ, aber die Periode bleibt aus? Nach 2 bis 3 Tagen noch einmal testen.',
      'Macht den Test zusammen – egal, wie er ausgeht, ihr seid nicht allein.',
    ],
    partner: [
      'Sei beim Test dabei und haltet euch an der Hand. 🤝',
      'Egal, was der Test zeigt: Nimm {name} in den Arm.',
      'Bleibt die Periode länger aus und der Test ist negativ, ist ein Termin bei der Frauenärztin sinnvoll.',
    ],
  },
  positiv: {
    emoji: '🎉',
    self: [
      'Herzlichen Glückwunsch! Mach einen Termin bei deiner Frauenärztin – die erste Untersuchung ist meist um die 6. bis 8. Woche.',
      'Folsäure weiter nehmen – und ab jetzt kein Alkohol, kein Rauchen, kein roher Fisch und keine Rohmilch.',
      'Such dir früh eine Hebamme – sie sind oft schnell ausgebucht.',
    ],
    partner: [
      'Feiert diesen Moment! 🥂 (Für {name} natürlich alkoholfrei.)',
      'Begleite {name} zu den Vorsorgeterminen.',
      'Ab jetzt deine Jobs: Katzenklo, schweres Heben und Gartenarbeit mit Erde.',
    ],
  },
};

/** Kurze Einblendungen, wenn ihr eintragt, dass ihr euch geliebt habt. */
export const LOVE_LOGGED = ['Eingetragen – ganz diskret. 🤫', 'Ihr zwei seid einfach süß. 💕', 'Nähe tut Herz und Körper gut. 💞', 'Liebe ist das beste Workout. 😏'];
export const LOVE_LOGGED_FERTILE = ['Perfektes Timing! Daumen sind gedrückt. 🤞', 'Mitten im fruchtbaren Fenster – drückt euch die Daumen. 🌸', 'Bestes Timing – jetzt nur noch Geduld und viel Liebe. 💕'];

export const FLOWS: { id: Flow; label: string; emoji: string }[] = [
  { id: 'schmier', label: 'Schmierblutung', emoji: '💧' },
  { id: 'leicht', label: 'Leicht', emoji: '🩸' },
  { id: 'mittel', label: 'Mittel', emoji: '🩸🩸' },
  { id: 'stark', label: 'Stark', emoji: '🩸🩸🩸' },
];

export interface Symptom {
  id: string;
  label: string;
  emoji: string;
  /** Tipp für die Person mit Zyklus. */
  self: string;
  /** Tipp für das Gegenüber. */
  partner: string;
}

export const SYMPTOMS: Symptom[] = [
  { id: 'kraempfe', label: 'Krämpfe', emoji: '😣', self: 'Wärme, sanfte Bewegung und bei Bedarf ein Schmerzmittel aus der Apotheke helfen vielen.', partner: 'Wärmflasche bringen und den unteren Rücken massieren.' },
  { id: 'kopfweh', label: 'Kopfweh', emoji: '🤕', self: 'Viel trinken, frische Luft und eine Bildschirmpause.', partner: 'Für Ruhe sorgen und ein großes Glas Wasser bringen.' },
  { id: 'ruecken', label: 'Rückenschmerzen', emoji: '🫠', self: 'Wärme und sanftes Dehnen (z. B. Katze-Kuh) lockern den Rücken.', partner: 'Eine Rückenmassage anbieten – ganz ohne Hintergedanken. 😇' },
  { id: 'brust', label: 'Brustspannen', emoji: '💗', self: 'Ein weicher, gut sitzender BH und weniger Salz können helfen.', partner: 'Beim Kuscheln heute besonders sanft sein.' },
  { id: 'blaeh', label: 'Blähbauch', emoji: '🎈', self: 'Fenchel- oder Pfefferminztee, kleinere Mahlzeiten und etwas weniger Salz.', partner: 'Kein Kommentar zum Bauch – stattdessen Tee kochen. 😉' },
  { id: 'muede', label: 'Müde', emoji: '😴', self: 'Ein Powernap oder früher ins Bett – dein Körper sagt dir, was er braucht.', partner: 'Schlaf hat heute Vorrang – Pläne können warten.' },
  { id: 'hunger', label: 'Heißhunger', emoji: '🍫', self: 'Dunkle Schokolade, Nüsse oder Obst mit Joghurt sättigen länger als Süßkram.', partner: 'Mit einem kleinen Snack überraschen – gesund oder ein bisschen süß.' },
  { id: 'haut', label: 'Unreine Haut', emoji: '🧴', self: 'Sanft reinigen und nicht drücken – das geht von allein vorbei.', partner: 'Sag {name}, wie schön {name} ist. ✨' },
  { id: 'stimmung', label: 'Stimmungsschwankungen', emoji: '🎢', self: 'Gefühle sind okay. Bewegung, Schlaf und Gespräche federn die Achterbahn ab.', partner: 'Zuhören, nicht diskutieren – und eine Umarmung anbieten.' },
  { id: 'gereizt', label: 'Gereizt', emoji: '😤', self: 'Kurz rausgehen und tief durchatmen. Du darfst auch sagen: „Heute brauche ich Ruhe.“', partner: 'Nicht persönlich nehmen und etwas Raum geben.' },
  { id: 'traurig', label: 'Traurig', emoji: '🥺', self: 'Sprich mit jemandem, dem du vertraust – zum Beispiel mit {partner}.', partner: 'Einfach da sein: Hand halten, nachfragen, zuhören.' },
  { id: 'uebel', label: 'Übelkeit', emoji: '🤢', self: 'Ingwertee und kleine, leichte Mahlzeiten beruhigen den Magen.', partner: 'Ingwertee kochen und Zwieback bereitstellen.' },
  { id: 'schlaf', label: 'Schlecht geschlafen', emoji: '🌙', self: 'Abends Handy weg, Zimmer kühl und dunkel – und ein fester Rhythmus.', partner: 'Morgen früh den Kaffee oder Tee ans Bett bringen. ☕' },
  { id: 'energie', label: 'Voller Energie', emoji: '⚡', self: 'Nutz den Schwung für ein knackiges Workout!', partner: 'Gemeinsam Sport machen – {name} ist heute in Topform.' },
  { id: 'lust', label: 'Lust auf Nähe', emoji: '💋', self: 'Sag es {partner} – oder schick eine kleine Botschaft. 😏', partner: 'Zeit für Zweisamkeit – Handy weg, Kerze an. 🕯️' },
  { id: 'schleim', label: 'Eiweiß-Schleim', emoji: '🥚', self: 'Klarer, dehnbarer Zervixschleim ist ein typisches Zeichen für fruchtbare Tage.', partner: 'Fruchtbare Tage: bei Kinderwunsch eine gute Chance, sonst gut verhüten.' },
  { id: 'mittelschmerz', label: 'Mittelschmerz', emoji: '📍', self: 'Ein Ziehen auf einer Seite um den Eisprung herum ist häufig und harmlos. Bei starken Schmerzen ab zur Ärztin.', partner: 'Wärme anbieten und es heute ruhig angehen lassen.' },
];

export const SYMPTOM_BY_ID: Record<string, Symptom> = Object.fromEntries(SYMPTOMS.map((s) => [s.id, s]));

/** Kurze Fakten für „Wusstet ihr schon?“. */
export const CYCLE_FACTS = [
  'Ein Zyklus dauert bei Erwachsenen meist zwischen 21 und 35 Tagen – 28 Tage sind nur der Durchschnitt.',
  'Die Periode dauert meist 2 bis 7 Tage.',
  'Pro Periode gehen im Schnitt nur etwa 30 bis 40 ml Blut verloren – das sind 2 bis 3 Esslöffel.',
  'Eine Eizelle lebt nach dem Eisprung nur etwa 12 bis 24 Stunden, Spermien dagegen bis zu 5 Tage.',
  'Der Eisprung findet meist etwa 12 bis 16 Tage vor der nächsten Periode statt – nicht zwingend an Tag 14.',
  'Nach dem Eisprung steigt die Körpertemperatur um etwa 0,3 bis 0,5 °C und bleibt bis zur Periode erhöht.',
  'Stress kann den Eisprung verschieben – und damit auch die nächste Periode.',
  'In der zweiten Zyklushälfte verbraucht der Körper etwas mehr Energie. Heißhunger ist also kein Zufall.',
  'Kurz vor dem Eisprung wird der Zervixschleim klar und dehnbar, damit Spermien leichter durchkommen.',
  'Auch Spermien brauchen Zeit: Ihre Bildung dauert etwa zweieinhalb Monate. Gesunder Lebensstil lohnt sich also für beide.',
  'Selbst bei einem perfekt passenden Timing liegt die Chance, in einem Zyklus schwanger zu werden, bei jungen Paaren nur bei etwa 20 bis 30 %.',
  'Regelmäßige Bewegung kann Regelschmerzen und PMS-Beschwerden lindern.',
  'Die besten Chancen auf ein Baby gibt es an den 2 Tagen vor dem Eisprung – nicht erst am Tag selbst.',
  'Etwa 8 von 10 Paaren mit Kinderwunsch werden innerhalb eines Jahres schwanger – viele schon in den ersten Monaten.',
];

export interface InfoTopic {
  id: string;
  emoji: string;
  title: string;
  intro?: string;
  points: string[];
  /** Was das Gegenüber tun kann. */
  partner?: string[];
}

export const INFO_TOPICS: InfoTopic[] = [
  {
    id: 'fruchtbarkeit',
    emoji: '🌼',
    title: 'Fruchtbarkeit & Kinderwunsch',
    intro: 'Fruchtbar sind etwa die 5 Tage vor dem Eisprung und der Tag danach. Am höchsten ist die Chance an den 2 bis 3 Tagen bis einschließlich Eisprung.',
    points: [
      'Wer schwanger werden möchte, hat im fruchtbaren Fenster alle 1 bis 2 Tage Sex – das reicht völlig, ganz ohne Stoppuhr.',
      'Zeichen für fruchtbare Tage: klarer, dehnbarer Zervixschleim, manchmal Mittelschmerz und mehr Lust. Ovulationstests aus der Drogerie messen den LH-Anstieg.',
      'Folsäure: Bei Kinderwunsch wird empfohlen, schon mindestens 4 Wochen vor der Schwangerschaft täglich 400 µg Folsäure einzunehmen – bis zum Ende des ersten Drittels.',
      'Rauchen, viel Alkohol, starkes Über- oder Untergewicht und Dauerstress senken die Fruchtbarkeit – bei beiden.',
      'Vorab lohnt ein Check bei der Frauenärztin, z. B. Impfschutz (Röteln, Windpocken) und Medikamente.',
      'Klappt es nach 12 Monaten nicht (ab 35 Jahren nach 6 Monaten), sollten sich beide ärztlich beraten lassen.',
    ],
    partner: [
      'Spermien brauchen etwa zweieinhalb Monate zum Reifen: nicht rauchen, wenig Alkohol, ausgewogen essen, bewegen.',
      'Hitze mögen sie nicht: keine Laptops auf dem Schoß und nicht ständig in die Sauna.',
      'Kein Leistungsdruck – Zärtlichkeit und Spaß sind das beste Rezept.',
    ],
  },
  {
    id: 'ovutest',
    emoji: '🧪',
    title: 'Ovulationstests richtig nutzen',
    intro: 'Ovulationstests (LH-Tests) messen den Hormonanstieg kurz vor dem Eisprung. Ist der Test positiv, folgt der Eisprung meist innerhalb von 1 bis 2 Tagen.',
    points: [
      'Etwa 3 bis 4 Tage vor dem erwarteten fruchtbaren Fenster mit dem Testen beginnen und dann täglich testen.',
      'Am besten zwischen späterem Vormittag und Abend testen und 2 Stunden vorher wenig trinken – Morgenurin ist hier nicht ideal.',
      'Positiv ist der Test, wenn die Testlinie mindestens so kräftig ist wie die Kontrolllinie.',
      'Tragt das Ergebnis in Arta ein: Bei einem positiven Test rechnet Arta den Eisprung neu und verschiebt das fruchtbare Fenster und die erwartete Periode.',
      'Nach dem Absetzen der Pille, bei PCOS oder sehr unregelmäßigem Zyklus können LH-Tests ungenau sein.',
    ],
    partner: ['Die besten Tage sind der Tag des positiven Tests und die 2 Tage danach. 💞'],
  },
  {
    id: 'warten',
    emoji: '🤞',
    title: 'Die Zwei-Wochen-Wartezeit',
    points: [
      'Nach dem Eisprung braucht eine befruchtete Eizelle etwa 6 bis 10 Tage, bis sie sich einnistet. Erst danach bildet der Körper das Schwangerschaftshormon hCG.',
      'Eine leichte Schmierblutung in dieser Zeit kann eine Einnistungsblutung sein – muss aber nicht.',
      'Frühe Anzeichen wie Brustspannen, Müdigkeit oder Ziehen ähneln PMS sehr. Sicherheit gibt erst der Test.',
      'Normal weiterleben: Sport im gewohnten Maß, ausgewogen essen, kein Alkohol.',
    ],
    partner: ['Für Ablenkung sorgen: Ausflüge, Kochabende, Spieleabende.', 'Geduld und Nähe – die Wartezeit ist für euch beide aufregend.'],
  },
  {
    id: 'mythen',
    emoji: '💡',
    title: 'Mythen rund ums Schwangerwerden',
    points: [
      'Danach Beine hochlegen oder eine Kerze machen? Nicht nötig – die schnellsten Spermien sind nach wenigen Minuten im Eileiter. Ein paar Minuten liegen bleiben schadet aber nicht.',
      'Je öfter, desto besser? Nicht unbedingt: Alle 1 bis 2 Tage im fruchtbaren Fenster ist ideal.',
      'Nur am Tag des Eisprungs klappt es? Nein – die Tage davor sind sogar besonders wichtig, weil die Spermien dann schon warten.',
      'Nach der Pille dauert es ewig? Meist pendelt sich der Zyklus innerhalb weniger Monate nach dem Absetzen ein.',
      'Keine Schuldfrage: Klappt es länger nicht, liegt es ungefähr gleich oft an ihr wie an ihm – deshalb lassen sich immer beide untersuchen.',
    ],
  },
  {
    id: 'test',
    emoji: '🧪',
    title: 'Schwangerschaftstest',
    points: [
      'Ein Urintest misst das Schwangerschaftshormon hCG. Aussagekräftig ist er ab dem Tag, an dem die Periode fällig wäre – etwa 2 Wochen nach dem Eisprung.',
      'Morgenurin ist am konzentriertesten, deshalb ist das Ergebnis am Morgen am zuverlässigsten.',
      'Negativ, aber die Periode bleibt aus? Nach ein paar Tagen noch einmal testen.',
      'Positiv? Dann einen Termin bei der Frauenärztin ausmachen – die erste Untersuchung findet meist um die 6. bis 8. Woche statt.',
    ],
  },
  {
    id: 'schwanger',
    emoji: '🤰',
    title: 'Schwangerschaft',
    intro: 'Eine Schwangerschaft dauert etwa 40 Wochen, gezählt ab dem ersten Tag der letzten Periode. „SSW 6+2“ bedeutet: 6 Wochen und 2 Tage sind geschafft.',
    points: [
      '1. Drittel (bis SSW 12): Die Organe werden angelegt. Übelkeit, Müdigkeit und Brustspannen sind typisch. Ab jetzt: kein Alkohol, kein Rauchen, kein roher Fisch, keine Rohmilch, kein rohes Fleisch.',
      '2. Drittel (SSW 13–27): Oft die schönste Zeit – mehr Energie, der Bauch wächst, zwischen SSW 18 und 22 spüren viele die ersten Bewegungen.',
      '3. Drittel (ab SSW 28): Das Baby legt an Gewicht zu, Schlafen wird unbequemer. Zeit für Geburtsvorbereitungskurs und Kliniktasche.',
      'Bewegung ist meistens gut – Schwimmen, Spazieren und Schwangerschaftsyoga. Was passt, besprecht ihr mit Ärztin oder Hebamme.',
      'Eine Hebamme gleich früh suchen – sie sind oft schnell ausgebucht. Die Kosten übernimmt in Deutschland die Krankenkasse.',
    ],
    partner: [
      'Mit zu den Vorsorgeterminen gehen – den Herzschlag im Ultraschall zu sehen, ist magisch.',
      'Gerüche, Müdigkeit, Hunger um 3 Uhr nachts: Verständnis und Snacks bereithalten.',
      'Schweres Heben, Katzenklo und Gartenarbeit mit Erde übernehmen.',
    ],
  },
  {
    id: 'geburt',
    emoji: '👶',
    title: 'Geburt',
    points: [
      'Typische Anzeichen: regelmäßige Wehen, die stärker werden und häufiger kommen, Abgang des Schleimpfropfs oder ein Blasensprung.',
      'Faustregel für den Weg in die Klinik: Wehen etwa alle 5 Minuten über eine Stunde – oder nach Absprache mit Hebamme bzw. Klinik.',
      'Sofort in die Klinik: bei Blasensprung, starker Blutung, Fieber oder wenn das Baby sich deutlich weniger bewegt.',
      'Kliniktasche ab etwa SSW 36: Mutterpass, Versichertenkarte, bequeme Kleidung, Still-BH, Snacks, Ladekabel, Babykleidung für die Heimfahrt und eine Babyschale fürs Auto.',
    ],
    partner: [
      'Du bist Teamplayer: Atmung mitmachen, Rücken massieren, Wasser reichen, Mut zusprechen.',
      'Wünsche vorher besprechen und in der Klinik ruhig für {name} eintreten.',
      'Babyschale vorher im Auto einbauen und den Weg zur Klinik einmal abfahren.',
    ],
  },
  {
    id: 'baby',
    emoji: '🍼',
    title: 'Wochenbett & Baby',
    points: [
      'Das Wochenbett dauert etwa 6 bis 8 Wochen. Der Körper heilt – Ruhe ist jetzt Pflicht, nicht Luxus. Die Hebamme kommt in dieser Zeit nach Hause.',
      'Neugeborene trinken oft alle 2 bis 3 Stunden, auch nachts. Stillen und Fläschchen sind beides Liebe.',
      'Sicher schlafen: auf dem Rücken, im eigenen Bettchen im Elternschlafzimmer, im Schlafsack statt unter Decke, rauchfreie Umgebung.',
      'Die U-Untersuchungen (U1 bis U9) beim Kinderarzt begleiten die Entwicklung – das gelbe Heft immer mitnehmen.',
      'Ein paar Tage Weinerlichkeit (Babyblues) sind normal. Hält die Traurigkeit länger als zwei Wochen an, Hebamme oder Ärztin ansprechen – das kann eine Wochenbettdepression sein und ist gut behandelbar.',
    ],
    partner: [
      'Haushalt, Besuch und Einkauf managen, damit {name} sich erholen kann.',
      'Wickeln, Baden, Tragen und Kuscheln – Bindung entsteht durch Zeit.',
      'Nachts abwechseln, wo es geht, und auf euch beide achten. 💞',
    ],
  },
  {
    id: 'arzt',
    emoji: '🩺',
    title: 'Wann zur Frauenärztin?',
    points: [
      'Sehr starke Schmerzen, die den Alltag lahmlegen oder mit Schmerzmitteln nicht besser werden.',
      'Sehr starke Blutung (z. B. stündlich Binde oder Tampon wechseln) oder Periode länger als 7 Tage.',
      'Zyklus regelmäßig kürzer als 21 oder länger als 35 Tage, oder die Periode bleibt (ohne Schwangerschaft) 3 Monate aus.',
      'Blutungen zwischen den Perioden oder nach dem Sex.',
      'Starke psychische Beschwerden vor der Periode (PMDS) – auch das kann man behandeln.',
    ],
  },
];

/** Größe des Babys ab SSW (ungefähre Vergleiche). */
export const BABY_SIZES: { week: number; text: string; emoji: string }[] = [
  { week: 4, text: 'ein Mohnsamen', emoji: '⚫' },
  { week: 6, text: 'eine Linse', emoji: '🫘' },
  { week: 8, text: 'eine Himbeere', emoji: '🍓' },
  { week: 10, text: 'eine Erdbeere', emoji: '🍓' },
  { week: 12, text: 'eine Limette', emoji: '🍋' },
  { week: 14, text: 'eine Zitrone', emoji: '🍋' },
  { week: 16, text: 'eine Avocado', emoji: '🥑' },
  { week: 20, text: 'eine Banane', emoji: '🍌' },
  { week: 24, text: 'ein Maiskolben', emoji: '🌽' },
  { week: 28, text: 'eine Aubergine', emoji: '🍆' },
  { week: 32, text: 'eine Kokosnuss', emoji: '🥥' },
  { week: 36, text: 'eine Honigmelone', emoji: '🍈' },
  { week: 40, text: 'eine kleine Wassermelone', emoji: '🍉' },
];

export const TESTS: { key: 'lh' | 'hcg'; label: string; emoji: string }[] = [
  { key: 'lh', label: 'Ovulationstest', emoji: '🧪' },
  { key: 'hcg', label: 'Schwangerschaftstest', emoji: '🤰' },
];

export const CYCLE_DISCLAIMER =
  'Arta schätzt den Zyklus nur anhand eurer Einträge. Die Vorhersagen sind kein Verhütungsmittel und ersetzen keine ärztliche Beratung – Zyklen schwanken, eine Schwangerschaft ist auch an „unfruchtbaren“ Tagen möglich.';
