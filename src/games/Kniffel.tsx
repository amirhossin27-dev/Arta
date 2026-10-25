import { useEffect, useState, type CSSProperties } from 'react';
import { cls } from '../lib/hooks';
import { buzz, sfx, tone } from './engine';
import { BONUS, BONUS_AT, bonusOf, catScore, KCAT_HINT, KCAT_LABEL, kniffelDef, LOWER, sheetFull, total, UPPER, upperSum, type KCat } from './kniffel';
import { otherSide, type Side } from './logic';
import { GameHint, TurnBar, turnHint, useOnChange } from './parts';
import { useTurnGame } from './turn';
import type { GameProps, Player } from './types';

const PIPS: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

export function Die({ value, held, rolling, onClick, small }: { value: number; held?: boolean; rolling?: boolean; onClick?: () => void; small?: boolean }) {
  return (
    <button className={cls('k-die', held && 'held', rolling && 'rolling', small && 'small')} onClick={onClick} disabled={!onClick} aria-label={`Würfel ${value}${held ? ', gehalten' : ''}`} aria-pressed={held}>
      {Array.from({ length: 9 }, (_, k) => (
        <i key={k} className={cls(PIPS[value]?.includes(k) && 'on')} />
      ))}
    </button>
  );
}

export function Kniffel(props: GameProps) {
  const { p1, p2, mode, onEnd } = props;
  const solo = mode === 'solo';
  const g = useTurnGame(kniffelDef, props);
  const s = g.s;
  const players: Record<Side, Player> = { p1, p2 };
  const me = g.view;
  const sides: Side[] = solo ? ['p1'] : [me, otherSide(me)];
  // An einem Handy würfeln beide abwechselnd – „mein Zug“ heißt hier: dieses Handy ist dran.
  const mine = g.myTurn;
  const actor = s.turn;
  const [hold, setHold] = useState<boolean[]>([false, false, false, false, false]);
  const [rolling, setRolling] = useState(false);
  const done = sheetFull(s.sheets.p1) && (solo || sheetFull(s.sheets.p2));

  // Neuer Zug oder Wurf des Schatzes: Haltemarken übernehmen
  useEffect(() => {
    setHold(s.rolls === 0 ? [false, false, false, false, false] : s.held.slice());
  }, [s.turn, s.rolls]);

  useOnChange(`${s.turn}-${s.rolls}-${s.dice.join('')}`, () => {
    if (s.rolls > 0) {
      setRolling(true);
      [0, 70, 140].forEach((d) => window.setTimeout(() => tone(300 + Math.random() * 300, 30, 'square', 0.03), d));
      buzz(15);
      window.setTimeout(() => setRolling(false), 380);
    }
  });
  useOnChange(s.last, (_, l) => {
    if (!l) return;
    if (l.cat === 'kniffel' && l.pts) {
      sfx.win();
      buzz([40, 40, 40, 40, 80]);
    } else if (l.pts) sfx.point();
    else sfx.miss();
  });

  // Allein: Ergebnis selbst melden
  useEffect(() => {
    if (!solo || !done) return;
    const t = window.setTimeout(() => onEnd({ score: total(s.sheets.p1) }), 1400);
    return () => window.clearTimeout(t);
  }, [solo, done]);

  const canHold = mine && s.rolls > 0 && s.rolls < 3;
  const roll = () => g.act({ t: 'roll', hold });
  const score = (cat: KCat) => {
    if (!mine || s.rolls === 0 || s.sheets[actor][cat] !== undefined) return;
    g.act({ t: 'score', cat });
  };

  const row = (cat: KCat) => (
    <div key={cat} className="k-row">
      <span className="k-cat">
        <b>{KCAT_LABEL[cat]}</b>
        <small>{KCAT_HINT[cat]}</small>
      </span>
      {sides.map((side) => {
        const v = s.sheets[side][cat];
        const preview = side === actor && mine && s.rolls > 0 && v === undefined;
        const p = preview ? catScore(cat, s.dice) : null;
        return (
          <button
            key={side}
            className={cls('k-cell', v !== undefined && 'set', preview && 'pick', preview && p === 0 && 'zero', s.last?.by === side && s.last.cat === cat && 'fresh')}
            disabled={!preview}
            onClick={() => score(cat)}
            style={{ '--pc': players[side].color } as CSSProperties}
          >
            {v !== undefined ? v : p !== null ? p : ''}
          </button>
        );
      })}
    </div>
  );

  const who = players[s.turn];
  let hint: string;
  if (done) {
    if (solo) hint = `Fertig! ${total(s.sheets.p1)} Punkte 🎉`;
    else {
      const a = total(s.sheets.p1);
      const b = total(s.sheets.p2);
      hint = a === b ? `Gleichstand mit ${a} Punkten! 🤝` : `${players[a > b ? 'p1' : 'p2'].emoji} ${players[a > b ? 'p1' : 'p2'].name} gewinnt mit ${Math.max(a, b)} Punkten!`;
    }
  } else if (mine) hint = s.rolls === 0 ? (props.mode === 'duo' ? `${who.emoji} ${who.name}, würfle los!` : 'Würfle los!') : s.rolls < 3 ? 'Würfel antippen zum Halten – oder unten eintragen' : 'Trag dein Ergebnis unten ein';
  else hint = turnHint(g, players, g.turn, '', `${who.emoji} ${who.name} würfelt …`);

  return (
    <div className="g-col kniffel">
      {!solo && <TurnBar p1={p1} p2={p2} turn={g.turn} scores={{ p1: total(s.sheets.p1), p2: total(s.sheets.p2) }} done={done} />}
      <div className="k-dice">
        {s.dice.map((d, i) => (
          <Die
            key={i}
            value={s.rolls === 0 ? 0 : d}
            held={s.rolls > 0 && hold[i]}
            rolling={rolling && !hold[i]}
            onClick={
              canHold
                ? () => {
                    setHold(hold.map((h, k) => (k === i ? !h : h)));
                    sfx.flip();
                  }
                : undefined
            }
          />
        ))}
      </div>
      <div className="k-actions">
        <button className="btn primary" disabled={!mine || s.rolls >= 3} onClick={roll}>
          🎲 {s.rolls === 0 ? 'Würfeln' : `Nochmal (${3 - s.rolls})`}
        </button>
      </div>
      <GameHint>{hint}</GameHint>
      <div className={cls('k-sheet', solo && 'solo')}>
        <div className="k-row head">
          <span />
          {sides.map((side) => (
            <span key={side} className="k-who" style={{ '--pc': players[side].color } as CSSProperties}>
              {players[side].emoji} {players[side].name}
            </span>
          ))}
        </div>
        {UPPER.map(row)}
        <div className="k-row sum">
          <span className="k-cat">
            <b>Bonus</b>
            <small>
              ab {BONUS_AT} oben: +{BONUS}
            </small>
          </span>
          {sides.map((side) => (
            <span key={side} className="k-cell set">
              {bonusOf(s.sheets[side]) ? `+${BONUS}` : `${upperSum(s.sheets[side])}/${BONUS_AT}`}
            </span>
          ))}
        </div>
        {LOWER.map(row)}
        <div className="k-row total">
          <span className="k-cat">
            <b>Gesamt</b>
          </span>
          {sides.map((side) => (
            <span key={side} className="k-cell set">
              {total(s.sheets[side])}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
