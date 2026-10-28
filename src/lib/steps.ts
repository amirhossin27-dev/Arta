import { addDays, startOfWeek } from './date';
import type { AppData, PersonId } from './types';

export const DEFAULT_STEP_GOAL = 8000;
/** Obergrenze gegen Tippfehler (100.000 Schritte sind schon ein Ultramarathon). */
export const MAX_STEPS = 100_000;
export const STEP_GOALS = [5000, 6000, 7000, 8000, 10_000, 12_000, 15_000];
/** Herzpunkte pro Tag mit erreichtem Schrittziel. */
export const STEP_GOAL_POINTS = 5;
/** Durchschnittliche Schrittlänge beim Gehen in Metern. */
const STRIDE_M = 0.75;

export interface DaySteps {
  date: string;
  count: number;
  goal: number;
  /** Zeitpunkt des Apple-Health-Stands, der in `count` steckt. */
  healthAt?: number;
  /** Davon von Hand dazugezählt. */
  extra?: number;
}

export function stepsOn(d: AppData, date: string, person: PersonId): DaySteps {
  const rec = d.steps[`${date}-${person}`];
  if (rec && !rec.deleted) return { date, count: rec.count, goal: rec.goal || d.persons[person].stepGoal, healthAt: rec.healthAt, extra: rec.extra };
  return { date, count: 0, goal: d.persons[person].stepGoal };
}

/** Die sieben Tage (Mo–So) der Woche, in der `date` liegt. */
export function weekSteps(d: AppData, date: string, person: PersonId): DaySteps[] {
  const start = startOfWeek(date);
  return Array.from({ length: 7 }, (_, i) => stepsOn(d, addDays(start, i), person));
}

export const goalReached = (before: number, after: number, goal: number) => goal > 0 && before < goal && after >= goal;

/** 8432 → „8.432“ */
export function formatSteps(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** Grobe Strecke, z. B. „4,7 km“. */
export function stepsKm(n: number): string {
  const km = (n * STRIDE_M) / 1000;
  return `${km.toFixed(km < 10 ? 1 : 0).replace('.', ',')} km`;
}

/** Grober Verbrauch beim Gehen: etwa 0,5 kcal pro 1.000 Schritte und kg Körpergewicht. */
export function stepsKcal(n: number, weightKg: number): number {
  return Math.round(n * weightKg * 0.0005);
}

/** Kleiner Wettstreit-Satz für die Schritte-Karte. */
export function stepDuel(mine: number, theirs: number, partnerName: string): string {
  if (!mine && !theirs) return `Wer von euch macht heute die ersten Schritte? 👣`;
  const diff = Math.abs(mine - theirs);
  if (diff < 100) return `Kopf an Kopf mit ${partnerName} – wie romantisch! 💞`;
  if (mine > theirs) return `Du liegst ${formatSteps(diff)} Schritte vor ${partnerName} 😏`;
  return `${partnerName} ist ${formatSteps(diff)} Schritte vorne – hol auf! 🏃`;
}
