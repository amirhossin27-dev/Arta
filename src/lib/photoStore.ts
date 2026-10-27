import { useEffect, useState, useSyncExternalStore } from 'react';
import { canvasToJpeg, drawScaled, loadBitmap } from './image';

/**
 * Die Bilder der gemeinsamen Fotos liegen auf jedem Handy in der IndexedDB – localStorage wäre
 * mit rund 5 MB viel zu klein und hält schon den restlichen App-Stand. Pro Foto gibt es zwei
 * JPEGs: groß für Hintergrund und Ansicht, klein fürs Album (sonst müsste das Handy für die
 * Übersicht jedes große Bild entpacken).
 */

const DB_NAME = 'arta-photos';
const STORE = 'photos';

/** Längste Seite im Hintergrund und in der Ansicht. */
const FULL_SIDE = 1280;
/** Kleinere Stufe, falls ein Foto (z. B. viel Laub, Nachtaufnahme) trotzdem zu groß wird. */
const FALLBACK_SIDE = 1024;
const THUMB_SIDE = 360;
/** Obergrenze pro Bild – hält Speicher, Datenbank und Download klein. */
const MAX_BYTES = 420_000;

export type PhotoSize = 'full' | 'thumb';

interface StoredPhoto {
  id: string;
  full: ArrayBuffer;
  thumb: ArrayBuffer;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      if (typeof indexedDB === 'undefined') return reject(new Error('Kein IndexedDB'));
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbPromise.catch(() => {
      dbPromise = null;
    });
  }
  return dbPromise;
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        t.oncomplete = () => resolve(req.result);
        t.onerror = () => reject(t.error ?? req.error);
        t.onabort = () => reject(t.error ?? new Error('Abgebrochen'));
      }),
  );
}

// ───── Welche Bilder liegen auf diesem Handy? ─────

let ids: ReadonlySet<string> = new Set();
/** Gerade erst gespeichert – noch nicht als „verwaist“ aufräumen, die Beschreibung folgt gleich. */
const savedAt = new Map<string, number>();
const listeners = new Set<() => void>();

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

const getIds = () => ids;

function setIds(next: ReadonlySet<string>) {
  ids = next;
  listeners.forEach((l) => l());
}

export const localPhotoIds = getIds;
export const onLocalPhotos = subscribe;

export function useLocalPhotos(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, getIds, getIds);
}

let indexLoaded: Promise<void> | null = null;

/** Einmal beim Start: vorhandene Bilder einlesen. */
export function loadPhotoIndex(): Promise<void> {
  if (!indexLoaded) {
    indexLoaded = run('readonly', (s) => s.getAllKeys())
      .then((keys) => setIds(new Set(keys.map(String))))
      .catch(() => undefined);
  }
  return indexLoaded;
}

export function justSaved(id: string, within = 60_000): boolean {
  const t = savedAt.get(id);
  return t !== undefined && Date.now() - t < within;
}

/** Speichert ein Bild. Wirft, wenn das Handy keinen Platz mehr hat. */
export async function savePhoto(id: string, full: Blob, thumb: Blob): Promise<void> {
  const rec: StoredPhoto = { id, full: await full.arrayBuffer(), thumb: await thumb.arrayBuffer() };
  await run('readwrite', (s) => s.put(rec));
  savedAt.set(id, Date.now());
  setIds(new Set([...ids, id]));
}

export async function readPhoto(id: string, size: PhotoSize): Promise<ArrayBuffer | undefined> {
  const rec = (await run('readonly', (s) => s.get(id))) as StoredPhoto | undefined;
  return rec?.[size];
}

export async function deletePhoto(id: string): Promise<void> {
  await run('readwrite', (s) => s.delete(id));
  savedAt.delete(id);
  forgetUrls(id);
  if (ids.has(id)) {
    const next = new Set(ids);
    next.delete(id);
    setIds(next);
  }
}

// ───── Bild-Adressen für <img> ─────

