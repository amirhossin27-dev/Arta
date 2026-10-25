import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { cls } from '../lib/hooks';
import type { Side } from './logic';
import type { Player } from './types';

/** Zeigt, wer gerade dran ist (und optional den Spielstand der Runde). */
export function TurnBar({ p1, p2, turn, scores, done }: { p1: Player; p2: Player; turn: Side | 'both' | null; scores?: Record<Side, number>; done?: boolean }) {
  return (
    <div className="turn-bar">
      {(['p1', 'p2'] as const).map((s) => {
        const p = s === 'p1' ? p1 : p2;
        return (
          <div key={s} className={cls('turn-player', !done && (turn === s || turn === 'both') && 'active')} style={{ '--pc': p.color } as CSSProperties}>
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

/** Ruft `fn` auf, wenn sich `value` ändert (nicht beim ersten Rendern) – z. B. für Töne bei Zügen des Schatzes. */
export function useOnChange<T>(value: T, fn: (prev: T, next: T) => void) {
  const prev = useRef(value);
  useEffect(() => {
    if (Object.is(prev.current, value)) return;
    const old = prev.current;
    prev.current = value;
    fn(old, value);
  }, [value]);
}

/** Sichtschutz an einem Handy, damit niemand die Karten des anderen sieht. */
export function Curtain({ player, note, onReveal }: { player: Player; note?: string; onReveal: () => void }) {
  return (
    <div className="g-curtain" style={{ '--pc': player.color } as CSSProperties}>
      <span className="g-curtain-emoji">{player.emoji}</span>
      <h3>{player.name} ist dran</h3>
      {note && <p className="g-curtain-note">{note}</p>}
      <p>Gib das Handy weiter – nicht spicken! 🙈</p>
      <button className="btn primary big" onClick={onReveal}>
        Ich bin {player.name} – zeigen
      </button>
    </div>
  );
}

/** Hinweiszeile für alle rundenbasierten Spiele. */
export function turnHint(g: { thinking: boolean; waiting: boolean }, players: Record<Side, Player>, turn: Side | 'both' | null, mine: string, theirs?: string) {
  if (g.thinking) return '🤖 KI überlegt …';
  if (g.waiting && turn && turn !== 'both') return theirs ?? `${players[turn].emoji} ${players[turn].name} ist dran …`;
  return mine;
}
