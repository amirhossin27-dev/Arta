import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { cls } from '../lib/hooks';
import { buzz, sfx, tone } from './engine';
import type { GameProps } from './types';

// Die Töne des Original-Simon von 1978
const PADS = [
  { emoji: '💗', color: '#ff4f81', freq: 329.63 },
  { emoji: '💛', color: '#ffc23d', freq: 277.18 },
  { emoji: '💚', color: '#2fcf7a', freq: 220 },
  { emoji: '💙', color: '#4f9dff', freq: 164.81 },
];

type Phase = 'start' | 'show' | 'input' | 'over';

export function Simon({ best, onEnd }: GameProps) {
  const [seq, setSeq] = useState<number[]>([]);
  const [phase, setPhase] = useState<Phase>('start');
  const [lit, setLit] = useState<number | null>(null);
  const [idx, setIdx] = useState(0);
  const timers = useRef<number[]>([]);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  const play = (s: number[]) => {
    setSeq(s);
    setPhase('show');
    setIdx(0);
    const on = Math.max(200, 480 - s.length * 18);
    const gap = 130;
    s.forEach((pad, i) => {
      later(() => {
        setLit(pad);
        tone(PADS[pad].freq, on, 'triangle', 0.08);
      }, 500 + i * (on + gap));
      later(() => setLit(null), 500 + i * (on + gap) + on);
    });
    later(() => setPhase('input'), 500 + s.length * (on + gap));
  };

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  useEffect(() => {
    later(() => play([Math.floor(Math.random() * 4)]), 700);
  }, []);

  const press = (pad: number) => {
    if (phase !== 'input') return;
    setLit(pad);
    later(() => setLit((l) => (l === pad ? null : l)), 200);
    if (seq[idx] !== pad) {
      setPhase('over');
      sfx.lose();
      buzz(120);
      later(() => onEnd({ score: seq.length - 1 }), 1300);
      return;
    }
    tone(PADS[pad].freq, 200, 'triangle', 0.08);
    buzz(10);
    if (idx + 1 === seq.length) {
      setPhase('show');
      later(() => play([...seq, Math.floor(Math.random() * 4)]), 750);
    } else {
      setIdx(idx + 1);
    }
  };

  const round = Math.max(seq.length, 1);
  const label =
    phase === 'over' ? `Ups! Du hast ${seq.length - 1} ${seq.length - 1 === 1 ? 'Runde' : 'Runden'} geschafft.` : phase === 'input' ? 'Du bist dran!' : 'Hör gut zu …';

  return (
    <div className="g-col">
      <div className="score-strip">
        <span>🎵 Runde {round}</span>
        <span>🏆 Rekord {best ?? '–'}</span>
      </div>
      <div className={cls('simon', `simon-${phase}`)}>
        {PADS.map((p, i) => (
          <button
            key={i}
            className={cls('simon-pad', lit === i && 'lit')}
            style={{ '--pc': p.color } as CSSProperties}
            onPointerDown={(e) => {
              e.preventDefault();
              press(i);
            }}
            aria-label={`Herz ${i + 1}`}
          >
            {p.emoji}
          </button>
        ))}
        <div className="simon-center">
          <b>{round}</b>
        </div>
      </div>
      <p className="game-hint">{label}</p>
    </div>
  );
}
