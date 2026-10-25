import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { cls } from '../lib/hooks';
import { buzz, sfx, tone } from './engine';
import { otherSide, type Side } from './logic';
import { Curtain, TurnBar, useOnChange } from './parts';
import { catPoints, counts, judge, roundPoints, SLF_CATS, SLF_ROUNDS, SLF_TIME, slfDef, slfTotals, slfWriter, type SlfAction, type SlfState } from './slf';
import { useTurnGame, type TurnGame } from './turn';
import type { GameProps, Player } from './types';

const VERDICT_ICON = { ok: '✓', unknown: '❓', wrong: '✗', empty: '–' };

function Writer({
  s,
  side,
  players,
  submitted,
  onSubmit,
}: {
  s: SlfState;
  side: Side;
  players: Record<Side, Player>;
  submitted: boolean;
  onSubmit: (answers: string[]) => void;
}) {
  const letter = s.letters[s.round];
  const [draft, setDraft] = useState<string[]>(() => SLF_CATS.map(() => ''));
  const [start] = useState(() => Date.now());
  const [now, setNow] = useState(Date.now());
  const sent = useRef(false);
  const deadline = Math.min(start + SLF_TIME, s.stopAt ?? Infinity);
  const left = Math.max(0, deadline - now);
  const stopped = s.stopAt !== null && s.stopBy !== side;

  const submit = () => {
    if (sent.current) return;
    sent.current = true;
    onSubmit(draft);
  };

  useEffect(() => {
    if (submitted) return;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [submitted]);

  useEffect(() => {
    if (!submitted && left <= 0) submit();
  }, [left, submitted]);

  const secs = Math.ceil(left / 1000);
  useOnChange(stopped && secs <= 5 ? secs : 0, (_, v) => v > 0 && tone(880, 80, 'square', 0.04));

  if (submitted || sent.current) {
    const other = otherSide(side);
    return (
      <div className="slf-waiting">
        <span className="slf-letter small">{letter}</span>
        <p>
          <b>Abgegeben ✓</b>
        </p>
        <p className="muted">
          {s.sequential ? 'Gleich ist der andere dran …' : `Warte auf ${players[other].emoji} ${players[other].name} …`}
        </p>
      </div>
    );
  }

  return (
    <div className="slf-write">
      <div className="slf-top">
        <span className="slf-letter">{letter}</span>
        <div className="slf-timer">
          <span>
            Runde {s.round + 1}/{SLF_ROUNDS} · {players[side].emoji} {players[side].name}
          </span>
          <span className={cls('slf-bar', stopped && 'stop')}>
            <span style={{ '--p': `${(left / SLF_TIME) * 100}%` } as CSSProperties} />
          </span>
          <b className={cls(secs <= 10 && 'warn')}>
            {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}
          </b>
        </div>
      </div>
      {stopped && (
        <p className="slf-stop">
          ⏰ {players[otherSide(side)].name} ist fertig – noch {secs} Sekunden!
        </p>
      )}
      <div className="slf-fields">
        {SLF_CATS.map((c, k) => (
          <label key={c.id} className="slf-field">
            <span>
              {c.emoji} {c.label}
            </span>
            <input
              value={draft[k]}
              onChange={(e) => setDraft(draft.map((d, j) => (j === k ? e.target.value : d)))}
              placeholder={`${letter} …`}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint={k === SLF_CATS.length - 1 ? 'done' : 'next'}
              maxLength={40}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                const next = (e.currentTarget.closest('.slf-fields')?.querySelectorAll('input')[k + 1] as HTMLInputElement | undefined) ?? null;
                if (next) next.focus();
                else e.currentTarget.blur();
              }}
            />
          </label>
        ))}
      </div>
      <button className="btn primary big block" onClick={submit}>
        {s.sequential ? '✋ Fertig' : '✋ Stopp – fertig!'}
      </button>
    </div>
  );
}

