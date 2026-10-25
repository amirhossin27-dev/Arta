import { useMemo, useState } from 'react';
import { cls } from '../lib/hooks';
import { capturedPieces, chessDef, colorOfSide, inCheck, legalMoves, pieceColor, sideOfColor, type ChessState, type Color, type Promo } from './chess';
import { buzz, sfx, tone } from './engine';
import { otherSide, type Side } from './logic';
import { GameHint, TurnBar, turnHint, useOnChange } from './parts';
import { useTurnGame } from './turn';
import type { GameProps, Player } from './types';

// Gefüllte Schachfiguren für beide Farben (Farbe kommt aus dem CSS). Das angehängte \uFE0E verhindert Emoji-Bauern auf dem iPhone.
const GLYPH: Record<string, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
export const glyph = (pc: string) => `${GLYPH[pc.toLowerCase()]}\uFE0E`;

const END_TEXT: Record<NonNullable<ChessState['result']>['reason'], string> = {
  matt: 'Schachmatt!',
  patt: 'Patt – unentschieden.',
  remis50: '50 Züge ohne Schlagen – unentschieden.',
  wiederholung: 'Dreimal dieselbe Stellung – unentschieden.',
  material: 'Zu wenig Material zum Mattsetzen – unentschieden.',
  aufgabe: 'aufgegeben.',
};

const COLOR_NAME: Record<Color, string> = { w: 'Weiß', b: 'Schwarz' };

function Captured({ pieces }: { pieces: string[] }) {
  return (
    <span className="chess-captured">
      {pieces.map((p, i) => (
        <span key={i} className={cls('chess-mini', pieceColor(p))}>
          {glyph(p)}
        </span>
      ))}
    </span>
  );
}

