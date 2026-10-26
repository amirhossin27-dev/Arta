import { useEffect, useState, useSyncExternalStore } from 'react';
import { todayKey } from './date';
import { useData, useDevice } from './store';
import { other } from './types';

export function usePeople() {
  const data = useData();
  const device = useDevice();
  const me = data.persons[device.me];
  const partner = data.persons[other(device.me)];
  return { me, partner, names: { me: me.name, partner: partner.name } };
}

/** Aktuelles Datum, das sich um Mitternacht (bzw. beim Zurückkehren in die App) aktualisiert. */
export function useToday(): string {
  const [today, setToday] = useState(todayKey);
  useEffect(() => {
    const check = () => setToday(todayKey());
    const id = setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
  return today;
}

const subscribeVisibility = (fn: () => void) => {
  document.addEventListener('visibilitychange', fn);
  return () => document.removeEventListener('visibilitychange', fn);
};

/** Ist die App gerade zu sehen (nicht im Hintergrund)? */
export function useVisible(): boolean {
  return useSyncExternalStore(subscribeVisibility, () => document.visibilityState !== 'hidden');
}

export function cls(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
