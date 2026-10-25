import { useState, type CSSProperties } from 'react';
import { cls } from '../lib/hooks';
import { buzz, sfx, tone } from './engine';
import { otherSide } from './logic';
import { Curtain, GameHint, TurnBar, useOnChange } from './parts';
import { useTurnGame } from './turn';
import type { GameProps, Player } from './types';
import { UNO_COLOR_NAME, UNO_COLORS, unoDef, unoLabel, unoName, unoPlayable, unoTop, type UnoCard, type UnoColor, type UnoState } from './uno';

export function UnoCardView({ card, playable, dim, onClick, small }: { card: UnoCard; playable?: boolean; dim?: boolean; onClick?: () => void; small?: boolean }) {
  const label = unoLabel(card);
  return (
    <button className={cls('uno-card', `uc-${card.c}`, playable && 'playable', dim && 'dim', small && 'small')} onClick={onClick} disabled={!onClick} aria-label={unoName(card)}>
      <span className="uc-corner">{label}</span>
      <span className="uc-oval">{card.c === 'w' ? <span className="uc-wheel" /> : null}<b>{label}</b></span>
      <span className="uc-corner br">{label}</span>
    </button>
  );
}

function lastText(s: UnoState, players: Record<'p1' | 'p2', Player>): string | undefined {
  const l = s.last;
  if (!l) return undefined;
  const who = players[l.by];
  const opp = players[otherSide(l.by)];
  if (l.kind === 'draw') return `${who.emoji} ${who.name} hat eine Karte gezogen`;
  if (l.kind === 'pass') return `${who.emoji} ${who.name} behält die Karte`;
  const c = l.card!;
  let t = `${who.emoji} ${who.name} legt ${unoName(c)}`;
  if (c.c === 'w') t += ` → ${UNO_COLOR_NAME[s.color]}`;
  if (l.penalty) t += ` – ${opp.name} zieht ${l.penalty}`;
  else if (c.v === 'S' || c.v === 'R') t += ` – ${opp.name} setzt aus`;
  return t;
}

export function Uno(props: GameProps) {
  const { p1, p2 } = props;
  const g = useTurnGame(unoDef, props);
  const s = g.s;
  const players = { p1, p2 };
  const me = g.view;
  const opp = otherSide(me);
  const hand = s.hands[me];
  const top = unoTop(s);
  const mine = g.myTurn && s.turn === me && !g.curtain;
  const [wild, setWild] = useState<number | null>(null);
  const [uno, setUno] = useState<string | null>(null);

  useOnChange(s.pile.length, () => {
    sfx.flip();
    buzz(10);
  });
  useOnChange(s.hands.p1.length + s.hands.p2.length, (a, b) => b > a && sfx.tap());
  useOnChange(`${s.hands.p1.length}-${s.hands.p2.length}`, () => {
    const who = (['p1', 'p2'] as const).find((side) => s.hands[side].length === 1 && s.last?.by === side && s.last.kind === 'play');
    if (!who) return;
    setUno(`${players[who].name}: UNO! 🔔`);
    [0, 120].forEach((d, k) => window.setTimeout(() => tone(660 + k * 220, 120, 'square', 0.05), d));
    window.setTimeout(() => setUno(null), 1600);
  });

  const play = (card: UnoCard) => {
    if (!mine || !unoPlayable(s, card)) return;
    if (card.c === 'w') setWild(card.id);
    else g.act({ t: 'play', id: card.id });
  };
  const pickColor = (color: UnoColor) => {
    if (wild !== null) g.act({ t: 'play', id: wild, color });
    setWild(null);
  };

  // Karten nach Farbe und Wert sortiert – findet man schneller.
  const order = (c: UnoCard) => UNO_COLORS.indexOf(c.c as UnoColor) * 20 + (c.c === 'w' ? 100 : 0) + '0123456789SRDWF'.indexOf(c.v);
  const sorted = hand.slice().sort((a, b) => order(a) - order(b));
  const note = lastText(s, players);

  let hint: string;
  if (s.winner) hint = `${players[s.winner].emoji} ${players[s.winner].name} hat keine Karten mehr! 🎉`;
  else if (g.thinking) hint = '🤖 KI überlegt …';
  else if (g.waiting) hint = `${players[s.turn].emoji} ${players[s.turn].name} ist dran …`;
  else if (s.drawn !== null) hint = 'Gezogene Karte legen – oder behalten.';
  else if (hand.some((c) => unoPlayable(s, c))) hint = 'Leg eine passende Karte.';
  else hint = 'Nichts passt – zieh eine Karte vom Stapel.';

  return (
    <div className="g-col uno">
      <TurnBar p1={p1} p2={p2} turn={g.turn} done={!!s.winner} />
      <div className="uno-opp">
        <span className="uno-opp-name">
          {players[opp].emoji} {players[opp].name}: {s.hands[opp].length} {s.hands[opp].length === 1 ? 'Karte' : 'Karten'}
        </span>
        <div className="uno-backs">
          {s.hands[opp].slice(0, 14).map((c) => (
            <span key={c.id} className="uno-back" />
          ))}
        </div>
      </div>

      <div className="uno-table">
        <button className={cls('uno-deck', mine && s.drawn === null && 'ready')} onClick={() => mine && g.act({ t: 'draw' })} disabled={!mine || s.drawn !== null} aria-label="Karte ziehen">
          <span className="uno-back big" />
          <small>{s.draw.length}</small>
        </button>
        <div className={cls('uno-pile', `ring-${s.color}`)}>
          <UnoCardView key={top.id} card={top} />
          <span className="uno-color" title="Aktuelle Farbe">
            {UNO_COLOR_NAME[s.color]}
          </span>
        </div>
      </div>
      {note && <p className="uno-note">{note}</p>}
      {uno && <div className="uno-flash">{uno}</div>}

      <div className="uno-hand" style={{ '--n': sorted.length } as CSSProperties}>
        {sorted.map((c) => {
          const ok = mine && unoPlayable(s, c);
          return <UnoCardView key={c.id} card={c} playable={ok} dim={mine && !ok} onClick={ok ? () => play(c) : undefined} />;
        })}
      </div>
      {mine && s.drawn !== null && (
        <button className="btn soft small" onClick={() => g.act({ t: 'pass' })}>
          Behalten &amp; weiter
        </button>
      )}
      <GameHint>{hint}</GameHint>

      {wild !== null && (
        <div className="uno-wild">
          <p>Welche Farbe wünschst du dir?</p>
          <div className="uno-wild-grid">
            {UNO_COLORS.map((c) => (
              <button key={c} className={cls('uno-wild-btn', `uc-${c}`)} onClick={() => pickColor(c)}>
                {UNO_COLOR_NAME[c]}
              </button>
            ))}
          </div>
          <button className="btn ghost small" onClick={() => setWild(null)}>
            Abbrechen
          </button>
        </div>
      )}
      {g.curtain && <Curtain player={players[g.curtain]} note={note} onReveal={g.reveal} />}
    </div>
  );
}
