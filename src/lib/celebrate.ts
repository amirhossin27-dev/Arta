import { EXERCISE_BY_ID } from '../data/exercises';
import { ALL_DONE, MEAL_LOGGED, STEP_GOAL, STEP_MILESTONE, TOGETHER_DONE, WORKOUT_DONE } from '../data/messages';
import { showLove } from './love';
import { pickRandom } from './random';
import { groupComplete, planFor } from './stats';
import { formatSteps, goalReached } from './steps';
import { getData, getDevice } from './store';
import { fill } from './text';
import { other } from './types';

function names() {
  const d = getData();
  const me = getDevice().me;
  return { me: d.persons[me].name, partner: d.persons[other(me)].name };
}

/** Passende Liebes-Einblendung nach einer erledigten Einheit. */
export function celebrateDone(planId: string) {
  const d = getData();
  const item = d.plan[planId];
  if (!item) return;
  const ex = EXERCISE_BY_ID[item.exerciseId];
  const n = names();
  if (item.groupId && groupComplete(d, item.groupId)) {
    showLove({ emoji: '💞', title: 'Gemeinsam geschafft!', text: pickRandom(TOGETHER_DONE), big: true, tone: 'party' });
    return;
  }
  const day = planFor(d, item.date, item.personId);
  if (day.length >= 2 && day.every((p) => p.done)) {
    showLove({ emoji: '🏆', title: 'Tagesplan komplett!', text: fill(pickRandom(ALL_DONE), n), big: true, tone: 'party' });
    return;
  }
  showLove({ emoji: ex.emoji, title: `${ex.name} ✓`, text: fill(pickRandom(WORKOUT_DONE), n), tone: 'sport' });
}

export function celebrateMeal(name: string) {
  showLove({ emoji: '🍽️', title: `${name} eingetragen`, text: pickRandom(MEAL_LOGGED), tone: 'food' });
}

/** Schrittziel erreicht (große Einblendung) oder – beim Mitzählen – wieder ein Tausender voll. */
export function celebrateSteps(before: number, after: number, goal: number, today: boolean, milestone?: number) {
  if (goalReached(before, after, goal)) {
    showLove({
      emoji: '🏆',
      title: today ? `${formatSteps(goal)} Schritte geschafft!` : 'Schrittziel erreicht!',
      text: fill(pickRandom(STEP_GOAL), names()),
      big: today,
      tone: 'party',
    });
    return;
  }
  if (milestone && Math.floor(after / milestone) > Math.floor(before / milestone)) {
    showLove({ emoji: '👣', title: `${formatSteps(Math.floor(after / milestone) * milestone)} Schritte`, text: fill(pickRandom(STEP_MILESTONE), names()), tone: 'sport' });
  }
}
