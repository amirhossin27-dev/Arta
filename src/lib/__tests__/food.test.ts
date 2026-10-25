import { describe, expect, it } from 'vitest';
import { RECIPES } from '../../data/recipes';
import { filterRecipes, fold, NO_FILTER, recipeDiet } from '../cookbook';
import { gramStep, guessMeal, itemKcal, looksLikeApiKey, normalizeResult, scanTotals } from '../foodScan';

describe('Rezeptbuch', () => {
  it('findet Rezepte über Name, Zutat und Küche – auch ohne Umlaute', () => {
    const byQuery = (query: string) => filterRecipes(RECIPES, { ...NO_FILTER, query }).map((r) => r.id);
    expect(byQuery('shakshuka')).toContain('shakshuka');
    expect(byQuery('Lachs')).toEqual(expect.arrayContaining(['lachs-ofengemuese', 'poke-bowl-lachs', 'teriyaki-lachs']));
    expect(byQuery('kase')).toEqual(byQuery('Käse'));
    expect(byQuery('Kaese')).toEqual(byQuery('Käse'));
    expect(byQuery('persisch')).toEqual(expect.arrayContaining(['kuku-sabzi', 'joojeh-kabab']));
    expect(byQuery('nudeln suppe')).toContain('huehnersuppe');
    expect(byQuery('xyz-gibt-es-nicht')).toEqual([]);
  });

  it('kombiniert Mahlzeit, Art, Ernährung und Küche', () => {
    const list = filterRecipes(RECIPES, { ...NO_FILTER, meal: 'abend', category: 'curry', focus: 'vegan', cuisine: 'indisch' });
    expect(list.length).toBeGreaterThan(0);
    for (const r of list) {
      expect(r.meal).toBe('abend');
      expect(r.category).toBe('curry');
      expect(r.cuisine).toBe('indisch');
      expect(recipeDiet(r)).toBe('vegan');
    }
  });

  it('zählt vegane Gerichte auch als veggie und erkennt Fisch und Fleisch', () => {
    const veggie = filterRecipes(RECIPES, { ...NO_FILTER, focus: 'vegetarisch' });
    expect(veggie.some((r) => recipeDiet(r) === 'vegan')).toBe(true);
    expect(veggie.every((r) => recipeDiet(r) === 'vegan' || recipeDiet(r) === 'vegetarisch')).toBe(true);
    expect(filterRecipes(RECIPES, { ...NO_FILTER, focus: 'fisch' }).map((r) => r.id)).toContain('fisch-tacos');
    expect(filterRecipes(RECIPES, { ...NO_FILTER, focus: 'fleisch' }).map((r) => r.id)).toContain('bolognese');
  });

  it('zeigt Favoriten', () => {
    expect(filterRecipes(RECIPES, { ...NO_FILTER, meal: 'favoriten' }, ['ramen', 'caprese']).map((r) => r.id).sort()).toEqual(['caprese', 'ramen']);
  });

  it('faltet Umlaute und ß', () => {
    expect(fold('Süßkartoffel')).toBe(fold('Suesskartoffel'));
    expect(fold('Crème')).toBe('creme');
  });
});

describe('Foto-Erkennung', () => {
  const raw = {
    is_food: true,
    dish: 'Spaghetti Bolognese',
    emoji: '🍝',
    confidence: 'hoch',
    note: 'Inklusive etwas Olivenöl in der Soße.',
    items: [
      { name: 'Spaghetti (gekocht)', emoji: '🍝', grams: 220, kcal_per_100g: 150, protein_per_100g: 5.5, carbs_per_100g: 30, fat_per_100g: 0.9 },
      { name: 'Bolognese-Soße', emoji: '🍅', grams: 180, kcal_per_100g: 110, protein_per_100g: 7, carbs_per_100g: 5, fat_per_100g: 6.5 },
      { name: 'Parmesan', emoji: '🧀', grams: 10, kcal_per_100g: 390, protein_per_100g: 35, carbs_per_100g: 0, fat_per_100g: 28 },
    ],
  };

  it('übernimmt eine gültige Antwort', () => {
    const r = normalizeResult(raw);
    expect(r.isFood).toBe(true);
    expect(r.dish).toBe('Spaghetti Bolognese');
    expect(r.confidence).toBe('hoch');
    expect(r.items).toHaveLength(3);
    expect(r.items[1]).toEqual({ name: 'Bolognese-Soße', emoji: '🍅', grams: 180, kcal100: 110, protein100: 7, carbs100: 5, fat100: 6.5 });
  });

  it('rechnet Summen und Portionen', () => {
    const { items } = normalizeResult(raw);
    // 330 + 198 + 39 kcal
    expect(scanTotals(items)).toEqual({ kcal: 567, protein: 28, carbs: 75, fat: 16 });
    expect(scanTotals(items, 0.5).kcal).toBe(284);
    expect(itemKcal(items[0])).toBe(330);
    expect(itemKcal(items[0], 2)).toBe(660);
  });

  it('begrenzt unplausible Werte und räumt leere Einträge weg', () => {
    const r = normalizeResult({
      dish: '',
      confidence: 'ganz sicher',
      items: [
        { name: 'Riesenportion', grams: 99999, kcal_per_100g: 5000, protein_per_100g: -3, carbs_per_100g: 'viel', fat_per_100g: 10 },
        { name: '  ', grams: 100, kcal_per_100g: 100 },
        null,
      ],
    });
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({ grams: 3000, kcal100: 900, protein100: 0, carbs100: 0, emoji: '🍽️' });
    expect(r.dish).toBe('Riesenportion');
    expect(r.confidence).toBe('mittel');
    expect(r.emoji).toBe('🍽️');
  });

  it('erkennt Fotos ohne Essen', () => {
    expect(normalizeResult({ is_food: false, dish: '', items: [] }).isFood).toBe(false);
    expect(normalizeResult({ is_food: true, dish: 'Teller', items: [] }).isFood).toBe(false);
    expect(() => normalizeResult('kein JSON-Objekt')).toThrow();
  });

  it('schlägt die passende Mahlzeit zur Uhrzeit vor', () => {
    const at = (h: number, m = 0) => new Date(2026, 9, 25, h, m);
    expect(guessMeal(at(7))).toBe('fruehstueck');
    expect(guessMeal(at(12, 30))).toBe('mittag');
    expect(guessMeal(at(16))).toBe('snack');
    expect(guessMeal(at(19))).toBe('abend');
  });

  it('prüft das Format des API-Schlüssels', () => {
    expect(looksLikeApiKey('sk-ant-api03-abcdefghijklmnopqrstuvwxyz_0123-XYZ')).toBe(true);
    expect(looksLikeApiKey('  sk-ant-api03-abcdefghijklmnopqrstuvwxyz  ')).toBe(true);
    expect(looksLikeApiKey('sk-proj-123')).toBe(false);
    expect(looksLikeApiKey('')).toBe(false);
  });

  it('passt die Schrittweite der Grammangaben an', () => {
    expect(gramStep(20)).toBe(5);
    expect(gramStep(120)).toBe(10);
    expect(gramStep(400)).toBe(25);
  });
});
