import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { cls } from '../lib/hooks';
import { buzz, sfx, tone } from './engine';
import { otherSide, type Side } from './logic';
import type { GameProps } from './types';

const WIN = 3;

type Phase = 'ready' | 'wait' | 'go' | 'point' | 'over';

export function Reaction({ p1, p2, onEnd }: GameProps) {
  const [phase, setPhaseState] = useState<Phase>('ready');
  const [scores, setScores] = useState<Record<Side, number>>({ p1: 0, p2: 0 });
  const [info, setInfo] = useState<{ winner: Side; text: string; foulBy?: Side } | null>(null);
  const phaseRef = useRef<Phase>('ready');
  const scoreRef = useRef<Record<Side, number>>({ p1: 0, p2: 0 });
  const goAt = useRef(0);
  const timers = useRef<number[]>([]);
  const players = { p1, p2 };

  const setPhase = (p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  };
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  const award = (winner: Side, text: string, foulBy?: Side) => {
    setPhase('point');
    setInfo({ winner, text, foulBy });
    if (foulBy) sfx.miss();
    else sfx.point();
    buzz(foulBy ? 70 : 30);
    const next = { ...scoreRef.current, [winner]: scoreRef.current[winner] + 1 };
    scoreRef.current = next;
    setScores(next);
    if (next[winner] >= WIN) {
      later(() => {
        setPhase('over');
        onEnd({ winner });
      }, 1500);
    } else {
      later(startWait, 1700);
    }
  };

  const startWait = () => {
    setInfo(null);
    setPhase('wait');
    later(() => {
      if (phaseRef.current !== 'wait') return;
      goAt.current = performance.now();
      setPhase('go');
      tone(1046, 120, 'square', 0.06);
      if (p2.cpu) later(() => hit('p2'), 240 + Math.random() * 280);
    }, 1400 + Math.random() * 2800);
  };

  const hit = (side: Side) => {
    const ph = phaseRef.current;
    if (ph === 'wait') {
      award(otherSide(side), `${players[side].name} war zu früh! 🙈`, side);
    } else if (ph === 'go') {
      award(side, `${Math.round(performance.now() - goAt.current)} ms`);
    }
  };

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);
  useEffect(() => {
    later(startWait, 1800);
  }, []);

  const status = (side: Side): string => {
    if (phase === 'ready') return players[side].cpu ? 'KI ist bereit 🤖' : 'Finger bereit halten!';
    if (phase === 'wait') return 'Warte auf das Herz …';
    if (phase === 'go') return 'JETZT TIPPEN!';
    if (info && (phase === 'point' || phase === 'over')) {
      if (info.foulBy === side) return 'Zu früh! 🙈';
      if (info.winner === side) return info.foulBy ? 'Punkt geschenkt! 🎁' : `Punkt! ⚡ ${info.text}`;
      return 'Zu langsam 🐢';
    }
    return '';
  };

  const half = (side: Side) => {
    const p = players[side];
    return (
      <div
        className={cls('rx-half', side === 'p2' && 'flipped', info?.winner === side && 'scored', info?.foulBy === side && 'foul')}
        style={{ '--pc': p.color } as CSSProperties}
        onPointerDown={(e) => {
          e.preventDefault();
          if (!p.cpu) hit(side);
        }}
      >
        <div className="rx-player">
          <span className="rx-emoji">{p.emoji}</span>
          <b>{p.name}</b>
          <span className="rx-dots">
            {Array.from({ length: WIN }, (_, i) => (
              <span key={i} className={cls('rx-dot', i < scores[side] && 'on')} />
            ))}
          </span>
        </div>
        {phase === 'go' && <span className="rx-heart">💗</span>}
        <p className="rx-status">{status(side)}</p>
      </div>
    );
  };

  return (
    <div className={cls('rx', `rx-${phase}`)}>
      {half('p2')}
      <div className="rx-mid">⚡</div>
      {half('p1')}
    </div>
  );
}
