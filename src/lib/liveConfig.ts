/**
 * Adresse der Firebase Realtime Database für den Live-Sync (siehe README).
 * Leer = kein Live-Sync, dann bleibt es beim Sync per Link.
 * Beim Bauen lässt sie sich mit VITE_ARTA_DB_URL überschreiben (z. B. für Tests).
 */
const DEFAULT_DB_URL = 'https://arta-47-default-rtdb.europe-west1.firebasedatabase.app';

export const LIVE_DB_URL: string = ((import.meta.env.VITE_ARTA_DB_URL as string | undefined) ?? DEFAULT_DB_URL).replace(/\/+$/, '');

/**
 * Adresse des Push-Relays (push-relay/worker.js, ein kostenloser Cloudflare Worker). Damit kommen
 * Mitteilungen auch an, wenn Arta auf dem anderen Handy ganz geschlossen ist.
 * Leer = Mitteilungen nur, solange die App läuft. Überschreibbar mit VITE_ARTA_PUSH_URL.
 */
const DEFAULT_PUSH_URL = 'https://arta-push.pk5g9j9v7s.workers.dev/';

export const PUSH_RELAY_URL: string = ((import.meta.env.VITE_ARTA_PUSH_URL as string | undefined) ?? DEFAULT_PUSH_URL).replace(/\/+$/, '');
