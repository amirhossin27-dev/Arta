import { useState, type CSSProperties } from 'react';
import { cls } from '../lib/hooks';
import { allSunk, battleDef, isSunk, knownWater, randomFleet, SEA, SHIP_NAME, type Fleet } from './battleship';
import { buzz, sfx, tone } from './engine';
import { otherSide, type Side } from './logic';
import { Curtain, GameHint, TurnBar, turnHint, useOnChange } from './parts';
import { useTurnGame } from './turn';
import type { GameProps, Player } from './types';

const CELLS = Array.from({ length: SEA * SEA }, (_, i) => i);

/** Ein Meer: eigene Flotte (offen) oder das des Schatzes (nur Treffer sichtbar). */
function Sea({
  fleet,
  shots,
  own,
  onShoot,
  small,
  lastAt,
}: {
  fleet: Fleet;
  shots: number[];
  own: boolean;
  onShoot?: (i: number) => void;
  small?: boolean;
  lastAt?: number;
}) {
  const water = knownWater(fleet, shots);
  const shipAt = (i: number) => fleet.find((s) => s.includes(i));
  return (
    <div className={cls('bs-sea', small && 'small', onShoot && 'aim')} style={{ '--n': SEA } as CSSProperties}>
      {CELLS.map((i) => {
        const ship = shipAt(i);
        const shot = shots.includes(i);
        const sunk = ship && isSunk(ship, shots);
        const show = own || sunk;
        const horiz = ship && ship.length > 1 && ship[1] - ship[0] === 1;
        const first = ship && i === Math.min(...ship);
        const end = ship && i === Math.max(...ship);
        return (
          <button
            key={i}
            className={cls(
              'bs-cell',
              show && ship && 'ship',
              show && ship && (horiz ? 'h' : 'v'),
              show && first && 'first',
              show && end && 'end',
              shot && ship && 'hit',
              sunk && 'sunk',
              shot && !ship && 'miss',
              !shot && water.has(i) && 'water',
              lastAt === i && 'last',
            )}
            disabled={!onShoot || shot || water.has(i)}
            onClick={() => onShoot?.(i)}
            aria-label={`${'ABCDEFGHIJ'[i % SEA]}${Math.floor(i / SEA) + 1}`}
          >
            {shot && ship ? (sunk ? '✖' : '🔥') : shot ? '•' : ''}
          </button>
        );
      })}
    </div>
  );
}

function ShipList({ fleet, shots }: { fleet: Fleet; shots: number[] }) {
  const sorted = fleet.slice().sort((a, b) => b.length - a.length);
  return (
    <div className="bs-ships">
      {sorted.map((ship, k) => (
        <span key={k} className={cls('bs-ship-tag', isSunk(ship, shots) && 'gone')} title={SHIP_NAME[ship.length]}>
          {Array.from({ length: ship.length }, (_, j) => (
            <i key={j} />
          ))}
        </span>
      ))}
    </div>
  );
}

