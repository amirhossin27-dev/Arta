import { EXERCISE_BY_ID } from '../data/exercises';
import { LEVELS } from '../data/messages';
import { addDays, startOfWeek } from './date';
import { exerciseKcal, ZERO, type Nutrition } from './nutrition';
import { ROUTINE_DAY_POINTS } from './routines';
import { STEP_GOAL_POINTS } from './steps';
import type { AppData, LoveNote, MealEntry, PersonId, PlanItem, Rec, Slot } from './types';

export function alive<T extends Rec>(col: Record<string, T>): T[] {
  return Object.values(col).filter((r) => !r.deleted);
}

export const SLOT_ORDER: Slot[] = ['morgens', 'mittags', 'abends'];
export const SLOT_LABEL: Record<Slot, { label: string; emoji: string }> = {
  morgens: { label: 'Morgens', emoji: '🌅' },
  mittags: { label: 'Mittags', emoji: '☀️' },
  abends: { label: 'Abends', emoji: '🌙' },
};

export function planFor(d: AppData, date: string, person: PersonId): PlanItem[] {
  return alive(d.plan)
    .filter((p) => p.date === date && p.personId === person && EXERCISE_BY_ID[p.exerciseId])
    .sort(
      (a, b) =>
        SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot) ||
        (a.time ?? '99').localeCompare(b.time ?? '99') ||
        a.id.localeCompare(b.id),
    );
}

export function mealsFor(d: AppData, date: string, person: PersonId): MealEntry[] {
  return alive(d.meals).filter((m) => m.date === date && m.personId === person);
}

export function sumMeals(meals: MealEntry[]): Nutrition {
  return meals.reduce(
    (acc, m) => ({
      kcal: acc.kcal + m.kcal,
      protein: acc.protein + m.protein,
      carbs: acc.carbs + m.carbs,
      fat: acc.fat + m.fat,
    }),
    { ...ZERO },
  );
}

export function burnedFor(d: AppData, date: string, person: PersonId): number {
  const weight = d.persons[person].weightKg;
  return planFor(d, date, person)
    .filter((p) => p.done)
    .reduce((sum, p) => sum + exerciseKcal(EXERCISE_BY_ID[p.exerciseId], weight), 0);
}

export function activeMinutes(d: AppData, date: string, person: PersonId): number {
  return planFor(d, date, person)
    .filter((p) => p.done)
    .reduce((sum, p) => sum + EXERCISE_BY_ID[p.exerciseId].minutes, 0);
}

function doneDates(d: AppData, person: PersonId): Set<string> {
  return new Set(alive(d.plan).filter((p) => p.personId === person && p.done).map((p) => p.date));
}

function countStreak(has: (date: string) => boolean, today: string): number {
  // Heute noch nichts gemacht? Dann zählt die Serie bis gestern.
  let day = has(today) ? today : addDays(today, -1);
  let n = 0;
  while (has(day)) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

export function streak(d: AppData, person: PersonId, today: string): number {
  const dates = doneDates(d, person);
  return countStreak((x) => dates.has(x), today);
}

export function coupleStreak(d: AppData, today: string): number {
  const a = doneDates(d, 'a');
  const b = doneDates(d, 'b');
  return countStreak((x) => a.has(x) && b.has(x), today);
}

export function weekDone(d: AppData, today: string): { a: number; b: number; total: number } {
  const start = startOfWeek(today);
  const end = addDays(start, 6);
  const done = alive(d.plan).filter((p) => p.done && p.date >= start && p.date <= end);
  const a = done.filter((p) => p.personId === 'a').length;
  return { a, b: done.length - a, total: done.length };
}

export function groupComplete(d: AppData, groupId: string): boolean {
  const items = alive(d.plan).filter((p) => p.groupId === groupId);
  return items.length >= 2 && items.every((p) => p.done);
}

/** Herzpunkte des Paares – werden aus den Daten berechnet, nicht gespeichert. */
export function points(d: AppData): number {
  let pts = 0;
  const groups = new Map<string, PlanItem[]>();
  for (const p of alive(d.plan)) {
    if (p.done) pts += 10;
    if (p.groupId) groups.set(p.groupId, [...(groups.get(p.groupId) ?? []), p]);
  }
  for (const items of groups.values()) {
    if (items.length >= 2 && items.every((p) => p.done)) pts += 10;
  }
  for (const n of alive(d.notes)) if (n.kind === 'note') pts += 3;
  for (const h of alive(d.hearts)) pts += Math.min(h.count, 10);
  for (const c of alive(d.coupons)) if (c.redeemedAt) pts += 5;
  pts += alive(d.moods).length;
  const mealDays = new Map<string, number>();
  for (const m of alive(d.meals)) {
    const key = `${m.date}-${m.personId}`;
    mealDays.set(key, (mealDays.get(key) ?? 0) + 1);
  }
  for (const count of mealDays.values()) if (count >= 3) pts += 5;
  for (const s of alive(d.steps)) if (s.goal > 0 && s.count >= s.goal) pts += STEP_GOAL_POINTS;
  for (const r of alive(d.routineDays)) if (r.total > 0 && r.done.length >= r.total) pts += ROUTINE_DAY_POINTS;
  return pts;
}

export function levelInfo(pts: number) {
  let idx = 0;
  for (let i = 0; i < LEVELS.length; i++) if (pts >= LEVELS[i].min) idx = i;
  const current = LEVELS[idx];
  const next = LEVELS[idx + 1];
  const progress = next ? (pts - current.min) / (next.min - current.min) : 1;
  return { level: idx + 1, current, next, progress };
}

export function heartsOn(d: AppData, date: string, from: PersonId): number {
  const h = d.hearts[`${date}-${from}`];
  return h && !h.deleted ? h.count : 0;
}

export function moodOn(d: AppData, date: string, person: PersonId): string | undefined {
  const m = d.moods[`${date}-${person}`];
  return m && !m.deleted ? m.mood : undefined;
}

export function notesFor(d: AppData, me: PersonId): { inbox: LoveNote[]; sent: LoveNote[] } {
  const all = alive(d.notes).sort((x, y) => y.createdAt - x.createdAt);
  return {
    // Überraschungen bleiben verborgen, bis sie eingeblendet wurden.
    inbox: all.filter((n) => n.to === me && (!n.surprise || n.seen)),
    sent: all.filter((n) => n.from === me),
  };
}

export function unreadNotes(d: AppData, me: PersonId): LoveNote[] {
  return alive(d.notes)
    .filter((n) => n.to === me && !n.seen && !n.surprise)
    .sort((x, y) => x.createdAt - y.createdAt);
}

export function pendingSurprises(d: AppData, me: PersonId): LoveNote[] {
  return alive(d.notes)
    .filter((n) => n.to === me && !n.seen && n.surprise)
    .sort((x, y) => x.createdAt - y.createdAt);
}
