const pad = (n: number) => String(n).padStart(2, '0');

const WEEKDAYS_SHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const MONTHS = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

/** Datumsschlüssel im Format YYYY-MM-DD (lokale Zeit). */
export function toKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayKey(): string {
  return toKey(new Date());
}

export function fromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: string, n: number): string {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

/** Anzahl Tage von a bis b (positiv, wenn b später liegt). */
export function diffDays(a: string, b: string): number {
  return Math.round((fromKey(b).getTime() - fromKey(a).getTime()) / 86_400_000);
}

/** Montag der Woche, in der `key` liegt. */
export function startOfWeek(key: string): string {
  const day = (fromKey(key).getDay() + 6) % 7;
  return addDays(key, -day);
}

export function weekdayShort(key: string): string {
  return WEEKDAYS_SHORT[fromKey(key).getDay()];
}

export function formatLong(key: string): string {
  const d = fromKey(key);
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]}`;
}

export function formatShort(key: string): string {
  const d = fromKey(key);
  return `${d.getDate()}. ${MONTHS[d.getMonth()].slice(0, 3)}.`;
}

export function formatDate(key: string): string {
  const d = fromKey(key);
  return `${d.getDate()}. ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function relativeDay(key: string, today = todayKey()): string {
  const diff = diffDays(today, key);
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Morgen';
  if (diff === -1) return 'Gestern';
  return `${weekdayShort(key)}, ${formatShort(key)}`;
}

export function greeting(date = new Date()): { text: string; emoji: string } {
  const h = date.getHours();
  if (h < 5) return { text: 'Gute Nacht', emoji: '🌙' };
  if (h < 11) return { text: 'Guten Morgen', emoji: '☀️' };
  if (h < 14) return { text: 'Hallo', emoji: '🌤️' };
  if (h < 18) return { text: 'Schönen Nachmittag', emoji: '🌻' };
  return { text: 'Guten Abend', emoji: '🌙' };
}

/** Nächster Jahrestag (gleicher Tag/Monat) ab heute. */
export function nextAnniversary(anniversary: string, today = todayKey()): { date: string; years: number; inDays: number } {
  const start = fromKey(anniversary);
  const t = fromKey(today);
  let years = t.getFullYear() - start.getFullYear();
  let next = new Date(start.getFullYear() + years, start.getMonth(), start.getDate());
  if (next < t) {
    years += 1;
    next = new Date(start.getFullYear() + years, start.getMonth(), start.getDate());
  }
  const key = toKey(next);
  return { date: key, years, inDays: diffDays(today, key) };
}

export function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDateTime(ts: number, today = todayKey()): string {
  const key = toKey(new Date(ts));
  return `${relativeDay(key, today)}, ${formatTime(ts)}`;
}
