import { useCallback, useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import { confetti, onLove, type LovePopup } from '../lib/love';
import { cls } from '../lib/hooks';

interface Particle {
  id: number;
  x: number;
  y: number;
  emoji: string;
  dx: number;
  rot: number;
  delay: number;
  size: number;
}

const CONFETTI = ['❤️', '💖', '💕', '✨', '🎉', '💗', '⭐', '💞'];

let pid = 0;

/** Ab so viel Weg (px) oder Tempo (px/ms) fliegt eine Einblendung beim Wischen weg. */
const SWIPE_DIST = 56;
const SWIPE_SPEED = 0.45;
/** Bis hierhin (px) zählt eine Berührung noch als Antippen. */
const TAP_SLOP = 8;

type Phase = 'idle' | 'drag' | 'back' | 'out';

/**
 * Wegwischen wie bei Handy-Mitteilungen: Die Einblendung folgt dem Finger und verschwindet,
 * wenn man sie weit oder schnell genug nach oben bzw. zur Seite schiebt (`down` = auch nach unten).
 * Solange der Finger drauf liegt, bleibt sie stehen (`held`).
 */
function useSwipeAway(onGone: () => void, down: boolean) {
  const start = useRef<{ id: number; x: number; y: number; t: number } | null>(null);
  const moved = useRef(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [held, setHeld] = useState(false);

  // Nach unten (wenn nicht erlaubt) nur ein kleines Stück mit Widerstand.
  const offset = (e: PointerEvent, s: { x: number; y: number }) => {
    const x = e.clientX - s.x;
    const y = e.clientY - s.y;
    return { x, y: !down && y > 0 ? y * 0.25 : y };
  };

  useEffect(() => {
    if (phase !== 'out') return;
    const t = window.setTimeout(onGone, 200);
    return () => window.clearTimeout(t);
  }, [phase, onGone]);

  const onPointerDown = (e: PointerEvent) => {
    if (start.current || phase === 'out') return;
    start.current = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
    moved.current = false;
    setHeld(true);
  };

  const onPointerMove = (e: PointerEvent) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const o = offset(e, s);
    if (!moved.current) {
      if (Math.hypot(o.x, o.y) < TAP_SLOP) return;
      moved.current = true;
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Zeiger schon weg
      }
    }
    setPos(o);
    setPhase('drag');
  };

  const finish = (e: PointerEvent, cancelled: boolean) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    start.current = null;
    setHeld(false);
    if (!moved.current) return;
    const o = offset(e, s);
    const dt = Math.max(1, performance.now() - s.t);
    const sideways = Math.abs(o.x) > Math.abs(o.y);
    const dist = sideways ? Math.abs(o.x) : down ? Math.abs(o.y) : -o.y;
    if (!cancelled && (dist > SWIPE_DIST || dist / dt > SWIPE_SPEED)) {
      setPos(
        sideways
          ? { x: Math.sign(o.x) * window.innerWidth, y: o.y }
          : { x: o.x, y: Math.sign(o.y || -1) * window.innerHeight * 0.7 },
      );
      setPhase('out');
    } else {
      setPos({ x: 0, y: 0 });
      setPhase('back');
    }
  };

  const style: CSSProperties | undefined =
    phase === 'idle'
      ? undefined
      : {
          animation: 'none',
          transform: `translate(${pos.x}px, ${pos.y}px)`,
          opacity: phase === 'out' ? 0 : 1 - Math.min(0.6, Math.hypot(pos.x, pos.y) / 320),
          transition:
            phase === 'drag'
              ? 'none'
              : phase === 'out'
                ? 'transform 0.2s ease-in, opacity 0.2s ease-in'
                : 'transform 0.3s cubic-bezier(0.2, 0.9, 0.3, 1.3), opacity 0.3s ease',
        };

  return {
    held: held || phase === 'out',
    leaving: phase === 'out',
    style,
    handlers: { onPointerDown, onPointerMove, onPointerUp: (e: PointerEvent) => finish(e, false), onPointerCancel: (e: PointerEvent) => finish(e, true) },
    /** Antippen schließt – aber nicht, wenn gerade gewischt wurde. */
    tap: (fn: () => void) => () => {
      if (!moved.current) fn();
      moved.current = false;
    },
  };
}

/** Blendet nach `ms` aus; solange `paused`, steht die Uhr (danach bleiben mindestens 1,5 s). */
function useAutoHide(ms: number, paused: boolean, onGone: () => void) {
  const left = useRef(ms);
  useEffect(() => {
    if (paused) return;
    const started = performance.now();
    const t = window.setTimeout(onGone, left.current);
    return () => {
      window.clearTimeout(t);
      left.current = Math.max(1500, left.current - (performance.now() - started));
    };
  }, [paused, onGone]);
}

