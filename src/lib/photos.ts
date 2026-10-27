import type { AppData, Photo, PersonId, PhotoFreq } from './types';

/** Mehr Fotos braucht der Hintergrund nicht – und so bleiben Handy und Datenbank schlank. */
export const MAX_PHOTOS = 60;

/** Pause zwischen zwei Fotos im Hintergrund. */
export const PHOTO_INTERVAL: Record<Exclude<PhotoFreq, 'aus'>, number> = { oft: 2 * 60_000, normal: 5 * 60_000, selten: 12 * 60_000 };

/** So lange bleibt ein Foto im Hintergrund stehen. */
export const PHOTO_SHOW_MS = 24_000;

/** Lädt das Handy, das ein Foto hinzugefügt hat, es nicht hoch, springt nach dieser Zeit das andere ein. */
export const HELP_UPLOAD_AFTER = 60 * 60_000;

/** Alle noch vorhandenen Fotos, neueste zuerst. */
export function livePhotos(data: AppData): Photo[] {
  return Object.values(data.photos)
    .filter((p) => !p.deleted)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export interface PhotoSyncPlan {
  /** Bild in den Foto-Raum hochladen. */
  upload: string[];
  /** Bild aus dem Foto-Raum holen. */
  download: string[];
  /** Gelöschtes Foto auch aus dem Foto-Raum entfernen. */
  remove: string[];
  /** Eigenes Foto liegt bereit – das dem anderen Handy sagen. */
  markReady: string[];
  /** Fotos, deren Bild noch auf keinem erreichbaren Weg da ist (später nochmal schauen). */
  waiting: number;
}

/**
 * Was ist zwischen diesem Handy und dem Foto-Raum zu tun? `local` sind die Bilder in der
 * IndexedDB, `remote` die Einträge im Raum. Hochladen tut normalerweise nur das Handy, das das
 * Foto hinzugefügt hat; klappt das lange nicht (z. B. Handy gewechselt), hilft das andere aus.
 */
export function planPhotoSync(input: {
  photos: Record<string, Photo>;
  local: ReadonlySet<string>;
  remote: ReadonlySet<string>;
  me: PersonId;
  now: number;
}): PhotoSyncPlan {
  const { photos, local, remote, me, now } = input;
  const plan: PhotoSyncPlan = { upload: [], download: [], remove: [], markReady: [], waiting: 0 };
  // Neueste zuerst – die sieht man als Erstes im Album.
  const list = Object.values(photos).sort((a, b) => b.createdAt - a.createdAt);
  for (const p of list) {
    if (p.deleted) {
      if (remote.has(p.id)) plan.remove.push(p.id);
      continue;
    }
    const here = local.has(p.id);
    const there = remote.has(p.id);
    if (here && !there) {
      if (p.by === me || now - p.createdAt > HELP_UPLOAD_AFTER) plan.upload.push(p.id);
    } else if (!here && there) {
      plan.download.push(p.id);
    } else if (!here && !there) {
      plan.waiting++;
    }
    if (there && p.by === me && !p.ready) plan.markReady.push(p.id);
  }
  return plan;
}

/**
 * Nächstes Foto für den Hintergrund: zufällig, aber keines der zuletzt gezeigten – erst wenn alle
 * einmal dran waren, geht es von vorne los.
 */
export function nextSlide(ids: readonly string[], recent: readonly string[], rnd: () => number = Math.random): string | undefined {
  if (!ids.length) return undefined;
  const keep = Math.min(recent.length, Math.max(0, ids.length - 1), Math.ceil(ids.length * 0.7));
  const blocked = new Set(recent.slice(-keep));
  const pool = keep ? ids.filter((id) => !blocked.has(id)) : ids.slice();
  return pool[Math.floor(rnd() * pool.length)] ?? ids[0];
}

// ───── „Jetzt zeigen“ ─────

export interface SlideRequest {
  id: string;
  /** Statt der Bildunterschrift, z. B. „Neues Foto von Mila“. */
  label?: string;
}

const slideListeners = new Set<(r: SlideRequest) => void>();

/** Ein bestimmtes Foto sofort in den Hintergrund gleiten lassen. */
export function requestSlide(r: SlideRequest) {
  slideListeners.forEach((l) => l(r));
}

export function onSlideRequest(fn: (r: SlideRequest) => void) {
  slideListeners.add(fn);
  return () => {
    slideListeners.delete(fn);
  };
}
