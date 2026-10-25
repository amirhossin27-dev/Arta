import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
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

  const dismiss = useCallback(() => setQueue((q) => q.slice(1)), []);

  useEffect(() => {
    if (!current) return;
    if (current.tone === 'party') confetti();
    const t = window.setTimeout(dismiss, current.duration ?? (current.big ? 6500 : 4200));
    return () => window.clearTimeout(t);
  }, [current, dismiss]);

  return (
    <>
      {current && !current.big && (
        <div className={cls('love-toast', `tone-${current.tone ?? 'love'}`)} key={current.id} role="status" onClick={dismiss}>
          <span className="love-toast-emoji">{current.emoji}</span>
          <div className="love-toast-text">
            {current.title && <b>{current.title}</b>}
            <span>{current.text}</span>
          </div>
        </div>
      )}
      {current && current.big && (
        <div className="love-modal-backdrop" key={current.id} onClick={dismiss}>
          <div className={cls('love-modal', `tone-${current.tone ?? 'love'}`)} role="alertdialog">
            <div className="love-modal-emoji">{current.emoji}</div>
            {current.title && <h2>{current.title}</h2>}
            <p>{current.text}</p>
            <button className="btn primary">Danke 💕</button>
          </div>
        </div>
      )}
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
