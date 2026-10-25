import { useMemo, useState, type CSSProperties } from 'react';
import { cls } from '../lib/hooks';
import { checkersDef, checkersMoves, colorOf, count, dColor, dark, sideOf } from './checkers';
import { buzz, sfx } from './engine';
import { otherSide, type Side } from './logic';
import { GameHint, TurnBar, turnHint, useOnChange } from './parts';
import { useTurnGame } from './turn';
import type { GameProps, Player } from './types';

export function Checkers(props: GameProps) {
  const { p1, p2 } = props;
  const g = useTurnGame(checkersDef, props);
  const s = g.s;
  const players: Record<Side, Player> = { p1, p2 };
  const me = g.view;
  const flip = colorOf(s, me) === 'b';
  const [path, setPath] = useState<number[]>([]);
  const moves = useMemo(() => (g.myTurn ? checkersMoves(s.board, s.turn) : []), [s, g.myTurn]);
  const forced = moves.length > 0 && moves[0].caps.length > 0;
  const cands = moves.filter((m) => path.every((x, k) => m.path[k] === x));
  const next = new Set(path.length ? cands.map((m) => m.path[path.length]).filter((x) => x !== undefined) : moves.map((m) => m.path[0]));
  // Schon übersprungene Steine während eines Mehrfachsprungs
  const jumped = new Set(path.length > 1 ? cands[0]?.caps.slice(0, path.length - 1) : []);
  const colorOfPlayer = (side: Side) => players[side].color;
  const toMove = sideOf(s, s.turn);

  useOnChange(s.last, (_, m) => {
    if (!m) return;
    if (m.caps.length) {
      sfx.brick();
      buzz(m.caps.length > 1 ? [20, 40, 20] : 20);
    } else sfx.tap();
    setPath([]);
  });

  const tap = (i: number) => {
    if (!g.myTurn) return;
    if (path.length && next.has(i)) {
      const np = [...path, i];
      const done = cands.find((m) => m.path.length === np.length && m.path.every((x, k) => x === np[k]));
      if (done) {
        g.act({ path: np });
        setPath([]);
      } else {
        setPath(np);
        sfx.flip();
      }
      return;
    }
    // Mitten im Mehrfachsprung nicht aus Versehen abbrechen
    if (path.length > 1) return;
    if (moves.some((m) => m.path[0] === i)) {
      setPath(path[0] === i ? [] : [i]);
      sfx.flip();
    } else setPath([]);
  };

  const order = Array.from({ length: 64 }, (_, k) => (flip ? 63 - k : k));
  const at = path[path.length - 1];
  const opp = otherSide(me);

  let hint: string;
  if (s.winner === 'draw') hint = 'Lange nichts passiert – unentschieden! 🤝';
  else if (s.winner) hint = `${players[s.winner].emoji} ${players[s.winner].name} gewinnt – ${players[otherSide(s.winner)].name} kann nicht mehr ziehen.`;
  else if (path.length > 1) hint = 'Weiter springen – Schlagen ist Pflicht!';
  else hint = turnHint(g, players, g.turn, forced ? `${players[toMove].emoji} ${players[toMove].name}: Du musst schlagen!` : `${players[toMove].emoji} ${players[toMove].name} ist dran`);

  return (
    <div className="g-col checkers">
      <TurnBar p1={p1} p2={p2} turn={g.turn} done={!!s.winner} />
      <div className="chess-side">
        <span>
          {players[opp].emoji} {count(s.board, colorOf(s, opp))} Steine
        </span>
        {path.length > 1 && (
          <button className="btn ghost small" onClick={() => setPath([])}>
            Zurück
          </button>
        )}
      </div>
      <div className="chess-board dame-board">
        {order.map((i) => {
          let pc = s.board[i];
          // Der ziehende Stein wandert während des Sprungs sichtbar mit.
          if (path.length > 1 && i === path[0]) pc = '.';
          if (path.length > 1 && i === at) pc = s.board[path[0]];
          const c = dColor(pc);
          const owner = c ? sideOf(s, c) : null;
          return (
            <button
              key={i}
              className={cls(
                'chess-sq',
                dark(i) ? 'dark' : 'light',
                path[0] === i && path.length === 1 && 'sel',
                path.includes(i) && path.length > 1 && 'path',
                next.has(i) && (path.length ? 'dot' : 'can'),
                s.last?.path.includes(i) && 'last',
              )}
              disabled={!dark(i)}
              onClick={() => tap(i)}
              aria-label={dark(i) ? `Feld ${i}` : undefined}
            >
              {owner && (
                <span className={cls('dame-piece', (pc === 'W' || pc === 'B') && 'king', jumped.has(i) && 'jumped', s.last?.path[s.last.path.length - 1] === i && 'moved')} style={{ '--pc': colorOfPlayer(owner) } as CSSProperties}>
                  {(pc === 'W' || pc === 'B') && '♛\uFE0E'}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <div className="chess-side">
        <span>
          {players[me].emoji} {count(s.board, colorOf(s, me))} Steine
        </span>
      </div>
      <GameHint>{hint}</GameHint>
    </div>
  );
}
