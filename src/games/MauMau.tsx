import { useState, type CSSProperties } from 'react';
import { cls } from '../lib/hooks';
import { buzz, sfx, tone } from './engine';
import { otherSide, type Side } from './logic';
import { mauDef, mauName, mauPlayable, mauSymbol, mauTop, SUIT_NAME, type MauState } from './maumau';
import { Curtain, GameHint, TurnBar, useOnChange } from './parts';
import { RCardView } from './Romme';
import { SUITS, type RCard, type Suit } from './romme';
import { useTurnGame } from './turn';
import type { GameProps, Player } from './types';

function lastText(s: MauState, players: Record<Side, Player>): string | undefined {
  const l = s.last;
  if (!l) return undefined;
  const who = players[l.by];
  const opp = players[otherSide(l.by)];
  if (l.kind === 'pass') return `${who.emoji} ${who.name} behält die Karte`;
  if (l.kind === 'draw') return `${who.emoji} ${who.name} zieht ${l.got === 1 ? 'eine Karte' : `${l.got} Karten`}`;
  const c = l.card!;
  let t = `${who.emoji} ${who.name} legt ${mauName(c)}`;
  if (c.r === 11) t += ` – wünscht sich ${SUIT_NAME[s.wish!]} ${mauSymbol(s.wish!)}`;
  else if (c.r === 7) t += ` – ${opp.name} muss ${s.penalty} ziehen`;
  else if (c.r === 8) t += ` – ${opp.name} setzt aus`;
  return t;
}

const ORDER = [7, 8, 9, 10, 11, 12, 13, 1];

export function MauMau(props: GameProps) {
  const { p1, p2 } = props;
  const g = useTurnGame(mauDef, props);
  const s = g.s;
  const players: Record<Side, Player> = { p1, p2 };
  const me = g.view;
  const opp = otherSide(me);
  const hand = s.hands[me];
  const top = mauTop(s);
  const mine = g.myTurn && s.turn === me && !g.curtain;
  const [jack, setJack] = useState<number | null>(null);
  const [mau, setMau] = useState<string | null>(null);

  useOnChange(s.pile.length, () => {
    sfx.flip();
    buzz(10);
  });
  useOnChange(s.hands.p1.length + s.hands.p2.length, (a, b) => b > a && sfx.tap());
  useOnChange(`${s.hands.p1.length}-${s.hands.p2.length}`, () => {
    const who = (['p1', 'p2'] as const).find((side) => s.hands[side].length === 1 && s.last?.by === side && s.last.kind === 'play');
    if (!who) return;
    setMau(`${players[who].name}: Mau! 🔔`);
    tone(740, 140, 'square', 0.05);
    window.setTimeout(() => setMau(null), 1500);
  });
  useOnChange(s.winner, (_, w) => {
    if (!w) return;
    setMau(`${players[w].name}: Mau-Mau! 🎉`);
    [0, 140].forEach((d, k) => window.setTimeout(() => tone(660 + k * 220, 140, 'square', 0.05), d));
  });

  const play = (card: RCard) => {
    if (!mine || !mauPlayable(s, card)) return;
    if (card.r === 11) setJack(card.id);
    else g.act({ t: 'play', id: card.id });
  };
  const wish = (suit: Suit) => {
    if (jack !== null) g.act({ t: 'play', id: jack, wish: suit });
    setJack(null);
  };

  const sorted = hand.slice().sort((a, b) => SUITS.indexOf(a.s as Suit) * 10 + ORDER.indexOf(a.r) - (SUITS.indexOf(b.s as Suit) * 10 + ORDER.indexOf(b.r)));
  const note = lastText(s, players);

  let hint: string;
  if (s.winner) hint = `${players[s.winner].emoji} ${players[s.winner].name} hat keine Karten mehr – Mau-Mau! 🎉`;
  else if (g.thinking) hint = '🤖 KI überlegt …';
  else if (g.waiting) hint = `${players[s.turn].emoji} ${players[s.turn].name} ist dran …`;
  else if (s.penalty > 0) hint = hand.some((c) => c.r === 7) ? `Leg eine 7 drauf – oder zieh ${s.penalty} Karten.` : `Keine 7 – zieh ${s.penalty} Karten.`;
  else if (s.drawn !== null) hint = 'Gezogene Karte legen – oder behalten.';
  else if (hand.some((c) => mauPlayable(s, c))) hint = s.wish ? `Gewünscht ist ${SUIT_NAME[s.wish]} ${mauSymbol(s.wish)} – oder ein Bube.` : 'Leg eine passende Karte.';
  else hint = 'Nichts passt – zieh eine Karte.';

  return (
    <div className="g-col uno mau">
      <TurnBar p1={p1} p2={p2} turn={g.turn} done={!!s.winner} />
      <div className="uno-opp">
        <span className="uno-opp-name">
          {players[opp].emoji} {players[opp].name}: {s.hands[opp].length} {s.hands[opp].length === 1 ? 'Karte' : 'Karten'}
        </span>
        <div className="uno-backs">
          {s.hands[opp].slice(0, 14).map((c) => (
            <span key={c.id} className="uno-back mau-back" />
          ))}
        </div>
      </div>

      <div className="uno-table">
        <button className={cls('uno-deck', mine && s.drawn === null && 'ready')} onClick={() => mine && g.act({ t: 'draw' })} disabled={!mine || s.drawn !== null} aria-label={s.penalty ? `${s.penalty} Karten ziehen` : 'Karte ziehen'}>
          <span className="uno-back big mau-back" />
          <small>{s.penalty ? `+${s.penalty} ziehen` : s.draw.length}</small>
        </button>
        <div className="mau-pile">
          <RCardView key={top.id} card={top} />
          {s.wish && (
            <span className={cls('mau-wish', (s.wish === 'H' || s.wish === 'D') && 'red')} title="Gewünschte Farbe">
              {mauSymbol(s.wish)}
            </span>
          )}
        </div>
      </div>
      {note && <p className="uno-note">{note}</p>}
      {mau && <div className="uno-flash">{mau}</div>}

      <div className="mau-hand" style={{ '--n': sorted.length } as CSSProperties}>
        {sorted.map((c) => {
          const ok = mine && mauPlayable(s, c);
          return (
            <span key={c.id} className={cls('mau-slot', ok && 'playable', mine && !ok && 'dim')}>
              <RCardView card={c} onClick={ok ? () => play(c) : undefined} />
            </span>
          );
        })}
      </div>
      {mine && s.drawn !== null && (
        <button className="btn soft small" onClick={() => g.act({ t: 'pass' })}>
          Behalten &amp; weiter
        </button>
      )}
      <GameHint>{hint}</GameHint>

      {jack !== null && (
        <div className="uno-wild">
          <p>Welche Farbe wünschst du dir?</p>
          <div className="uno-wild-grid">
            {SUITS.map((x) => (
              <button key={x} className={cls('mau-suit-btn', (x === 'H' || x === 'D') && 'red')} onClick={() => wish(x)}>
                <span>{mauSymbol(x)}</span>
                {SUIT_NAME[x]}
              </button>
            ))}
          </div>
          <button className="btn ghost small" onClick={() => setJack(null)}>
            Abbrechen
          </button>
        </div>
      )}
      {g.curtain && <Curtain player={players[g.curtain]} note={note} onReveal={g.reveal} />}
    </div>
  );
}
