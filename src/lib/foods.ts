import { FOOD_BY_ID, FOODS, type Food, type FoodGroup } from '../data/foods';
import { fold } from './cookbook';
import type { Nutrition } from './nutrition';
import type { MealEntry, PersonId } from './types';

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Nährwerte für eine Menge in g bzw. ml. */
export function foodNutrition(food: Food, grams: number): Nutrition {
  const f = grams / 100;
  return { kcal: Math.round(food.kcal * f), protein: round1(food.protein * f), carbs: round1(food.carbs * f), fat: round1(food.fat * f) };
}

/** Die Menge, die man meist auf einmal isst – damit startet ein Lebensmittel auf dem Teller. */
export function defaultGrams(food: Food): number {
  return food.portion[1] * (food.count ?? 1);
}

const SEARCH_TEXT = new Map(
  FOODS.map((f) => {
    const name = fold(f.name);
    return [f.id, { name, words: name.split(/[^a-z0-9]+/), all: fold(`${f.name} ${f.alias ?? ''}`) }];
  }),
);

/**
 * Sucht Lebensmittel über Name und Suchbegriffe (Umlaute egal). Genaue Treffer und Wortanfänge
 * im Namen kommen zuerst, damit „Reis“ nicht hinter „Reiswaffeln“ oder „Milchreis“ landet.
 */
export function searchFoods(query: string, group: FoodGroup | 'alle' = 'alle'): Food[] {
  const pool = group === 'alle' ? FOODS : FOODS.filter((f) => f.group === group);
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return pool;
  const scored: { food: Food; score: number }[] = [];
  for (const food of pool) {
    const text = SEARCH_TEXT.get(food.id)!;
    if (!words.every((w) => text.all.includes(w))) continue;
    const first = words[0];
    const score =
      text.words[0] === first ? 0 : text.name.startsWith(first) ? 1 : text.words.some((w) => w.startsWith(first)) ? 2 : text.name.includes(first) ? 3 : 4;
    scored.push({ food, score });
  }
  return scored.sort((a, b) => a.score - b.score).map((s) => s.food);
}

const PLURAL: Record<string, string> = {
  Scheibe: 'Scheiben',
  Portion: 'Portionen',
  Tasse: 'Tassen',
  Kugel: 'Kugeln',
  Dose: 'Dosen',
  Flasche: 'Flaschen',
  Glas: 'Gläser',
  Hälfte: 'Hälften',
  Schale: 'Schalen',
  Schüssel: 'Schüsseln',
  Zehe: 'Zehen',
  Rippe: 'Rippen',
  Stange: 'Stangen',
  Tüte: 'Tüten',
  Box: 'Boxen',
  Pizza: 'Pizzen',
  Keks: 'Kekse',
  Spieß: 'Spieße',
  Shot: 'Shots',
};

const FRACTIONS = ['', '¼', '½', '¾'];

/** 1,5 → „1½“, 0,25 → „¼“, krumme Werte mit einer Nachkommastelle. */
export function formatCount(count: number): string {
  const quarters = Math.round(count * 4);
  if (Math.abs(count * 4 - quarters) > 0.01) return count.toLocaleString('de-DE', { maximumFractionDigits: 1 });
  const whole = Math.floor(quarters / 4);
  const frac = FRACTIONS[quarters % 4];
  return whole === 0 ? frac || '0' : `${whole}${frac}`;
}

export function unitLabel(unit: string, count: number): string {
  return count > 1 ? (PLURAL[unit] ?? unit) : unit;
}

export function gramLabel(food: Food, grams: number): string {
  return `${Math.round(grams)} ${food.ml ? 'ml' : 'g'}`;
}

/** „2 Scheiben“, wenn die Menge in halben Einheiten aufgeht, sonst „180 g“. */
export function amountLabel(food: Food, grams: number): string {
  const [unit, per] = food.portion;
  const count = grams / per;
  if (unit === 'Portion' || Math.abs(count * 2 - Math.round(count * 2)) > 0.01) return gramLabel(food, grams);
  return `${formatCount(count)} ${unitLabel(unit, count)}`;
}

/** So heißt der Eintrag im Tagebuch, z. B. „Banane (2 Stück)“. */
export function entryName(food: Food, grams: number): string {
  return `${food.name} (${amountLabel(food, grams)})`;
}

/** Plus/Minus in halben Einheiten bis 2, danach in ganzen – nie unter ½. */
export function stepGrams(food: Food, grams: number, dir: 1 | -1): number {
  const per = food.portion[1];
  const count = grams / per;
  let next: number;
  if (dir > 0) {
    const step = count < 2 - 1e-9 ? 0.5 : 1;
    next = Math.floor(count / step + 1e-9) * step + step;
  } else {
    const step = count <= 2 + 1e-9 ? 0.5 : 1;
    next = Math.max(0.5, Math.ceil(count / step - 1e-9) * step - step);
  }
  return Math.round(next * per * 10) / 10;
}

/** Zuletzt eingetragene Lebensmittel einer Person, jeweils mit der zuletzt gewählten Menge. */
export function recentFoods(meals: Record<string, MealEntry>, personId: PersonId, limit = 8): { food: Food; grams: number }[] {
  const list = Object.values(meals)
    .filter((m) => !m.deleted && m.personId === personId && m.foodId && FOOD_BY_ID[m.foodId])
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const seen = new Set<string>();
  const out: { food: Food; grams: number }[] = [];
  for (const m of list) {
    if (seen.has(m.foodId!)) continue;
    seen.add(m.foodId!);
    const food = FOOD_BY_ID[m.foodId!];
    out.push({ food, grams: m.grams ?? defaultGrams(food) });
    if (out.length >= limit) break;
  }
  return out;
}
