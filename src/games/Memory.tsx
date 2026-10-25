import { useEffect, useState, type CSSProperties } from 'react';
import { cls } from '../lib/hooks';
import { MEMORY_PAIRS, memoryDef } from './classic';
import { buzz, sfx } from './engine';
import { GameHint, TurnBar, turnHint, useOnChange } from './parts';
import { useTurnGame } from './turn';
import type { GameProps } from './types';

export function Memory(props: GameProps) {
  const { mode, p1, p2, best, onEnd } = props;
  const solo = mode === 'solo';
  const g = useTurnGame(memoryDef, props);
  const { deck, owner, open, turn, moves } = g.s;
  const [started] = useState(() => Date.now());
  const [now, setNow] = useState(Date.now());
  const players = { p1, p2 };
  const scores = { p1: owner.filter((o) => o === 'p1').length, p2: owner.filter((o) => o === 'p2').length };
  const done = owner.every(Boolean);

  useOnChange(open.length, (prev, next) => next > prev && sfx.flip());
  useOnChange(scores.p1 + scores.p2, () => {
    sfx.match();
    buzz(25);
  });

  useEffect(() => {
    if (!solo || done) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [solo, done]);

  useEffect(() => {
    if (!solo || !done) return;
    const t = window.setTimeout(() => onEnd({ score: moves }), 900);
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
        <TurnBar p1={p1} p2={p2} turn={g.turn} scores={scores} done={done} />
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
              onClick={() => g.act({ t: 'flip', i })}
              disabled={!!o || !g.myTurn}
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
            ? `Finde alle ${MEMORY_PAIRS} Pärchen mit möglichst wenigen Zügen.`
            : turnHint(g, players, g.turn, `${players[turn].emoji} ${players[turn].name} deckt auf`)}
      </GameHint>
    </div>
  );
}
