import { useSyncExternalStore } from 'react';
import { drawScaled, loadBitmap } from './image';
import type { MealType } from './types';

/**
 * Foto-Erkennung fürs Essen: Das Bild geht direkt vom Handy an Claude (Anthropic API),
 * die Antwort kommt als JSON mit Zutaten, geschätzten Grammangaben und Nährwerten pro 100 g.
 * Den API-Schlüssel trägt jede Person selbst ein – er bleibt nur auf diesem Gerät.
 */

export const SCAN_MODEL = 'claude-opus-5-5';

/** Längste Bildseite in Pixeln: reicht für Essen und hält Upload und Kosten klein. */
const MAX_SIDE = 1024;

// ───── API-Schlüssel (nur auf diesem Gerät, nie im Sync oder Backup) ─────

const KEY_STORAGE = 'arta.ai.v1';
const keyListeners = new Set<() => void>();

function readKey(): string {
  try {
    return localStorage.getItem(KEY_STORAGE) ?? '';
  } catch {
    return '';
  }
}

let apiKey = readKey();

export function getApiKey(): string {
  return apiKey;
}

export function setApiKey(key: string) {
  apiKey = key.trim();
  try {
    if (apiKey) localStorage.setItem(KEY_STORAGE, apiKey);
    else localStorage.removeItem(KEY_STORAGE);
  } catch {
    // Ohne Speicher gilt der Schlüssel nur bis zum Neuladen.
  }
  keyListeners.forEach((l) => l());
}

export function useApiKey(): string {
  return useSyncExternalStore(
    (fn) => {
      keyListeners.add(fn);
      return () => {
        keyListeners.delete(fn);
      };
    },
    getApiKey,
  );
}

export function looksLikeApiKey(key: string): boolean {
  return /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key.trim());
}

// ───── Ergebnis ─────

export type Confidence = 'hoch' | 'mittel' | 'niedrig';

export interface ScanItem {
  name: string;
  emoji: string;
  grams: number;
  /** Nährwerte pro 100 g so, wie es auf dem Teller liegt (gegart, mit Soße …). */
  kcal100: number;
  protein100: number;
  carbs100: number;
  fat100: number;
}

export interface ScanResult {
  isFood: boolean;
  dish: string;
  emoji: string;
  confidence: Confidence;
  note: string;
  items: ScanItem[];
}

export interface ScanTotals {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

const RESULT_SCHEMA = {
  type: 'object',
  properties: {
    is_food: { type: 'boolean', description: 'false, wenn auf dem Foto kein Essen oder Getränk zu sehen ist.' },
    dish: { type: 'string', description: 'Kurzer deutscher Name des Gerichts, z. B. „Spaghetti Bolognese“.' },
    emoji: { type: 'string', description: 'Ein passendes Emoji.' },
    confidence: { type: 'string', enum: ['hoch', 'mittel', 'niedrig'] },
    note: { type: 'string', description: 'Ein kurzer, freundlicher deutscher Satz zu den wichtigsten Annahmen.' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Deutscher Name der Komponente.' },
          emoji: { type: 'string' },
          grams: { type: 'number', description: 'Geschätzte Menge auf dem Foto in Gramm (Getränke: ml).' },
          kcal_per_100g: { type: 'number' },
          protein_per_100g: { type: 'number' },
          carbs_per_100g: { type: 'number' },
          fat_per_100g: { type: 'number' },
        },
        required: ['name', 'emoji', 'grams', 'kcal_per_100g', 'protein_per_100g', 'carbs_per_100g', 'fat_per_100g'],
        additionalProperties: false,
      },
    },
  },
  required: ['is_food', 'dish', 'emoji', 'confidence', 'note', 'items'],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `Du bist die Ernährungs-KI in „Arta“, einer deutschsprachigen App, mit der Paare ihr Essen und ihre Kalorien festhalten. Du bekommst ein Foto einer Mahlzeit und schätzt, was darauf zu sehen ist und wie viele Kalorien es hat.

So gehst du vor:
- Erkenne das Gericht und zerlege es in seine sichtbaren Komponenten (z. B. Nudeln, Soße, Käse, Salat). Fasse Kleinkram zusammen, höchstens 10 Komponenten.
- Schätze die Menge jeder Komponente in Gramm so, wie sie auf dem Teller liegt (gegart). Nutze Teller (meist ca. 26 cm), Besteck, Hände, Verpackungen und Gläser als Größenmaßstab. Bei Getränken entspricht 1 ml etwa 1 g.
- Denke an versteckte Kalorien: Bratöl, Butter, Dressing, Soßen, Zucker in Getränken. Wenn sie wahrscheinlich sind, führe sie als eigene Komponente auf.
- Gib Nährwerte pro 100 g für die Komponente im gezeigten Zustand an, orientiert an üblichen Nährwerttabellen (z. B. Bundeslebensmittelschlüssel). Kalorien und Makros sollen zueinander passen.
- Sieht man Verpackungen mit Nährwertangaben, nutze diese.
- Wenn mehrere Portionen zu sehen sind (z. B. zwei Teller), schätze nur eine Portion und erwähne das in der Notiz.
- Wenn die Person einen Hinweis gibt (z. B. „das ist Tofu, kein Hähnchen“ oder „nur die Hälfte gegessen“), hat dieser Vorrang vor deinem Eindruck.
- Ist auf dem Foto kein Essen und kein Getränk, setze is_food auf false und gib eine leere Liste zurück.
- Alle Texte auf Deutsch. Die Notiz ist ein kurzer, warmherziger Satz (höchstens 140 Zeichen), gern mit einem Emoji.
- confidence: „hoch“, wenn Gericht und Menge gut erkennbar sind, „niedrig“, wenn vieles verdeckt oder unklar ist.`;

