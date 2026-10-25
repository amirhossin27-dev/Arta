import { describe, expect, it } from 'vitest';
import { EXERCISES } from '../../data/exercises';
import { RECIPES } from '../../data/recipes';
import { INGREDIENT_DB } from '../../data/ingredients';
import { recipeNutrition, exerciseKcal, formatQty, suggestKcalGoal } from '../nutrition';
import { dailyRecipes, dailyUnits } from '../daily';

describe('Inhalte', () => {
  it('hat eindeutige IDs', () => {
    expect(new Set(EXERCISES.map((e) => e.id)).size).toBe(EXERCISES.length);
    expect(new Set(RECIPES.map((r) => r.id)).size).toBe(RECIPES.length);
  });

  it('kennt alle Zutaten und Einheiten', () => {
    for (const r of RECIPES) {
      for (const ing of r.ingredients) {
        expect(INGREDIENT_DB[ing.key], `${r.id}: ${ing.key}`).toBeDefined();
      }
      expect(() => recipeNutrition(r)).not.toThrow();
    }
  });

  it('liefert plausible Kalorien pro Portion', () => {
    for (const r of RECIPES) {
      const n = recipeNutrition(r);
      const [min, max] = r.meal === 'snack' ? [100, 350] : [250, 700];
      expect(n.kcal, r.name).toBeGreaterThanOrEqual(min);
      expect(n.kcal, r.name).toBeLessThanOrEqual(max);
      // Makros und kcal passen grob zusammen (Ballaststoffe & Rundung erlauben Abweichung)
      const fromMacros = n.protein * 4 + n.carbs * 4 + n.fat * 9;
      expect(Math.abs(fromMacros - n.kcal) / n.kcal, r.name).toBeLessThan(0.2);
    }
  });

  it('berechnet Sport-kcal nach MET-Formel', () => {
    expect(exerciseKcal({ met: 7, minutes: 30 }, 70)).toBe(257);
  });

  it('schlägt einen sinnvollen Tagesbedarf vor', () => {
    const kcal = suggestKcalGoal({ sex: 'w', age: 28, heightCm: 168, weightKg: 60, activity: 1.375, goal: 0 });
    expect(kcal).toBeGreaterThan(1800);
    expect(kcal).toBeLessThan(2100);
  });

  it('formatiert Mengen lesbar', () => {
    expect(formatQty(0.5, 'Stück')).toBe('½ Stück');
    expect(formatQty(1.5, 'EL')).toBe('1½ EL');
    expect(formatQty(2, 'Zehe')).toBe('2 Zehe');
    expect(formatQty(123, 'g')).toBe('125 g');
    expect(formatQty(1200, 'g')).toBe('1,2 kg');
  });
});

describe('Tagesangebot', () => {
  it('ist pro Tag stabil und wechselt zwischen Tagen', () => {
    const a = dailyUnits('2026-10-25');
    expect(dailyUnits('2026-10-25')).toEqual(a);
    const ids = (u: ReturnType<typeof dailyUnits>) => [...u.zuhause, ...u.draussen, ...u.zusammen].map((e) => e.id).join();
    const days = new Set(Array.from({ length: 7 }, (_, i) => ids(dailyUnits(`2026-11-0${i + 1}`))));
    expect(days.size).toBeGreaterThan(5);
  });

  it('bietet Einheiten für zuhause, draußen und zu zweit', () => {
    const u = dailyUnits('2026-10-25');
    expect(u.zuhause.length).toBe(5);
    expect(u.draussen.length).toBe(3);
    expect(u.zusammen.length).toBe(2);
    expect(u.zuhause.every((e) => e.place === 'zuhause')).toBe(true);
    expect(new Set(u.zuhause.map((e) => e.category)).size).toBeGreaterThanOrEqual(4);
  });

  it('schlägt für jede Mahlzeit ein Gericht vor', () => {
    const r = dailyRecipes('2026-10-25');
    expect(r.fruehstueck.meal).toBe('fruehstueck');
    expect(r.snack.meal).toBe('snack');
  });
});
