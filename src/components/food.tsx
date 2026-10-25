import { useMemo, useState } from 'react';
import { INGREDIENT_DB } from '../data/ingredients';
import { QUICK_FOODS } from '../data/foods';
import { CATEGORY_LABEL, CUISINE_LABEL, MEAL_LABEL, MEAL_ORDER, MEAL_SHORT, RECIPES, RECIPE_BY_ID, TAG_LABEL, type Recipe } from '../data/recipes';
import { celebrateMeal } from '../lib/celebrate';
import { todayKey } from '../lib/date';
import { cls, usePeople } from '../lib/hooks';
import { heartBurst, showLove } from '../lib/love';
import { formatQty, recipeNutrition } from '../lib/nutrition';
import { recipeToShopping } from '../lib/shopping';
import { actions, type Who } from '../lib/store';
import type { MealEntry, MealType } from '../lib/types';
import { nav } from '../lib/ui';
import { FoodScan } from './foodScan';
import { Segmented, Sheet, Stepper } from './ui';

export function RecipeCard({ recipe, date, wide }: { recipe: Recipe; date?: string; wide?: boolean }) {
  const n = recipeNutrition(recipe);
  const { me } = usePeople();
  const fav = me.favorites.includes(recipe.id);
  return (
    <button className={cls('recipe-card', wide && 'wide')} onClick={() => nav.open({ type: 'recipe', id: recipe.id, date })}>
      <span className="recipe-emoji">{recipe.emoji}</span>
      {fav && <span className="recipe-fav">❤️</span>}
      <span className="recipe-meal">{MEAL_LABEL[recipe.meal].label}</span>
      <b className="recipe-name">{recipe.name}</b>
      <span className="recipe-meta">
        <span className="kcal-pill">{n.kcal} kcal</span>
        <span>⏱️ {recipe.minutes} Min</span>
      </span>
    </button>
  );
}

export function MealRow({ entry }: { entry: MealEntry }) {
  return (
    <div className="meal-row">
      <span className="meal-emoji">{entry.emoji}</span>
      <button className="meal-info" onClick={() => entry.recipeId && nav.open({ type: 'recipe', id: entry.recipeId, date: entry.date })} disabled={!entry.recipeId}>
        <b>{entry.name}</b>
        {entry.protein + entry.carbs + entry.fat > 0 && (
          <span className="muted">
            E {Math.round(entry.protein)} g · K {Math.round(entry.carbs)} g · F {Math.round(entry.fat)} g
          </span>
        )}
      </button>
      <span className="meal-kcal">{entry.kcal} kcal</span>
      <button className="icon-btn small ghost" onClick={() => actions.removeMeal(entry.id)} aria-label="Eintrag löschen">
        ✕
      </button>
    </div>
  );
}

function logRecipe(recipe: Recipe, date: string, meal: MealType, who: Who) {
  const n = recipeNutrition(recipe);
  actions.addMeal({ date, meal, name: recipe.name, emoji: recipe.emoji, recipeId: recipe.id, ...n, who });
  celebrateMeal(recipe.name);
}

