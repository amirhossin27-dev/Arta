import { useEffect, useState, type CSSProperties } from 'react';
import { cls } from '../lib/hooks';
import { buzz, sfx } from './engine';
import { C4_COLS, C4_ROWS, c4CpuMove, c4Drop, c4Empty, c4Full, c4LandingRow, c4Winner, otherSide, type Cell, type Side } from './logic';
import { GameHint, TurnBar } from './parts';
import type { GameProps } from './types';

export function ConnectFour({ mode, p1, p2, starter, onEnd }: GameProps) {
  const [board, setBoard] = useState<Cell[]>(c4Empty);
  const [turn, setTurn] = useState<Side>(starter);
  const [last, setLast] = useState<number>(-1);
  const [hover, setHover] = useState<number | null>(null);
  const win = c4Winner(board);
  const full = !win && c4Full(board);
  const over = !!win || full;
  const cpuTurn = mode === 'cpu' && turn === 'p2' && !over;
  const players = { p1, p2 };

  const drop = (col: number) => {
    if (over) return;
    const d = c4Drop(board, col, turn);
    if (!d) return;
    setBoard(d.board);
    setLast(d.row * C4_COLS + col);
    setTurn(otherSide(turn));
    sfx.tap();
    buzz(12);
  };

  useEffect(() => {
    if (!cpuTurn) return;
    const t = window.setTimeout(() => drop(c4CpuMove(board, 'p2', 4)), 650 + Math.random() * 350);
    return () => window.clearTimeout(t);
  }, [cpuTurn, board]);

  const winner: Side | 'draw' | undefined = win ? win.winner : full ? 'draw' : undefined;
  useEffect(() => {
    if (!winner) return;
    const t = window.setTimeout(() => onEnd({ winner }), 1400);
    return () => window.clearTimeout(t);
  }, [winner]);

  const winCells = new Set(win?.cells ?? []);
  const preview = hover !== null && !over && !cpuTurn ? c4LandingRow(board, hover) : -1;

  return (
    <div className="g-col">
      <TurnBar p1={p1} p2={p2} turn={turn} done={over} />
      <div className="c4-board" style={{ '--cols': C4_COLS, '--rows': C4_ROWS } as CSSProperties} onPointerLeave={() => setHover(null)}>
        {Array.from({ length: C4_COLS }, (_, col) => (
          <button
            key={col}
            className="c4-col"
            disabled={over || cpuTurn || c4LandingRow(board, col) < 0}
            onClick={() => drop(col)}
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
            : cpuTurn
              ? '🤖 Arta überlegt …'
              : `${players[turn].emoji} ${players[turn].name}: Tippe auf eine Spalte`}
      </GameHint>
    </div>
  );
}