const thumbUrls = new Map<string, Promise<string | undefined>>();
/** Große Bilder nur wenige gleichzeitig im Speicher halten. */
const fullUrls = new Map<string, Promise<string | undefined>>();
const FULL_CACHE = 4;

function toUrl(buf: ArrayBuffer | undefined): string | undefined {
  return buf ? URL.createObjectURL(new Blob([buf], { type: 'image/jpeg' })) : undefined;
}

function revoke(p: Promise<string | undefined> | undefined) {
  // Erst etwas später: Ein gerade sichtbares Bild soll nicht mitten im Ausblenden verschwinden.
  void p?.then((url) => url && window.setTimeout(() => URL.revokeObjectURL(url), 5000));
}

function forgetUrls(id: string) {
  revoke(thumbUrls.get(id));
  revoke(fullUrls.get(id));
  thumbUrls.delete(id);
  fullUrls.delete(id);
}

export function photoUrl(id: string, size: PhotoSize): Promise<string | undefined> {
  const cache = size === 'thumb' ? thumbUrls : fullUrls;
  let p = cache.get(id);
  if (p) {
    // zuletzt benutzt ans Ende
    cache.delete(id);
    cache.set(id, p);
    return p;
  }
  p = readPhoto(id, size)
    .then(toUrl)
    .catch(() => undefined);
  cache.set(id, p);
  void p.then((url) => {
    if (!url && cache.get(id) === p) cache.delete(id); // später nochmal versuchen
  });
  if (size === 'full') {
    while (fullUrls.size > FULL_CACHE) {
      const [oldest] = fullUrls.keys();
      revoke(fullUrls.get(oldest));
      fullUrls.delete(oldest);
    }
  }
  return p;
}

/** Adresse des Bildes für ein <img> – `undefined`, solange es lädt oder nicht auf dem Handy ist. */
export function usePhotoUrl(id: string | undefined, size: PhotoSize): string | undefined {
  const local = useLocalPhotos();
  const has = !!id && local.has(id);
  const [url, setUrl] = useState<{ id: string; url?: string }>();
  useEffect(() => {
    if (!id || !has) return;
    let alive = true;
    void photoUrl(id, size).then((u) => alive && setUrl({ id, url: u }));
    return () => {
      alive = false;
    };
  }, [id, has, size]);
  return has && url?.id === id ? url.url : undefined;
}

// ───── Fotos vorbereiten ─────

export interface PreparedPhoto {
  full: Blob;
  thumb: Blob;
  w: number;
  h: number;
}

/** Verkleinert ein Foto aus der Mediathek (oder der Kamera) auf Hintergrund-Größe. */
export async function preparePhoto(file: Blob): Promise<PreparedPhoto> {
  const bmp = await loadBitmap(file);
  try {
    let canvas = drawScaled(bmp, FULL_SIDE);
    let full = await canvasToJpeg(canvas, 0.8);
    if (full.size > MAX_BYTES) full = await canvasToJpeg(canvas, 0.66);
    if (full.size > MAX_BYTES) {
      canvas = drawScaled(bmp, FALLBACK_SIDE);
      full = await canvasToJpeg(canvas, 0.62);
    }
    const thumb = await canvasToJpeg(drawScaled(bmp, THUMB_SIDE), 0.72);
    return { full, thumb, w: canvas.width, h: canvas.height };
  } finally {
    bmp.close();
  }
}

/** Kleine Album-Version eines Bildes, das vom anderen Handy kam. */
export async function makeThumb(full: Blob): Promise<Blob> {
  const bmp = await loadBitmap(full);
  try {
    return await canvasToJpeg(drawScaled(bmp, THUMB_SIDE), 0.72);
  } finally {
    bmp.close();
  }
}

/** Bittet den Browser, die Fotos nicht bei Platzmangel wegzuräumen. */
export function askPersistentStorage() {
  void navigator.storage?.persist?.().catch(() => false);
}
