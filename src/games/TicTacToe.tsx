import { useEffect, useState } from 'react';
import { cls } from '../lib/hooks';
import { buzz, sfx } from './engine';
import { otherSide, tttCpuMove, tttResult, type Cell, type Side } from './logic';
import { GameHint, TurnBar } from './parts';
import type { GameProps } from './types';

export function TicTacToe({ mode, p1, p2, starter, onEnd }: GameProps) {
  const [board, setBoard] = useState<Cell[]>(() => Array(9).fill(null));
  const [turn, setTurn] = useState<Side>(starter);
  const result = tttResult(board);
  const cpuTurn = mode === 'cpu' && turn === 'p2' && !result;
  const players = { p1, p2 };

  const place = (i: number) => {
    if (board[i] || result) return;
    const next = board.slice();
    next[i] = turn;
    setBoard(next);
    setTurn(otherSide(turn));
    sfx.tap();
    buzz(10);
  };

  useEffect(() => {
    if (!cpuTurn) return;
    const t = window.setTimeout(() => place(tttCpuMove(board, 'p2')), 520 + Math.random() * 300);
    return () => window.clearTimeout(t);
  }, [cpuTurn, board]);

  const winner = result?.winner;
  useEffect(() => {
    if (!winner) return;
    const t = window.setTimeout(() => onEnd({ winner }), 1100);
    return () => window.clearTimeout(t);
  }, [winner]);

  return (
    <div className="g-col">
      <TurnBar p1={p1} p2={p2} turn={turn} done={!!result} />
      <div className="ttt-board">
        {board.map((c, i) => (
          <button
            key={i}
            className={cls('ttt-cell', result?.line?.includes(i) && 'win')}
            disabled={!!c || !!result || cpuTurn}
            onClick={() => place(i)}
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
          : cpuTurn
            ? '🤖 Arta überlegt …'
            : `${players[turn].emoji} ${players[turn].name} ist dran`}
      </GameHint>
    </div>
  );
}
