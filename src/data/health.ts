// Gesundheitstipps und tägliche Routinen. Bewusst allgemein gehalten – keine Heilversprechen,
// bei Nahrungsergänzung immer der Hinweis auf Arzt bzw. Apotheke (siehe HEALTH_DISCLAIMER).

export type TipCategory = 'naehrstoffe' | 'hausmittel' | 'trinken' | 'schlaf' | 'alltag' | 'essen' | 'seele' | 'zusammen';

export const TIP_CATEGORIES: { id: TipCategory; emoji: string; label: string }[] = [
  { id: 'naehrstoffe', emoji: '💊', label: 'Vitamine & Co.' },
  { id: 'hausmittel', emoji: '🌿', label: 'Hausmittel' },
  { id: 'trinken', emoji: '💧', label: 'Trinken' },
  { id: 'schlaf', emoji: '😴', label: 'Schlaf' },
  { id: 'alltag', emoji: '🚶', label: 'Bewegung im Alltag' },
  { id: 'essen', emoji: '🥦', label: 'Essen & Darm' },
  { id: 'seele', emoji: '🧠', label: 'Kopf & Seele' },
  { id: 'zusammen', emoji: '💞', label: 'Zu zweit' },
];

export interface HealthTip {
  id: string;
  emoji: string;
  category: TipCategory;
  title: string;
  text: string;
  /** Passende Routine zum Übernehmen (ID aus ROUTINE_PRESETS). */
  routine?: string;
  /** Nur in diesen Monaten als Tipp des Tages (1 = Januar). */
  months?: number[];
}

const WINTER = [10, 11, 12, 1, 2, 3];
const COLD_SEASON = [10, 11, 12, 1, 2, 3, 4];
const SUMMER = [5, 6, 7, 8, 9];

