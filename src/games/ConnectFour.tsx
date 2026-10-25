import { useState, type CSSProperties } from 'react';
import { cls } from '../lib/hooks';
import { c4Def } from './classic';
import { buzz, sfx } from './engine';
import { C4_COLS, C4_ROWS, c4Full, c4LandingRow, c4Winner } from './logic';
import { GameHint, TurnBar, turnHint, useOnChange } from './parts';
import { useTurnGame } from './turn';
import type { GameProps } from './types';

export function ConnectFour(props: GameProps) {
  const { p1, p2 } = props;
  const g = useTurnGame(c4Def, props);
  const { board, last, turn } = g.s;
  const [hover, setHover] = useState<number | null>(null);
  const win = c4Winner(board);
  const full = !win && c4Full(board);
  const over = !!win || full;
  const players = { p1, p2 };

  useOnChange(board, () => {
    sfx.tap();
    buzz(12);
  });

  const winCells = new Set(win?.cells ?? []);
  const preview = hover !== null && g.myTurn ? c4LandingRow(board, hover) : -1;

  return (
    <div className="g-col">
      <TurnBar p1={p1} p2={p2} turn={g.turn} done={over} />
      <div className="c4-board" style={{ '--cols': C4_COLS, '--rows': C4_ROWS } as CSSProperties} onPointerLeave={() => setHover(null)}>
        {Array.from({ length: C4_COLS }, (_, col) => (
          <button
            key={col}
            className="c4-col"
            disabled={!g.myTurn || c4LandingRow(board, col) < 0}
            onClick={() => g.act(col)}
            onPointerEnter={(e) => e.pointerType === 'mouse' && setHover(col)}
            aria-label={`Spalte ${col + 1}`}
          >
            {Array.from({ length: C4_ROWS }, (_, row) => {
              const i = row * C4_COLS + col;
              const c = board[i];
              const ghost = !c && hover === col && row === preview;
              return (
                <span key={row} className="c4-hole">
                  {(c || ghost) && (
                    <span
                      className={cls('c4-disc', i === last && 'drop', winCells.has(i) && 'win', ghost && 'ghost')}
                      style={{ '--pc': players[c ?? turn].color, '--fall': row + 1 } as CSSProperties}
                    >
                      {players[c ?? turn].emoji}
                    </span>
                  )}
                </span>
              );
            })}
          </button>
        ))}
      </div>
      <GameHint>
        {win
          ? `${players[win.winner].emoji} ${players[win.winner].name} hat vier in einer Reihe!`
          : full
            ? 'Brett voll – unentschieden! 🤝'
            : turnHint(g, players, g.turn, `${players[turn].emoji} ${players[turn].name}: Tippe auf eine Spalte`)}
      </GameHint>
    </div>
  );
}
