import { useState } from 'react';
import { cls } from '../lib/hooks';
import { buzz, sfx } from './engine';
import { Face } from './Face';
import { candidates, FACES, guessWhoDef, QUESTION_BY_ID, QUESTIONS, split, type GuessWhoState } from './guesswho';
import { otherSide } from './logic';
import { Curtain, GameHint, TurnBar, useOnChange } from './parts';
import { useTurnGame } from './turn';
import type { GameProps, Player } from './types';

function askedText(s: GuessWhoState, players: Record<'p1' | 'p2', Player>, k: number): string | undefined {
  const l = s.asked[s.asked.length - 1 - k];
  if (!l) return undefined;
  const q = QUESTION_BY_ID[l.q];
  return `${players[l.by].emoji} ${players[l.by].name}: „${q.text}“ – ${l.yes ? 'Ja ✓' : 'Nein ✗'}`;
}

export function GuessWho(props: GameProps) {
  const { p1, p2 } = props;
  const g = useTurnGame(guessWhoDef, props);
  const s = g.s;
  const players = { p1, p2 };
  const me = g.view;
  const opp = otherSide(me);
  const mine = g.myTurn && s.turn === me && !g.curtain;
  const [guessing, setGuessing] = useState(false);
  const [confirm, setConfirm] = useState<number | null>(null);
  const left = candidates(s, me);
  const theirsLeft = candidates(s, opp).length;
  const secret = FACES[s.secret[me]];

  useOnChange(s.asked.length, () => {
    sfx.flip();
    buzz(15);
  });

  const ask = (q: string) => {
    setGuessing(false);
    g.act({ t: 'ask', q });
  };
  const guess = (face: number) => {
    setConfirm(null);
    setGuessing(false);
    g.act({ t: 'guess', face });
  };

  const note = askedText(s, players, 0);
  const before = askedText(s, players, 1);
  let hint: string;
  if (s.guess) {
    const who = players[s.guess.by];
    const face = FACES[s.guess.face];
    hint = s.guess.right ? `${who.emoji} ${who.name} hat ${face.name} erraten! 🎉` : `${who.emoji} ${who.name} tippte auf ${face.name} – falsch! Gesucht war ${FACES[s.secret[otherSide(s.guess.by)]].name}.`;
  } else if (g.thinking) hint = '🤖 KI überlegt …';
  else if (g.waiting) hint = `${players[s.turn].emoji} ${players[s.turn].name} ist dran …`;
  else if (guessing) hint = 'Tippe auf die Person, die du für die richtige hältst.';
  else hint = left.length === 1 ? `Nur noch ${FACES[left[0]].name} übrig – tippe auf „Raten“!` : 'Stell eine Frage – oder rate, wenn du dir sicher bist.';

  return (
    <div className="g-col gw">
      <TurnBar p1={p1} p2={p2} turn={g.turn} done={!!s.winner} />
      <div className="gw-head">
        <div className="gw-secret">
          <span className="gw-face mini">
            <Face f={secret} />
          </span>
          <span>
            <small>Deine geheime Person</small>
            <b>{secret.name}</b>
          </span>
        </div>
        <div className="gw-count">
          <b>{left.length}</b>
          <small>übrig bei dir</small>
          <span className="muted">
            {players[opp].emoji} {theirsLeft}
          </span>
        </div>
      </div>

      <div className={cls('gw-board', guessing && 'guessing')}>
        {FACES.map((f, i) => {
          const down = s.down[me].includes(i);
          const reveal = s.winner && (i === s.secret[opp] || i === s.guess?.face);
          return (
            <button
              key={f.name}
              className={cls('gw-tile', down && 'down', reveal && i === s.secret[opp] && 'answer', reveal && i === s.guess?.face && !s.guess?.right && 'wrong')}
              disabled={!guessing || down}
              onClick={() => setConfirm(i)}
              aria-label={down ? `${f.name} (umgeklappt)` : f.name}
            >
              <span className="gw-face">
                <Face f={f} />
              </span>
              <span className="gw-name">{f.name}</span>
            </button>
          );
        })}
      </div>

      {note && (
        <div className="gw-log">
          <p>{note}</p>
          {before && <p className="muted">{before}</p>}
        </div>
      )}

      {mine && !s.winner && (
        <div className="gw-controls">
          <button className={cls('btn small', guessing ? 'primary' : 'soft')} onClick={() => setGuessing(!guessing)}>
            🎯 {guessing ? 'Doch nicht raten' : 'Raten'}
          </button>
          {!guessing && (
            <div className="gw-questions">
              {QUESTIONS.map((q) => {
                const asked = s.asked.some((x) => x.by === me && x.q === q.id);
                const sp = split(s, me, q);
                const useless = sp.yes === 0 || sp.no === 0;
                return (
                  <button key={q.id} className="gw-q" disabled={asked || useless} onClick={() => ask(q.id)} title={q.text}>
                    <span>{q.emoji}</span>
                    {q.short}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
      <GameHint>{hint}</GameHint>

      {confirm !== null && (
        <div className="uno-wild">
          <span className="gw-face big">
            <Face f={FACES[confirm]} />
          </span>
          <p>
            Ist es <b>{FACES[confirm].name}</b>? Wenn nicht, hast du verloren.
          </p>
          <div className="btn-row">
            <button className="btn primary" onClick={() => guess(confirm)}>
              Ja, {FACES[confirm].name}!
            </button>
            <button className="btn soft" onClick={() => setConfirm(null)}>
              Lieber nicht
            </button>
          </div>
        </div>
      )}
      {g.curtain && <Curtain player={players[g.curtain]} note={note} onReveal={g.reveal} />}
    </div>
  );
}