export const HEALTH_TIPS: HealthTip[] = [
  // ───── Vitamine & Co. ─────
  {
    id: 'vitd-winter',
    emoji: '☀️',
    category: 'naehrstoffe',
    title: 'Vitamin D im Winter',
    text: 'Von Oktober bis März reicht die Sonne in Deutschland kaum, damit die Haut genug Vitamin D bildet. Lasst euren Wert beim Hausarzt checken – dann wisst ihr, ob und wie viel ihr ergänzen solltet.',
    routine: 'vitamin-d',
    months: WINTER,
  },
  {
    id: 'vitd-fett',
    emoji: '🧈',
    category: 'naehrstoffe',
    title: 'Vitamin D mag Fett',
    text: 'Die Vitamine D, E, K und A sind fettlöslich. Nimm sie zu einer Mahlzeit mit etwas Fett – z. B. zum Frühstück mit Ei, Käse oder Nüssen –, dann kommen sie besser an.',
    routine: 'vitamin-d',
  },
  {
    id: 'folsaeure',
    emoji: '🌱',
    category: 'naehrstoffe',
    title: 'Folsäure bei Kinderwunsch',
    text: 'Wünscht ihr euch ein Baby? Fachgesellschaften empfehlen Frauen 400 µg Folsäure am Tag – am besten schon 4 Wochen vor der Schwangerschaft bis zum Ende des ersten Drittels. Das senkt das Risiko für Fehlbildungen am Rückenmark.',
    routine: 'folsaeure',
  },
  {
    id: 'omega3',
    emoji: '🐟',
    category: 'naehrstoffe',
    title: 'Omega-3 aus dem Meer',
    text: '1–2 Portionen fetter Fisch pro Woche (Lachs, Hering, Makrele) liefern Omega-3-Fettsäuren für Herz und Gehirn. Wer keinen Fisch isst, greift zu Leinöl, Walnüssen oder Algenöl.',
    routine: 'omega3',
  },
  {
    id: 'magnesium',
    emoji: '🌙',
    category: 'naehrstoffe',
    title: 'Magnesium am Abend',
    text: 'Nüsse, Haferflocken, Vollkorn und Hülsenfrüchte sind gute Magnesium-Quellen. Wer viel Sport macht oder Wadenkrämpfe hat, nimmt es gern abends – mehr als 250 mg extra am Tag nur nach Rücksprache.',
    routine: 'magnesium',
  },
  {
    id: 'b12',
    emoji: '🥬',
    category: 'naehrstoffe',
    title: 'B12 bei pflanzlicher Ernährung',
    text: 'Vitamin B12 steckt fast nur in tierischen Lebensmitteln. Wer vegan isst, sollte es ergänzen – und auch Vegetarier lassen den Wert ab und zu prüfen.',
    routine: 'vitamine',
  },
  {
    id: 'eisen-vitc',
    emoji: '🍊',
    category: 'naehrstoffe',
    title: 'Eisen + Vitamin C',
    text: 'Eisen aus Linsen, Haferflocken oder Spinat wird mit Vitamin C besser aufgenommen: ein Glas O-Saft oder Paprika dazu. Kaffee und schwarzer Tee direkt zum Essen bremsen dagegen.',
  },
  {
    id: 'jod',
    emoji: '🧂',
    category: 'naehrstoffe',
    title: 'Jodsalz verwenden',
    text: 'In Deutschland ist Jod oft knapp. Jodiertes Speisesalz und ab und zu Seefisch helfen der Schilddrüse – sparsam salzen bleibt trotzdem die Devise.',
  },
  {
    id: 'nicht-zu-viel',
    emoji: '⚖️',
    category: 'naehrstoffe',
    title: 'Mehr ist nicht besser',
    text: 'Nahrungsergänzung ersetzt kein buntes Essen. Hochdosiertes nur nach Blutwert – manche Vitamine wie A und D reichern sich im Körper an.',
  },

  // ───── Hausmittel ─────
  {
    id: 'schwarzkuemmel',
    emoji: '🌿',
    category: 'hausmittel',
    title: 'Schwarzkümmelöl am Abend',
    text: 'Ein Teelöffel Schwarzkümmelöl am Abend ist ein altes Hausmittel aus dem Orient. Pur schmeckt es scharf-würzig – mit etwas Honig, in Joghurt oder über Salat geht’s leichter. Fang mit ½ Teelöffel an.',
    routine: 'schwarzkuemmel',
  },
  {
    id: 'schwarzkuemmel-vorsicht',
    emoji: '🫙',
    category: 'hausmittel',
    title: 'Schwarzkümmelöl richtig nutzen',
    text: 'Kühl und dunkel lagern, dann bleibt es frisch. In der Schwangerschaft und bei Medikamenten wie Blutverdünnern oder Blutzuckersenkern vorher ärztlich abklären.',
    routine: 'schwarzkuemmel',
  },
  {
    id: 'ingwer',
    emoji: '🫚',
    category: 'hausmittel',
    title: 'Frischer Ingwer-Tee',
    text: 'Ein paar Scheiben Ingwer mit heißem Wasser übergießen, 10 Minuten ziehen lassen, Zitrone und Honig dazu. Wärmt von innen und tut gut, wenn der Magen grummelt.',
    routine: 'ingwer',
  },
  {
    id: 'honig',
    emoji: '🍯',
    category: 'hausmittel',
    title: 'Honig bei Halskratzen',
    text: 'Ein Löffel Honig in warmem – nicht kochendem – Tee lindert Halskratzen und Hustenreiz. Das ist sogar ganz gut untersucht.',
    months: COLD_SEASON,
  },
  {
    id: 'goldene-milch',
    emoji: '🟡',
    category: 'hausmittel',
    title: 'Goldene Milch',
    text: 'Kurkuma mit einer Prise schwarzem Pfeffer in warmer Milch oder Haferdrink, etwas Zimt und Honig dazu – ein gemütliches Abendgetränk für euch zwei.',
  },
  {
    id: 'dampf',
    emoji: '♨️',
    category: 'hausmittel',
    title: 'Dampf bei Schnupfen',
    text: 'Heißes Wasser in eine Schüssel, Handtuch über den Kopf und 5–10 Minuten durchatmen. Das befeuchtet die Schleimhäute – nur nicht zu heiß!',
    months: COLD_SEASON,
  },
  {
    id: 'immun',
    emoji: '🧤',
    category: 'hausmittel',
    title: 'Gut durch die Erkältungszeit',
    text: 'Genug Schlaf, Bewegung an der frischen Luft, regelmäßig Hände waschen und bunt essen – das ist die beste Erkältungsvorsorge. Wundermittel braucht es nicht.',
    months: COLD_SEASON,
  },

  // ───── Trinken ─────
  {
    id: 'wasser-morgens',
    emoji: '💧',
    category: 'trinken',
    title: 'Ein Glas Wasser zum Start',
    text: 'Nach der Nacht ist dein Körper etwas ausgetrocknet. Stell dir abends ein Glas Wasser ans Bett und trink es direkt nach dem Aufstehen – noch vor dem Kaffee.',
    routine: 'wasser',
  },
  {
    id: 'anderthalb-liter',
    emoji: '🚰',
    category: 'trinken',
    title: 'Rund 1,5 Liter am Tag',
    text: 'So viel empfiehlt die DGE Erwachsenen über Getränke – an heißen Tagen und beim Sport mehr. Eine Flasche in Sichtweite erinnert dich ganz nebenbei.',
  },
  {
    id: 'hitze',
    emoji: '🍉',
    category: 'trinken',
    title: 'Hitze-Tipp',
    text: 'Bei Hitze früh oder abends bewegen, Wasser mit Gurke oder Minze trinken und wasserreiches Obst wie Melone naschen.',
    months: [6, 7, 8],
  },
  {
    id: 'kaffee',
    emoji: '☕',
    category: 'trinken',
    title: 'Kaffee mit Maß',
    text: 'Bis zu 3–4 Tassen Kaffee am Tag gelten für gesunde Erwachsene als unbedenklich, in der Schwangerschaft höchstens die Hälfte. Nach 14 Uhr lieber koffeinfrei – dein Schlaf dankt es dir.',
  },
  {
    id: 'zucker-trinken',
    emoji: '🍋',
    category: 'trinken',
    title: 'Zucker nicht trinken',
    text: 'Softdrinks und Säfte sind versteckte Zuckerbomben. Wasser mit Zitrone, Beeren oder Minze schmeckt auch und spart schnell 200 kcal am Tag.',
  },

  // ───── Schlaf ─────
  {
    id: 'schlafrhythmus',
    emoji: '😴',
    category: 'schlaf',
    title: 'Gleiche Schlafenszeit',
    text: 'Euer Körper liebt Routine: Wer jeden Tag ungefähr zur selben Zeit ins Bett geht und aufsteht – auch am Wochenende –, schläft schneller ein.',
  },
  {
    id: 'handy-weg',
    emoji: '📵',
    category: 'schlaf',
    title: 'Bildschirm-Pause vor dem Schlafen',
    text: 'Leg das Handy 30 Minuten vor dem Einschlafen weg. Kuscheln, lesen oder reden statt scrollen – das beruhigt den Kopf.',
    routine: 'handyfrei',
  },
  {
    id: 'kuehl-schlafen',
    emoji: '🌡️',
    category: 'schlaf',
    title: 'Kühles Schlafzimmer',
    text: 'Etwa 16–19 °C und vorher kurz lüften: In einem kühlen, dunklen Raum schläft es sich tiefer.',
  },
  {
    id: 'schlafdauer',
    emoji: '⏰',
    category: 'schlaf',
    title: '7 bis 9 Stunden',
    text: 'So viel Schlaf brauchen die meisten Erwachsenen. Guter Schlaf hilft beim Abnehmen, beim Muskelaufbau und bei der Laune.',
  },
  {
    id: 'spaet-essen',
    emoji: '🍽️',
    category: 'schlaf',
    title: 'Nicht zu spät schwer essen',
    text: 'Gönnt euch das Abendessen am besten 2–3 Stunden vor dem Schlafengehen – mit vollem Bauch schläft man unruhiger.',
  },

  // ───── Bewegung im Alltag ─────
  {
    id: 'tageslicht',
    emoji: '🌤️',
    category: 'alltag',
    title: 'Tageslicht tanken',
    text: 'Schon 15 Minuten draußen am Vormittag oder in der Mittagspause bringen Licht für die innere Uhr und gute Laune – auch an grauen Tagen.',
    routine: 'tageslicht',
  },
  {
    id: 'treppe',
    emoji: '🪜',
    category: 'alltag',
    title: 'Treppe statt Aufzug',
    text: 'Jede Treppe zählt: Kleine Bewegungen im Alltag summieren sich zu richtig vielen Schritten.',
  },
  {
    id: 'aufstehen',
    emoji: '🪑',
    category: 'alltag',
    title: 'Alle 30 Minuten aufstehen',
    text: 'Wer viel sitzt: kurz aufstehen, strecken, ein Glas Wasser holen. Dein Rücken sagt Danke.',
  },
  {
    id: 'dehnen',
    emoji: '🧘',
    category: 'alltag',
    title: '5 Minuten Dehnen',
    text: 'Abends ein paar ruhige Dehnübungen lösen Verspannungen und helfen beim Runterkommen.',
    routine: 'dehnen',
  },
  {
    id: 'who-150',
    emoji: '🏃',
    category: 'alltag',
    title: '150 Minuten pro Woche',
    text: 'Die WHO empfiehlt mindestens 150 Minuten moderate Bewegung pro Woche plus zweimal Kräftigung. Mit euren Arta-Einheiten seid ihr da schnell dabei!',
  },
  {
    id: 'zahnseide',
    emoji: '🦷',
    category: 'alltag',
    title: 'Zahnseide am Abend',
    text: 'Die Zahnbürste erreicht die Zwischenräume nicht. Einmal am Tag Zahnseide oder Interdentalbürstchen – gesundes Zahnfleisch tut dem ganzen Körper gut.',
    routine: 'zahnseide',
  },
  {
    id: 'sonnenschutz',
    emoji: '🧴',
    category: 'alltag',
    title: 'Sonnenschutz im Alltag',
    text: 'Gesicht und Nacken mit LSF 30+ eincremen und mittags Schatten suchen. Für Vitamin D reichen im Sommer schon ein paar Minuten Sonne auf Gesicht und Armen.',
    months: SUMMER,
  },

  // ───── Essen & Darm ─────
  {
    id: 'fuenf-am-tag',
    emoji: '🥕',
    category: 'essen',
    title: '5 am Tag',
    text: '3 Portionen Gemüse und 2 Portionen Obst – eine Portion ist ungefähr eine Handvoll. Je bunter, desto mehr Vitamine.',
    routine: 'obst',
  },
  {
    id: 'ballaststoffe',
    emoji: '🌾',
    category: 'essen',
    title: 'Ballaststoffe für den Darm',
    text: 'Vollkorn, Haferflocken, Hülsenfrüchte und Gemüse füttern die guten Darmbakterien und halten lange satt. Ziel: etwa 30 g am Tag.',
  },
  {
    id: 'fermentiert',
    emoji: '🥬',
    category: 'essen',
    title: 'Fermentiertes',
    text: 'Joghurt, Kefir, Sauerkraut oder Kimchi bringen Abwechslung in die Darmflora – schon kleine Portionen zählen.',
  },
  {
    id: 'nuesse',
    emoji: '🥜',
    category: 'essen',
    title: 'Eine Handvoll Nüsse',
    text: 'Etwa 25 g Nüsse am Tag liefern gute Fette, Magnesium und Eiweiß – der perfekte Snack statt Süßem.',
  },
  {
    id: 'langsam-essen',
    emoji: '🐢',
    category: 'essen',
    title: 'Langsam essen',
    text: 'Das Sättigungsgefühl kommt erst nach etwa 15–20 Minuten. Wer langsam isst und gut kaut, isst ganz automatisch weniger.',
  },
  {
    id: 'eiweiss',
    emoji: '🥚',
    category: 'essen',
    title: 'Eiweiß zu jeder Mahlzeit',
    text: 'Eier, Quark, Hülsenfrüchte, Fisch oder Tofu halten lange satt und helfen deinen Muskeln nach dem Training.',
  },
  {
    id: 'verdauungsspaziergang',
    emoji: '🚶',
    category: 'essen',
    title: 'Verdauungsspaziergang',
    text: '10–15 Minuten gemütlich gehen nach dem Essen tun dem Blutzucker gut – und ihr habt Zeit zum Quatschen.',
  },

  // ───── Kopf & Seele ─────
  {
    id: 'atmung',
    emoji: '🌬️',
    category: 'seele',
    title: '4-7-8-Atmung',
    text: '4 Sekunden einatmen, 7 Sekunden halten, 8 Sekunden ausatmen – vier Runden. Beruhigt bei Stress und hilft beim Einschlafen.',
  },
  {
    id: 'drei-dinge',
    emoji: '🙏',
    category: 'seele',
    title: 'Drei schöne Dinge',
    text: 'Erzählt euch abends drei Dinge, die heute schön waren. Das richtet den Blick aufs Gute – und verbindet.',
  },
  {
    id: 'gruen',
    emoji: '🌳',
    category: 'seele',
    title: 'Ab ins Grüne',
    text: '20 Minuten im Park oder Wald können das Stresslevel spürbar senken. Perfekt für einen Spaziergang zu zweit.',
  },
  {
    id: 'pausen',
    emoji: '🪟',
    category: 'seele',
    title: 'Echte Pausen',
    text: 'Kurze Pausen ohne Handy laden den Akku besser auf als Durcharbeiten: Fenster auf, durchatmen, kurz bewegen.',
  },
  {
    id: 'lachen',
    emoji: '😂',
    category: 'seele',
    title: 'Lachen tut gut',
    text: 'Gemeinsam lachen entspannt und verbindet. Wie wär’s heute mit einer Runde in den Arta-Spielen? 🎮',
  },

  // ───── Zu zweit ─────
  {
    id: 'umarmung',
    emoji: '🤗',
    category: 'zusammen',
    title: 'Lange Umarmung',
    text: 'Umarmt euch heute mal 20 Sekunden lang. Fühlt sich nicht nur schön an – Nähe und Berührung helfen auch, Stress abzubauen.',
  },
  {
    id: 'zusammen-kochen',
    emoji: '🧑‍🍳',
    category: 'zusammen',
    title: 'Zusammen kochen',
    text: 'Wer selbst kocht, weiß, was drin ist – und es ist Zeit zu zweit. Sucht euch im Essen-Tab ein Rezept für heute Abend aus.',
  },
  {
    id: 'checkup',
    emoji: '🩺',
    category: 'zusammen',
    title: 'Check-up nicht vergessen',
    text: 'Die Krankenkasse zahlt zwischen 18 und 34 einmal einen Gesundheits-Check-up, ab 35 alle drei Jahre. Macht die Termine doch zusammen aus!',
  },
  {
    id: 'zahnarzt',
    emoji: '🪥',
    category: 'zusammen',
    title: 'Zahnarzt-Kontrolle',
    text: 'Einmal im Jahr zur Kontrolle (das zählt fürs Bonusheft), dazu gern eine professionelle Zahnreinigung. Gleich zusammen einen Termin ausmachen?',
  },
  {
    id: 'kinderwunsch-beide',
    emoji: '💞',
    category: 'zusammen',
    title: 'Kinderwunsch: Ihr seid beide gefragt',
    text: 'Auch für Männer lohnt sich ein gesunder Lebensstil: nicht rauchen, wenig Alkohol, genug Bewegung, Laptop nicht auf dem Schoß. Die Spermienqualität profitiert schon nach etwa drei Monaten.',
  },
  {
    id: 'alkoholfrei',
    emoji: '🍹',
    category: 'zusammen',
    title: 'Alkoholfreie Tage',
    text: 'Alkoholfreie Tage tun Schlaf, Haut und Figur gut. Wie wär’s mit einem bunten Mocktail für euch zwei?',
  },
];

