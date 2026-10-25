import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { cls } from '../lib/hooks';
import { buzz, sfx, tone } from './engine';
import type { GameProps } from './types';

export const MS_COLS = 9;
export const MS_ROWS = 12;
export const MS_MINES = 16;

export interface MsCell {
  mine: boolean;
  n: number;
  open: boolean;
  flag: boolean;
}

export function neighbors(i: number, cols = MS_COLS, rows = MS_ROWS): number[] {
  const r = Math.floor(i / cols);
  const c = i % cols;
  const out: number[] = [];
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr;
      const cc = c + dc;
      if (rr >= 0 && rr < rows && cc >= 0 && cc < cols) out.push(rr * cols + cc);
    }
  return out;
}

const emptyBoard = (): MsCell[] => Array.from({ length: MS_COLS * MS_ROWS }, () => ({ mine: false, n: 0, open: false, flag: false }));

/** Minen verteilen – nie auf dem ersten Feld und seinen Nachbarn. */
export function layMines(first: number, rnd: () => number = Math.random): MsCell[] {
  const safe = new Set([first, ...neighbors(first)]);
  const cells = emptyBoard();
  const spots = cells.map((_, i) => i).filter((i) => !safe.has(i));
  for (let k = 0; k < MS_MINES; k++) {
    const j = k + Math.floor(rnd() * (spots.length - k));
    [spots[k], spots[j]] = [spots[j], spots[k]];
    cells[spots[k]].mine = true;
  }
  cells.forEach((cell, i) => (cell.n = neighbors(i).filter((j) => cells[j].mine).length));
  return cells;
}

/** Feld aufdecken; leere Felder decken ihre Nachbarn gleich mit auf. */
export function reveal(cells: MsCell[], i: number): MsCell[] {
  const out = cells.map((c) => ({ ...c }));
  const stack = [i];
  while (stack.length) {
    const k = stack.pop()!;
    const cell = out[k];
    if (cell.open || cell.flag) continue;
    cell.open = true;
    if (!cell.mine && cell.n === 0) stack.push(...neighbors(k).filter((j) => !out[j].open));
  }
  return out;
}

export const msWon = (cells: MsCell[]) => cells.every((c) => c.mine || c.open);

const NUM_COLOR = ['', '#4fc3f7', '#5ee6a8', '#ff6b8b', '#c77dff', '#ffb74d', '#4dd0e1', '#f8ecff', '#baa6cd'];

