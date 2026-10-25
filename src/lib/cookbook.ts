import { INGREDIENT_DB, type Diet } from '../data/ingredients';
import { CATEGORY_LABEL, CUISINE_LABEL, TAG_LABEL, type Cuisine, type Recipe, type RecipeCategory, type RecipeTag } from '../data/recipes';
import type { MealType } from './types';

export type RecipeDiet = Diet | 'vegan';

/** Ernährungsform eines Rezepts, abgeleitet aus den Zutaten (Fleisch vor Fisch vor vegetarisch). */
export function recipeDiet(recipe: Recipe): RecipeDiet {
  const diets = new Set(recipe.ingredients.map((ing) => INGREDIENT_DB[ing.key].diet));
  if (diets.has('fleisch')) return 'fleisch';
  if (diets.has('fisch')) return 'fisch';
  if (diets.has('vegetarisch')) return 'vegetarisch';
  return 'vegan';
}

export type MealFilter = 'alle' | 'favoriten' | MealType;
export type FocusFilter = 'alle' | RecipeTag | 'fisch' | 'fleisch';

export interface RecipeFilter {
  meal: MealFilter;
  category: 'alle' | RecipeCategory;
  focus: FocusFilter;
  cuisine: 'alle' | Cuisine;
  query: string;
}

export const NO_FILTER: RecipeFilter = { meal: 'alle', category: 'alle', focus: 'alle', cuisine: 'alle', query: '' };

/** Für die Suche: klein, ohne Akzente, Umlaute und ae/oe/ue gleichwertig („Kaese“ findet „Käse“). */
export function fold(text: string): string {
  return text
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/([aou])e/g, '$1');
}

const searchCache = new Map<string, string>();

function searchText(recipe: Recipe): string {
  let text = searchCache.get(recipe.id);
  if (text === undefined) {
    text = fold(
      [
        recipe.name,
        ...recipe.ingredients.map((ing) => INGREDIENT_DB[ing.key].name),
        CATEGORY_LABEL[recipe.category],
        CUISINE_LABEL[recipe.cuisine],
        ...recipe.tags.map((t) => TAG_LABEL[t]),
      ].join(' '),
    );
    searchCache.set(recipe.id, text);
  }
  return text;
}

function matchesFocus(recipe: Recipe, focus: FocusFilter): boolean {
  if (focus === 'alle') return true;
  const diet = recipeDiet(recipe);
  if (focus === 'vegetarisch') return diet === 'vegetarisch' || diet === 'vegan';
  if (focus === 'vegan') return diet === 'vegan';
  if (focus === 'fisch' || focus === 'fleisch') return recipe.ingredients.some((ing) => INGREDIENT_DB[ing.key].diet === focus);
  return recipe.tags.includes(focus);
}

export function filterRecipes(recipes: readonly Recipe[], filter: RecipeFilter, favorites: readonly string[] = []): Recipe[] {
  const words = fold(filter.query).split(/\s+/).filter(Boolean);
  return recipes.filter((r) => {
    if (filter.meal === 'favoriten' && !favorites.includes(r.id)) return false;
    if (filter.meal !== 'alle' && filter.meal !== 'favoriten' && r.meal !== filter.meal) return false;
    if (filter.category !== 'alle' && r.category !== filter.category) return false;
    if (filter.cuisine !== 'alle' && r.cuisine !== filter.cuisine) return false;
    if (!matchesFocus(r, filter.focus)) return false;
    if (words.length) {
      const text = searchText(r);
      if (!words.every((w) => text.includes(w))) return false;
    }
    return true;
  });
}