export const TIP_BY_ID: Record<string, HealthTip> = Object.fromEntries(HEALTH_TIPS.map((t) => [t.id, t]));

/** Vorlagen für tägliche Routinen – mit einem Antippen übernommen, danach frei änderbar. */
export interface RoutinePreset {
  id: string;
  emoji: string;
  name: string;
  /** Vorschlag für die Uhrzeit (HH:MM). */
  time: string;
  hint: string;
}

export const ROUTINE_PRESETS: RoutinePreset[] = [
  { id: 'vitamin-d', emoji: '☀️', name: 'Vitamin D', time: '08:00', hint: 'Zum Frühstück mit etwas Fett. Dosis am besten nach Blutwert mit Arzt oder Apotheke absprechen.' },
  { id: 'vitamine', emoji: '💊', name: 'Vitamine', time: '08:00', hint: 'Deine täglichen Vitamine – am besten zu einer Mahlzeit.' },
  { id: 'folsaeure', emoji: '🌱', name: 'Folsäure', time: '08:00', hint: 'Bei Kinderwunsch: 400 µg am Tag, idealerweise ab 4 Wochen vor der Schwangerschaft.' },
  { id: 'wasser', emoji: '💧', name: 'Glas Wasser am Morgen', time: '07:00', hint: 'Direkt nach dem Aufstehen – noch vor dem Kaffee.' },
  { id: 'ingwer', emoji: '🫚', name: 'Ingwer-Tee', time: '10:00', hint: 'Frischer Ingwer, heißes Wasser, Zitrone und Honig.' },
  { id: 'omega3', emoji: '🐟', name: 'Omega-3', time: '13:00', hint: 'Zum Mittagessen – mit Fett wird es besser aufgenommen.' },
  { id: 'tageslicht', emoji: '🌤️', name: '15 Min. Tageslicht', time: '12:30', hint: 'Kurz raus in der Mittagspause – gut für Laune und innere Uhr.' },
  { id: 'obst', emoji: '🥕', name: '5 Portionen Obst & Gemüse', time: '18:00', hint: '3× Gemüse, 2× Obst – eine Portion ist eine Handvoll.' },
  { id: 'dehnen', emoji: '🧘', name: '5 Min. Dehnen', time: '20:00', hint: 'Ein paar ruhige Dehnübungen zum Runterkommen.' },
  { id: 'schwarzkuemmel', emoji: '🌿', name: 'Schwarzkümmelöl', time: '21:00', hint: '1 Teelöffel, gern mit Honig oder in Joghurt. In der Schwangerschaft und mit Medikamenten vorher ärztlich abklären.' },
  { id: 'magnesium', emoji: '🌙', name: 'Magnesium', time: '21:00', hint: 'Gern abends – mehr als 250 mg extra am Tag nur nach Rücksprache.' },
  { id: 'zahnseide', emoji: '🦷', name: 'Zahnseide', time: '22:00', hint: 'Einmal am Tag die Zwischenräume – dein Zahnfleisch dankt es dir.' },
  { id: 'handyfrei', emoji: '📵', name: 'Handy weg vorm Schlafen', time: '22:30', hint: '30 Minuten vor dem Einschlafen: kuscheln, lesen oder reden statt scrollen.' },
];

