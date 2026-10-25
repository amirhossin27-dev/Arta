import { useEffect, useState } from 'react';
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

export function cls(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
