import { useMemo, useState, type CSSProperties } from 'react';
import { cls } from '../lib/hooks';
import { buzz, sfx } from './engine';
import { otherSide, type Side } from './logic';
import { MILL_POINTS, MILL_STONES, muehleDef, muehleMoves, onBoard, phaseOf, removable } from './muehle';
import { GameHint, TurnBar, turnHint, useOnChange } from './parts';
import { useTurnGame } from './turn';
import type { GameProps, Player } from './types';

// Linien des Bretts im 7×7-Raster
const RINGS = [0, 1, 2];
const CROSS: [number, number, number, number][] = [
  [3, 0, 3, 2],
  [3, 4, 3, 6],
  [0, 3, 2, 3],
  [4, 3, 6, 3],
];
const pos = (k: number) => `${(k / 6) * 100}%`;

function Stones({ n, color }: { n: number; color: string }) {
  return (
    <span className="mill-hand" style={{ '--pc': color } as CSSProperties}>
      {Array.from({ length: n }, (_, k) => (
        <i key={k} />
      ))}
    </span>
  );
}

export function Muehle(props: GameProps) {
  const { p1, p2 } = props;
  const g = useTurnGame(muehleDef, props);
  const s = g.s;
  const players: Record<Side, Player> = { p1, p2 };
  const me = g.view;
  const opp = otherSide(me);
  const [sel, setSel] = useState<number | null>(null);
  const moves = useMemo(() => (g.myTurn ? muehleMoves(s) : []), [s, g.myTurn]);
  const phase = phaseOf(s, s.turn);
  const canRemove = s.removing && g.myTurn ? new Set(removable(s.board, s.turn)) : new Set<number>();
  const targets = new Set(sel === null ? [] : moves.flatMap((m) => (m.t === 'move' && m.from === sel ? [m.to] : [])));
  const movable = new Set(moves.flatMap((m) => (m.t === 'move' ? [m.from] : [])));

  useOnChange(s.last, (_, l) => {
    if (l?.removed !== undefined) {
      sfx.miss();
      buzz([30, 30, 60]);
    } else sfx.tap();
    setSel(null);
  });
  useOnChange(s.removing, (_, r) => {
    if (r) {
      sfx.match();
      buzz(25);
    }
  });

  const tap = (i: number) => {
    if (!g.myTurn) return;
    if (s.removing) {
      if (canRemove.has(i)) g.act({ t: 'remove', at: i });
      return;
    }
    if (phase === 'place') {
      if (!s.board[i]) g.act({ t: 'place', at: i });
      return;
    }
    if (sel !== null && targets.has(i)) {
      g.act({ t: 'move', from: sel, to: i });
      setSel(null);
      return;
    }
    if (movable.has(i)) {
      setSel(i === sel ? null : i);
      sfx.flip();
    } else setSel(null);
  };

  const who = players[s.turn];
  let hint: string;
  if (s.winner === 'draw') hint = 'Lange keine Mühle mehr – unentschieden! 🤝';
  else if (s.winner) hint = `${players[s.winner].emoji} ${players[s.winner].name} gewinnt!`;
  else if (s.removing) hint = turnHint(g, players, g.turn, `Mühle! ${who.emoji} ${who.name}, nimm einen Stein weg.`, `Mühle! ${who.emoji} ${who.name} nimmt einen Stein …`);
  else if (phase === 'place') hint = turnHint(g, players, g.turn, `${who.emoji} ${who.name}: Setze einen Stein (noch ${s.hand[s.turn]})`);
  else if (phase === 'fly') hint = turnHint(g, players, g.turn, `${who.emoji} ${who.name} hat nur noch 3 Steine und darf springen!`);
  else hint = turnHint(g, players, g.turn, `${who.emoji} ${who.name}: Tippe einen Stein und dann ein freies Nachbarfeld`);

  const lost = (side: Side) => MILL_STONES - s.hand[side] - onBoard(s.board, side);

  return (
    <div className="g-col muehle">
      <TurnBar p1={p1} p2={p2} turn={g.turn} done={!!s.winner} />
      <div className="mill-row">
        <Stones n={s.hand[opp]} color={players[opp].color} />
        {lost(opp) > 0 && <span className="mill-lost">{lost(opp)} geschlagen</span>}
      </div>
      <div className="mill-board">
        <div className="mill-inner">
          <svg viewBox="0 0 6 6" className="mill-lines" aria-hidden="true">
            {RINGS.map((r) => (
              <rect key={r} x={r} y={r} width={6 - 2 * r} height={6 - 2 * r} />
            ))}
            {CROSS.map(([y1, x1, y2, x2], k) => (
              <line key={k} x1={x1} y1={y1} x2={x2} y2={y2} />
            ))}
          </svg>
          {MILL_POINTS.map(([r, c], i) => {
            const owner = s.board[i];
            const placeable = g.myTurn && !s.removing && phase === 'place' && !owner;
            return (
              <button
                key={i}
                className={cls('mill-pt', placeable && 'free', targets.has(i) && 'free', sel === i && 'sel', canRemove.has(i) && 'remove', movable.has(i) && !s.removing && 'can', (s.last?.to === i || s.last?.from === i) && 'last')}
                style={{ left: pos(c), top: pos(r) }}
                onClick={() => tap(i)}
                aria-label={`Punkt ${i + 1}${owner ? ` (${players[owner].name})` : ''}`}
              >
                {owner && (
                  <span className="mill-stone" style={{ '--pc': players[owner].color } as CSSProperties}>
                    {players[owner].emoji}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
      <div className="mill-row">
        <Stones n={s.hand[me]} color={players[me].color} />
        {lost(me) > 0 && <span className="mill-lost">{lost(me)} geschlagen</span>}
      </div>
      <GameHint>{hint}</GameHint>
    </div>
  );
}