export function Minesweeper({ best, onEnd }: GameProps) {
  const [cells, setCells] = useState<MsCell[]>(emptyBoard);
  const [started, setStarted] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [flagMode, setFlagMode] = useState(false);
  const [state, setState] = useState<'play' | 'won' | 'lost'>('play');
  const [boom, setBoom] = useState<number | null>(null);
  const press = useRef<{ i: number; timer: number; long: boolean } | null>(null);

  useEffect(() => {
    if (started === null || state !== 'play') return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [started, state]);

  const secs = started === null ? 0 : Math.floor((now - started) / 1000);
  const flags = cells.filter((c) => c.flag).length;

  const finish = (next: MsCell[], lost: boolean, at?: number) => {
    const time = started === null ? 0 : Math.max(1, Math.round((Date.now() - started) / 1000));
    setNow(Date.now());
    if (lost) {
      setState('lost');
      setBoom(at ?? null);
      setCells(next.map((c) => (c.mine ? { ...c, open: true } : c)));
      sfx.lose();
      buzz([80, 40, 160]);
      window.setTimeout(() => onEnd({ score: time, failed: true }), 1800);
    } else {
      setState('won');
      setCells(next.map((c) => (c.mine ? { ...c, flag: true } : c)));
      sfx.win();
      buzz([30, 30, 30]);
      window.setTimeout(() => onEnd({ score: time }), 1400);
    }
  };

  const open = (i: number) => {
    if (state !== 'play') return;
    let board = cells;
    if (started === null) {
      board = layMines(i);
      setStarted(Date.now());
    }
    const cell = board[i];
    if (cell.flag) return;
    // Auf eine aufgedeckte Zahl tippen: Nachbarn aufdecken, wenn genug Fahnen stehen
    if (cell.open) {
      const nb = neighbors(i);
      if (cell.n && nb.filter((j) => board[j].flag).length === cell.n) {
        let next = board;
        let hit: number | undefined;
        for (const j of nb) {
          if (next[j].flag || next[j].open) continue;
          if (next[j].mine) hit = j;
          next = reveal(next, j);
        }
        if (hit !== undefined) return finish(next, true, hit);
        setCells(next);
        sfx.flip();
        if (msWon(next)) finish(next, false);
      }
      return;
    }
    if (cell.mine) return finish(reveal(board, i), true, i);
    const next = reveal(board, i);
    setCells(next);
    if (next.filter((c) => c.open).length - board.filter((c) => c.open).length > 3) tone(700, 60, 'triangle', 0.04, 1000);
    else sfx.tap();
    if (msWon(next)) finish(next, false);
  };

  const flag = (i: number) => {
    if (state !== 'play' || cells[i].open) return;
    setCells(cells.map((c, k) => (k === i ? { ...c, flag: !c.flag } : c)));
    sfx.flip();
    buzz(25);
  };

  const down = (i: number) => {
    const timer = window.setTimeout(() => {
      if (press.current?.i !== i) return;
      press.current.long = true;
      flag(i);
    }, 420);
    press.current = { i, timer, long: false };
  };
  const up = (i: number) => {
    const p = press.current;
    press.current = null;
    if (!p || p.i !== i) return;
    window.clearTimeout(p.timer);
    if (p.long) return;
    if (flagMode && !cells[i].open) flag(i);
    else open(i);
  };

  return (
    <div className="g-col ms">
      <div className="score-strip">
        <span>💣 {MS_MINES - flags}</span>
        <span>⏱ {secs} s</span>
        <span>🏆 {best !== undefined ? `${best} s` : '–'}</span>
      </div>
      <div className="ms-board" style={{ '--cols': MS_COLS } as CSSProperties} onContextMenu={(e) => e.preventDefault()}>
        {cells.map((c, i) => (
          <button
            key={i}
            className={cls('ms-cell', c.open && 'open', c.open && c.mine && 'mine', boom === i && 'boom', c.flag && 'flag', state === 'lost' && c.flag && !c.mine && 'wrong')}
            onPointerDown={() => down(i)}
            onPointerUp={() => up(i)}
            onPointerLeave={() => press.current?.i === i && (window.clearTimeout(press.current.timer), (press.current = null))}
            style={c.open && c.n && !c.mine ? ({ color: NUM_COLOR[c.n] } as CSSProperties) : undefined}
            aria-label={c.open ? (c.mine ? 'Mine' : String(c.n || 'leer')) : c.flag ? 'Fahne' : 'verdeckt'}
          >
            {c.open ? (c.mine ? '💣' : c.n || '') : c.flag ? '🚩' : ''}
          </button>
        ))}
      </div>
      <div className="ms-tools" role="group" aria-label="Was passiert beim Tippen?">
        <button className={cls('btn small', flagMode ? 'ghost' : 'primary')} onClick={() => setFlagMode(false)} aria-pressed={!flagMode}>
          👆 Aufdecken
        </button>
        <button className={cls('btn small', flagMode ? 'primary' : 'ghost')} onClick={() => setFlagMode(true)} aria-pressed={flagMode}>
          🚩 Fahne setzen
        </button>
      </div>
      <p className="game-hint">
        {state === 'won' ? `Geschafft in ${secs} Sekunden! 🎉` : state === 'lost' ? 'Boom! 💥' : started === null ? 'Tippe irgendwo hin – das erste Feld ist immer sicher' : 'Lange drücken setzt eine Fahne'}
      </p>
    </div>
  );
}
