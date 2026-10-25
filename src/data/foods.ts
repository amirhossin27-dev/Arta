export interface QuickFood {
  id: string;
  name: string;
  emoji: string;
  portion: string;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  group: 'Obst & Gemüse' | 'Frühstück & Brot' | 'Eiweiß & Milch' | 'Süßes & Snacks' | 'Getränke' | 'Unterwegs';
}

/** Ungefähre Durchschnittswerte pro Portion zum schnellen Eintragen. */
export const QUICK_FOODS: QuickFood[] = [
  { id: 'apfel', name: 'Apfel', emoji: '🍎', portion: '1 Stück (150 g)', kcal: 78, protein: 0.5, carbs: 17, fat: 0.3, group: 'Obst & Gemüse' },
  { id: 'banane', name: 'Banane', emoji: '🍌', portion: '1 Stück (120 g)', kcal: 107, protein: 1.3, carbs: 24, fat: 0.4, group: 'Obst & Gemüse' },
  { id: 'orange', name: 'Orange', emoji: '🍊', portion: '1 Stück (150 g)', kcal: 70, protein: 1.4, carbs: 14, fat: 0.2, group: 'Obst & Gemüse' },
  { id: 'beeren', name: 'Beeren', emoji: '🍓', portion: '1 Schale (150 g)', kcal: 60, protein: 1.2, carbs: 12, fat: 0.5, group: 'Obst & Gemüse' },
  { id: 'trauben', name: 'Weintrauben', emoji: '🍇', portion: '1 Handvoll (100 g)', kcal: 70, protein: 0.7, carbs: 16, fat: 0.2, group: 'Obst & Gemüse' },
  { id: 'rohkost', name: 'Gemüsesticks', emoji: '🥕', portion: '1 Schale (150 g)', kcal: 45, protein: 1.5, carbs: 8, fat: 0.3, group: 'Obst & Gemüse' },
  { id: 'salat-beilage', name: 'Beilagensalat mit Dressing', emoji: '🥗', portion: '1 Schale', kcal: 120, protein: 2, carbs: 6, fat: 9, group: 'Obst & Gemüse' },

  { id: 'vollkornbrot', name: 'Vollkornbrot', emoji: '🍞', portion: '1 Scheibe (50 g)', kcal: 108, protein: 3.8, carbs: 19, fat: 0.9, group: 'Frühstück & Brot' },
  { id: 'broetchen', name: 'Brötchen', emoji: '🥖', portion: '1 Stück (60 g)', kcal: 150, protein: 5, carbs: 30, fat: 1, group: 'Frühstück & Brot' },
  { id: 'butterbrot', name: 'Butterbrot mit Käse', emoji: '🧀', portion: '1 Scheibe', kcal: 230, protein: 10, carbs: 19, fat: 12, group: 'Frühstück & Brot' },
  { id: 'croissant', name: 'Croissant', emoji: '🥐', portion: '1 Stück (60 g)', kcal: 240, protein: 5, carbs: 26, fat: 13, group: 'Frühstück & Brot' },
  { id: 'muesli', name: 'Müsli mit Milch', emoji: '🥣', portion: '1 Schale', kcal: 300, protein: 11, carbs: 45, fat: 7, group: 'Frühstück & Brot' },
  { id: 'porridge', name: 'Porridge', emoji: '🥣', portion: '1 Schale', kcal: 280, protein: 10, carbs: 42, fat: 7, group: 'Frühstück & Brot' },

  { id: 'ei', name: 'Ei, gekocht', emoji: '🥚', portion: '1 Stück', kcal: 83, protein: 7.3, carbs: 0.4, fat: 5.5, group: 'Eiweiß & Milch' },
  { id: 'joghurt', name: 'Naturjoghurt', emoji: '🥛', portion: '150 g', kcal: 74, protein: 5.9, carbs: 7, fat: 2.3, group: 'Eiweiß & Milch' },
  { id: 'skyr', name: 'Skyr natur', emoji: '🥛', portion: '150 g', kcal: 95, protein: 16.5, carbs: 6, fat: 0.3, group: 'Eiweiß & Milch' },
  { id: 'kaese', name: 'Käse (Gouda)', emoji: '🧀', portion: '1 Scheibe (25 g)', kcal: 90, protein: 6, carbs: 0, fat: 7.5, group: 'Eiweiß & Milch' },
  { id: 'haehnchen', name: 'Hähnchenbrust, gebraten', emoji: '🍗', portion: '150 g', kcal: 240, protein: 45, carbs: 0, fat: 6, group: 'Eiweiß & Milch' },
  { id: 'nuesse', name: 'Nüsse', emoji: '🥜', portion: '1 Handvoll (25 g)', kcal: 155, protein: 5, carbs: 3, fat: 14, group: 'Eiweiß & Milch' },

  { id: 'schokolade', name: 'Schokolade', emoji: '🍫', portion: '2 Rippen (20 g)', kcal: 108, protein: 1.5, carbs: 11, fat: 6.5, group: 'Süßes & Snacks' },
  { id: 'muesliriegel', name: 'Müsliriegel', emoji: '🍪', portion: '1 Riegel (25 g)', kcal: 105, protein: 1.5, carbs: 16, fat: 3.5, group: 'Süßes & Snacks' },
  { id: 'kuchen', name: 'Stück Kuchen', emoji: '🍰', portion: '1 Stück', kcal: 300, protein: 4, carbs: 38, fat: 14, group: 'Süßes & Snacks' },
  { id: 'eis', name: 'Eis', emoji: '🍦', portion: '1 Kugel', kcal: 100, protein: 1.5, carbs: 13, fat: 4.5, group: 'Süßes & Snacks' },
  { id: 'chips', name: 'Chips', emoji: '🥔', portion: '1 Handvoll (30 g)', kcal: 160, protein: 2, carbs: 15, fat: 10, group: 'Süßes & Snacks' },
  { id: 'gummibaerchen', name: 'Gummibärchen', emoji: '🐻', portion: '1 Handvoll (30 g)', kcal: 100, protein: 2, carbs: 23, fat: 0, group: 'Süßes & Snacks' },
  { id: 'popcorn', name: 'Popcorn (Kino)', emoji: '🍿', portion: 'kleine Tüte', kcal: 250, protein: 3, carbs: 28, fat: 14, group: 'Süßes & Snacks' },

  { id: 'cappuccino', name: 'Cappuccino', emoji: '☕', portion: '1 Tasse', kcal: 90, protein: 5, carbs: 7, fat: 4.5, group: 'Getränke' },
  { id: 'latte', name: 'Latte Macchiato', emoji: '🥛', portion: '1 Glas', kcal: 130, protein: 7, carbs: 10, fat: 6.5, group: 'Getränke' },
  { id: 'osaft', name: 'Orangensaft', emoji: '🧃', portion: '1 Glas (200 ml)', kcal: 90, protein: 1.4, carbs: 18, fat: 0.2, group: 'Getränke' },
  { id: 'smoothie', name: 'Smoothie (gekauft)', emoji: '🥤', portion: '250 ml', kcal: 140, protein: 1.5, carbs: 31, fat: 0.5, group: 'Getränke' },
  { id: 'cola', name: 'Cola', emoji: '🥤', portion: '1 Dose (330 ml)', kcal: 139, protein: 0, carbs: 35, fat: 0, group: 'Getränke' },
  { id: 'bier', name: 'Bier', emoji: '🍺', portion: '0,5 l', kcal: 210, protein: 2.5, carbs: 15, fat: 0, group: 'Getränke' },
  { id: 'wein', name: 'Wein', emoji: '🍷', portion: '1 Glas (0,2 l)', kcal: 150, protein: 0.2, carbs: 5, fat: 0, group: 'Getränke' },

  { id: 'doener', name: 'Döner', emoji: '🥙', portion: '1 Stück', kcal: 650, protein: 32, carbs: 60, fat: 30, group: 'Unterwegs' },
  { id: 'pizza', name: 'Pizza Margherita', emoji: '🍕', portion: '1 ganze', kcal: 850, protein: 32, carbs: 105, fat: 30, group: 'Unterwegs' },
  { id: 'burger', name: 'Burger', emoji: '🍔', portion: '1 Stück', kcal: 600, protein: 30, carbs: 45, fat: 32, group: 'Unterwegs' },
  { id: 'pommes', name: 'Pommes', emoji: '🍟', portion: 'mittlere Portion', kcal: 340, protein: 4, carbs: 42, fat: 17, group: 'Unterwegs' },
  { id: 'sushi', name: 'Sushi', emoji: '🍣', portion: '8 Stück', kcal: 400, protein: 16, carbs: 70, fat: 6, group: 'Unterwegs' },
  { id: 'pasta-restaurant', name: 'Pasta (Restaurant)', emoji: '🍝', portion: '1 Teller', kcal: 700, protein: 22, carbs: 90, fat: 25, group: 'Unterwegs' },
  { id: 'currywurst', name: 'Currywurst', emoji: '🌭', portion: '1 Portion ohne Pommes', kcal: 450, protein: 16, carbs: 18, fat: 35, group: 'Unterwegs' },
];
