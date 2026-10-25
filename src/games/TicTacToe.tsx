import { cls } from '../lib/hooks';
import { tttDef } from './classic';
import { buzz, sfx } from './engine';
import { tttResult } from './logic';
import { GameHint, TurnBar, turnHint, useOnChange } from './parts';
import { useTurnGame } from './turn';
import type { GameProps } from './types';

export function TicTacToe(props: GameProps) {
  const { p1, p2 } = props;
  const g = useTurnGame(tttDef, props);
  const { board } = g.s;
  const result = tttResult(board);
  const players = { p1, p2 };

  useOnChange(board, () => {
    sfx.tap();
    buzz(10);
  });

  return (
    <div className="g-col">
      <TurnBar p1={p1} p2={p2} turn={g.turn} done={!!result} />
      <div className="ttt-board">
        {board.map((c, i) => (
          <button
            key={i}
            className={cls('ttt-cell', result?.line?.includes(i) && 'win')}
            disabled={!!c || !g.myTurn}
            onClick={() => g.act(i)}
            aria-label={c ? players[c].name : `Feld ${i + 1}`}
          >
            {c && <span className="ttt-mark">{players[c].emoji}</span>}
          </button>
        ))}
      </div>
      <GameHint>
        {result
          ? result.winner === 'draw'
            ? 'Unentschieden! 🤝'
            : `${players[result.winner].emoji} ${players[result.winner].name} gewinnt!`
          : turnHint(g, players, g.turn, `${players[g.s.turn].emoji} ${players[g.s.turn].name} ist dran`)}
      </GameHint>
    </div>
  );
}
