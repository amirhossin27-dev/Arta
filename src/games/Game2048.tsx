import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react';
import { cls } from '../lib/hooks';
import { buzz, sfx, tone } from './engine';
import type { GameProps } from './types';

const N = 4;

export interface Tile {
  id: number;
  v: number;
  r: number;
  c: number;
  /** Verschwindet nach der Bewegung (wurde in eine andere Kachel geschoben) */
  gone?: boolean;
  merged?: boolean;
  fresh?: boolean;
}

type Dir = 'up' | 'down' | 'left' | 'right';

let nextId = 1;

export function addRandom(tiles: Tile[], rnd: () => number = Math.random): Tile[] {
  const used = new Set(tiles.filter((t) => !t.gone).map((t) => t.r * N + t.c));
  const free = Array.from({ length: N * N }, (_, i) => i).filter((i) => !used.has(i));
  if (!free.length) return tiles;
  const i = free[Math.floor(rnd() * free.length)];
  return [...tiles, { id: nextId++, v: rnd() < 0.9 ? 2 : 4, r: Math.floor(i / N), c: i % N, fresh: true }];
}

/** Schiebt alle Kacheln in eine Richtung. Liefert die Kacheln (inkl. verschwindender) und die Punkte. */
export function slide(tiles: Tile[], dir: Dir): { tiles: Tile[]; gained: number; moved: boolean } {
  const live = tiles.filter((t) => !t.gone).map((t) => ({ ...t, merged: false, fresh: false }));
  const out: Tile[] = [];
  let gained = 0;
  let moved = false;
  for (let line = 0; line < N; line++) {
    // Kacheln dieser Zeile/Spalte in Schieberichtung sortiert
    const inLine = live
      .filter((t) => (dir === 'left' || dir === 'right' ? t.r === line : t.c === line))
      .sort((a, b) => {
        const ka = dir === 'left' || dir === 'right' ? a.c : a.r;
        const kb = dir === 'left' || dir === 'right' ? b.c : b.r;
        return dir === 'left' || dir === 'up' ? ka - kb : kb - ka;
      });
    let slot = 0;
    let prev: Tile | null = null;
    for (const t of inLine) {
      const place = (k: number) => {
        const pos = dir === 'left' || dir === 'up' ? k : N - 1 - k;
        return dir === 'left' || dir === 'right' ? { r: line, c: pos } : { r: pos, c: line };
      };
      if (prev && !prev.merged && prev.v === t.v) {
        // Verschmelzen: t rutscht auf prev und verschwindet, prev verdoppelt sich
        const p = { r: prev.r, c: prev.c };
        out.push({ ...t, ...p, gone: true });
        prev.v *= 2;
        prev.merged = true;
        gained += prev.v;
        moved = true;
        continue;
      }
      const p = place(slot++);
      if (p.r !== t.r || p.c !== t.c) moved = true;
      const nt = { ...t, ...p };
      out.push(nt);
      prev = nt;
    }
  }
  return { tiles: out, gained, moved };
}

export function canMove(tiles: Tile[]): boolean {
  const live = tiles.filter((t) => !t.gone);
  if (live.length < N * N) return true;
  const at = (r: number, c: number) => live.find((t) => t.r === r && t.c === c)?.v;
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (at(r, c) === at(r, c + 1) || at(r, c) === at(r + 1, c)) return true;
  return false;
}

const COLORS: Record<number, [string, string]> = {
  2: ['#fde2ec', '#7a3550'],
  4: ['#fbcfe0', '#7a3550'],
  8: ['#ffb38a', '#fff'],
  16: ['#ff9466', '#fff'],
  32: ['#ff7a6b', '#fff'],
  64: ['#ff5770', '#fff'],
  128: ['#f7c948', '#fff'],
  256: ['#f2b630', '#fff'],
  512: ['#eba51d', '#fff'],
  1024: ['#c77dff', '#fff'],
  2048: ['#ff2f8f', '#fff'],
};

export function Game2048({ best, onEnd }: GameProps) {
  const [tiles, setTiles] = useState<Tile[]>(() => addRandom(addRandom([])));
  const [score, setScore] = useState(0);
  const [won, setWon] = useState(false);
  const [over, setOver] = useState(false);
  const busy = useRef(false);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const state = useRef({ tiles, score });
  state.current = { tiles, score };

  const go = (dir: Dir) => {
    if (busy.current || over) return;
    const { tiles: moved, gained, moved: changed } = slide(state.current.tiles, dir);
    if (!changed) {
      tone(160, 50, 'square', 0.02);
      return;
    }
    busy.current = true;
    setTiles(moved);
    const total = state.current.score + gained;
    setScore(total);
    if (gained) {
      sfx.match();
      buzz(10);
    } else sfx.tap();
    window.setTimeout(() => {
      const next = addRandom(moved.filter((t) => !t.gone));
      setTiles(next);
      busy.current = false;
      if (!won && next.some((t) => t.v >= 2048)) {
        setWon(true);
        sfx.win();
      }
      if (!canMove(next)) {
        setOver(true);
        sfx.lose();
        window.setTimeout(() => onEnd({ score: total }), 1200);
      }
    }, 120);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const d = ({ arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down', arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right' } as Record<string, Dir>)[e.key.toLowerCase()];
      if (!d) return;
      e.preventDefault();
      go(d);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const onDown = (e: RPointerEvent) => {
    swipe.current = { x: e.clientX, y: e.clientY };
  };
  const onUp = (e: RPointerEvent) => {
    const sw = swipe.current;
    swipe.current = null;
    if (!sw) return;
    const dx = e.clientX - sw.x;
    const dy = e.clientY - sw.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    go(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
  };

  const top = Math.max(...tiles.map((t) => t.v));

  return (
    <div className="g-col">
      <div className="score-strip">
        <span>⭐ {score}</span>
        <span>🔝 {top}</span>
        <span>🏆 {best ?? '–'}</span>
      </div>
      <div className="g2048" onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={() => (swipe.current = null)}>
        {Array.from({ length: N * N }, (_, i) => (
          <span key={i} className="g2048-slot" />
        ))}
        {tiles.map((t) => {
          const [bg, fg] = COLORS[t.v] ?? ['#3d2a5c', '#fff'];
          return (
            <span
              key={t.id}
              className={cls('g2048-tile', t.merged && 'merged', t.fresh && 'fresh', t.gone && 'gone', t.v >= 1024 && 'big')}
              style={{ '--r': t.r, '--c': t.c, '--tile': bg, '--ink': fg } as CSSProperties}
            >
              {t.v}
            </span>
          );
        })}
        {won && !over && <span className="g2048-badge">2048! 💖 Weiter geht’s</span>}
      </div>
      <p className="game-hint">{over ? 'Nichts geht mehr!' : 'Wische, um alle Kacheln zu schieben'}</p>
    </div>
  );
}
