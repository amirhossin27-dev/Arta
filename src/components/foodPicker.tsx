import { useMemo, useState } from 'react';
import { FOOD_GROUPS, type Food, type FoodGroup } from '../data/foods';
import { defaultGrams, foodNutrition, formatCount, gramLabel, recentFoods, searchFoods, stepGrams, unitLabel } from '../lib/foods';
import { cls } from '../lib/hooks';
import { addNutrition, ZERO } from '../lib/nutrition';
import { useData } from '../lib/store';
import type { PersonId } from '../lib/types';
import { Chips } from './ui';

export interface PlateItem {
  food: Food;
  grams: number;
}

const MAX_GRAMS = 5000;

function portionText(food: Food, grams: number): string {
  const [unit, per] = food.portion;
  const count = grams / per;
  if (Math.abs(count * 2 - Math.round(count * 2)) > 0.01) return gramLabel(food, grams);
  return `${formatCount(count)} ${unitLabel(unit, count)} · ${gramLabel(food, grams)}`;
}

function FoodRow({ food, grams, added, onAdd }: { food: Food; grams: number; added: boolean; onAdd: () => void }) {
  return (
    <button className={cls('pick-row', added && 'on-plate')} onClick={onAdd}>
      <span className="pick-emoji">{food.emoji}</span>
      <span className="pick-info">
        <b>{food.name}</b>
        <span className="muted">{portionText(food, grams)}</span>
      </span>
      <span className="pick-kcal">{foodNutrition(food, grams).kcal} kcal</span>
      <span className="pick-add">{added ? '✓' : '+'}</span>
    </button>
  );
}

/** Alle Lebensmittel zum Durchsuchen – ein Tipp legt sie auf den Teller. */
export function FoodList({
  query,
  personId,
  plate,
  onAdd,
}: {
  query: string;
  personId: PersonId;
  plate: PlateItem[];
  onAdd: (food: Food, grams: number) => void;
}) {
  const data = useData();
  const [group, setGroup] = useState<FoodGroup | 'alle'>('alle');
  const q = query.trim();
  const results = useMemo(() => searchFoods(q, group), [q, group]);
  const recent = useMemo(() => (q || group !== 'alle' ? [] : recentFoods(data.meals, personId)), [q, group, data.meals, personId]);
  const onPlate = new Set(plate.map((p) => p.food.id));

  const row = (food: Food, grams = defaultGrams(food), key = food.id) => (
    <FoodRow key={key} food={food} grams={grams} added={onPlate.has(food.id)} onAdd={() => onAdd(food, grams)} />
  );

  return (
    <>
      <Chips
        className="scroll"
        value={group}
        onChange={setGroup}
        options={[['alle', 'Alle'], ...FOOD_GROUPS.map((g): [FoodGroup, string] => [g.id, `${g.emoji} ${g.label}`])]}
      />
      {!plate.length && <p className="hint">Tippe an, was du gegessen hast – auf dem Teller kannst du die Menge anpassen.</p>}

      {recent.length > 0 && (
        <>
          <p className="group-label">Zuletzt gegessen</p>
          <div className="pick-list">{recent.map((r) => row(r.food, r.grams, `recent-${r.food.id}`))}</div>
        </>
      )}

      {q ? (
        <div className="pick-list">{results.map((f) => row(f))}</div>
      ) : (
        FOOD_GROUPS.filter((g) => group === 'alle' || g.id === group).map((g) => (
          <div key={g.id}>
            <p className="group-label">
              {g.emoji} {g.label}
            </p>
            <div className="pick-list">{results.filter((f) => f.group === g.id).map((f) => row(f))}</div>
          </div>
        ))
      )}

      {!results.length && <p className="hint center">Nichts gefunden. Trag es unter ✏️ Eigenes ein oder mach ein 📸 Foto.</p>}
    </>
  );
}

function PlateRow({ item, onChange, onRemove }: { item: PlateItem; onChange: (grams: number) => void; onRemove: () => void }) {
  const { food, grams } = item;
  const [unit, per] = food.portion;
  const count = grams / per;
  // Beim Tippen darf das Feld kurz leer sein, ohne dass die Menge auf 0 springt.
  const [draft, setDraft] = useState<string | null>(null);

  return (
    <div className="plate-row">
      <span className="plate-emoji">{food.emoji}</span>
      <div className="plate-info">
        <div className="plate-title">
          <b>{food.name}</b>
          <span className="plate-kcal">{foodNutrition(food, grams).kcal} kcal</span>
        </div>
        <div className="plate-amount">
          <button className="icon-btn small" onClick={() => onChange(stepGrams(food, grams, -1))} disabled={count <= 0.5 + 1e-9} aria-label={`${food.name}: weniger`}>
            −
          </button>
          <span className="plate-count">
            {formatCount(count)} {unitLabel(unit, count)}
          </span>
          <button className="icon-btn small" onClick={() => onChange(Math.min(MAX_GRAMS, stepGrams(food, grams, 1)))} aria-label={`${food.name}: mehr`}>
            +
          </button>
          <label className="plate-grams">
            <input
              inputMode="numeric"
              value={draft ?? String(Math.round(grams))}
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                setDraft(v);
                if (Number(v) > 0) onChange(Math.min(MAX_GRAMS, Number(v)));
              }}
              onBlur={() => setDraft(null)}
              aria-label={`${food.name} in ${food.ml ? 'ml' : 'g'}`}
            />
            {food.ml ? 'ml' : 'g'}
          </label>
        </div>
      </div>
      <button className="icon-btn small ghost" onClick={onRemove} aria-label={`${food.name} vom Teller nehmen`}>
        ✕
      </button>
    </div>
  );
}

/** Der Teller unten im Blatt: zugeklappt nur die Summe, aufgeklappt Mengen anpassen. */
export function Plate({ plate, onChange, onLog }: { plate: PlateItem[]; onChange: (plate: PlateItem[]) => void; onLog: () => void }) {
  const [open, setOpen] = useState(false);
  const total = plate.reduce((sum, p) => addNutrition(sum, foodNutrition(p.food, p.grams)), ZERO);
  return (
    <div className="plate">
      <button className="plate-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="plate-head-line">
          <b>🍽️ Dein Teller ({plate.length})</b>
          <span className="plate-toggle">{open ? 'Zuklappen ▾' : 'Mengen ändern ▴'}</span>
        </span>
        <span className="muted plate-summary">
          {open
            ? `Eiweiß ${Math.round(total.protein)} g · Kohlenhydrate ${Math.round(total.carbs)} g · Fett ${Math.round(total.fat)} g`
            : plate.map((p) => `${p.food.name} ${gramLabel(p.food, p.grams)}`).join(' · ')}
        </span>
      </button>
      {open && (
        <div className="plate-items">
          {plate.map((item, i) => (
            <PlateRow
              key={item.food.id}
              item={item}
              onChange={(grams) => onChange(plate.map((p, j) => (j === i ? { ...p, grams } : p)))}
              onRemove={() => onChange(plate.filter((_, j) => j !== i))}
            />
          ))}
        </div>
      )}
      <button className="btn primary block" onClick={onLog}>
        Eintragen · {total.kcal} kcal
      </button>
    </div>
  );
}
