import type { ShopCategory } from '../lib/types';

export type Unit = 'g' | 'ml' | 'Stück' | 'EL' | 'TL' | 'Zehe' | 'Scheibe' | 'Handvoll';

export interface Ingredient {
  name: string;
  category: ShopCategory;
  /** Nährwerte pro 100 g bzw. 100 ml (gerundete Durchschnittswerte). */
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Gramm pro Einheit, wenn nicht in g/ml angegeben. */
  units?: Partial<Record<Unit, number>>;
  /** Grundzutaten, die meist im Haus sind – landen nicht automatisch auf der Einkaufsliste. */
  pantry?: boolean;
}

export const INGREDIENTS = {
  haferflocken: { name: 'Haferflocken', category: 'vorrat', kcal: 370, protein: 13.5, carbs: 58.7, fat: 7, units: { EL: 10 } },
  joghurt: { name: 'Naturjoghurt (1,5 %)', category: 'kuehl', kcal: 49, protein: 3.9, carbs: 4.7, fat: 1.5, units: { EL: 15 } },
  griechJoghurt: { name: 'Griechischer Joghurt (2 %)', category: 'kuehl', kcal: 73, protein: 9.5, carbs: 4, fat: 2 },
  skyr: { name: 'Skyr', category: 'kuehl', kcal: 63, protein: 11, carbs: 4, fat: 0.2 },
  magerquark: { name: 'Magerquark', category: 'kuehl', kcal: 67, protein: 12, carbs: 4, fat: 0.3 },
  milch: { name: 'Milch (1,5 %)', category: 'kuehl', kcal: 47, protein: 3.4, carbs: 4.9, fat: 1.5 },
  haferdrink: { name: 'Haferdrink', category: 'getraenke', kcal: 46, protein: 1, carbs: 6.7, fat: 1.5 },
  feta: { name: 'Feta', category: 'kuehl', kcal: 265, protein: 16.5, carbs: 0.5, fat: 21.5 },
  mozzarellaLight: { name: 'Mozzarella light', category: 'kuehl', kcal: 160, protein: 18, carbs: 1, fat: 9.5 },
  parmesan: { name: 'Parmesan', category: 'kuehl', kcal: 390, protein: 35, carbs: 0, fat: 28, units: { EL: 5 } },
  hummus: { name: 'Hummus', category: 'kuehl', kcal: 255, protein: 7.5, carbs: 10, fat: 20, units: { EL: 20 } },
  tofu: { name: 'Tofu natur', category: 'kuehl', kcal: 125, protein: 13, carbs: 1.5, fat: 7.5 },
  ei: { name: 'Eier', category: 'kuehl', kcal: 143, protein: 12.6, carbs: 0.7, fat: 9.5, units: { Stück: 58 } },

  haehnchen: { name: 'Hähnchenbrust', category: 'fleisch', kcal: 108, protein: 23.5, carbs: 0, fat: 1.2 },
  lachs: { name: 'Lachsfilet', category: 'fleisch', kcal: 200, protein: 20, carbs: 0, fat: 13.4 },
  garnelen: { name: 'Garnelen', category: 'fleisch', kcal: 85, protein: 19, carbs: 0.5, fat: 0.8 },
  rinderhack: { name: 'Rinderhack (mager)', category: 'fleisch', kcal: 130, protein: 21, carbs: 0, fat: 5 },

  vollkornbrot: { name: 'Vollkornbrot', category: 'brot', kcal: 215, protein: 7.5, carbs: 38, fat: 1.8, units: { Scheibe: 50 } },
  wrap: { name: 'Vollkorn-Wraps', category: 'brot', kcal: 300, protein: 9, carbs: 47, fat: 7.5, units: { Stück: 62 } },

  banane: { name: 'Bananen', category: 'obst', kcal: 89, protein: 1.1, carbs: 20, fat: 0.3, units: { Stück: 120 } },
  apfel: { name: 'Äpfel', category: 'obst', kcal: 52, protein: 0.3, carbs: 11.4, fat: 0.2, units: { Stück: 150 } },
  beeren: { name: 'Beeren (frisch oder TK)', category: 'obst', kcal: 45, protein: 1, carbs: 8.5, fat: 0.4, units: { Handvoll: 80 } },
  zitrone: { name: 'Zitronen', category: 'obst', kcal: 30, protein: 0.4, carbs: 7, fat: 0.2, units: { Stück: 60 } },
  avocado: { name: 'Avocados', category: 'obst', kcal: 160, protein: 2, carbs: 1.8, fat: 14.7, units: { Stück: 140 } },
  spinat: { name: 'Babyspinat', category: 'obst', kcal: 23, protein: 2.9, carbs: 1.4, fat: 0.4, units: { Handvoll: 30 } },
  tomate: { name: 'Tomaten', category: 'obst', kcal: 18, protein: 0.9, carbs: 2.6, fat: 0.2, units: { Stück: 100 } },
  cherrytomaten: { name: 'Cherrytomaten', category: 'obst', kcal: 18, protein: 0.9, carbs: 2.6, fat: 0.2 },
  gurke: { name: 'Salatgurke', category: 'obst', kcal: 13, protein: 0.6, carbs: 2, fat: 0.1 },
  paprika: { name: 'Paprika', category: 'obst', kcal: 31, protein: 1, carbs: 6, fat: 0.3, units: { Stück: 150 } },
  zucchini: { name: 'Zucchini', category: 'obst', kcal: 17, protein: 1.2, carbs: 2.2, fat: 0.3, units: { Stück: 250 } },
  brokkoli: { name: 'Brokkoli', category: 'obst', kcal: 34, protein: 2.8, carbs: 4, fat: 0.4 },
  karotte: { name: 'Karotten', category: 'obst', kcal: 41, protein: 0.9, carbs: 7, fat: 0.2, units: { Stück: 80 } },
  zwiebel: { name: 'Zwiebeln', category: 'obst', kcal: 40, protein: 1.1, carbs: 7.6, fat: 0.1, units: { Stück: 100 } },
  roteZwiebel: { name: 'Rote Zwiebeln', category: 'obst', kcal: 40, protein: 1.1, carbs: 7.6, fat: 0.1, units: { Stück: 100 } },
  fruehlingszwiebel: { name: 'Frühlingszwiebeln', category: 'obst', kcal: 32, protein: 1.8, carbs: 4.7, fat: 0.2, units: { Stück: 15 } },
  knoblauch: { name: 'Knoblauch', category: 'obst', kcal: 149, protein: 6.4, carbs: 31, fat: 0.5, units: { Zehe: 4 } },
  ingwer: { name: 'Ingwer', category: 'obst', kcal: 80, protein: 1.8, carbs: 15, fat: 0.8 },
  kraeuter: { name: 'Frische Kräuter', category: 'obst', kcal: 40, protein: 3, carbs: 4, fat: 0.7, units: { Handvoll: 10 } },
  rucola: { name: 'Rucola', category: 'obst', kcal: 25, protein: 2.6, carbs: 2, fat: 0.7, units: { Handvoll: 20 } },
  salat: { name: 'Blattsalat', category: 'obst', kcal: 17, protein: 1.2, carbs: 1.7, fat: 0.3, units: { Handvoll: 30 } },
  champignons: { name: 'Champignons', category: 'obst', kcal: 22, protein: 3.1, carbs: 2.3, fat: 0.3 },
  suesskartoffel: { name: 'Süßkartoffeln', category: 'obst', kcal: 86, protein: 1.6, carbs: 17, fat: 0.1 },
  kartoffeln: { name: 'Kartoffeln', category: 'obst', kcal: 77, protein: 2, carbs: 15.6, fat: 0.1 },

  quinoa: { name: 'Quinoa', category: 'vorrat', kcal: 368, protein: 14, carbs: 57, fat: 6 },
  reis: { name: 'Basmatireis', category: 'vorrat', kcal: 352, protein: 7.5, carbs: 78, fat: 0.6 },
  vollkornreis: { name: 'Vollkornreis', category: 'vorrat', kcal: 350, protein: 7.5, carbs: 72, fat: 2.7 },
  vollkornnudeln: { name: 'Vollkornnudeln', category: 'vorrat', kcal: 350, protein: 13, carbs: 64, fat: 2.5 },
  couscous: { name: 'Couscous', category: 'vorrat', kcal: 360, protein: 12, carbs: 72, fat: 1.5 },
  roteLinsen: { name: 'Rote Linsen', category: 'vorrat', kcal: 340, protein: 24, carbs: 51, fat: 1.8 },
  linsenGekocht: { name: 'Linsen (Dose/vorgegart)', category: 'vorrat', kcal: 110, protein: 9, carbs: 14, fat: 0.5 },
  kichererbsen: { name: 'Kichererbsen (Dose)', category: 'vorrat', kcal: 125, protein: 7.2, carbs: 16, fat: 2.6 },
  kidneybohnen: { name: 'Kidneybohnen (Dose)', category: 'vorrat', kcal: 100, protein: 7, carbs: 13, fat: 0.6 },
  weisseBohnen: { name: 'Weiße Bohnen (Dose)', category: 'vorrat', kcal: 100, protein: 6.8, carbs: 13, fat: 0.5 },
  mais: { name: 'Mais (Dose)', category: 'vorrat', kcal: 80, protein: 2.8, carbs: 14, fat: 1.2 },
  thunfisch: { name: 'Thunfisch (Dose, natur)', category: 'vorrat', kcal: 110, protein: 25, carbs: 0, fat: 1 },
  passierteTomaten: { name: 'Passierte Tomaten', category: 'vorrat', kcal: 30, protein: 1.4, carbs: 4.5, fat: 0.2 },
  gehackteTomaten: { name: 'Gehackte Tomaten (Dose)', category: 'vorrat', kcal: 22, protein: 1.2, carbs: 3.3, fat: 0.2 },
  kokosmilch: { name: 'Kokosmilch (light)', category: 'vorrat', kcal: 80, protein: 1, carbs: 2.5, fat: 7.5 },
  chia: { name: 'Chiasamen', category: 'vorrat', kcal: 486, protein: 16.5, carbs: 7.7, fat: 30.7, units: { EL: 10 } },
  mandeln: { name: 'Mandeln', category: 'vorrat', kcal: 580, protein: 21, carbs: 8, fat: 50, units: { Handvoll: 25 } },
  walnuesse: { name: 'Walnüsse', category: 'vorrat', kcal: 654, protein: 15, carbs: 7, fat: 65, units: { Handvoll: 25 } },
  erdnussbutter: { name: 'Erdnussmus', category: 'vorrat', kcal: 600, protein: 25, carbs: 12, fat: 50, units: { EL: 15, TL: 5 } },
  honig: { name: 'Honig', category: 'vorrat', kcal: 304, protein: 0.3, carbs: 82, fat: 0, units: { TL: 7, EL: 20 } },
  datteln: { name: 'Datteln (getrocknet)', category: 'vorrat', kcal: 282, protein: 2.5, carbs: 66, fat: 0.4, units: { Stück: 8 } },
  kakao: { name: 'Backkakao', category: 'vorrat', kcal: 350, protein: 20, carbs: 11, fat: 21, units: { TL: 5, EL: 10 } },
  kokosraspeln: { name: 'Kokosraspeln', category: 'vorrat', kcal: 660, protein: 6.5, carbs: 6.5, fat: 63, units: { EL: 5 } },
  popcornmais: { name: 'Popcornmais', category: 'vorrat', kcal: 375, protein: 11, carbs: 64, fat: 4.5 },
  sojasauce: { name: 'Sojasauce', category: 'vorrat', kcal: 60, protein: 8, carbs: 6, fat: 0.1, units: { EL: 15 } },
  edamame: { name: 'Edamame (TK)', category: 'tk', kcal: 121, protein: 11.9, carbs: 4, fat: 5.2 },

  olivenoel: { name: 'Olivenöl', category: 'vorrat', kcal: 884, protein: 0, carbs: 0, fat: 100, units: { EL: 10, TL: 4.5 }, pantry: true },
  rapsoel: { name: 'Rapsöl', category: 'vorrat', kcal: 884, protein: 0, carbs: 0, fat: 100, units: { EL: 10, TL: 4.5 }, pantry: true },
  gemuesebruehe: { name: 'Gemüsebrühe', category: 'vorrat', kcal: 3, protein: 0.1, carbs: 0.4, fat: 0.1, pantry: true },
  gewuerze: { name: 'Salz, Pfeffer & Gewürze', category: 'vorrat', kcal: 0, protein: 0, carbs: 0, fat: 0, units: { TL: 2 }, pantry: true },
  zimt: { name: 'Zimt', category: 'vorrat', kcal: 0, protein: 0, carbs: 0, fat: 0, units: { TL: 2 }, pantry: true },
  curry: { name: 'Currypulver', category: 'vorrat', kcal: 0, protein: 0, carbs: 0, fat: 0, units: { TL: 2 }, pantry: true },
} satisfies Record<string, Ingredient>;

export type IngredientKey = keyof typeof INGREDIENTS;

export const INGREDIENT_DB: Record<IngredientKey, Ingredient> = INGREDIENTS;