/** Mahlzeit, die gerade am wahrscheinlichsten ist. */
export function guessMeal(date = new Date()): MealType {
  const h = date.getHours() + date.getMinutes() / 60;
  if (h < 10.5) return 'fruehstueck';
  if (h < 14.5) return 'mittag';
  if (h < 17.5) return 'snack';
  return 'abend';
}

function num(v: unknown, min: number, max: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function str(v: unknown, fallback: string, maxLength: number): string {
  const s = typeof v === 'string' ? v.trim() : '';
  return (s || fallback).slice(0, maxLength);
}

/** Prüft die Antwort der KI und begrenzt alle Werte auf plausible Bereiche. */
export function normalizeResult(raw: unknown): ScanResult {
  if (!raw || typeof raw !== 'object') throw new ScanError('antwort');
  const r = raw as Record<string, unknown>;
  const items = (Array.isArray(r.items) ? r.items : [])
    .filter((it): it is Record<string, unknown> => !!it && typeof it === 'object')
    .map((it) => ({
      name: str(it.name, '', 60),
      emoji: str(it.emoji, '🍽️', 8),
      grams: Math.round(num(it.grams, 1, 3000)),
      kcal100: num(it.kcal_per_100g, 0, 900),
      protein100: num(it.protein_per_100g, 0, 100),
      carbs100: num(it.carbs_per_100g, 0, 100),
      fat100: num(it.fat_per_100g, 0, 100),
    }))
    .filter((it) => it.name)
    .slice(0, 12);
  const confidence: Confidence = r.confidence === 'hoch' || r.confidence === 'niedrig' ? r.confidence : 'mittel';
  return {
    isFood: r.is_food !== false && items.length > 0,
    dish: str(r.dish, items[0]?.name ?? 'Mahlzeit', 80),
    emoji: str(r.emoji, '🍽️', 8),
    confidence,
    note: str(r.note, '', 200),
    items,
  };
}

export function itemKcal(item: ScanItem, factor = 1): number {
  return Math.round((item.kcal100 * item.grams * factor) / 100);
}

export function scanTotals(items: readonly ScanItem[], factor = 1): ScanTotals {
  const sum = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const it of items) {
    const f = (it.grams * factor) / 100;
    sum.kcal += it.kcal100 * f;
    sum.protein += it.protein100 * f;
    sum.carbs += it.carbs100 * f;
    sum.fat += it.fat100 * f;
  }
  return { kcal: Math.round(sum.kcal), protein: Math.round(sum.protein), carbs: Math.round(sum.carbs), fat: Math.round(sum.fat) };
}

