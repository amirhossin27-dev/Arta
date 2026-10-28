import { useSyncExternalStore } from 'react';
import { toKey } from './date';
import { setHealthSteps } from './pedometer';
import { stepsOn, type DaySteps } from './steps';
import { getData, getDevice } from './store';
import type { PersonId } from './types';

/**
 * Schritte aus Apple Health: Ein iPhone-Kurzbefehl liest die Schritte von heute und schreibt sie
 * – auch wenn Arta zu ist – als kleinen Eintrag `health-a` / `health-b` in euren Live-Raum.
 * Der Eintrag hat dieselbe Form wie die Geräte-Stände (siehe database.rules.json), ist aber
 * nicht verschlüsselt, weil Kurzbefehle das nicht können: Er enthält nur die Schrittzahl.
 *
 *   { "v": 1, "at": {".sv": "timestamp"}, "iv": "health", "ct": "8432" }
 *
 * Der Kurzbefehl baut das mit „Haupttext anfordern: JSON“ selbst zusammen (Anleitung in
 * components/healthSetup.tsx) – eine von Hand getippte Text-Vorlage scheitert an Kleinigkeiten.
 * `at` setzt die Datenbank selbst (Serverzeit) – daraus ergibt sich der Tag.
 */
export const HEALTH_PREFIX = 'health-';

export interface HealthSteps {
  date: string;
  count: number;
  /** Wann der Kurzbefehl zuletzt geschickt hat. */
  at: number;
  /** Die letzte Nachricht hatte keine lesbare Schrittzahl (Variable im Kurzbefehl vergessen?). */
  broken?: boolean;
}

export const isHealth = (name: string) => name.startsWith(HEALTH_PREFIX);

/** Liest eine Zahl wie „8432“, „8.432“, „8,432“, „8432 Schritte“ oder „8432,0“. */
function parseNumber(text: string): number | undefined {
  const m = text.match(/\d[\d.,'\u00a0\u202f ]*/);
  if (!m) return undefined;
  let token = m[0].replace(/[\s'\u00a0\u202f]/g, '').replace(/[.,]+$/, '');
  if (token.includes('.') && token.includes(',')) {
    // „1.234,5“ oder „1,234.5“: Das letzte Trennzeichen steht vor den Nachkommastellen.
    const dec = token.lastIndexOf(',') > token.lastIndexOf('.') ? ',' : '.';
    token = token.split(dec === ',' ? '.' : ',').join('').replace(dec, '.');
  } else if (/^\d{1,3}([.,]\d{3})+$/.test(token)) {
    token = token.replace(/[.,]/g, '');
  } else {
    token = token.replace(',', '.');
  }
  const n = Number(token);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * Liest die Schrittzahl aus dem, was der Kurzbefehl schickt – je nach iPhone-Sprache z. B.
 * „8432“, „8.432“ oder „8432 Schritte“. Kommen mehrere Messungen (eine pro Zeile, wenn im
 * Kurzbefehl nicht nach Tag gruppiert ist), werden sie zusammengezählt.
 */
export function parseStepText(text: string): number | undefined {
  const values = text
    .split(/[\r\n]+/)
    .map(parseNumber)
    .filter((n): n is number => n !== undefined);
  if (!values.length) return undefined;
  const sum = Math.round(values.reduce((a, b) => a + b, 0));
  return sum <= 200_000 ? sum : undefined;
}

export function parseHealthNode(node: unknown): HealthSteps | undefined {
  const n = node as { at?: unknown; ct?: unknown } | null;
  if (!n || typeof n !== 'object' || typeof n.at !== 'number' || typeof n.ct !== 'string') return undefined;
  const count = parseStepText(n.ct);
  if (count === undefined) return undefined;
  return { date: toKey(new Date(n.at)), count, at: n.at };
}

let health: Partial<Record<PersonId, HealthSteps>> = {};
const listeners = new Set<() => void>();

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

const getHealth = () => health;

export function useHealth(): Partial<Record<PersonId, HealthSteps>> {
  return useSyncExternalStore(subscribe, getHealth, getHealth);
}

function setHealth(next: Partial<Record<PersonId, HealthSteps>>) {
  health = next;
  listeners.forEach((l) => l());
}

export function clearHealth() {
  if (Object.keys(health).length) setHealth({});
}

/**
 * Ein `health-…`-Eintrag aus dem Live-Raum. Für dich selbst übernimmt Arta die Zahl in deinen
 * Schritte-Tag (dein Handy schreibt ja nur deine eigenen Daten); beim Partner wird sie nur
 * angezeigt, bis sein Handy sie selbst übernimmt.
 *
 * Apple Health ist dabei die Wahrheit: Ein neuerer Stand ersetzt, was Arta mitgezählt hat, denn
 * das iPhone hat dieselben Schritte selbst gezählt. (Früher galt das Maximum – dann blieb eine zu
 * hohe Zahl für immer stehen.) Derselbe Stand kommt bei jedem Verbinden wieder an; `healthAt` im
 * Schritte-Tag merkt sich, welcher schon drinsteckt, damit seitdem Mitgezähltes nicht verloren geht.
 */
export function applyHealthNode(name: string, node: unknown) {
  const person = name.slice(HEALTH_PREFIX.length);
  if (person !== 'a' && person !== 'b') return;
  const h = parseHealthNode(node);
  const cur = health[person];
  if (!h) {
    const at = (node as { at?: unknown } | null)?.at;
    if (typeof at === 'number') {
      // Der Kurzbefehl läuft, schickt aber keine Zahl mit – die letzte gute bleibt stehen.
      if (!cur?.broken) setHealth({ ...health, [person]: { ...(cur ?? { date: toKey(new Date(at)), count: 0, at }), broken: true } });
    } else if (cur) {
      const next = { ...health };
      delete next[person];
      setHealth(next);
    }
    return;
  }
  if (!cur || cur.broken || cur.at !== h.at || cur.count !== h.count) setHealth({ ...health, [person]: h });
  if (person === getDevice().me && isNewer(h, stepsOn(getData(), h.date, person))) setHealthSteps(h.date, h.count, h.at);
}

/** Steckt dieser Health-Stand noch nicht in den gespeicherten Schritten des Tages? */
const isNewer = (h: HealthSteps, s: DaySteps) => !h.broken && h.date === s.date && h.at > (s.healthAt ?? 0);

/** Schritte eines Tages inklusive eines Health-Stands, den das Handy der Person noch nicht übernommen hat. */
export function withHealth(s: DaySteps, person: PersonId): DaySteps {
  const h = health[person];
  return h && isNewer(h, s) ? { ...s, count: h.count + (s.extra ?? 0), healthAt: h.at } : s;
}
