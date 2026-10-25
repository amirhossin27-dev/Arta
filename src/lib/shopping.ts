import type { ShopCategory } from './types';
import { INGREDIENT_DB } from '../data/ingredients';
import type { Recipe } from '../data/recipes';

export const SHOP_CATEGORIES: { id: ShopCategory; label: string; emoji: string }[] = [
  { id: 'obst', label: 'Obst & Gemüse', emoji: '🥦' },
  { id: 'kuehl', label: 'Kühlregal', emoji: '🧀' },
  { id: 'fleisch', label: 'Fleisch & Fisch', emoji: '🐟' },
  { id: 'brot', label: 'Brot & Backwaren', emoji: '🥖' },
  { id: 'vorrat', label: 'Vorrat & Konserven', emoji: '🥫' },
  { id: 'tk', label: 'Tiefkühl', emoji: '🧊' },
  { id: 'getraenke', label: 'Getränke', emoji: '🧃' },
  { id: 'drogerie', label: 'Drogerie & Haushalt', emoji: '🧴' },
  { id: 'sonstiges', label: 'Sonstiges', emoji: '🛍️' },
];

// Reihenfolge ist wichtig: spezifische Begriffe zuerst. „=“ = ganzes Wort, „^“ = Wortanfang.
const KEYWORDS: [ShopCategory, string[]][] = [
  ['tk', ['tiefkühl', '=tk', '=eis', 'eiscreme', 'pommes', 'edamame', 'tk-']],
  ['drogerie', ['shampoo', 'zahnpasta', 'zahnbürste', 'duschgel', 'toilettenpapier', 'klopapier', 'spülmittel', 'waschmittel', 'seife', '=deo', 'taschentücher', 'müllbeutel', 'creme', 'küchenrolle', 'schwamm', 'spüli', 'tabs', 'rasier', 'pflaster', 'sonnencreme']],
  ['getraenke', ['wasser', 'saft', '=cola', 'bier', 'wein', 'sprudel', 'limo', 'drink', 'schorle', 'kaffeebohnen', 'eistee', 'sekt']],
  ['fleisch', ['hähnchen', 'huhn', 'pute', 'rind', '^hack', 'lachs', 'fisch', 'garnelen', 'wurst', 'schinken', 'steak', 'filet', 'salami', 'speck', 'forelle']],
  ['kuehl', ['milch', 'joghurt', 'quark', 'skyr', 'käse', 'feta', 'mozzarella', 'butter', 'sahne', '=ei', '=eier', 'frischkäse', 'tofu', 'hummus', 'parmesan', 'kefir', 'buttermilch', 'halloumi', 'schmand']],
  ['brot', ['brot', 'brötchen', 'toast', '^wrap', 'tortilla', 'croissant', 'brezel', 'baguette', 'semmel', 'knäckebrot', 'fladen']],
  ['vorrat', ['nudeln', 'pasta', 'spaghetti', '^reis', 'vollkornreis', 'basmati', 'quinoa', 'couscous', 'linsen', 'bohnen', 'kichererbsen', 'mehl', 'zucker', '^öl', 'olivenöl', 'rapsöl', 'essig', 'haferflocken', 'müsli', 'dose', 'passiert', 'gehackte tomaten', 'tomatenmark', 'honig', 'nüsse', 'nuss', 'mandeln', 'gewürz', '=salz', 'pfeffer', 'kaffee', '=tee', 'schokolade', 'kakao', '=mais', 'kokosmilch', 'soja', 'datteln', 'chia', 'brühe', 'erdnuss', 'marmelade', 'senf', 'ketchup', 'popcorn', 'thunfisch', 'riegel', 'chips']],
  ['obst', ['apfel', 'äpfel', 'banane', 'tomate', 'gurke', 'salat', 'paprika', 'zwiebel', 'kartoffel', 'möhre', 'karotte', 'beere', 'zitrone', 'limette', 'avocado', 'spinat', 'brokkoli', 'zucchini', 'kräuter', 'petersilie', 'basilikum', 'minze', 'knoblauch', 'ingwer', '^pilz', 'champignon', 'obst', 'gemüse', 'orange', 'traube', 'mango', 'kiwi', 'birne', 'rucola', 'lauch', 'sellerie', 'kohl', 'aubergine', 'melone', 'ananas', 'pflaume', 'kirsche', 'erdbeere']],
];

