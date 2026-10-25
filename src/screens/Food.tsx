import { useState } from 'react';
import { MEAL_LABEL, MEAL_ORDER, RECIPES, type RecipeTag } from '../data/recipes';
import { MealRow, RecipeCard } from '../components/food';
import { Bar, Chips, Empty, ProgressRing, WeekStrip } from '../components/ui';
import { dailyRecipes } from '../lib/daily';
import { relativeDay, todayKey } from '../lib/date';
import { usePeople } from '../lib/hooks';
import { burnedFor, mealsFor, sumMeals } from '../lib/stats';
import { useData } from '../lib/store';
import type { MealType } from '../lib/types';
import { nav, useUI } from '../lib/ui';

type Filter = 'alle' | 'favoriten' | MealType | RecipeTag;

export function Food() {
  const data = useData();
  const { me, partner } = usePeople();
  const { foodDate: date } = useUI();
  const [filter, setFilter] = useState<Filter>('alle');

  const meals = mealsFor(data, date, me.id);
  const eaten = sumMeals(meals);
  const burned = burnedFor(data, date, me.id);
  const budget = me.kcalGoal + burned;
  const left = budget - eaten.kcal;
  const partnerEaten = sumMeals(mealsFor(data, date, partner.id)).kcal;
  const suggestions = dailyRecipes(date);

  // Grobe Makro-Ziele: 25 % Eiweiß, 50 % Kohlenhydrate, 25 % Fett
  const macroGoal = { protein: (me.kcalGoal * 0.25) / 4, carbs: (me.kcalGoal * 0.5) / 4, fat: (me.kcalGoal * 0.25) / 9 };

  const list = RECIPES.filter((r) => {
    if (filter === 'alle') return true;
    if (filter === 'favoriten') return me.favorites.includes(r.id);
    if (MEAL_ORDER.includes(filter as MealType)) return r.meal === filter;
    return r.tags.includes(filter as RecipeTag);
  });

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
          <p className="muted">{RECIPES.length} einfache, gesunde Gerichte</p>
        </div>
      </div>
      <Chips
        value={filter}
        onChange={setFilter}
        options={[
          ['alle', 'Alle'],
          ['favoriten', '❤️ Favoriten'],
          ['fruehstueck', 'Frühstück'],
          ['mittag', 'Mittag'],
          ['abend', 'Abend'],
          ['snack', 'Snacks'],
          ['high-protein', '💪 Proteinreich'],
          ['vegetarisch', '🌱 Veggie'],
          ['vegan', '🌿 Vegan'],
          ['schnell', '⚡ Schnell'],
          ['date-night', '🕯️ Date-Night'],
        ]}
      />
      <div className="recipe-grid">
        {list.map((r) => (
          <RecipeCard key={r.id} recipe={r} date={date} />
        ))}
      </div>
      {!list.length && (
        <Empty emoji="🤍" title="Noch keine Favoriten">
          Tippe in einem Rezept auf das Herz, um es hier zu sammeln.
        </Empty>
      )}
    </section>
  );
}
