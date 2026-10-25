import type { CSSProperties, ReactNode } from 'react';
import { cls } from '../lib/hooks';
import type { Side } from './logic';
import type { Player } from './types';

/** Zeigt, wer gerade dran ist (und optional den Spielstand der Runde). */
export function TurnBar({ p1, p2, turn, scores, done }: { p1: Player; p2: Player; turn: Side; scores?: Record<Side, number>; done?: boolean }) {
  return (
    <div className="turn-bar">
      {(['p1', 'p2'] as const).map((s) => {
        const p = s === 'p1' ? p1 : p2;
        return (
          <div key={s} className={cls('turn-player', !done && turn === s && 'active')} style={{ '--pc': p.color } as CSSProperties}>
            <span className="turn-emoji">{p.emoji}</span>
            <span className="turn-name">{p.name}</span>
            {scores && <b className="turn-score">{scores[s]}</b>}
          </div>
        );
      })}
    </div>
  );
}

export function GameHint({ children }: { children: ReactNode }) {
  return <p className="game-hint">{children}</p>;
}
