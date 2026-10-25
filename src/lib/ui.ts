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
  | { type: 'who' }
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

function set(changes: Partial<UIState>) {
  state = { ...state, ...changes };
  listeners.forEach((l) => l());
}

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
    set({ tab });
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
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