export function Chess(props: GameProps) {
  const { p1, p2 } = props;
  const g = useTurnGame(chessDef, props);
  const s = g.s;
  const players: Record<Side, Player> = { p1, p2 };
  const me = g.view;
  const myColor = colorOfSide(s, me);
  const flip = myColor === 'b';
  const [sel, setSel] = useState<number | null>(null);
  const [promo, setPromo] = useState<{ from: number; to: number } | null>(null);
  const [resign, setResign] = useState(false);
  const moves = useMemo(() => (g.myTurn ? legalMoves(s) : []), [s, g.myTurn]);
  const targets = sel === null ? [] : moves.filter((m) => m.from === sel);
  const check = !s.result && inCheck(s.board, s.turn) ? s.board.indexOf(s.turn === 'w' ? 'K' : 'k') : -1;
  const lost = capturedPieces(s.board);
  const toMove = sideOfColor(s, s.turn);

  useOnChange(s.moves, () => {
    const capture = s.last && /x/.test(s.last.san);
    if (s.last?.san.endsWith('+') || s.last?.san.endsWith('#')) {
      tone(880, 90, 'square', 0.05, 660);
      buzz([30, 40, 30]);
    } else if (capture) {
      sfx.brick();
      buzz(20);
    } else sfx.tap();
    setSel(null);
  });

  const tap = (i: number) => {
    if (!g.myTurn) return;
    if (sel !== null && targets.some((m) => m.to === i)) {
      if (targets.some((m) => m.to === i && m.promo)) setPromo({ from: sel, to: i });
      else g.act({ t: 'move', from: sel, to: i });
      setSel(null);
      return;
    }
    if (pieceColor(s.board[i]) === s.turn && moves.some((m) => m.from === i)) {
      setSel(i === sel ? null : i);
      sfx.flip();
    } else setSel(null);
  };

  const order = Array.from({ length: 64 }, (_, k) => (flip ? 63 - k : k));
  const opp = otherSide(me);

  let hint: string;
  if (s.result) {
    const r = s.result;
    if (r.winner === 'draw') hint = END_TEXT[r.reason];
    else if (r.reason === 'aufgabe') hint = `${players[otherSide(r.winner)].name} hat aufgegeben – ${players[r.winner].name} gewinnt.`;
    else hint = `${END_TEXT.matt} ${players[r.winner].emoji} ${players[r.winner].name} gewinnt.`;
  } else {
    const who = players[toMove];
    const mine = `${check >= 0 ? 'Schach! ' : ''}${who.emoji} ${who.name} (${COLOR_NAME[s.turn]}) ist dran`;
    hint = turnHint(g, players, g.turn, mine, `${check >= 0 ? 'Schach! ' : ''}${who.emoji} ${who.name} überlegt …`);
  }
  const lastText = s.last ? `${players[sideOfColor(s, s.turn === 'w' ? 'b' : 'w')].emoji} ${s.last.san}` : null;

  return (
    <div className="g-col chess">
      <TurnBar p1={p1} p2={p2} turn={g.turn} done={!!s.result} />
      <div className="chess-side">
        <span>
          {players[opp].emoji} {COLOR_NAME[colorOfSide(s, opp)]}
        </span>
        <Captured pieces={lost[myColor]} />
      </div>
      <div className={cls('chess-board', flip && 'flip')}>
        {order.map((i) => {
          const pc = s.board[i];
          const dark = ((i >> 3) + (i & 7)) % 2 === 1;
          const target = targets.find((m) => m.to === i);
          const r = i >> 3;
          const c = i & 7;
          // Schlagen (auch en passant) als Ring, normales Ziehen als Punkt
          const capture = !!target && (pc !== '.' || (s.board[target.from].toLowerCase() === 'p' && c !== (target.from & 7)));
          return (
            <button
              key={i}
              className={cls(
                'chess-sq',
                dark ? 'dark' : 'light',
                sel === i && 'sel',
                target && (capture ? 'hit' : 'dot'),
                s.last && (s.last.from === i || s.last.to === i) && 'last',
                check === i && 'check',
              )}
              onClick={() => tap(i)}
              aria-label={`Feld ${'abcdefgh'[c]}${8 - r}`}
            >
              {pc !== '.' && <span className={cls('chess-piece', pieceColor(pc))}>{glyph(pc)}</span>}
              {(flip ? r === 0 : r === 7) && <span className="chess-file">{'abcdefgh'[c]}</span>}
              {(flip ? c === 7 : c === 0) && <span className="chess-rank">{8 - r}</span>}
            </button>
          );
        })}
      </div>
      <div className="chess-side">
        <span>
          {players[me].emoji} {COLOR_NAME[myColor]}
        </span>
        <Captured pieces={lost[myColor === 'w' ? 'b' : 'w']} />
      </div>
      <GameHint>
        {hint}
        {lastText && !s.result && <span className="chess-last"> · zuletzt {lastText}</span>}
      </GameHint>
      {!s.result && g.myTurn && (
        <button className="btn ghost small" onClick={() => setResign(true)}>
          🏳️ Aufgeben
        </button>
      )}

      {promo && (
        <div className="uno-wild">
          <p>Worin soll sich der Bauer verwandeln?</p>
          <div className="chess-promo">
            {(['q', 'r', 'b', 'n'] as Promo[]).map((p) => (
              <button
                key={p}
                className="chess-promo-btn"
                onClick={() => {
                  g.act({ t: 'move', from: promo.from, to: promo.to, promo: p });
                  setPromo(null);
                }}
              >
                <span className={cls('chess-piece', s.turn)}>{glyph(p)}</span>
                <small>{{ q: 'Dame', r: 'Turm', b: 'Läufer', n: 'Springer' }[p]}</small>
              </button>
            ))}
          </div>
          <button className="btn ghost small" onClick={() => setPromo(null)}>
            Abbrechen
          </button>
        </div>
      )}
      {resign && (
        <div className="uno-wild">
          <p>Wirklich aufgeben? {players[opp].name} gewinnt dann diese Runde.</p>
          <div className="btn-row">
            <button
              className="btn primary"
              onClick={() => {
                g.act({ t: 'resign' });
                setResign(false);
              }}
            >
              Ja, aufgeben
            </button>
            <button className="btn soft" onClick={() => setResign(false)}>
              Weiterspielen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