export function guessCategory(name: string): ShopCategory {
  const lower = name.toLowerCase();
  const words = lower.split(/[\s,.()/-]+/).filter(Boolean);
  for (const [cat, keys] of KEYWORDS) {
    for (const k of keys) {
      if (k.startsWith('=')) {
        if (words.includes(k.slice(1))) return cat;
      } else if (k.startsWith('^')) {
        if (words.some((w) => w.startsWith(k.slice(1)))) return cat;
      } else if (lower.includes(k)) {
        return cat;
      }
    }
  }
  return 'sonstiges';
}

const UNIT_ALIASES: Record<string, string> = {
  g: 'g',
  gr: 'g',
  gramm: 'g',
  kg: 'kg',
  ml: 'ml',
  l: 'l',
  liter: 'l',
  stk: 'Stück',
  stück: 'Stück',
  x: 'Stück',
  pck: 'Pck.',
  packung: 'Pck.',
  packungen: 'Pck.',
  dose: 'Dose',
  dosen: 'Dose',
  flasche: 'Flasche',
  flaschen: 'Flasche',
  bund: 'Bund',
  becher: 'Becher',
  glas: 'Glas',
  netz: 'Netz',
};

/** „500 g Hackfleisch“ → { qty: 500, unit: 'g', name: 'Hackfleisch' } */
export function parseShoppingInput(input: string): { name: string; qty?: number; unit?: string } {
  const text = input.trim().replace(/\s+/g, ' ');
  const withUnit = text.match(/^(\d+(?:[.,]\d+)?)\s*([a-zA-ZäöüÄÖÜ]+)\.?\s+(.+)$/);
  if (withUnit) {
    const unit = UNIT_ALIASES[withUnit[2].toLowerCase()];
    if (unit) return { name: capitalize(withUnit[3]), qty: toNumber(withUnit[1]), unit };
  }
  // Zahl ohne Einheit: „2 Avocados“
  const plain = text.match(/^(\d+(?:[.,]\d+)?)\s+(.+)$/);
  if (plain) return { name: capitalize(plain[2]), qty: toNumber(plain[1]), unit: 'Stück' };
  return { name: capitalize(text) };
}

function toNumber(s: string): number {
  return Number(s.replace(',', '.'));
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatShopQty(qty?: number, unit?: string): string {
  if (qty === undefined) return '';
  const n = Number.isInteger(qty) ? String(qty) : qty.toLocaleString('de-DE', { maximumFractionDigits: 2 });
  if (unit === 'g' && qty >= 1000) return `${(qty / 1000).toLocaleString('de-DE', { maximumFractionDigits: 2 })} kg`;
  if (unit === 'ml' && qty >= 1000) return `${(qty / 1000).toLocaleString('de-DE', { maximumFractionDigits: 2 })} l`;
  return unit ? `${n} ${unit}` : n;
}

/** Zutaten eines Rezepts als Einkaufsartikel – Grundzutaten wie Öl oder Salz bleiben weg. */
export function recipeToShopping(recipe: Recipe, portions: number) {
  return recipe.ingredients
    .filter((ing) => !INGREDIENT_DB[ing.key].pantry)
    .map((ing) => {
      const db = INGREDIENT_DB[ing.key];
      const total = ing.qty * portions;
      if (ing.unit === 'g' || ing.unit === 'ml') {
        const step = total >= 100 ? 10 : 5;
        return { name: db.name, qty: Math.ceil(total / step) * step, unit: ing.unit, category: db.category };
      }
      if (ing.unit === 'Stück') return { name: db.name, qty: Math.ceil(total), unit: 'Stück', category: db.category };
      // EL, TL, Zehe, Scheibe, Handvoll: man kauft eine Packung – ohne Mengenangabe.
      return { name: db.name, category: db.category };
    });
}
