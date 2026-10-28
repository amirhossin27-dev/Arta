import { EXERCISES, MUSCLE_BY_ID, type Exercise } from '../data/exercises';
import { RECIPES, type Recipe } from '../data/recipes';
import { DAILY_LOVE, QUESTIONS } from '../data/messages';
import { pickSeeded, seededShuffle } from './random';
import type { MealType } from './types';

export interface DailyUnits {
  zuhause: Exercise[];
  draussen: Exercise[];
  zusammen: Exercise[];
}

/**
 * Tägliches Angebot an Grundeinheiten. Für denselben Tag immer gleich,
 * damit beide Handys dieselben Vorschläge zeigen.
 */
export function dailyUnits(dateKey: string): DailyUnits {
  const month = Number(dateKey.slice(5, 7));
  const pool = EXERCISES.filter((e) => !e.months || e.months.includes(month));
  const home = seededShuffle(
    pool.filter((e) => e.place === 'zuhause'),
    `home-${dateKey}`,
  );
  // Abwechslung: möglichst eine Übung je Kategorie
  const zuhause: Exercise[] = [];
  for (const cat of ['Kraft', 'Core', 'Cardio', 'Mobilität'] as const) {
    const ex = home.find((e) => e.category === cat && !zuhause.includes(e));
    if (ex) zuhause.push(ex);
  }
  // Die zweite Kraftübung zielt auf eine andere Körperregion, damit über den Tag möglichst viele Muskeln drankommen
  const region = (e: Exercise | undefined) => (e?.muscles[0] ? MUSCLE_BY_ID[e.muscles[0]].region : undefined);
  const kraft = home.filter((e) => !zuhause.includes(e) && e.category === 'Kraft');
  const extra = kraft.find((e) => region(e) !== region(zuhause[0])) ?? kraft[0];
  if (extra) zuhause.splice(1, 0, extra);

  const draussen = seededShuffle(
    pool.filter((e) => e.place === 'draussen'),
    `out-${dateKey}`,
  ).slice(0, 3);

  const together = seededShuffle(
    pool.filter((e) => e.place === 'zusammen'),
    `duo-${dateKey}`,
  );
  const indoor = together.find((e) => !e.outdoor);
  const outdoor = together.find((e) => e.outdoor);
  const zusammen = [indoor, outdoor].filter((e): e is Exercise => Boolean(e));

  return { zuhause, draussen, zusammen };
}

export function dailyRecipes(dateKey: string): Record<MealType, Recipe> {
  const pick = (meal: MealType) =>
    pickSeeded(
      RECIPES.filter((r) => r.meal === meal),
      `${meal}-${dateKey}`,
    );
  return { fruehstueck: pick('fruehstueck'), mittag: pick('mittag'), abend: pick('abend'), snack: pick('snack') };
}

export function dailyLove(dateKey: string): string {
  return pickSeeded(DAILY_LOVE, `love-${dateKey}`);
}

export function dailyQuestion(dateKey: string): string {
  return pickSeeded(QUESTIONS, `question-${dateKey}`);
}