export function RecipeSheet({ id, date, onClose }: { id: string; date?: string; onClose: () => void }) {
  const recipe = RECIPE_BY_ID[id];
  const { me } = usePeople();
  const [portions, setPortions] = useState(2);
  const [meal, setMeal] = useState<MealType>(recipe?.meal ?? 'mittag');
  if (!recipe) return null;
  const n = recipeNutrition(recipe);
  const fav = me.favorites.includes(recipe.id);
  const day = date && date >= todayKey() ? date : todayKey();

  const toShopping = () => {
    const items = recipeToShopping(recipe, portions);
    actions.addShopping(items);
    showLove({
      emoji: '🛒',
      title: 'Ab auf die Liste!',
      text: `${items.length} Zutaten für ${portions} ${portions === 1 ? 'Portion' : 'Portionen'} ${recipe.name} hinzugefügt.`,
      tone: 'food',
    });
  };

  return (
    <Sheet title={`${recipe.emoji} ${recipe.name}`} onClose={onClose}>
      <div className="recipe-top">
        <div className="badges">
          <span className="badge">
            {MEAL_LABEL[recipe.meal].emoji} {MEAL_LABEL[recipe.meal].label}
          </span>
          <span className="badge">⏱️ {recipe.minutes} Min</span>
          <span className="badge">{CATEGORY_LABEL[recipe.category]}</span>
          <span className="badge">{CUISINE_LABEL[recipe.cuisine]}</span>
          {recipe.tags.map((t) => (
            <span key={t} className="badge soft">
              {TAG_LABEL[t]}
            </span>
          ))}
        </div>
        <button
          className={cls('fav-btn', fav && 'on')}
          onClick={(e) => {
            const on = actions.toggleFavorite(recipe.id);
            if (on) heartBurst(e, '❤️', 6);
          }}
          aria-label={fav ? 'Aus Favoriten entfernen' : 'Zu Favoriten'}
        >
          {fav ? '❤️' : '🤍'}
        </button>
      </div>
      <div className="facts food">
        <div>
          <b>{n.kcal}</b>
          <span>kcal / Portion</span>
        </div>
        <div>
          <b>{n.protein} g</b>
          <span>Eiweiß</span>
        </div>
        <div>
          <b>{n.carbs} g</b>
          <span>Kohlenhydrate</span>
        </div>
        <div>
          <b>{n.fat} g</b>
          <span>Fett</span>
        </div>
      </div>

      <div className="inset">
        <h3>🍽️ Eintragen ({day === todayKey() ? 'heute' : 'geplant'})</h3>
        <Segmented value={meal} onChange={setMeal} small options={MEAL_ORDER.map((m) => [m, MEAL_SHORT[m]])} />
        <div className="btn-row">
          <button
            className="btn primary"
            onClick={() => {
              logRecipe(recipe, day, meal, 'me');
              onClose();
            }}
          >
            {me.emoji} Für mich
          </button>
          <button
            className="btn soft"
            onClick={() => {
              logRecipe(recipe, day, meal, 'both');
              onClose();
            }}
          >
            💑 Für uns beide
          </button>
        </div>
      </div>

      <div className="section-head">
        <h3>Zutaten</h3>
        <Stepper value={portions} onChange={setPortions} label={portions === 1 ? 'Portion' : 'Portionen'} />
      </div>
      <ul className="ingredients">
        {recipe.ingredients.map((ing) => {
          const db = INGREDIENT_DB[ing.key];
          return (
            <li key={ing.key} className={cls(db.pantry && 'pantry')}>
              <span>{db.name}</span>
              <span className="muted">{ing.key === 'gewuerze' ? 'nach Geschmack' : formatQty(ing.qty * portions, ing.unit)}</span>
            </li>
          );
        })}
      </ul>
      <button className="btn soft block" onClick={toShopping}>
        🛒 Zutaten auf die Einkaufsliste
      </button>
      <p className="hint">Grundzutaten wie Öl, Salz und Gewürze landen nicht auf der Liste.</p>

      <h3>Zubereitung</h3>
      <ol className="steps">
        {recipe.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      {recipe.tip && <p className="tip">💡 {recipe.tip}</p>}
      <p className="hint">Nährwerte sind Richtwerte pro Portion, berechnet aus den Zutaten.</p>
    </Sheet>
  );
}

type AddTab = 'rezepte' | 'schnell' | 'foto' | 'eigenes';

export function AddMealSheet({ date, meal, onClose }: { date: string; meal: MealType; onClose: () => void }) {
  const { me } = usePeople();
  const [tab, setTab] = useState<AddTab>('rezepte');
  const [who, setWho] = useState<Who>('me');
  const [query, setQuery] = useState('');
  const [allMeals, setAllMeals] = useState(false);
  const [custom, setCustom] = useState({ name: '', kcal: '', protein: '', carbs: '', fat: '' });
  const q = query.trim().toLowerCase();

  const recipes = useMemo(() => {
    const list = RECIPES.filter((r) => (allMeals || q ? true : r.meal === meal) && (!q || r.name.toLowerCase().includes(q)));
    return list.sort((a, b) => Number(me.favorites.includes(b.id)) - Number(me.favorites.includes(a.id)));
  }, [allMeals, q, meal, me.favorites]);

  const foods = QUICK_FOODS.filter((f) => !q || f.name.toLowerCase().includes(q));
  const groups = [...new Set(foods.map((f) => f.group))];

  const done = (name: string) => {
    celebrateMeal(name);
    onClose();
  };

  const addCustom = () => {
    const kcal = Number(custom.kcal);
    if (!custom.name.trim() || !kcal) return;
    actions.addMeal({
      date,
      meal,
      name: custom.name.trim(),
      emoji: '🍴',
      kcal: Math.round(kcal),
      protein: Number(custom.protein) || 0,
      carbs: Number(custom.carbs) || 0,
      fat: Number(custom.fat) || 0,
      who,
    });
    done(custom.name.trim());
  };

  return (
    <Sheet title={`${MEAL_LABEL[meal].emoji} ${MEAL_LABEL[meal].label} eintragen`} onClose={onClose}>
      <Segmented
        value={who}
        onChange={setWho}
        options={[
          ['me', `${me.emoji} Für mich`],
          ['both', '💑 Für uns beide'],
        ]}
      />
      <Segmented
        value={tab}
        onChange={setTab}
        small
        options={[
          ['rezepte', '📖 Rezepte'],
          ['schnell', '⚡ Schnell'],
          ['foto', '📸 Foto'],
          ['eigenes', '✏️ Eigenes'],
        ]}
      />
      {tab === 'foto' && <FoodScan date={date} meal={meal} who={who} onDone={onClose} />}
      {(tab === 'rezepte' || tab === 'schnell') && (
        <input className="search" type="search" placeholder="Suchen …" value={query} onChange={(e) => setQuery(e.target.value)} />
      )}

      {tab === 'rezepte' && (
        <>
          <label className="toggle-line">
            <input type="checkbox" checked={allMeals} onChange={(e) => setAllMeals(e.target.checked)} />
            Rezepte aller Mahlzeiten zeigen
          </label>
          <div className="pick-list">
            {recipes.map((r) => {
              const n = recipeNutrition(r);
              return (
                <button
                  key={r.id}
                  className="pick-row"
                  onClick={() => {
                    actions.addMeal({ date, meal, name: r.name, emoji: r.emoji, recipeId: r.id, ...n, who });
                    done(r.name);
                  }}
                >
                  <span className="pick-emoji">{r.emoji}</span>
                  <span className="pick-info">
                    <b>
                      {r.name} {me.favorites.includes(r.id) && '❤️'}
                    </b>
                    <span className="muted">
                      {n.kcal} kcal · E {n.protein} g · {r.minutes} Min
                    </span>
                  </span>
                  <span className="pick-add">+</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {tab === 'schnell' &&
        groups.map((g) => (
          <div key={g}>
            <p className="group-label">{g}</p>
            <div className="pick-list">
              {foods
                .filter((f) => f.group === g)
                .map((f) => (
                  <button
                    key={f.id}
                    className="pick-row"
                    onClick={() => {
                      actions.addMeal({
                        date,
                        meal,
                        name: f.name,
                        emoji: f.emoji,
                        kcal: f.kcal,
                        protein: f.protein,
                        carbs: f.carbs,
                        fat: f.fat,
                        who,
                      });
                      done(f.name);
                    }}
                  >
                    <span className="pick-emoji">{f.emoji}</span>
                    <span className="pick-info">
                      <b>{f.name}</b>
                      <span className="muted">{f.portion}</span>
                    </span>
                    <span className="pick-kcal">{f.kcal} kcal</span>
                    <span className="pick-add">+</span>
                  </button>
                ))}
            </div>
          </div>
        ))}

      {tab === 'eigenes' && (
        <div className="form">
          <label className="field">
            <span className="field-label">Was gab’s?</span>
            <input value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} placeholder="z. B. Omas Gemüsesuppe" />
          </label>
          <div className="field-row">
            <label className="field">
              <span className="field-label">kcal</span>
              <input inputMode="numeric" value={custom.kcal} onChange={(e) => setCustom({ ...custom, kcal: e.target.value.replace(/\D/g, '') })} placeholder="450" />
            </label>
            <label className="field">
              <span className="field-label">Eiweiß (g)</span>
              <input inputMode="decimal" value={custom.protein} onChange={(e) => setCustom({ ...custom, protein: e.target.value })} placeholder="optional" />
            </label>
          </div>
          <div className="field-row">
            <label className="field">
              <span className="field-label">Kohlenhydrate (g)</span>
              <input inputMode="decimal" value={custom.carbs} onChange={(e) => setCustom({ ...custom, carbs: e.target.value })} placeholder="optional" />
            </label>
            <label className="field">
              <span className="field-label">Fett (g)</span>
              <input inputMode="decimal" value={custom.fat} onChange={(e) => setCustom({ ...custom, fat: e.target.value })} placeholder="optional" />
            </label>
          </div>
          <button className="btn primary block" onClick={addCustom} disabled={!custom.name.trim() || !Number(custom.kcal)}>
            Eintragen
          </button>
        </div>
      )}
    </Sheet>
  );
}