export function Battleship(props: GameProps) {
  const { p1, p2, mode } = props;
  const g = useTurnGame(battleDef, props);
  const s = g.s;
  const players: Record<Side, Player> = { p1, p2 };
  // An einem Handy wechselt die Sicht erst, wenn der Nächste den Sichtschutz aufhebt.
  const me = g.view;
  const opp = otherSide(me);
  const [draft, setDraft] = useState<Fleet>(() => randomFleet(Math.random));
  const [boom, setBoom] = useState<string | null>(null);

  useOnChange(s.last, (_, l) => {
    if (!l) return;
    if (l.sunk) {
      setBoom(`Versenkt! ${SHIP_NAME[l.sunk]} (${l.sunk})`);
      sfx.miss();
      buzz([40, 40, 80]);
      window.setTimeout(() => setBoom(null), 1400);
    } else if (l.hit) {
      tone(180, 160, 'sawtooth', 0.05, 90);
      buzz(40);
    } else {
      tone(520, 60, 'triangle', 0.04, 260);
    }
  });

  const shuffleFleet = () => {
    setDraft(randomFleet(Math.random));
    sfx.flip();
  };

  if (s.phase === 'setup') {
    const ready = !!s.fleets[me];
    return (
      <div className="g-col bs">
        <TurnBar p1={p1} p2={p2} turn={g.turn} />
        {!ready && g.myTurn ? (
          <>
            <p className="bs-title">
              {players[me].emoji} {players[me].name}: Deine Flotte
            </p>
            <Sea fleet={draft} shots={[]} own />
            <p className="game-hint">Gefällt dir die Aufstellung? Sonst einfach neu mischen.</p>
            <div className="btn-row">
              <button className="btn soft" onClick={shuffleFleet}>
                🎲 Neu mischen
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  g.act({ t: 'ready', fleet: draft }, me);
                  setDraft(randomFleet(Math.random));
                  sfx.point();
                }}
              >
                ✅ Fertig
              </button>
            </div>
          </>
        ) : (
          !g.curtain && (
            <div className="slf-waiting">
              <span className="bs-wait">🚢</span>
              <p>
                <b>Flotte steht ✓</b>
              </p>
              <p className="muted">
                {mode === 'cpu' ? '🤖 Die KI stellt auf …' : `Warte auf ${players[opp].emoji} ${players[opp].name} …`}
              </p>
            </div>
          )
        )}
        {g.curtain && <Curtain player={players[g.curtain]} note="Jetzt stellst du deine Flotte auf." onReveal={g.reveal} />}
      </div>
    );
  }

  const theirFleet = s.fleets[opp]!;
  const myFleet = s.fleets[me]!;
  const myShots = s.shots[me];
  const theirShots = s.shots[opp];
  const mine = g.myTurn && s.turn === me && !g.curtain;
  const l = s.last;

  let hint: string;
  if (s.winner) hint = `${players[s.winner].emoji} ${players[s.winner].name} hat die ganze Flotte versenkt! ⚓`;
  else if (mine) hint = l?.by === me && l.hit ? 'Treffer! Du darfst nochmal 🎯' : 'Tippe aufs Meer, um zu schießen';
  else hint = turnHint(g, players, g.turn, '', l?.by === opp && l.hit ? `Treffer bei dir! ${players[opp].name} schießt nochmal …` : undefined);

  return (
    <div className="g-col bs">
      <TurnBar p1={p1} p2={p2} turn={g.turn} done={!!s.winner} />
      <div className="bs-head">
        <span>
          {players[opp].emoji} Meer von {players[opp].name}
        </span>
        <ShipList fleet={theirFleet} shots={myShots} />
      </div>
      <Sea fleet={theirFleet} shots={myShots} own={!!s.winner} onShoot={mine ? (i) => g.act({ t: 'shoot', at: i }) : undefined} lastAt={l?.by === me ? l.at : undefined} />
      <GameHint>{hint}</GameHint>
      <div className="bs-mine">
        <Sea fleet={myFleet} shots={theirShots} own small lastAt={l?.by === opp ? l.at : undefined} />
        <div className="bs-mine-info">
          <b>
            {players[me].emoji} Deine Flotte
          </b>
          <ShipList fleet={myFleet} shots={theirShots} />
          <small className="muted">
            {myShots.length} Schüsse · {myShots.filter((x) => theirFleet.some((sh) => sh.includes(x))).length} Treffer
          </small>
          {allSunk(myFleet, theirShots) && <small>Alles versenkt 😢</small>}
        </div>
      </div>
      {boom && <div className="uno-flash">{boom}</div>}
      {g.curtain && <Curtain player={players[g.curtain]} note={l ? (l.hit ? `${players[otherSide(g.curtain)].name} hat getroffen.` : `${players[otherSide(g.curtain)].name} hat danebengeschossen.`) : undefined} onReveal={g.reveal} />}
    </div>
  );
}