export const PRESET_BY_ID: Record<string, RoutinePreset> = Object.fromEntries(ROUTINE_PRESETS.map((p) => [p.id, p]));

export const ROUTINE_EMOJIS = ['💊', '☀️', '🌿', '🌱', '💧', '🐟', '🌙', '🫚', '🍋', '🥕', '🍎', '🧘', '🦷', '📵', '🌤️', '🫖', '🥛', '🧴', '😴', '🩺'];

export const HEALTH_DISCLAIMER =
  'Arta gibt allgemeine Gesundheitstipps und ersetzt keine ärztliche Beratung. Sprecht Nahrungsergänzung und Hausmittel – besonders bei Kinderwunsch, in der Schwangerschaft oder wenn ihr Medikamente nehmt – mit eurer Ärztin, eurem Arzt oder der Apotheke ab.';

// Texte dürfen {me} und {partner} enthalten, {routine} wird durch Emoji + Name ersetzt.

/** Einblendung, wenn die Uhrzeit einer Routine erreicht ist. */
export const ROUTINE_REMINDERS = [
  'Zeit für {routine}! Du tust dir gerade was Gutes. 💚',
  '{routine} wartet auf dich – kleiner Schritt, große Wirkung. 🌿',
  'Psst, {me}: {routine} nicht vergessen. {partner} möchte, dass es dir gut geht. 💞',
  'Erinnerung mit Liebe: {routine} 💚',
];

/** Alle Routinen eines Tages abgehakt. */
export const ROUTINES_ALL_DONE = [
  'Alles abgehakt – du kümmerst dich so gut um dich! 🌿',
  'Gesund-Routine komplett! {partner} wäre stolz auf dich. 💚',
  'Heute alles für deine Gesundheit getan. Du bist großartig! ✨',
  'Komplett! Dein Körper sagt Danke. 💪💚',
];

/** Liebevolle Erinnerung an den Schatz (wird als Anfeuerung verschickt). */
export const ROUTINE_NUDGES = [
  'Kleine Erinnerung mit Liebe: {routine} 💚',
  '{routine} nicht vergessen – ich hab dich lieb! 💞',
  'Psst … {routine} wartet noch auf dich. 😘',
  'Ich pass auf dich auf: {routine} 🌿💕',
];
