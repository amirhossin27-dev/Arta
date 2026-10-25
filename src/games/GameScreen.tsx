import { useEffect, useState, type ComponentType, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { GAME_CPU_LOSE, GAME_CPU_WIN, GAME_DRAW, GAME_RECORD, GAME_WIN, STAKES } from '../data/messages';
import { Segmented } from '../components/ui';
import { cls } from '../lib/hooks';
import { confetti } from '../lib/love';
import { pickRandom } from '../lib/random';
import { actions, useData, useDevice } from '../lib/store';
import { other, type PersonId } from '../lib/types';
import { Breakout } from './Breakout';
import { ConnectFour } from './ConnectFour';
import { sfx, unlockAudio } from './engine';
import { gameSummary, isBetter, otherSide, type GameSummary, type Side } from './logic';
import { Memory } from './Memory';
import { Pong } from './Pong';
import { Reaction } from './Reaction';
import { GAME_BY_ID, MODE_LABEL, type GameId, type GameMeta, type GameMode } from './registry';
import { Simon } from './Simon';
import { Snake } from './Snake';
import { TicTacToe } from './TicTacToe';
import type { GameOutcome, GameProps, Player } from './types';

const COMPONENTS: Record<GameId, ComponentType<GameProps>> = {
  tictactoe: TicTacToe,
  connect4: ConnectFour,
  memory: Memory,
  pong: Pong,
  reaction: Reaction,
  snake: Snake,
  breakout: Breakout,
  simon: Simon,
};

const P1_COLOR = '#ff4f81';
const P2_COLOR = '#ffc23d';
const CPU_COLOR = '#7fc8ff';

interface RoundResult {
  emoji: string;
  title: string;
  text: string;
  score?: number;
  stake?: string;
}

function fillGame(t: string, winner: string, loser: string) {
  return t.replace(/\{winner\}/g, winner).replace(/\{loser\}/g, loser);
}

function RecordBoard({ meta, summary }: { meta: GameMeta; summary: GameSummary }) {
  const data = useData();
  const { a, b } = summary.best;
  let leader: PersonId | null = null;
  if (a !== undefined && (b === undefined || isBetter(meta.id, a, b))) leader = 'a';
  else if (b !== undefined && (a === undefined || isBetter(meta.id, b, a))) leader = 'b';
  return (
    <div className="record-board">
      <p className="lobby-label">🏆 Highscore-Duell</p>
      {(['a', 'b'] as const).map((id) => (
        <div key={id} className={cls('record-row', leader === id && 'lead')}>
          <span className="avatar sm">{data.persons[id].emoji}</span>
          <span className="grow">{data.persons[id].name}</span>
          <b>{summary.best[id] ?? '–'}</b>
          <span className="record-unit">{meta.scoreLabel}</span>
          <span className="record-crown">{leader === id ? '👑' : ''}</span>
        </div>
      ))}
      {meta.lowerIsBetter && <p className="lobby-note">Je weniger Züge, desto besser.</p>}
    </div>
  );
}

export function GameScreen({ id, onClose }: { id: GameId; onClose: () => void }) {
  const meta = GAME_BY_ID[id];
  const Game = COMPONENTS[id];
  const data = useData();
  const device = useDevice();
  const me = data.persons[device.me];
  const partner = data.persons[other(device.me)];
  const [phase, setPhase] = useState<'lobby' | 'play' | 'result'>('lobby');
  const [mode, setModeState] = useState<GameMode>(meta.modes[0]);
  const [soloId, setSoloId] = useState<PersonId>(device.me);
  const [stake, setStake] = useState<number | null>(null);
  const [round, setRound] = useState(0);
  const [session, setSession] = useState<Record<Side, number>>({ p1: 0, p2: 0 });
  const [result, setResult] = useState<RoundResult | null>(null);
  const summary = gameSummary(data, id);
  const sound = device.sound !== false;

  const soloPerson = data.persons[soloId];
  const p1: Player =
    mode === 'solo'
      ? { name: soloPerson.name, emoji: soloPerson.emoji, color: P1_COLOR, cpu: false }
      : { name: me.name, emoji: me.emoji, color: P1_COLOR, cpu: false };
  let p2: Player = mode === 'cpu' ? { name: 'Arta', emoji: '🤖', color: CPU_COLOR, cpu: true } : { name: partner.name, emoji: partner.emoji, color: P2_COLOR, cpu: false };
  if (p2.emoji === p1.emoji) p2 = { ...p2, emoji: p1.emoji === '💛' ? '💜' : '💛' };
  const players = { p1, p2 };
  const personOf = (s: Side): PersonId => (s === 'p1' ? device.me : other(device.me));

  const setMode = (m: GameMode) => {
    setModeState(m);
    setSession({ p1: 0, p2: 0 });
  };

  const start = () => {
    unlockAudio();
    setResult(null);
    setPhase('play');
  };
  const again = () => {
    setRound((r) => r + 1);
    start();
  };
  const back = () => {
    if (phase === 'play') setPhase('lobby');
    else onClose();
  };

  useEffect(() => {
    document.body.classList.add('no-scroll');
    return () => document.body.classList.remove('no-scroll');
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && back();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const finishDuel = (winner: Side | 'draw'): RoundResult => {
    if (mode === 'duo') actions.recordGame(id, { winner: winner === 'draw' ? 'draw' : personOf(winner) });
    else actions.recordGame(id, {});
    if (winner === 'draw') {
      sfx.draw();
      return {
        emoji: '🤝',
        title: 'Unentschieden!',
        text: pickRandom(GAME_DRAW),
        stake: mode === 'duo' && stake !== null ? 'Der Einsatz bleibt stehen – die nächste Runde entscheidet! 😏' : undefined,
      };
    }
    setSession((s) => ({ ...s, [winner]: s[winner] + 1 }));
    const w = players[winner];
    const l = players[otherSide(winner)];
    if (mode === 'cpu') {
      if (winner === 'p1') {
        sfx.win();
        confetti();
        return { emoji: '🏆', title: `${w.name} gewinnt!`, text: pickRandom(GAME_CPU_WIN) };
      }
      sfx.lose();
      return { emoji: '🤖', title: 'Arta gewinnt!', text: pickRandom(GAME_CPU_LOSE) };
    }
    sfx.win();
    confetti();
    let stakeText: string | undefined;
    if (stake !== null) {
      const st = STAKES[stake];
      actions.addCoupon(st.title, st.emoji, personOf(otherSide(winner)));
      stakeText = `${l.name} schenkt ${w.name}: ${st.emoji} „${st.title}“ – liegt jetzt bei den Gutscheinen im Liebe-Tab.`;
      setStake(null);
    }
    return { emoji: w.emoji, title: `${w.name} gewinnt!`, text: fillGame(pickRandom(GAME_WIN), w.name, l.name), stake: stakeText };
  };

  const finishSolo = (score: number): RoundResult => {
    const rival = data.persons[other(soloId)];
    const prev = summary.best[soloId];
    const rivalBest = summary.best[rival.id];
    actions.recordGame(id, { score, player: soloId, lowerIsBetter: meta.lowerIsBetter });
    const record = (score > 0 || meta.lowerIsBetter) && isBetter(id, score, prev);
    const overtook = record && rivalBest !== undefined && isBetter(id, score, rivalBest) && (prev === undefined || !isBetter(id, prev, rivalBest));
    if (record) {
      sfx.win();
      confetti();
    }
    let text: string;
    if (overtook) text = `Du hast ${rival.name} überholt! 👑 Jetzt ist ${rival.name} dran.`;
    else if (record && prev === undefined) text = `Dein erster Rekord steht. Mal sehen, ob ${rival.name} da rankommt! 😏`;
    else if (record) text = pickRandom(GAME_RECORD).replace(/\{partner\}/g, rival.name);
    else if (prev !== undefined) text = `Dein Rekord liegt bei ${prev} ${meta.scoreLabel}. Gleich nochmal?`;
    else text = 'Gleich nochmal – du schaffst mehr! 💪';
    return {
      emoji: record ? '🏆' : meta.emoji,
      title: record ? 'Neuer Rekord!' : meta.id === 'memory' ? 'Geschafft!' : 'Game over',
      text,
      score,
    };
  };

  const finish = (o: GameOutcome) => {
    setResult('winner' in o ? finishDuel(o.winner) : finishSolo(o.score));
    setPhase('result');
  };

  const duoWins = mode === 'duo' ? summary.wins : null;

  return createPortal(
    <div className={cls('game-screen', `game-${id}`, `phase-${phase}`)} style={{ '--g1': meta.colors[0], '--g2': meta.colors[1] } as CSSProperties}>
      <header className="game-head">
        <button className="game-btn" onClick={back} aria-label={phase === 'play' ? 'Zurück zum Menü' : 'Spiel schließen'}>
          {phase === 'play' ? '‹' : '✕'}
        </button>
        <div className="game-title">
          <span>{meta.emoji}</span> {meta.name}
        </div>
        {phase !== 'lobby' && mode !== 'solo' && (
          <span className="session-chip" aria-label="Spielstand heute">
            {p1.emoji} {session.p1}:{session.p2} {p2.emoji}
          </span>
        )}
        <button className="game-btn" onClick={() => actions.setSound(!sound)} aria-label={sound ? 'Ton aus' : 'Ton an'}>
          {sound ? '🔊' : '🔇'}
        </button>
      </header>

      {phase === 'lobby' && (
        <div className="game-lobby">
          <div className="lobby-hero">
            <span className="lobby-emoji">{meta.emoji}</span>
            <h2>{meta.name}</h2>
            <p>{meta.tagline}</p>
            <span className="lobby-time">⏱ ca. {meta.minutes} pro Runde</span>
          </div>

          {meta.modes.length > 1 && <Segmented value={mode} onChange={setMode} options={meta.modes.map((m) => [m, MODE_LABEL[m]])} />}

          <p className="lobby-rules">{meta.rules}</p>

          {mode === 'duo' && (
            <>
              <div className="versus">
                <span className="versus-p" style={{ '--pc': P1_COLOR } as CSSProperties}>
                  <span className="avatar">{p1.emoji}</span>
                  {p1.name}
                  {duoWins && <b>{duoWins[device.me]} Siege</b>}
                </span>
                <span className="versus-vs">VS</span>
                <span className="versus-p" style={{ '--pc': P2_COLOR } as CSSProperties}>
                  <span className="avatar">{p2.emoji}</span>
                  {p2.name}
                  {duoWins && <b>{duoWins[other(device.me)]} Siege</b>}
                </span>
              </div>
              <div className="lobby-block">
                <p className="lobby-label">💝 Worum spielt ihr?</p>
                <div className="stake-chips">
                  <button className={cls('chip', stake === null && 'active')} onClick={() => setStake(null)}>
                    Nur zum Spaß
                  </button>
                  {STAKES.map((s, i) => (
                    <button key={s.label} className={cls('chip', stake === i && 'active')} onClick={() => setStake(i)}>
                      {s.emoji} {s.label}
                    </button>
                  ))}
                </div>
                <p className="lobby-note">
                  {stake === null ? 'Wählt einen Einsatz – wer verliert, schenkt ihn dem anderen als Liebes-Gutschein.' : `Wer verliert, schenkt: ${STAKES[stake].emoji} „${STAKES[stake].title}“`}
                </p>
              </div>
            </>
          )}

          {mode === 'cpu' && (
            <p className="lobby-note center">
              {me.emoji} {me.name} gegen 🤖 Arta – der Computer ist gut, aber nicht unschlagbar.
            </p>
          )}

          {mode === 'solo' && (
            <>
              <div className="lobby-block">
                <p className="lobby-label">Wer spielt?</p>
                <Segmented value={soloId} onChange={setSoloId} small options={(['a', 'b'] as const).map((pid) => [pid, `${data.persons[pid].emoji} ${data.persons[pid].name}`])} />
              </div>
              <RecordBoard meta={meta} summary={summary} />
            </>
          )}

          <button className="btn primary big block game-start" onClick={start}>
            ▶ Los geht's!
          </button>
        </div>
      )}

      {phase !== 'lobby' && (
        <div className="game-stage">
          <Game key={`${round}-${mode}-${soloId}`} mode={mode} p1={p1} p2={p2} starter={round % 2 === 0 ? 'p1' : 'p2'} best={summary.best[soloId]} onEnd={finish} />
        </div>
      )}

      {phase === 'result' && result && (
        <div className="game-result-backdrop">
          <div className="game-result">
            <div className="result-emoji">{result.emoji}</div>
            <h2>{result.title}</h2>
            {result.score !== undefined && (
              <p className="result-score">
                {result.score} <small>{meta.scoreLabel}</small>
              </p>
            )}
            <p className="result-text">{result.text}</p>
            {result.stake && <p className="result-stake">🎟️ {result.stake}</p>}
            {mode !== 'solo' && (
              <p className="result-session">
                Heute: {p1.emoji} {p1.name} <b>{session.p1}</b> : <b>{session.p2}</b> {p2.name} {p2.emoji}
              </p>
            )}
            <div className="btn-row">
              <button className="btn primary" onClick={again}>
                🔁 Nochmal
              </button>
              <button className="btn soft" onClick={() => setPhase('lobby')}>
                Menü
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
