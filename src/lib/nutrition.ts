import { INGREDIENT_DB } from '../data/ingredients';
import type { Recipe, RecipeIngredient } from '../data/recipes';
import type { Exercise } from '../data/exercises';

export interface Nutrition {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

export const ZERO: Nutrition = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

export function ingredientGrams(ing: RecipeIngredient): number {
  if (ing.unit === 'g' || ing.unit === 'ml') return ing.qty;
  const per = INGREDIENT_DB[ing.key].units?.[ing.unit];
  if (per === undefined) throw new Error(`Einheit ${ing.unit} für ${ing.key} unbekannt`);
  return ing.qty * per;
}

const cache = new Map<string, Nutrition>();

/** Nährwerte einer Portion, berechnet aus der Zutatenliste. */
export function recipeNutrition(recipe: Recipe): Nutrition {
  const hit = cache.get(recipe.id);
  if (hit) return hit;
  const sum = { ...ZERO };
  for (const ing of recipe.ingredients) {
    const db = INGREDIENT_DB[ing.key];
    const factor = ingredientGrams(ing) / 100;
    sum.kcal += db.kcal * factor;
    sum.protein += db.protein * factor;
    sum.carbs += db.carbs * factor;
    sum.fat += db.fat * factor;
  }
  const result = {
    kcal: Math.round(sum.kcal / 5) * 5,
    protein: Math.round(sum.protein),
    carbs: Math.round(sum.carbs),
    fat: Math.round(sum.fat),
  };
  cache.set(recipe.id, result);
  return result;
}

export function addNutrition(a: Nutrition, b: Nutrition): Nutrition {
  return { kcal: a.kcal + b.kcal, protein: a.protein + b.protein, carbs: a.carbs + b.carbs, fat: a.fat + b.fat };
}

/** kcal = MET × 3,5 × kg / 200 × Minuten */
export function exerciseKcal(ex: Pick<Exercise, 'met' | 'minutes'>, weightKg: number): number {
  return Math.round(((ex.met * 3.5 * weightKg) / 200) * ex.minutes);
}

export type Sex = 'w' | 'm' | 'd';
export type Activity = 1.2 | 1.375 | 1.55 | 1.725;

export const ACTIVITY_LABEL: { value: Activity; label: string }[] = [
  { value: 1.2, label: 'Kaum aktiv (Büro, wenig Bewegung)' },
  { value: 1.375, label: 'Leicht aktiv (1–2× Sport/Woche)' },
  { value: 1.55, label: 'Aktiv (3–5× Sport/Woche)' },
  { value: 1.725, label: 'Sehr aktiv (täglich Sport)' },
];

/** Tagesbedarf nach Mifflin-St Jeor × Aktivitätsfaktor, auf 50 kcal gerundet. */
export function suggestKcalGoal(p: { sex: Sex; age: number; heightCm: number; weightKg: number; activity: Activity; goal: -1 | 0 | 1 }): number {
  const base = 10 * p.weightKg + 6.25 * p.heightCm - 5 * p.age;
  const offset = p.sex === 'm' ? 5 : p.sex === 'w' ? -161 : -78;
  const tdee = (base + offset) * p.activity;
  const adjusted = tdee + p.goal * 400;
  return Math.round(adjusted / 50) * 50;
}

const FRACTIONS: Record<string, string> = { '0.25': '¼', '0.5': '½', '0.75': '¾' };

export function formatQty(qty: number, unit: string): string {
  let value: string;
  if (unit === 'g' || unit === 'ml') {
    const rounded = qty >= 50 ? Math.round(qty / 5) * 5 : Math.round(qty);
    if (rounded >= 1000) return `${(rounded / 1000).toLocaleString('de-DE', { maximumFractionDigits: 2 })} ${unit === 'g' ? 'kg' : 'l'}`;
    value = String(rounded);
  } else {
    let whole = Math.floor(qty + 1e-9);
    let rest = Math.round((qty - whole) * 4) / 4;
    if (rest === 1) {
      whole += 1;
      rest = 0;
    }
    const frac = FRACTIONS[String(rest)] ?? '';
    value = whole === 0 ? frac || '0' : `${whole}${frac}`;
  }
  return `${value} ${unit}`;
}
