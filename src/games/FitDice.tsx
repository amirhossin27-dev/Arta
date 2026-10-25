import { useEffect, useState, type CSSProperties } from 'react';
import { cls } from '../lib/hooks';
import { buzz, sfx, tone } from './engine';
import { FIT_EXERCISES, FIT_MAX, fitCurrent, fitDef, fitLabel } from './fitdice';
import { Die } from './Kniffel';
import { otherSide, type Side } from './logic';
import { GameHint, TurnBar, useOnChange } from './parts';
import { useTurnGame } from './turn';
import type { GameProps, Player } from './types';

/** Countdown für Halte-Übungen wie den Unterarmstütz */
function HoldTimer({ seconds }: { seconds: number }) {
  const [end, setEnd] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (end === null) return;
    const t = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(t);
  }, [end]);
  const left = end === null ? seconds : Math.max(0, Math.ceil((end - now) / 1000));
  useOnChange(left, (_, v) => {
    if (end === null) return;
    if (v === 0) {
      sfx.win();
      buzz([60, 60, 60]);
    } else if (v <= 3) tone(880, 70, 'square', 0.04);
  });
  return (
    <button className={cls('btn soft fit-timer', end !== null && 'running', left === 0 && 'over')} onClick={() => setEnd(Date.now() + seconds * 1000)} disabled={end !== null && left > 0}>
      {end === null ? `⏱ Timer starten (${seconds} s)` : left > 0 ? `⏱ noch ${left} s` : '⏱ Zeit um – stark! 💪'}
    </button>
  );
}

export function FitDice(props: GameProps) {
  const { p1, p2, mode, onEnd } = props;
  const solo = mode === 'solo';
  const g = useTurnGame(fitDef, props);
  const s = g.s;
  const players: Record<Side, Player> = { p1, p2 };
  const who = players[s.turn];
  const [rolling, setRolling] = useState(false);
  const ex = s.dice ? FIT_EXERCISES[s.dice.ex] : null;
  const amount = fitCurrent(s);
  const level = s.done[s.turn];

  useOnChange(s.dice ? `${s.dice.ex}-${s.dice.pips}` : null, (_, v) => {
    if (!v) return;
    setRolling(true);
    [0, 80, 160].forEach((d) => window.setTimeout(() => tone(300 + Math.random() * 300, 30, 'square', 0.03), d));
    buzz(15);
    window.setTimeout(() => setRolling(false), 420);
  });
  useOnChange(s.last, (_, l) => {
    if (!l) return;
    if (l.ok) {
      sfx.point();
      buzz(20);
    } else sfx.lose();
  });

  // Allein: Wer aufgibt, hat seinen Rekord
  useEffect(() => {
    if (!solo || !s.quit) return;
    const t = window.setTimeout(() => onEnd({ score: s.done.p1 }), 1200);
    return () => window.clearTimeout(t);
  }, [solo, s.quit]);

  const exDie = s.dice ? s.dice.ex : null;
  const quitter = s.quit ? players[s.quit] : null;

  let hint: string;
  if (quitter) hint = solo ? `Geschafft: ${s.done.p1} Runden! 💪` : `${quitter.emoji} ${quitter.name} macht schlapp – ${players[otherSide(s.quit!)].name} gewinnt! 🏆`;
  else if (!solo && s.done.p1 >= FIT_MAX && s.done.p2 >= FIT_MAX) hint = 'Ihr seid beide unschlagbar – unentschieden! 🤝';
  else if (g.thinking) hint = s.dice ? `🤖 KI macht ${fitLabel(s.dice.ex, amount)} …` : '🤖 KI würfelt …';
  else if (g.waiting) hint = s.dice ? `${who.emoji} ${who.name} macht ${fitLabel(s.dice.ex, amount)} – feuer ${who.name} an! 📣` : `${who.emoji} ${who.name} würfelt …`;
  else if (!s.dice) hint = solo ? `Runde ${s.done.p1 + 1} – würfle!` : `${who.emoji} ${who.name}, würfle!`;
  else hint = 'Los geht’s – und ehrlich bleiben 😉';

  return (
    <div className="g-col fit">
      {!solo && <TurnBar p1={p1} p2={p2} turn={g.turn} scores={s.done} done={!!s.quit} />}
      <div className="fit-level">
        <span>
          {solo ? `Runde ${s.done.p1 + (s.quit ? 0 : 1)}` : `Runde ${Math.min(level + 1, FIT_MAX)}/${FIT_MAX}`}
        </span>
        <span className="fit-bar">
          <span style={{ '--p': `${Math.min(level / FIT_MAX, 1) * 100}%` } as CSSProperties} />
        </span>
        <span>{level ? `+${level * 25} %` : 'Aufwärmen'}</span>
      </div>
      <div className="fit-dice">
        <div className={cls('fit-ex-die', rolling && 'rolling')}>{exDie !== null ? FIT_EXERCISES[exDie].emoji : '❔'}</div>
        <Die value={s.dice?.pips ?? 0} rolling={rolling} />
      </div>
      {ex && s.dice && (
        <div className="fit-card" style={{ '--pc': who.color } as CSSProperties}>
          <b className="fit-amount">{fitLabel(s.dice.ex, amount)}</b>
          <p className="muted">{ex.how}</p>
          {g.myTurn && ex.unit === 's' && <HoldTimer key={`${s.turn}-${s.done[s.turn]}`} seconds={amount} />}
        </div>
      )}
      {g.myTurn && !s.dice && (
        <button className="btn primary big block" onClick={() => g.act({ t: 'roll' })}>
          🎲 Würfeln
        </button>
      )}
      {g.myTurn && s.dice && (
        <div className="fit-actions">
          <button className="btn primary big block" onClick={() => g.act({ t: 'done' })}>
            ✅ Geschafft!
          </button>
          <button className="btn ghost block" onClick={() => g.act({ t: 'quit' })}>
            😮‍💨 Ich kann nicht mehr
          </button>
        </div>
      )}
      <GameHint>{hint}</GameHint>
      {s.last && !s.quit && (
        <p className="fit-log">
          {players[s.last.by].emoji} {players[s.last.by].name}: {fitLabel(s.last.ex, s.last.amount)} {s.last.ok ? '✓' : '✗'}
        </p>
      )}
      <div className="fit-faces">
        {FIT_EXERCISES.map((e, k) => (
          <span key={k} className={cls(exDie === k && 'on')}>
            {e.emoji} {e.name}
          </span>
        ))}
      </div>
    </div>
  );
}
