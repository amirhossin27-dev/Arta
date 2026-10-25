/**
 * Adresse der Firebase Realtime Database für den Live-Sync (siehe README).
 * Leer = kein Live-Sync, dann bleibt es beim Sync per Link.
 * Beim Bauen lässt sie sich mit VITE_ARTA_DB_URL überschreiben (z. B. für Tests).
 */
const DEFAULT_DB_URL = 'https://arta-47-default-rtdb.europe-west1.firebasedatabase.app';

export const LIVE_DB_URL: string = ((import.meta.env.VITE_ARTA_DB_URL as string | undefined) ?? DEFAULT_DB_URL).replace(/\/+$/, '');