function Toast({ popup, onDismiss }: { popup: LovePopup; onDismiss: (id: string) => void }) {
  const gone = useCallback(() => onDismiss(popup.id), [onDismiss, popup.id]);
  const swipe = useSwipeAway(gone, false);
  useAutoHide(popup.duration ?? 4200, swipe.held, gone);
  return (
    <div className={cls('love-toast', `tone-${popup.tone ?? 'love'}`)} role="status" style={swipe.style} {...swipe.handlers} onClick={swipe.tap(gone)}>
      <span className="love-toast-emoji">{popup.emoji}</span>
      <div className="love-toast-text">
        {popup.title && <b>{popup.title}</b>}
        <span>{popup.text}</span>
      </div>
    </div>
  );
}

function BigPopup({ popup, onDismiss }: { popup: LovePopup; onDismiss: (id: string) => void }) {
  const gone = useCallback(() => onDismiss(popup.id), [onDismiss, popup.id]);
  const swipe = useSwipeAway(gone, true);
  useAutoHide(popup.duration ?? 6500, swipe.held, gone);
  return (
    <div className={cls('love-modal-backdrop', swipe.leaving && 'leaving')} {...swipe.handlers} onClick={swipe.tap(gone)}>
      <div className={cls('love-modal', `tone-${popup.tone ?? 'love'}`)} role="alertdialog" style={swipe.style}>
        <div className="love-modal-emoji">{popup.emoji}</div>
        {popup.title && <h2>{popup.title}</h2>}
        <p>{popup.text}</p>
        <button className="btn primary">Danke 💕</button>
      </div>
    </div>
  );
}

export function LoveLayer() {
  const [queue, setQueue] = useState<LovePopup[]>([]);
  const [particles, setParticles] = useState<Particle[]>([]);
  const [confettiKey, setConfettiKey] = useState(0);
  const confettiTimer = useRef<number>(undefined);

  useEffect(
    () =>
      onLove((e) => {
        if (e.type === 'popup') {
          setQueue((q) => (q.length > 4 ? q : [...q, e.popup]));
        } else if (e.type === 'burst') {
          const batch: Particle[] = Array.from({ length: e.count }, () => ({
            id: ++pid,
            x: e.x,
            y: e.y,
            emoji: e.emoji,
            dx: (Math.random() - 0.5) * 140,
            rot: (Math.random() - 0.5) * 60,
            delay: Math.random() * 120,
            size: 18 + Math.random() * 14,
          }));
          setParticles((p) => [...p, ...batch]);
          const ids = new Set(batch.map((b) => b.id));
          window.setTimeout(() => setParticles((p) => p.filter((x) => !ids.has(x.id))), 1600);
        } else if (e.type === 'confetti') {
          setConfettiKey(Date.now());
          window.clearTimeout(confettiTimer.current);
          confettiTimer.current = window.setTimeout(() => setConfettiKey(0), 3200);
        }
      }),
    [],
  );

  const current = queue[0];

  const dismiss = useCallback((id: string) => setQueue((q) => q.filter((p) => p.id !== id)), []);

  useEffect(() => {
    if (current?.tone === 'party') confetti();
  }, [current]);

  return (
    <>
      {current && !current.big && <Toast key={current.id} popup={current} onDismiss={dismiss} />}
      {current && current.big && <BigPopup key={current.id} popup={current} onDismiss={dismiss} />}
      <div className="burst-layer" aria-hidden="true">
        {particles.map((p) => (
          <span
            key={p.id}
            className="burst"
            style={
              {
                left: p.x,
                top: p.y,
                fontSize: p.size,
                animationDelay: `${p.delay}ms`,
                '--dx': `${p.dx}px`,
                '--rot': `${p.rot}deg`,
              } as CSSProperties
            }
          >
            {p.emoji}
          </span>
        ))}
      </div>
      {confettiKey > 0 && (
        <div className="confetti" key={confettiKey} aria-hidden="true">
          {Array.from({ length: 36 }, (_, i) => (
            <span
              key={i}
              style={
                {
                  left: `${(i * 97) % 100}%`,
                  animationDelay: `${(i % 12) * 90}ms`,
                  animationDuration: `${2200 + ((i * 53) % 900)}ms`,
                  fontSize: `${16 + ((i * 7) % 14)}px`,
                  '--sway': `${((i % 5) - 2) * 18}px`,
                } as CSSProperties
              }
            >
              {CONFETTI[i % CONFETTI.length]}
            </span>
          ))}
        </div>
      )}
    </>
  );
}