/** Schrittweite für die ± Knöpfe an einer Grammangabe. */
export function gramStep(grams: number): number {
  if (grams < 50) return 5;
  if (grams < 300) return 10;
  return 25;
}

// ───── Fehler ─────

export type ScanErrorKind = 'schluessel' | 'guthaben' | 'limit' | 'offline' | 'abgelehnt' | 'antwort' | 'bild' | 'unbekannt';

export const SCAN_ERROR_TEXT: Record<ScanErrorKind, string> = {
  schluessel: 'Der KI-Schlüssel wurde nicht angenommen. Prüfe ihn in der Anthropic-Konsole und trag ihn neu ein.',
  guthaben: 'Die KI hat die Anfrage abgelehnt. Prüfe in der Anthropic-Konsole, ob noch Guthaben da ist.',
  limit: 'Die KI ist gerade ausgelastet. Versuch es in einer Minute noch mal.',
  offline: 'Keine Verbindung zur KI. Bist du online?',
  abgelehnt: 'Zu diesem Foto möchte die KI nichts sagen. Probier ein anderes Bild.',
  antwort: 'Die Antwort der KI war unvollständig. Versuch es bitte noch einmal.',
  bild: 'Das Bild konnte nicht gelesen werden. Probier ein anderes Foto.',
  unbekannt: 'Da ist etwas schiefgelaufen. Versuch es bitte noch einmal.',
};

export class ScanError extends Error {
  constructor(public kind: ScanErrorKind) {
    super(SCAN_ERROR_TEXT[kind]);
    this.name = 'ScanError';
  }
}

export function scanErrorText(error: unknown): string {
  return error instanceof ScanError ? error.message : SCAN_ERROR_TEXT.unbekannt;
}

// ───── Bild vorbereiten ─────

export interface PreparedImage {
  /** Base64 ohne „data:“-Präfix. */
  data: string;
  mediaType: 'image/jpeg';
  /** Für die Vorschau im Sheet. */
  url: string;
}

/** Verkleinert das Foto auf höchstens 1024 px und macht ein JPEG daraus. */
export async function prepareImage(file: Blob): Promise<PreparedImage> {
  try {
    const bmp = await loadBitmap(file);
    const canvas = drawScaled(bmp, MAX_SIDE);
    bmp.close();
    const url = canvas.toDataURL('image/jpeg', 0.85);
    return { data: url.slice(url.indexOf(',') + 1), mediaType: 'image/jpeg', url };
  } catch {
    throw new ScanError('bild');
  }
}

// ───── Anfrage an Claude ─────

function userText(hint: string): string {
  const base = 'Was ist auf diesem Foto, und wie viele Kalorien hat es?';
  return hint.trim() ? `${base}\n\nHinweis von mir: ${hint.trim().slice(0, 300)}` : base;
}

export async function analyzeFood(image: PreparedImage, { hint = '', signal }: { hint?: string; signal?: AbortSignal } = {}): Promise<ScanResult> {
  const key = getApiKey();
  if (!key) throw new ScanError('schluessel');
  // Das SDK wird erst beim ersten Foto geladen, damit die App schnell startet.
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 1, timeout: 90_000 });

  let response;
  try {
    response = await client.beta.messages.create(
      {
        model: SCAN_MODEL,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'low', format: { type: 'json_schema', schema: RESULT_SCHEMA } },
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } },
              { type: 'text', text: userText(hint) },
            ],
          },
        ],
      },
      { signal },
    );
  } catch (error) {
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) throw new ScanError('schluessel');
    if (error instanceof Anthropic.RateLimitError) throw new ScanError('limit');
    if (error instanceof Anthropic.BadRequestError) throw new ScanError('guthaben');
    if (error instanceof Anthropic.APIConnectionError) throw new ScanError('offline');
    throw error instanceof Anthropic.APIError ? new ScanError('unbekannt') : error;
  }

  if (response.stop_reason === 'refusal') throw new ScanError('abgelehnt');
  if (response.stop_reason === 'max_tokens') throw new ScanError('antwort');
  const text = response.content.find((b) => b.type === 'text');
  if (!text || text.type !== 'text') throw new ScanError('antwort');
  try {
    return normalizeResult(JSON.parse(text.text));
  } catch {
    throw new ScanError('antwort');
  }
}
