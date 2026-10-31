import { useSyncExternalStore } from 'react';
import type { GameId } from '../games/registry';
import { todayKey } from './date';
import type { MealType } from './types';

export type Tab = 'heute' | 'sport' | 'essen' | 'einkauf' | 'liebe' | 'spiele';
export type LoveView = 'wir' | 'zyklus';

export type SheetState =
  | { type: 'exercise'; id: string; date?: string; planFirst?: boolean }
  | { type: 'recipe'; id: string; date?: string }
  | { type: 'addMeal'; date: string; meal: MealType }
  | { type: 'foodScan'; date: string; meal: MealType }
  | { type: 'sync'; code?: string }
  | { type: 'settings' }
  | { type: 'cheer' }
  | { type: 'couple' }
  | { type: 'weekGoal' }
  | { type: 'streak' }
  | { type: 'steps'; date: string }
  | { type: 'health' }
  | { type: 'events' }
  /** Termin ansehen/ändern (`id`) oder neu anlegen; `back`: danach wieder zur Terminliste. */
  | { type: 'event'; id?: string; date?: string; back?: boolean }
  | { type: 'calendar'; back?: boolean }
  | { type: 'gesund'; view?: 'routinen' | 'tipps' }
  | { type: 'photo'; id: string }
  | { type: 'memos' }
  /** Notiz öffnen (`id`) oder neu anlegen (aus `template`); `back`: danach wieder zur Notizliste. */
  | { type: 'memo'; id?: string; template?: string; back?: boolean }
  | { type: 'game'; id: GameId; join?: string };

interface UIState {
  tab: Tab;
  sheet: SheetState | null;
  sportDate: string;
  foodDate: string;
  loveView: LoveView;
}

let state: UIState = { tab: 'heute', sheet: null, sportDate: todayKey(), foodDate: todayKey(), loveView: 'wir' };
const listeners = new Set<() => void>();
/** Welcher Tag gerade „heute“ ist – Sport und Essen starten auf diesem Tag. */
let shownToday = state.sportDate;

function set(changes: Partial<UIState>) {
  state = { ...state, ...changes };
  listeners.forEach((l) => l());
}

export const getUI = () => state;

export function useUI(): UIState {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    () => state,
  );
}

export const nav = {
  setTab(tab: Tab) {
    nav.followToday();
    set({ tab });
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  },
  /**
   * Ein neuer Tag hat begonnen (auf dem Handy bleibt Arta oft über Nacht offen): Wer bei Sport
   * oder Essen auf „heute“ stand, steht danach wieder auf heute. Ein bewusst gewählter Tag bleibt.
   */
  followToday(today = todayKey()) {
    if (today === shownToday) return;
    const changes: Partial<UIState> = {};
    if (state.sportDate === shownToday) changes.sportDate = today;
    if (state.foodDate === shownToday) changes.foodDate = today;
    shownToday = today;
    if (changes.sportDate || changes.foodDate) set(changes);
  },
  open(sheet: SheetState) {
    set({ sheet });
  },
  close() {
    set({ sheet: null });
  },
  setSportDate(sportDate: string) {
    set({ sportDate });
  },
  setFoodDate(foodDate: string) {
    set({ foodDate });
  },
  setLoveView(loveView: LoveView) {
    set({ loveView });
  },
  /** Direkt in den Periodenkalender unter „Liebe“ springen. */
  openCycle() {
    set({ loveView: 'zyklus' });
    nav.setTab('liebe');
  },
};
