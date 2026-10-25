import { useEffect, useState, type CSSProperties } from 'react';
import { cls } from '../lib/hooks';
import { buzz, sfx } from './engine';
import { memoryDeck, otherSide, type Side } from './logic';
import { GameHint, TurnBar } from './parts';
import type { GameProps } from './types';

const PAIRS = 8;

export function Memory({ mode, p1, p2, starter, best, onEnd }: GameProps) {
  const solo = mode === 'solo';
  const [deck] = useState(() => memoryDeck(PAIRS));
  const [owner, setOwner] = useState<(Side | null)[]>(() => Array(PAIRS * 2).fill(null));
  const [open, setOpen] = useState<number[]>([]);
  const [turn, setTurn] = useState<Side>(solo ? 'p1' : starter);
  const [moves, setMoves] = useState(0);
  const [started] = useState(() => Date.now());
  const [now, setNow] = useState(Date.now());
  const players = { p1, p2 };
  const scores = { p1: owner.filter((o) => o === 'p1').length, p2: owner.filter((o) => o === 'p2').length };
  const done = owner.every(Boolean);

  useEffect(() => {
    if (!solo || done) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [solo, done]);

  const flip = (i: number) => {
    if (open.length === 2 || open.includes(i) || owner[i]) return;
    sfx.flip();
    const next = [...open, i];
    setOpen(next);
    if (next.length < 2) return;
    setMoves((m) => m + 1);
    const [a, b] = next;
    if (deck[a] === deck[b]) {
      window.setTimeout(() => {
        sfx.match();
        buzz(25);
        setOwner((o) => o.map((x, k) => (k === a || k === b ? turn : x)));
        setOpen([]);
      }, 450);
    } else {
      window.setTimeout(() => {
        setOpen([]);
        if (!solo) setTurn((t) => otherSide(t));
      }, 950);
    }
  };

  useEffect(() => {
    if (!done) return;
    const t = window.setTimeout(() => {
      if (solo) onEnd({ score: moves });
      else onEnd({ winner: scores.p1 === scores.p2 ? 'draw' : scores.p1 > scores.p2 ? 'p1' : 'p2' });
    }, 900);
    return () => window.clearTimeout(t);
  }, [done]);

  const secs = Math.floor((now - started) / 1000);

  return (
    <div className="g-col">
      {solo ? (
        <div className="score-strip">
          <span>🔁 {moves} Züge</span>
          <span>⏱️ {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}</span>
          <span>🏆 Rekord {best ?? '–'}</span>
        </div>
      ) : (
        <TurnBar p1={p1} p2={p2} turn={turn} scores={scores} done={done} />
      )}
      <div className="memory-grid">
        {deck.map((emoji, i) => {
          const shown = open.includes(i) || !!owner[i];
          const o = owner[i];
          return (
            <button
              key={i}
              className={cls('memory-card', shown && 'shown', !!o && 'matched')}
              style={o && !solo ? ({ '--pc': players[o].color } as CSSProperties) : undefined}
              onClick={() => flip(i)}
              disabled={!!o}
              aria-label={shown ? emoji : 'verdeckte Karte'}
            >
              <span className="memory-inner">
                <span className="memory-back">❤</span>
                <span className="memory-front">{emoji}</span>
              </span>
            </button>
          );
        })}
      </div>
      <GameHint>
        {done
          ? solo
            ? `Alle Pärchen in ${moves} Zügen gefunden! 🎉`
            : 'Alle Pärchen gefunden! 💞'
          : solo
            ? 'Finde alle 8 Pärchen mit möglichst wenigen Zügen.'
            : `${players[turn].emoji} ${players[turn].name} deckt auf`}
      </GameHint>
    </div>
  );
}
