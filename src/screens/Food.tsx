import { useState } from 'react';
import { CATEGORY_LABEL, CATEGORY_ORDER, CUISINE_LABEL, CUISINE_ORDER, MEAL_LABEL, MEAL_ORDER, RECIPES } from '../data/recipes';
import { MealRow, RecipeCard } from '../components/food';
import { Bar, Chips, Empty, ProgressRing, WeekStrip } from '../components/ui';
import { filterRecipes, NO_FILTER, type RecipeFilter } from '../lib/cookbook';
import { dailyRecipes } from '../lib/daily';
import { relativeDay, todayKey } from '../lib/date';
import { guessMeal } from '../lib/foodScan';
import { usePeople } from '../lib/hooks';
import { burnedFor, mealsFor, sumMeals } from '../lib/stats';
import { useData } from '../lib/store';
import { nav, useUI } from '../lib/ui';

/** So viele Rezepte zeigt das Rezeptbuch auf einmal, der Rest kommt per „Mehr anzeigen“. */
const PAGE = 12;

export function Food() {
  const data = useData();
  const { me, partner } = usePeople();
  const { foodDate: date } = useUI();
  const [filter, setFilterState] = useState<RecipeFilter>(NO_FILTER);
  const [limit, setLimit] = useState(PAGE);
  const setFilter = (changes: Partial<RecipeFilter>) => {
    setFilterState({ ...filter, ...changes });
    setLimit(PAGE);
  };

  const meals = mealsFor(data, date, me.id);
  const eaten = sumMeals(meals);
  const burned = burnedFor(data, date, me.id);
  const budget = me.kcalGoal + burned;
  const left = budget - eaten.kcal;
  const partnerEaten = sumMeals(mealsFor(data, date, partner.id)).kcal;
  const suggestions = dailyRecipes(date);

  // Grobe Makro-Ziele: 25 % Eiweiß, 50 % Kohlenhydrate, 25 % Fett
  const macroGoal = { protein: (me.kcalGoal * 0.25) / 4, carbs: (me.kcalGoal * 0.5) / 4, fat: (me.kcalGoal * 0.25) / 9 };

  const list = filterRecipes(RECIPES, filter, me.favorites);
  const filtered = filter.meal !== 'alle' || filter.category !== 'alle' || filter.focus !== 'alle' || filter.cuisine !== 'alle' || filter.query.trim() !== '';

  return (
    <section className="screen">
      <div className="hero hero-food" data-deco="🥗">
        <p className="eyebrow">{relativeDay(date)} · Ernährung</p>
        <div className="kcal-hero">
          <ProgressRing value={eaten.kcal} max={budget} size={118} stroke={12} className="on-hero">
            <b>{Math.abs(left)}</b>
            <span>{left >= 0 ? 'kcal übrig' : 'kcal drüber'}</span>
          </ProgressRing>
          <div className="kcal-facts">
            <div>
              🍽️ <b>{eaten.kcal}</b> gegessen
            </div>
            <div>
              🔥 <b>{burned}</b> durch Sport
            </div>
            <div>
              🎯 <b>{me.kcalGoal}</b> Tagesziel
            </div>
          </div>
        </div>
        <div className="macros">
          {(
            [
              ['Eiweiß', eaten.protein, macroGoal.protein],
              ['Kohlenh.', eaten.carbs, macroGoal.carbs],
              ['Fett', eaten.fat, macroGoal.fat],
            ] as const
          ).map(([label, v, goal]) => (
            <div key={label} className="macro">
              <span>
                {label} <b>{Math.round(v)}</b>/{Math.round(goal)} g
              </span>
              <Bar value={v} max={goal} className="on-hero" />
            </div>
          ))}
        </div>
      </div>

      <WeekStrip value={date} onChange={nav.setFoodDate} marks={(k) => mealsFor(data, k, me.id).length} />
      {date !== todayKey() && (
        <button className="link center-link" onClick={() => nav.setFoodDate(todayKey())}>
          ↩︎ Zurück zu heute
        </button>
      )}

      <button className="scan-cta" onClick={() => nav.open({ type: 'foodScan', date, meal: guessMeal() })}>
        <span className="scan-cta-icon">📸</span>
        <span className="scan-cta-text">
          <b>Essen fotografieren</b>
          <span>Die KI erkennt dein Gericht und rechnet die Kalorien aus.</span>
        </span>
        <span className="scan-cta-go">›</span>
      </button>

      {MEAL_ORDER.map((meal) => {
        const entries = meals.filter((m) => m.meal === meal);
        const kcal = entries.reduce((s, m) => s + m.kcal, 0);
        return (
          <div key={meal} className="card meal-card">
            <div className="card-head">
              <h3>
                {MEAL_LABEL[meal].emoji} {MEAL_LABEL[meal].label}
              </h3>
              {kcal > 0 && <span className="muted">{kcal} kcal</span>}
            </div>
            {entries.map((m) => (
              <MealRow key={m.id} entry={m} />
            ))}
            <div className="meal-actions">
              <button className="add-line" onClick={() => nav.open({ type: 'addMeal', date, meal })}>
                + Hinzufügen
              </button>
              {!entries.length && (
                <button className="suggest-line" onClick={() => nav.open({ type: 'recipe', id: suggestions[meal].id, date })}>
                  Idee: {suggestions[meal].emoji} {suggestions[meal].name}
                </button>
              )}
            </div>
          </div>
        );
      })}

      <div className="partner-line">
        <span className="avatar">{partner.emoji}</span>
        <span className="grow">
          {partner.name}: <b>{partnerEaten}</b> / {partner.kcalGoal} kcal
        </span>
        <Bar value={partnerEaten} max={partner.kcalGoal} className="food" />
      </div>

      <div className="section-title">
        <span className="section-emoji">✨</span>
        <div>
          <h2>Gerichte des Tages</h2>
          <p className="muted">Einfach, gesund und lecker – jeden Tag neu</p>
        </div>
      </div>
      <div className="h-scroll">
        {MEAL_ORDER.map((m) => (
          <RecipeCard key={m} recipe={suggestions[m]} date={date} wide />
        ))}
      </div>

      <div className="section-title">
        <span className="section-emoji">📖</span>
        <div>
          <h2>Rezeptbuch</h2>
          <p className="muted">{RECIPES.length} einfache, gesunde Gerichte aus aller Welt</p>
        </div>
      </div>
      <input
        className="search cookbook-search"
        type="search"
        placeholder="Gericht, Zutat oder Küche suchen …"
        value={filter.query}
        onChange={(e) => setFilter({ query: e.target.value })}
      />
      <div className="cookbook-filters">
        <Chips
          value={filter.meal}
          onChange={(meal) => setFilter({ meal })}
          options={[
            ['alle', 'Alle'],
            ['favoriten', '❤️ Favoriten'],
            ['fruehstueck', 'Frühstück'],
            ['mittag', 'Mittag'],
            ['abend', 'Abend'],
            ['snack', 'Snacks & Süßes'],
          ]}
        />
        <Chips value={filter.category} onChange={(category) => setFilter({ category })} options={[['alle', 'Alle Arten'], ...CATEGORY_ORDER.map((c) => [c, CATEGORY_LABEL[c]] as [typeof c, string])]} />
        <Chips
          value={filter.focus}
          onChange={(focus) => setFilter({ focus })}
          options={[
            ['alle', 'Jede Ernährung'],
            ['high-protein', '💪 Proteinreich'],
            ['vegetarisch', '🌱 Veggie'],
            ['vegan', '🌿 Vegan'],
            ['low-carb', '🥬 Low Carb'],
            ['schnell', '⚡ Schnell'],
            ['meal-prep', '📦 Meal-Prep'],
            ['guenstig', '💶 Günstig'],
            ['date-night', '🕯️ Date-Night'],
            ['fisch', '🐟 Mit Fisch'],
            ['fleisch', '🍗 Mit Fleisch'],
          ]}
        />
        <Chips value={filter.cuisine} onChange={(cuisine) => setFilter({ cuisine })} options={[['alle', 'Alle Küchen'], ...CUISINE_ORDER.map((c) => [c, CUISINE_LABEL[c]] as [typeof c, string])]} />
      </div>
      {filtered && (
        <p className="cookbook-count muted">
          {list.length} von {RECIPES.length} Rezepten ·{' '}
          <button className="link inline" onClick={() => setFilter(NO_FILTER)}>
            Filter zurücksetzen
          </button>
        </p>
      )}
      <div className="recipe-grid">
        {list.slice(0, limit).map((r) => (
          <RecipeCard key={r.id} recipe={r} date={date} />
        ))}
      </div>
      {list.length > limit && (
        <button className="btn soft block more-recipes" onClick={() => setLimit(limit + PAGE * 2)}>
          Mehr anzeigen ({list.length - limit} weitere)
        </button>
      )}
      {!list.length &&
        (filter.meal === 'favoriten' && !me.favorites.length ? (
          <Empty emoji="🤍" title="Noch keine Favoriten">
            Tippe in einem Rezept auf das Herz, um es hier zu sammeln.
          </Empty>
        ) : (
          <Empty emoji="🥄" title="Nichts gefunden">
            Für diese Kombination gibt’s noch kein Rezept – probier einen anderen Filter.
          </Empty>
        ))}
    </section>
  );
}
