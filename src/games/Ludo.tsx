import type { CSSProperties } from 'react';
import { cls } from '../lib/hooks';
import { buzz, sfx, tone } from './engine';
import type { Side } from './logic';
import { LUDO_GOAL, LUDO_HOME, LUDO_SPARE_HOMES, LUDO_TRACK, ludoCell, ludoDef, ludoMoves } from './ludo';
import { GameHint, TurnBar, useOnChange } from './parts';
import { useTurnGame } from './turn';
import type { GameProps } from './types';

type CellKind = 'track' | 'start-p1' | 'start-p2' | 'goal-p1' | 'goal-p2' | 'home-p1' | 'home-p2' | 'spare';

const CELLS: { x: number; y: number; kind: CellKind }[] = (() => {
  const out: { x: number; y: number; kind: CellKind }[] = [];
  const add = (list: [number, number][], kind: CellKind) => list.forEach(([x, y]) => out.push({ x, y, kind }));
  add(LUDO_TRACK, 'track');
  add(LUDO_GOAL.p1, 'goal-p1');
  add(LUDO_GOAL.p2, 'goal-p2');
  add(LUDO_HOME.p1, 'home-p1');
  add(LUDO_HOME.p2, 'home-p2');
  LUDO_SPARE_HOMES.forEach((h) => add(h, 'spare'));
  out[0].kind = 'start-p1';
  out[20].kind = 'start-p2';
  return out;
})();

const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

function Die({ n }: { n: number }) {
  return (
    <span className="die-face">
      {Array.from({ length: 9 }, (_, i) => (
        <span key={i} className={cls('pip', PIPS[n]?.includes(i) && 'on')} />
      ))}
    </span>
  );
}

const pct = (v: number) => `${(v * 100) / 11}%`;

export function Ludo(props: GameProps) {
  const { p1, p2 } = props;
  const g = useTurnGame(ludoDef, props);
  const s = g.s;
  const players = { p1, p2 };
  const cur = players[s.turn];
  const movable = s.phase === 'move' && s.roll !== null && g.myTurn ? ludoMoves(s, s.turn, s.roll) : [];
  const canRoll = g.myTurn && s.phase === 'roll';
  const flip = g.view === 'p2';

  useOnChange(s.rolls, () => {
    [0, 60, 120].forEach((d, k) => window.setTimeout(() => tone(380 + k * 90, 45, 'square', 0.035), d));
    buzz(15);
  });
  useOnChange(s.pos, (a, b) => {
    const hit = (['p1', 'p2'] as Side[]).some((side) => a[side].some((p, i) => p >= 0 && b[side][i] < 0));
    if (hit) {
      sfx.miss();
      buzz(80);
    } else if ((['p1', 'p2'] as Side[]).some((side) => b[side].some((p, i) => p >= 40 && a[side][i] < 40))) sfx.point();
    else sfx.bounce();
  });

  let hint: string;
  if (s.winner) hint = `${players[s.winner].emoji} ${players[s.winner].name} hat alle Figuren im Ziel! 🏁`;
  else if (g.thinking) hint = s.phase === 'roll' ? '🤖 KI würfelt …' : '🤖 KI zieht …';
  else if (g.waiting) hint = `${cur.emoji} ${cur.name} ist dran …`;
  else if (s.phase === 'roll') hint = `${cur.emoji} ${cur.name}, würfle!${s.tries > 1 ? ` (${s.tries} Versuche)` : ''}`;
  else hint = movable.length > 1 ? `${cur.emoji} Tippe auf eine leuchtende Figur` : `${cur.emoji} ${cur.name} zieht …`;

  const last = s.last;

  return (
    <div className="g-col">
      <TurnBar p1={p1} p2={p2} turn={g.turn} done={!!s.winner} />
      <div className={cls('ludo-board', flip && 'flip')} style={{ '--c1': p1.color, '--c2': p2.color } as CSSProperties}>
        {CELLS.map((c, i) => (
          <span key={i} className={cls('ludo-cell', c.kind)} style={{ left: pct(c.x), top: pct(c.y) }} />
        ))}
        <span className="ludo-center">🎲</span>
        {(['p1', 'p2'] as Side[]).map((side) =>
          s.pos[side].map((rel, i) => {
            const [x, y] = ludoCell(side, rel, i);
            const can = side === s.turn && movable.includes(i);
            return (
              <button
                key={`${side}${i}`}
                className={cls('ludo-piece', can && 'movable', rel >= 40 && 'home-run')}
                style={{ left: pct(x), top: pct(y), '--pc': players[side].color } as CSSProperties}
                disabled={!can}
                onClick={() => g.act({ t: 'move', i })}
                aria-label={`${players[side].name}: Figur ${i + 1}`}
              >
                <span>{players[side].emoji}</span>
              </button>
            );
          }),
        )}
      </div>
      <div className="ludo-dice-row">
        <button className={cls('ludo-die', canRoll && 'ready')} onClick={() => g.act({ t: 'roll' })} disabled={!canRoll} aria-label="Würfeln">
          <span key={s.rolls} className="die-roll" style={{ '--pc': players[last?.by ?? s.turn].color } as CSSProperties}>
            <Die n={s.roll ?? last?.roll ?? 6} />
          </span>
        </button>
        <div className="ludo-info">
          <b>{hint}</b>
          {last && (
            <span className="muted">
              {players[last.by].emoji} hat eine {last.roll} gewürfelt{last.note ? ` · ${last.note}` : ''}
            </span>
          )}
          {!last && <span className="muted">Mit einer 6 kommt eine neue Figur raus.</span>}
        </div>
      </div>
      <GameHint>
        🏁 {p1.emoji} {s.pos.p1.filter((p) => p >= 40).length}/4 · {p2.emoji} {s.pos.p2.filter((p) => p >= 40).length}/4 im Ziel
      </GameHint>
    </div>
  );
}
