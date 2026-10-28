import { describe, expect, it } from 'vitest';
import { EXERCISES, MUSCLE_BY_ID, MUSCLES } from '../../data/exercises';
import { CATEGORY_ORDER, CUISINE_ORDER, RECIPES } from '../../data/recipes';
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

  it('deckt viele Arten und Länderküchen ab', () => {
    expect(RECIPES.length).toBeGreaterThanOrEqual(120);
    for (const c of CATEGORY_ORDER) expect(RECIPES.filter((r) => r.category === c).length, c).toBeGreaterThanOrEqual(4);
    for (const c of CUISINE_ORDER) expect(RECIPES.filter((r) => r.cuisine === c).length, c).toBeGreaterThanOrEqual(5);
    for (const meal of ['fruehstueck', 'mittag', 'abend', 'snack'] as const) {
      expect(RECIPES.filter((r) => r.meal === meal).length, meal).toBeGreaterThanOrEqual(20);
    }
  });

  it('kennzeichnet vegane und vegetarische Rezepte passend zu den Zutaten', () => {
    for (const r of RECIPES) {
      const diets = new Set(r.ingredients.map((ing) => INGREDIENT_DB[ing.key].diet));
      const meatOrFish = diets.has('fleisch') || diets.has('fisch');
      if (r.tags.includes('vegan')) expect([...diets].filter(Boolean), r.id).toEqual([]);
      if (r.tags.includes('vegetarisch')) expect(meatOrFish, r.id).toBe(false);
      // Alles ohne Fleisch und Fisch soll auch im Veggie-Filter auftauchen
      if (!meatOrFish) expect(r.tags.includes('vegan') || r.tags.includes('vegetarisch'), r.id).toBe(true);
    }
  });

  it('hält, was die Schlagworte versprechen', () => {
    for (const r of RECIPES) {
      const n = recipeNutrition(r);
      if (r.tags.includes('high-protein')) expect(n.protein, r.id).toBeGreaterThanOrEqual(r.meal === 'snack' ? 10 : 20);
      if (r.tags.includes('low-carb')) expect(n.carbs, r.id).toBeLessThanOrEqual(30);
      if (r.tags.includes('schnell')) expect(r.minutes, r.id).toBeLessThanOrEqual(20);
      expect(r.steps.length, r.id).toBeGreaterThanOrEqual(2);
      expect(new Set(r.ingredients.map((ing) => ing.key)).size, `${r.id}: doppelte Zutat`).toBe(r.ingredients.length);
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

describe('Übungen', () => {
  it('nennt für jede Übung gültige Muskelgruppen', () => {
    for (const e of EXERCISES) {
      for (const m of e.muscles) expect(MUSCLE_BY_ID[m], `${e.id}: ${m}`).toBeDefined();
      expect(new Set(e.muscles).size, e.id).toBe(e.muscles.length);
      if (e.category !== 'Mobilität') expect(e.muscles.length, e.id).toBeGreaterThan(0);
      for (const month of e.months ?? []) expect(month >= 1 && month <= 12, e.id).toBe(true);
    }
  });

  it('trainiert jede Muskelgruppe auch zuhause ohne Geräte', () => {
    expect(EXERCISES.length).toBeGreaterThanOrEqual(90);
    for (const m of MUSCLES) {
      const all = EXERCISES.filter((e) => e.muscles.includes(m.id) && e.category !== 'Mobilität');
      expect(all.length, m.label).toBeGreaterThanOrEqual(4);
      expect(all.some((e) => e.place === 'zuhause'), m.label).toBe(true);
    }
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

  it('verteilt die Kraftübungen auf verschiedene Körperregionen', () => {
    for (let i = 1; i <= 28; i++) {
      const date = `2026-02-${String(i).padStart(2, '0')}`;
      const kraft = dailyUnits(date).zuhause.filter((e) => e.category === 'Kraft');
      expect(kraft.length, date).toBe(2);
      expect(MUSCLE_BY_ID[kraft[0].muscles[0]].region, date).not.toBe(MUSCLE_BY_ID[kraft[1].muscles[0]].region);
    }
  });

  it('schlägt Saisonsport nur in der passenden Jahreszeit vor', () => {
    const ids = (month: string) =>
      new Set(
        Array.from({ length: 28 }, (_, i) => {
          const u = dailyUnits(`2026-${month}-${String(i + 1).padStart(2, '0')}`);
          return [...u.draussen, ...u.zusammen].map((e) => e.id);
        }).flat(),
      );
    const winter = ids('01');
    const summer = ids('07');
    expect(winter.has('stand-up-paddling') || winter.has('kajak')).toBe(false);
    expect(summer.has('eislaufen')).toBe(false);
  });

  it('schlägt für jede Mahlzeit ein Gericht vor', () => {
    const r = dailyRecipes('2026-10-25');
    expect(r.fruehstueck.meal).toBe('fruehstueck');
    expect(r.snack.meal).toBe('snack');
  });
});
