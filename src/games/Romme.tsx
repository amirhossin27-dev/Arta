import { useState, type CSSProperties } from 'react';
import { cls } from '../lib/hooks';
import { buzz, sfx } from './engine';
import { otherSide } from './logic';
import { Curtain, GameHint, TurnBar, useOnChange } from './parts';
import {
  analyzeMeld,
  cardLabel,
  discardError,
  FIRST_MELD,
  freshValue,
  isJoker,
  layoffError,
  meldError,
  penalty,
  rankLabel,
  rommeDef,
  rommeTop,
  SUIT_SYMBOL,
  SUITS,
  type RCard,
  type RommeState,
  type Suit,
} from './romme';
import { useTurnGame } from './turn';
import type { GameProps, Player } from './types';

export function RCardView({ card, rank, selected, onClick, small }: { card: RCard; rank?: number; selected?: boolean; onClick?: () => void; small?: boolean }) {
  const joker = isJoker(card);
  const red = card.s === 'H' || card.s === 'D';
  return (
    <button
      className={cls('r-card', red && 'red', joker && 'joker', selected && 'selected', small && 'small')}
      onClick={onClick}
      disabled={!onClick}
      aria-label={cardLabel(card)}
      aria-pressed={selected}
    >
      {joker ? (
        <>
          <span className="rc-rank">🃏</span>
          {rank ? <span className="rc-suit rc-as">{rankLabel(rank)}</span> : <span className="rc-suit">Joker</span>}
        </>
      ) : (
        <>
          <span className="rc-rank">{rankLabel(card.r)}</span>
          <span className="rc-suit">{SUIT_SYMBOL[card.s as Suit]}</span>
        </>
      )}
    </button>
  );
}

function lastText(s: RommeState, players: Record<'p1' | 'p2', Player>): string | undefined {
  const l = s.last;
  if (!l) return undefined;
  const who = players[l.by];
  if (l.kind === 'stock') return `${who.emoji} ${who.name} hat vom Stapel gezogen`;
  if (l.kind === 'pile') return `${who.emoji} ${who.name} hat ${cardLabel(l.card!)} von der Ablage genommen`;
  return `${who.emoji} ${who.name} hat ${cardLabel(l.card!)} abgeworfen`;
}

