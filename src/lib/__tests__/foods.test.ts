import { describe, expect, it } from 'vitest';
import { FOOD_BY_ID, FOOD_GROUPS, FOODS } from '../../data/foods';
import { amountLabel, defaultGrams, entryName, foodNutrition, formatCount, recentFoods, searchFoods, stepGrams } from '../foods';
import type { MealEntry } from '../types';

const ids = (query: string) => searchFoods(query).map((f) => f.id);

describe('Lebensmittel-Liste', () => {
  it('hat viele gängige Lebensmittel in jeder Gruppe', () => {
    expect(FOODS.length).toBeGreaterThanOrEqual(300);
    expect(new Set(FOODS.map((f) => f.id)).size).toBe(FOODS.length);
    for (const g of FOOD_GROUPS) expect(FOODS.filter((f) => f.group === g.id).length, g.id).toBeGreaterThanOrEqual(10);
  });

  it('hat plausible Nährwerte und Portionen', () => {
    for (const f of FOODS) {
      expect(f.kcal, f.id).toBeGreaterThanOrEqual(0);
      expect(f.kcal, f.id).toBeLessThanOrEqual(900);
      expect(f.protein + f.carbs + f.fat, f.id).toBeLessThanOrEqual(100.5);
      // kcal passen grob zu den Makros (Ballaststoffe zählen auf Etiketten mit etwa 2 kcal/g)
      const fromMacros = f.protein * 4 + f.carbs * 4 + f.fat * 9 + (f.alcohol ?? 0) * 7;
      expect(Math.abs(fromMacros - f.kcal), f.id).toBeLessThanOrEqual(Math.max(15, f.kcal * 0.25));
      expect(f.portion[1], f.id).toBeGreaterThan(0);
      expect(defaultGrams(f), f.id).toBeLessThanOrEqual(600);
    }
  });

  it('findet Lebensmittel über Namen und Suchbegriffe – auch ohne Umlaute', () => {
    expect(ids('reis').slice(0, 2)).toEqual(['reis', 'reis-roh']);
    expect(ids('pizza')[0]).toBe('pizza');
    expect(ids('Hähnchen').slice(0, 2)).toEqual(['haehnchen', 'haehnchen-gebraten']);
    expect(ids('haehnchen')).toEqual(ids('Hähnchen'));
    expect(ids('hahnchen')).toEqual(ids('Hähnchen'));
    expect(ids('nutella')).toEqual(['nussnougat']);
    expect(ids('semmel')).toContain('broetchen');
    expect(ids('käse brot')).toContain('kaesebrot');
    expect(ids('gibt-es-nicht')).toEqual([]);
    expect(searchFoods('', 'obst').every((f) => f.group === 'obst')).toBe(true);
  });

  it('rechnet Nährwerte für die gewählte Menge', () => {
    expect(foodNutrition(FOOD_BY_ID.banane, 120)).toEqual({ kcal: 107, protein: 1.3, carbs: 24, fat: 0.4 });
    expect(foodNutrition(FOOD_BY_ID.reis, 200).kcal).toBe(260);
    expect(foodNutrition(FOOD_BY_ID.cola, 330).kcal).toBe(139);
  });

  it('beschreibt Mengen verständlich', () => {
    expect(formatCount(1)).toBe('1');
    expect(formatCount(0.5)).toBe('½');
    expect(formatCount(1.5)).toBe('1½');
    expect(formatCount(2.75)).toBe('2¾');
    expect(formatCount(1.6)).toBe('1,6');
    expect(amountLabel(FOOD_BY_ID.vollkornbrot, 100)).toBe('2 Scheiben');
    expect(amountLabel(FOOD_BY_ID.vollkornbrot, 50)).toBe('1 Scheibe');
    expect(amountLabel(FOOD_BY_ID.vollkornbrot, 80)).toBe('80 g');
    expect(amountLabel(FOOD_BY_ID.reis, 150)).toBe('150 g');
    expect(amountLabel(FOOD_BY_ID.orangensaft, 250)).toBe('250 ml');
    expect(amountLabel(FOOD_BY_ID.orangensaft, 300)).toBe('1½ Gläser');
    expect(entryName(FOOD_BY_ID.banane, 60)).toBe('Banane (½ Stück)');
    expect(entryName(FOOD_BY_ID.vollmilchschokolade, defaultGrams(FOOD_BY_ID.vollmilchschokolade))).toBe('Vollmilchschokolade (2 Rippen)');
  });

  it('zählt erst in halben, dann in ganzen Einheiten', () => {
    const brot = FOOD_BY_ID.vollkornbrot;
    expect(stepGrams(brot, 50, 1)).toBe(75);
    expect(stepGrams(brot, 75, 1)).toBe(100);
    expect(stepGrams(brot, 100, 1)).toBe(150);
    expect(stepGrams(brot, 150, -1)).toBe(100);
    expect(stepGrams(brot, 100, -1)).toBe(75);
    expect(stepGrams(brot, 25, -1)).toBe(25);
    // Krumme Mengen rasten auf die nächste Stufe ein
    expect(stepGrams(brot, 80, 1)).toBe(100);
    expect(stepGrams(brot, 80, -1)).toBe(75);
  });

  it('merkt sich die zuletzt gegessenen Lebensmittel mit Menge', () => {
    const meal = (id: string, foodId: string | undefined, grams: number, updatedAt: number, personId: 'a' | 'b' = 'a'): MealEntry => ({
      id,
      updatedAt,
      date: '2026-10-27',
      personId,
      meal: 'fruehstueck',
      name: id,
      emoji: '🍽️',
      kcal: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      foodId,
      grams,
      createdBy: personId,
    });
    const meals = Object.fromEntries(
      [
        meal('1', 'haferflocken', 60, 1),
        meal('2', 'banane', 120, 2),
        meal('3', 'haferflocken', 40, 3),
        meal('4', undefined, 0, 4),
        meal('5', 'cola', 330, 5, 'b'),
        { ...meal('6', 'apfel', 150, 6), deleted: true },
      ].map((m) => [m.id, m]),
    );
    expect(recentFoods(meals, 'a').map((r) => [r.food.id, r.grams])).toEqual([
      ['haferflocken', 40],
      ['banane', 120],
    ]);
  });
});
