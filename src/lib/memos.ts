import { formatDateTime } from './date';
import { alive } from './stats';
import type { AppData, Memo, MemoColor, MemoItem, PersonId } from './types';

/** Grenzen, damit der verschlüsselte Stand im Live-Raum klein bleibt. */
export const MAX_MEMOS = 150;
export const MAX_MEMO_TEXT = 4000;
export const MAX_MEMO_TITLE = 80;
export const MAX_MEMO_ITEMS = 80;
export const MAX_ITEM_TEXT = 200;

export const MEMO_COLORS: { id: MemoColor; label: string }[] = [
  { id: 'gelb', label: 'Gelb' },
  { id: 'rosa', label: 'Rosa' },
  { id: 'pfirsich', label: 'Pfirsich' },
  { id: 'mint', label: 'Mint' },
  { id: 'himmel', label: 'Himmelblau' },
  { id: 'lila', label: 'Lila' },
];

export const MEMO_EMOJIS = ['📝', '💡', '🧳', '🎁', '🎬', '🏠', '✈️', '🍳', '📚', '🎵', '💭', '❤️', '🛠️', '💰', '🌱', '🐾', '🎉', '📌'];

export interface MemoTemplate {
  id: string;
  emoji: string;
  title: string;
  color: MemoColor;
  /** Listen-Vorlagen springen direkt zum ersten Punkt statt in den Text. */
  list: boolean;
  /** Platzhalter für den ersten Punkt. */
  hint?: string;
}

/** Schnellstart beim Anlegen – „Freie Notiz“ zuerst. */
export const MEMO_TEMPLATES: MemoTemplate[] = [
  { id: 'frei', emoji: '📝', title: '', color: 'gelb', list: false },
  { id: 'packliste', emoji: '🧳', title: 'Packliste', color: 'himmel', list: true, hint: 'z. B. Ladekabel' },
  { id: 'geschenke', emoji: '🎁', title: 'Geschenkideen', color: 'rosa', list: true, hint: 'z. B. Kochkurs zu zweit' },
  { id: 'filme', emoji: '🎬', title: 'Filme & Serien', color: 'lila', list: true, hint: 'z. B. ein Filmklassiker' },
  { id: 'zuhause', emoji: '🏠', title: 'To-dos Zuhause', color: 'mint', list: true, hint: 'z. B. Lampe aufhängen' },
  { id: 'reisen', emoji: '✈️', title: 'Reiseträume', color: 'pfirsich', list: true, hint: 'z. B. Lissabon' },
  { id: 'rezepte', emoji: '🍳', title: 'Rezepte zum Ausprobieren', color: 'gelb', list: true, hint: 'z. B. Shakshuka' },
  { id: 'wuensche', emoji: '💭', title: 'Wünsche & Träume', color: 'lila', list: false },
];

export const templateById = (id?: string) => MEMO_TEMPLATES.find((t) => t.id === id);

/** Alle Punkte einer Notiz: offene oben, erledigte darunter – jeweils in der Reihenfolge des Anlegens. */
export function itemsOf(d: AppData, memoId: string): MemoItem[] {
  return alive(d.memoItems)
    .filter((i) => i.memoId === memoId)
    .sort((a, b) => Number(a.done) - Number(b.done) || a.pos - b.pos || a.id.localeCompare(b.id));
}

/** Die letzte Änderung an einer Notiz – am Text oder an einem ihrer Punkte (auch gelöschten). */
export function lastChange(d: AppData, m: Memo): { at: number; by: PersonId } {
  let at = m.updatedAt;
  let by = m.editedBy;
  for (const i of Object.values(d.memoItems)) {
    if (i.memoId === m.id && i.updatedAt > at) {
      at = i.updatedAt;
      by = i.by;
    }
  }
  return { at, by };
}

/** Angepinnte zuerst, sonst die zuletzt geänderte oben. */
export function sortedMemos(d: AppData): Memo[] {
  const changed = new Map<string, number>();
  for (const m of alive(d.memos)) changed.set(m.id, m.updatedAt);
  for (const i of Object.values(d.memoItems)) {
    const cur = changed.get(i.memoId);
    if (cur !== undefined && i.updatedAt > cur) changed.set(i.memoId, i.updatedAt);
  }
  return alive(d.memos).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || changed.get(b.id)! - changed.get(a.id)!);
}

/** Hat der Schatz die Notiz geändert, seit du sie zuletzt offen hattest? */
export function isUnseen(d: AppData, m: Memo, me: PersonId, seen: Record<string, number> | undefined): boolean {
  const c = lastChange(d, m);
  return c.by !== me && c.at > (seen?.[m.id] ?? 0);
}

/** Leere Notizen (kein Titel, kein Text, keine Punkte) räumt Arta beim Schließen weg. */
export function memoIsEmpty(d: AppData, m: Memo): boolean {
  return !m.title.trim() && !m.text.trim() && itemsOf(d, m.id).length === 0;
}

/** Suche in Titel, Text und Punkten (ohne Groß-/Kleinschreibung). */
export function matchesMemo(d: AppData, m: Memo, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (m.title.toLowerCase().includes(q) || m.text.toLowerCase().includes(q)) return true;
  return itemsOf(d, m.id).some((i) => i.text.toLowerCase().includes(q));
}

/** Überschrift für Liste und Mitteilung – ohne Titel die erste Textzeile bzw. der erste Punkt. */
export function memoLabel(d: AppData, m: Memo): string {
  const first = m.text.trim().split('\n')[0] || itemsOf(d, m.id)[0]?.text || '';
  const label = m.title.trim() || first.trim();
  if (!label) return 'Notiz';
  return label.length > 60 ? `${label.slice(0, 57)}…` : label;
}

/** „1 neue Notiz 📝“ / „3 neue Notizen 📝“ für die Sync-Einblendungen. */
export const memosText = (n: number) => `${n} neue Notiz${n === 1 ? '' : 'en'} 📝`;

/** „gerade eben“, „vor 5 Min.“, „vor 2 Std.“ – sonst Tag und Uhrzeit. */
export function agoText(ts: number, now = Date.now()): string {
  const min = Math.floor((now - ts) / 60_000);
  if (min < 1) return 'gerade eben';
  if (min < 60) return `vor ${min} Min.`;
  if (min < 6 * 60) return `vor ${Math.floor(min / 60)} Std.`;
  return formatDateTime(ts);
}