export function Romme(props: GameProps) {
  const { p1, p2 } = props;
  const g = useTurnGame(rommeDef, props);
  const s = g.s;
  const players = { p1, p2 };
  const me = g.view;
  const opp = otherSide(me);
  const hand = s.hands[me];
  const mine = g.myTurn && s.turn === me && !g.curtain;
  const [sel, setSel] = useState<number[]>([]);
  const [byRank, setByRank] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const top = rommeTop(s);

  useOnChange(s.pile.length, () => sfx.flip());
  useOnChange(s.melds, () => {
    sfx.match();
    buzz(20);
  });
  useOnChange(s.turn, () => {
    setSel([]);
    setMsg(null);
  });

  const toggle = (id: number) => {
    setMsg(null);
    setSel((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };
  const run = (err: string | null, action: Parameters<typeof g.act>[0]) => {
    if (err) {
      setMsg(err);
      buzz(40);
      return;
    }
    if (g.act(action)) {
      setSel([]);
      setMsg(null);
    }
  };

  const suitOrder = (c: RCard) => (isJoker(c) ? 9 : SUITS.indexOf(c.s as Suit));
  const sorted = hand.slice().sort((a, b) => (byRank ? (a.r || 99) - (b.r || 99) || suitOrder(a) - suitOrder(b) : suitOrder(a) - suitOrder(b) || a.r - b.r));
  const preview = sel.length >= 3 ? analyzeMeld(sel.map((id) => hand.find((c) => c.id === id)!).filter(Boolean)) : null;
  const changed = s.phase === 'play' && !!s.undo && s.undo.hand.length !== hand.length;
  const note = lastText(s, players);

  let hint: string;
  if (s.winner === 'draw') hint = 'Der Stapel ist leer – unentschieden!';
  else if (s.winner) hint = `${players[s.winner].emoji} ${players[s.winner].name} ist alle Karten los! ${players[otherSide(s.winner)].name} hat ${penalty(s.hands[otherSide(s.winner)])} Strafpunkte auf der Hand.`;
  else if (g.thinking) hint = '🤖 KI überlegt …';
  else if (g.waiting) hint = `${players[s.turn].emoji} ${players[s.turn].name} ist dran …`;
  else if (s.phase === 'draw') hint = 'Zieh eine Karte vom Stapel oder nimm die oberste der Ablage.';
  else if (sel.length === 0) hint = 'Karten antippen zum Auslegen/Anlegen – zum Schluss eine abwerfen.';
  else if (sel.length === 1) hint = 'Abwerfen – oder auf eine Auslage tippen zum Anlegen.';
  else hint = preview ? `${preview.kind === 'set' ? 'Satz' : 'Reihe'} mit ${preview.value} Punkten – auslegen?` : 'Tippe auf eine Auslage zum Anlegen.';

  return (
    <div className="g-col romme">
      <TurnBar p1={p1} p2={p2} turn={g.turn} done={!!s.winner} />
      <div className="romme-opp">
        <span>
          {players[opp].emoji} {players[opp].name}: {s.hands[opp].length} Karten {s.out[opp] ? '· ✓ ausgelegt' : ''}
        </span>
        {!s.out[me] && (
          <span className={cls('romme-first', freshValue(s) >= FIRST_MELD && 'ok')}>
            Erstauslage {freshValue(s)}/{FIRST_MELD}
          </span>
        )}
      </div>

      <div className="romme-melds">
        {!s.melds.length && <p className="romme-empty">Noch nichts ausgelegt. Sätze: 3–4 gleiche Werte · Reihen: 3+ in einer Farbe.</p>}
        {s.melds.map((m) => {
          const info = analyzeMeld(m.cards);
          return (
            <button
              key={m.id}
              className={cls('romme-meld', s.fresh.includes(m.id) && 'fresh', mine && sel.length > 0 && s.phase === 'play' && 'target')}
              style={{ '--pc': players[m.by].color } as CSSProperties}
              onClick={() => mine && sel.length && s.phase === 'play' && run(layoffError(s, me, sel, m.id), { t: 'layoff', ids: sel, meld: m.id })}
              disabled={!mine || !sel.length || s.phase !== 'play'}
            >
              {m.cards.map((c, k) => (
                <RCardView key={c.id} card={c} rank={info?.ranks[k]} small />
              ))}
            </button>
          );
        })}
      </div>

      <div className="romme-table">
        <button className={cls('romme-stock', mine && s.phase === 'draw' && 'ready')} onClick={() => g.act({ t: 'draw', from: 'stock' })} disabled={!mine || s.phase !== 'draw'}>
          <span className="r-back" />
          <small>Stapel · {s.stock.length}</small>
        </button>
        <button className={cls('romme-pile', mine && s.phase === 'draw' && !!top && 'ready')} onClick={() => g.act({ t: 'draw', from: 'pile' })} disabled={!mine || s.phase !== 'draw' || !top}>
          {top ? <RCardView card={top} /> : <span className="r-slot" />}
          <small>Ablage</small>
        </button>
        <div className="romme-actions">
          <button className="btn primary small" disabled={!mine || s.phase !== 'play' || sel.length < 3} onClick={() => run(meldError(s, me, sel), { t: 'meld', ids: sel })}>
            Auslegen
          </button>
          <button className="btn soft small" disabled={!mine || s.phase !== 'play' || sel.length !== 1} onClick={() => run(discardError(s, me, sel[0]), { t: 'discard', id: sel[0] })}>
            Abwerfen
          </button>
          {changed && (
            <button className="btn ghost small" onClick={() => run(null, { t: 'undo' })}>
              ↩︎ Zurück
            </button>
          )}
        </div>
      </div>
      {note && <p className="uno-note">{note}</p>}
      {msg && <p className="romme-msg">{msg}</p>}

      <div className="romme-hand-head">
        <span>Deine Hand · {hand.length}</span>
        <button className="chip small" onClick={() => setByRank(!byRank)}>
          Sortieren: {byRank ? 'Wert' : 'Farbe'}
        </button>
      </div>
      <div className="romme-hand">
        {sorted.map((c) => (
          <RCardView key={c.id} card={c} selected={sel.includes(c.id)} onClick={mine ? () => toggle(c.id) : undefined} />
        ))}
      </div>
      <GameHint>{hint}</GameHint>
      {g.curtain && <Curtain player={players[g.curtain]} note={note} onReveal={g.reveal} />}
    </div>
  );
}
