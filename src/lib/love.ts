import { uid } from './random';

export interface LovePopup {
  id: string;
  emoji: string;
  title?: string;
  text: string;
  tone?: 'love' | 'sport' | 'food' | 'party' | 'info';
  /** Große Einblendung in der Mitte, sonst kleiner Toast oben. Ton „party“ bringt Konfetti. */
  big?: boolean;
  duration?: number;
}

export type LoveEvent =
  | { type: 'popup'; popup: LovePopup }
  | { type: 'burst'; x: number; y: number; emoji: string; count: number }
  | { type: 'confetti' };

const listeners = new Set<(e: LoveEvent) => void>();

export function onLove(fn: (e: LoveEvent) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const emit = (e: LoveEvent) => listeners.forEach((l) => l(e));

export function showLove(popup: Omit<LovePopup, 'id'>) {
  emit({ type: 'popup', popup: { ...popup, id: uid() } });
}

/** Herzchen steigen von der Stelle auf, an der getippt wurde. */
export function heartBurst(target?: { clientX: number; clientY: number; currentTarget?: EventTarget | null }, emoji = '❤️', count = 8) {
  let x = window.innerWidth / 2;
  let y = window.innerHeight / 2;
  if (target) {
    if (target.clientX || target.clientY) {
      x = target.clientX;
      y = target.clientY;
    } else if (target.currentTarget instanceof Element) {
      const r = target.currentTarget.getBoundingClientRect();
      x = r.left + r.width / 2;
      y = r.top + r.height / 2;
    }
  }
  emit({ type: 'burst', x, y, emoji, count });
  try {
    navigator.vibrate?.(25);
  } catch {
    // Vibration nicht verfügbar
  }
}

export function confetti() {
  emit({ type: 'confetti' });
}
