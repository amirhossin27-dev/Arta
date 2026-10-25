import { describe, expect, it } from 'vitest';
import { RECIPE_BY_ID } from '../../data/recipes';
import { guessCategory, parseShoppingInput, recipeToShopping } from '../shopping';
import { coupleStreak, levelInfo, points, streak, weekDone } from '../stats';
import { emptyData } from '../store';
import type { AppData, PlanItem } from '../types';

describe('Einkaufsliste', () => {
  it('erkennt Mengen und Einheiten', () => {
    expect(parseShoppingInput('500 g Quark')).toEqual({ name: 'Quark', qty: 500, unit: 'g' });
    expect(parseShoppingInput('500g hack')).toEqual({ name: 'Hack', qty: 500, unit: 'g' });
    expect(parseShoppingInput('2 Avocados')).toEqual({ name: 'Avocados', qty: 2, unit: 'Stück' });
    expect(parseShoppingInput('1,5 l Milch')).toEqual({ name: 'Milch', qty: 1.5, unit: 'l' });
    expect(parseShoppingInput('3 rote Paprika')).toEqual({ name: 'Rote Paprika', qty: 3, unit: 'Stück' });
    expect(parseShoppingInput('Brot')).toEqual({ name: 'Brot' });
  });

  it('ordnet Artikel Kategorien zu', () => {
    expect(guessCategory('Bananen')).toBe('obst');
    expect(guessCategory('Eier')).toBe('kuehl');
    expect(guessCategory('Vollkornreis')).toBe('vorrat');
    expect(guessCategory('Eis')).toBe('tk');
    expect(guessCategory('Eisbergsalat')).toBe('obst');
    expect(guessCategory('Lachsfilet')).toBe('fleisch');
    expect(guessCategory('Toilettenpapier')).toBe('drogerie');
    expect(guessCategory('Mineralwasser')).toBe('getraenke');
    expect(guessCategory('Geschenkpapier')).toBe('sonstiges');
  });

  it('übernimmt Rezeptzutaten ohne Grundzutaten', () => {
    const items = recipeToShopping(RECIPE_BY_ID['overnight-oats'], 2);
    const names = items.map((i) => i.name);
    expect(names).toContain('Haferflocken');
    expect(items.find((i) => i.name === 'Haferflocken')?.qty).toBe(100);
    const shakshuka = recipeToShopping(RECIPE_BY_ID.shakshuka, 2).map((i) => i.name);
    expect(shakshuka).not.toContain('Olivenöl');
    expect(shakshuka).not.toContain('Salz, Pfeffer & Gewürze');
  });
});

function plan(id: string, date: string, personId: 'a' | 'b', done: boolean, groupId?: string): PlanItem {
  return { id, date, personId, exerciseId: 'plank', slot: 'morgens', createdBy: personId, done, groupId, updatedAt: 1 };
}

function withPlan(items: PlanItem[]): AppData {
  return { ...emptyData(), plan: Object.fromEntries(items.map((p) => [p.id, p])) };
}

describe('Motivation', () => {
  it('zählt Serien, auch wenn heute noch nichts erledigt ist', () => {
    const d = withPlan([
      plan('1', '2026-10-22', 'a', true),
      plan('2', '2026-10-23', 'a', true),
      plan('3', '2026-10-24', 'a', true),
      plan('4', '2026-10-25', 'a', false),
      plan('5', '2026-10-24', 'b', true),
      plan('6', '2026-10-23', 'b', true),
    ]);
    expect(streak(d, 'a', '2026-10-25')).toBe(3);
    expect(coupleStreak(d, '2026-10-25')).toBe(2);
  });

  it('vergibt Bonuspunkte für gemeinsam erledigte Einheiten', () => {
    const solo = points(withPlan([plan('1', '2026-10-25', 'a', true, 'g'), plan('2', '2026-10-25', 'b', false, 'g')]));
    const both = points(withPlan([plan('1', '2026-10-25', 'a', true, 'g'), plan('2', '2026-10-25', 'b', true, 'g')]));
    expect(solo).toBe(10);
    expect(both).toBe(30);
  });

  it('zählt das Wochenziel von Montag bis Sonntag', () => {
    const d = withPlan([plan('1', '2026-10-19', 'a', true), plan('2', '2026-10-25', 'b', true), plan('3', '2026-10-18', 'a', true)]);
    expect(weekDone(d, '2026-10-22')).toEqual({ a: 1, b: 1, total: 2 });
  });

  it('berechnet Level und Fortschritt', () => {
    expect(levelInfo(0).current.name).toBe('Frisch verliebt');
    const l = levelInfo(175);
    expect(l.current.name).toBe('Turteltauben');
    expect(l.progress).toBeCloseTo(0.5);
    expect(levelInfo(99999).next).toBeUndefined();
  });
});