function Review({ g, players, mySide }: { g: TurnGame<SlfState, SlfAction>; players: Record<Side, Player>; mySide: Side }) {
  const s = g.s;
  const r = s.rounds[s.rounds.length - 1];
  const [pressed, setPressed] = useState(false);
  if (!r) return null;
  const order: Side[] = [mySide, otherSide(mySide)];
  const pts = roundPoints(r);
  const totals = slfTotals(s);
  const last = s.round + 1 >= SLF_ROUNDS;
  const waiting = !s.sequential && (s.next[mySide] || pressed) && !s.next[otherSide(mySide)];
  const done = s.phase === 'done';

  return (
    <div className="slf-review">
      <div className="slf-review-head">
        <span className="slf-letter small">{r.letter}</span>
        <span>
          Runde {Math.min(s.round + 1, SLF_ROUNDS)}/{SLF_ROUNDS} – tippe auf eine Antwort, die nicht gilt.
        </span>
      </div>
      <div className="slf-table">
        <div className="slf-row head">
          <span />
          {order.map((side) => (
            <span key={side} style={{ '--pc': players[side].color } as CSSProperties}>
              {players[side].emoji} {players[side].name}
            </span>
          ))}
        </div>
        {SLF_CATS.map((c, k) => {
          const p = catPoints(r, k);
          return (
            <div key={c.id} className="slf-row">
              <span className="slf-cat">{c.emoji}</span>
              {order.map((side) => {
                const word = r.answers[side][k];
                const v = judge(c.id, r.letter, word);
                const ok = counts(r, side, k);
                return (
                  <button
                    key={side}
                    className={cls('slf-ans', `v-${v}`, r.veto[side][k] && 'vetoed', !ok && 'nope')}
                    disabled={done || v === 'empty' || v === 'wrong'}
                    onClick={() => g.act({ t: 'veto', who: side, cat: k })}
                  >
                    <span className="slf-word">{word || '—'}</span>
                    <span className="slf-v">{r.veto[side][k] ? '✗' : VERDICT_ICON[v]}</span>
                    <b className="slf-pts">{p[side]}</b>
                  </button>
                );
              })}
            </div>
          );
        })}
        <div className="slf-row total">
          <span>Σ</span>
          {order.map((side) => (
            <span key={side}>
              +{pts[side]} <small>(gesamt {totals[side]})</small>
            </span>
          ))}
        </div>
      </div>
      <p className="slf-legend">✓ kennt Arta · ❓ unbekannt, zählt trotzdem · ✗ gilt nicht · 20 allein, 10 verschieden, 5 gleich</p>
      {!done && (
        <button
          className="btn primary big block"
          disabled={waiting}
          onClick={() => {
            setPressed(true);
            g.act({ t: 'next' }, s.sequential ? undefined : mySide);
          }}
        >
          {waiting ? `⏳ Warte auf ${players[otherSide(mySide)].name}` : last ? '🏁 Zum Ergebnis' : '➜ Nächster Buchstabe'}
        </button>
      )}
    </div>
  );
}

export function Slf(props: GameProps) {
  const { p1, p2, mode } = props;
  const g = useTurnGame(slfDef, props);
  const s = g.s;
  const players = { p1, p2 };
  const writer: Side = s.sequential ? (slfWriter(s) ?? g.view) : g.view;
  const [sentRound, setSentRound] = useState<string | null>(null);
  const key = `${s.round}-${writer}`;

  useOnChange(s.phase, (_, p) => {
    if (p === 'review') {
      sfx.point();
      buzz(30);
    }
  });
  useOnChange(s.stopAt, (_, v) => v !== null && sfx.tap());

  const submitted = !!s.answers[writer] || (mode === 'online' && sentRound === key);

  return (
    <div className="g-col slf">
      <TurnBar p1={p1} p2={p2} turn={g.turn} scores={slfTotals(s)} done={s.phase === 'done'} />
      {s.phase === 'write' && !g.curtain && s.sequential && !g.myTurn && (
        <div className="slf-waiting">
          <p>
            <b>Abgegeben ✓</b>
          </p>
          <p className="muted">Gleich ist der andere dran …</p>
        </div>
      )}
      {s.phase === 'write' && !g.curtain && (!s.sequential || g.myTurn) && (
        <Writer
          key={key}
          s={s}
          side={writer}
          players={players}
          submitted={submitted}
          onSubmit={(answers) => {
            setSentRound(key);
            g.act({ t: 'submit', answers }, writer);
          }}
        />
      )}
      {s.phase !== 'write' && <Review key={s.round} g={g} players={players} mySide={g.view} />}
      {g.curtain && <Curtain player={players[g.curtain]} note={s.sequential && s.answers[otherSide(g.curtain)] ? `Gleicher Buchstabe – ${players[g.curtain].name} sieht die Antworten erst danach.` : undefined} onReveal={g.reveal} />}
    </div>
  );
}
