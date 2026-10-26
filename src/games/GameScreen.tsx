import { useEffect, useMemo, useRef, useState, type ComponentType, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { GAME_CPU_LOSE, GAME_CPU_WIN, GAME_DRAW, GAME_RECORD, GAME_WIN, STAKES } from '../data/messages';
import { Segmented } from '../components/ui';
import { cls } from '../lib/hooks';
import { channelsLoaded, liveAvailable, useLive, useLiveStatus } from '../lib/live';
import { confetti } from '../lib/love';
import { pickRandom } from '../lib/random';
import { actions, useData, useDevice } from '../lib/store';
import { other, type PersonId } from '../lib/types';
import { nav } from '../lib/ui';
import { Battleship } from './Battleship';
import { Breakout } from './Breakout';
import { Checkers } from './Checkers';
import { Chess } from './Chess';
import { ConnectFour } from './ConnectFour';
import { sfx, unlockAudio } from './engine';
import { Fight } from './Fight';
import { FitDice } from './FitDice';
import { Flappy } from './Flappy';
import { Game2048 } from './Game2048';
import { GuessWho } from './GuessWho';
import { Invaders } from './Invaders';
import { Kart } from './Kart';
import { Kniffel } from './Kniffel';
import { gameSummary, isBetter, otherSide, type GameSummary, type Side } from './logic';
import { Ludo } from './Ludo';
import { MauMau } from './MauMau';
import { Memory } from './Memory';
import { Minesweeper } from './Minesweeper';
import { Muehle } from './Muehle';
import { hostMatch, leaveMatch, markRecorded, publishShared, pushAct, setReady, useArcade } from './online';
import { Pong } from './Pong';
import { Reaction } from './Reaction';
import { GAME_BY_ID, MODE_LABEL, type GameId, type GameMeta, type GameMode } from './registry';
import { Romme } from './Romme';
import { Simon } from './Simon';
import { Slf } from './Slf';
import { Snake } from './Snake';
import { Tetris } from './Tetris';
import { TicTacToe } from './TicTacToe';
import type { GameOutcome, GameProps, NetLink, Player } from './types';
import { Uno } from './Uno';

const COMPONENTS: Record<GameId, ComponentType<GameProps>> = {
  uno: Uno,
  maumau: MauMau,
  romme: Romme,
  kniffel: Kniffel,
  ludo: Ludo,
  fitdice: FitDice,
  chess: Chess,
  checkers: Checkers,
  muehle: Muehle,
  battleship: Battleship,
  connect4: ConnectFour,
  tictactoe: TicTacToe,
  slf: Slf,
  guesswho: GuessWho,
  memory: Memory,
  kart: Kart,
  fight: Fight,
  pong: Pong,
  reaction: Reaction,
  snake: Snake,
  breakout: Breakout,
  simon: Simon,
  tetris: Tetris,
  invaders: Invaders,
  flappy: Flappy,
  g2048: Game2048,
  minesweeper: Minesweeper,
};

const P1_COLOR = '#ff4f81';
const P2_COLOR = '#ffc23d';
const CPU_COLOR = '#7fc8ff';
/** Spiele mit verdeckten Karten oder Antworten */
const GAME_HIDDEN = new Set<GameId>(['uno', 'maumau', 'romme', 'guesswho', 'slf', 'battleship']);

export const KI_PLAYER: Player = { name: 'KI', emoji: '🤖', color: CPU_COLOR, cpu: true };

type Phase = 'lobby' | 'invite' | 'play' | 'result';

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
      {meta.lowerIsBetter && <p className="lobby-note">{meta.scoreLabel === 'Sek.' ? 'Je schneller, desto besser.' : 'Je weniger Züge, desto besser.'}</p>}
    </div>
  );
}

function StakePicker({ stake, setStake }: { stake: number | null; setStake: (s: number | null) => void }) {
  return (
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
  );
}

export function GameScreen({ id, join, onClose }: { id: GameId; join?: string; onClose: () => void }) {
  const meta = GAME_BY_ID[id];
  const Game = COMPONENTS[id];
  const data = useData();
  const device = useDevice();
  const live = useLive();
  const liveStatus = useLiveStatus();
  const arcade = useArcade();
  const me = data.persons[device.me];
  const partner = data.persons[other(device.me)];
  // Kartenspiele mit verdeckter Hand spielt man am besten jeder am eigenen Handy.
  const [mode, setModeState] = useState<GameMode>(() => (join || (live && GAME_HIDDEN.has(id) && meta.modes.includes('online')) ? 'online' : meta.modes[0]));
  const [matchId, setMatchId] = useState<string | null>(join ?? null);
  const [phase, setPhase] = useState<Phase>(join ? 'play' : 'lobby');
  const [soloId, setSoloId] = useState<PersonId>(device.me);
  const [stake, setStake] = useState<number | null>(null);
  const [round, setRound] = useState(() => (join && arcade.match?.id === join ? arcade.match.round : 0));
  const [session, setSession] = useState<Record<Side, number>>({ p1: 0, p2: 0 });
  const [result, setResult] = useState<RoundResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const stakePaid = useRef(false);
  const summary = gameSummary(data, id);
  const sound = device.sound !== false;
  const online = mode === 'online';
  const mv = online && matchId && arcade.match?.id === matchId ? arcade.match : null;

  // ───── Wer spielt? ─────
  const soloPerson = data.persons[soloId];
  const hostId: PersonId = mv?.host ?? device.me;
  const person = (pid: PersonId, color: string): Player => ({ name: data.persons[pid].name, emoji: data.persons[pid].emoji, color, cpu: false });
  let p1: Player;
  let p2: Player;
  if (mode === 'solo') {
    p1 = { name: soloPerson.name, emoji: soloPerson.emoji, color: P1_COLOR, cpu: false };
    p2 = KI_PLAYER;
  } else if (online) {
    p1 = person(hostId, P1_COLOR);
    p2 = person(other(hostId), P2_COLOR);
  } else {
    p1 = person(device.me, P1_COLOR);
    p2 = mode === 'cpu' ? KI_PLAYER : person(other(device.me), P2_COLOR);
  }
  if (p2.emoji === p1.emoji) p2 = { ...p2, emoji: p1.emoji === '💛' ? '💜' : '💛' };
  const players = { p1, p2 };
  const personOf = (s: Side): PersonId => (online ? (s === 'p1' ? hostId : other(hostId)) : s === 'p1' ? device.me : other(device.me));
  const activeStake = online ? (mv?.stake ?? null) : stake;

  const setMode = (m: GameMode) => {
    setModeState(m);
    setSession({ p1: 0, p2: 0 });
  };

  // ───── Online ─────
  const net: NetLink | undefined = useMemo(() => {
    if (!mv || !matchId) return undefined;
    return {
      me: mv.me,
      shared: mv.shared(round),
      acts: mv.acts(round),
      publish: (snap) => publishShared(matchId, round, snap),
      pushAct: (a, keep) => pushAct(matchId, round, a, keep),
    };
  }, [mv, matchId, round]);

  const matchRef = useRef(matchId);
  matchRef.current = matchId;
  const leave = () => {
    if (matchRef.current) leaveMatch(matchRef.current);
    matchRef.current = null;
    setMatchId(null);
  };
  // Wird der Spielbildschirm anders geschlossen (z. B. über ein anderes Fenster), die Partie verlassen.
  // Verzögert, weil React im Entwicklungsmodus einmal zum Test ab- und wieder anbaut.
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      window.setTimeout(() => !mounted.current && leave(), 0);
    };
  }, []);

  // Gastgeber: Der Schatz hat angenommen → los geht's.
  useEffect(() => {
    if (phase === 'invite' && mv?.together) {
      setRound(mv.round);
      setPhase('play');
    }
    if (phase === 'invite' && mv?.declined) {
      setNotice(`${partner.name} kann gerade nicht – vielleicht später? 💌`);
      leave();
      setPhase('lobby');
    }
  }, [phase, mv]);

  // Gast: Der Gastgeber hat eine neue Runde begonnen.
  useEffect(() => {
    if (mv?.me === 'p2' && mv.round > round) {
      setRound(mv.round);
      setResult(null);
      setPhase('play');
    }
  }, [mv?.round]);

  // Gastgeber: Beide wollen nochmal.
  useEffect(() => {
    if (mv?.me === 'p1' && phase === 'result' && mv.readyMine > round && mv.readyTheirs > round) {
      setRound(round + 1);
      setResult(null);
      setPhase('play');
    }
  }, [mv, phase]);

  const partnerGone = online && !!mv && mv.left && channelsLoaded() && (phase === 'play' || phase === 'result');

  // ───── Ablauf ─────
  const start = () => {
    unlockAudio();
    setNotice(null);
    setResult(null);
    if (online) {
      const mid = hostMatch(id, stake);
      if (!mid) {
        setNotice('Der Live-Sync ist gerade nicht verbunden.');
        return;
      }
      stakePaid.current = false;
      setMatchId(mid);
      setRound(0);
      setPhase('invite');
      return;
    }
    setPhase('play');
  };
  const again = () => {
    if (online) {
      if (matchId) setReady(matchId, round + 1);
      return;
    }
    setRound((r) => r + 1);
    start();
  };
  const toLobby = () => {
    if (online) leave();
    setPhase('lobby');
  };
  const close = () => {
    leave();
    onClose();
  };
  const back = () => {
    if (phase === 'play' || phase === 'invite') toLobby();
    else close();
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
    // Online zählt nur der Gastgeber – der Live-Sync bringt das Ergebnis aufs andere Handy.
    const counts = !online || (mv?.me === 'p1' && mv.recorded < round);
    if (counts) {
      if (mode === 'duo' || online) actions.recordGame(id, { winner: winner === 'draw' ? 'draw' : personOf(winner) });
      else actions.recordGame(id, {});
      if (online && matchId) markRecorded(matchId, round);
    }
    if (winner === 'draw') {
      sfx.draw();
      return {
        emoji: '🤝',
        title: 'Unentschieden!',
        text: pickRandom(GAME_DRAW),
        stake: mode !== 'cpu' && activeStake !== null && !stakePaid.current ? 'Der Einsatz bleibt stehen – die nächste Runde entscheidet! 😏' : undefined,
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
      return { emoji: '🤖', title: 'Die KI gewinnt!', text: pickRandom(GAME_CPU_LOSE) };
    }
    const iWon = !online || winner === mv?.me;
    if (iWon) {
      sfx.win();
      confetti();
    } else sfx.lose();
    let stakeText: string | undefined;
    if (activeStake !== null && !stakePaid.current) {
      const st = STAKES[activeStake];
      if (counts) actions.addCoupon(st.title, st.emoji, personOf(otherSide(winner)));
      stakeText = `${l.name} schenkt ${w.name}: ${st.emoji} „${st.title}“ – liegt jetzt bei den Gutscheinen im Liebe-Tab.`;
      stakePaid.current = true;
      if (!online) setStake(null);
    }
    return { emoji: w.emoji, title: `${w.name} gewinnt!`, text: fillGame(pickRandom(GAME_WIN), w.name, l.name), stake: stakeText };
  };

  const finishSolo = (score: number, failed?: boolean): RoundResult => {
    const rival = data.persons[other(soloId)];
    const prev = summary.best[soloId];
    const rivalBest = summary.best[rival.id];
    if (failed) {
      actions.recordGame(id, { player: soloId });
      return {
        emoji: '💥',
        title: 'Boom!',
        text: prev !== undefined ? `Dein Rekord bleibt bei ${prev} ${meta.scoreLabel}. Nächste Runde klappt’s! 💪` : 'Das war knapp – gleich nochmal, das erste Feld ist immer sicher! 💪',
      };
    }
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
      title: record ? 'Neuer Rekord!' : meta.id === 'kart' ? 'Im Ziel! 🏁' : meta.id === 'memory' ? 'Geschafft!' : 'Game over',
      text,
      score,
    };
  };

  const finish = (o: GameOutcome) => {
    setResult('winner' in o ? finishDuel(o.winner) : finishSolo(o.score, o.failed));
    setPhase('result');
  };

  const duoWins = mode === 'duo' || online ? summary.wins : null;
  const waitingForState = online && phase === 'play' && !!mv && mv.me === 'p2' && !net?.shared;
  const canMount = !online || (!!net && (mv!.me === 'p1' || !!net.shared));
  const iWantAgain = online && !!mv && mv.readyMine > round;
  const theyWantAgain = online && !!mv && mv.readyTheirs > round;

  return createPortal(
    <div className={cls('game-screen', `game-${id}`, `phase-${phase}`)} style={{ '--g1': meta.colors[0], '--g2': meta.colors[1] } as CSSProperties}>
      <header className="game-head">
        <button className="game-btn" onClick={back} aria-label={phase === 'play' ? 'Zurück zum Menü' : 'Spiel schließen'}>
          {phase === 'play' || phase === 'invite' ? '‹' : '✕'}
        </button>
        <div className="game-title">
          <span>{meta.emoji}</span> {meta.name}
        </div>
        {phase !== 'lobby' && phase !== 'invite' && mode !== 'solo' && (
          <span className="session-chip" aria-label="Spielstand heute">
            {online && '🌐 '}
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

          {(mode === 'duo' || (online && live)) && (
            <>
              <div className="versus">
                <span className="versus-p" style={{ '--pc': P1_COLOR } as CSSProperties}>
                  <span className="avatar">{me.emoji}</span>
                  {me.name}
                  {duoWins && <b>{duoWins[device.me]} Siege</b>}
                </span>
                <span className="versus-vs">VS</span>
                <span className="versus-p" style={{ '--pc': P2_COLOR } as CSSProperties}>
                  <span className="avatar">{partner.emoji === me.emoji ? '💛' : partner.emoji}</span>
                  {partner.name}
                  {duoWins && <b>{duoWins[other(device.me)]} Siege</b>}
                </span>
              </div>
              <StakePicker stake={stake} setStake={setStake} />
              {mode === 'duo' && GAME_HIDDEN.has(id) && (
                <p className="lobby-note center">📱 Ihr spielt an einem Handy – zwischen den Zügen kommt ein Sichtschutz, damit niemand spickt.</p>
              )}
              {online && <p className="lobby-note center">🌐 Jeder spielt am eigenen Handy. {partner.name} bekommt sofort eine Einladung.</p>}
            </>
          )}

          {online && !live && (
            <div className="lobby-block online-setup">
              <p className="lobby-label">🌐 Online gegeneinander</p>
              {liveAvailable() ? (
                <>
                  <p className="lobby-note">
                    Dafür verbindet ihr eure Handys einmal per Live-Sync – danach könnt ihr euch jederzeit zu einem Spiel einladen, auch wenn ihr nicht nebeneinander sitzt.
                  </p>
                  <button className="btn soft block" onClick={() => nav.open({ type: 'sync' })}>
                    🔄 Live-Sync einrichten
                  </button>
                </>
              ) : (
                <p className="lobby-note">Dieser Browser unterstützt den Live-Sync leider nicht.</p>
              )}
            </div>
          )}

          {mode === 'cpu' && (
            <p className="lobby-note center">
              {me.emoji} {me.name} gegen 🤖 KI – der Computer ist gut, aber nicht unschlagbar.
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

          {notice && <p className="lobby-notice">{notice}</p>}

          <button className="btn primary big block game-start" onClick={start} disabled={online && !live}>
            {online ? `📨 ${partner.name} einladen` : "▶ Los geht's!"}
          </button>
        </div>
      )}

      {phase === 'invite' && (
        <div className="game-lobby invite-wait">
          <div className="lobby-hero">
            <span className="lobby-emoji invite-pulse">📨</span>
            <h2>Warte auf {partner.name} …</h2>
            <p>
              Die Einladung zu {meta.name} ist unterwegs und taucht auf, sobald Arta bei {partner.name} offen ist. Ein Tipp auf „Mitspielen“ – und los geht's.
            </p>
          </div>
          {liveStatus.state !== 'online' && <p className="lobby-notice">⚠️ Gerade keine Verbindung zum Live-Sync – die Einladung geht raus, sobald ihr wieder online seid.</p>}
          {activeStake !== null && (
            <p className="lobby-note center">
              💝 Einsatz: {STAKES[activeStake].emoji} „{STAKES[activeStake].title}“
            </p>
          )}
          <button className="btn soft block" onClick={toLobby}>
            Einladung zurückziehen
          </button>
        </div>
      )}

      {(phase === 'play' || phase === 'result') && (
        <div className="game-stage">
          {canMount && (
            <Game
              key={`${round}-${mode}-${soloId}-${matchId ?? ''}`}
              mode={mode}
              p1={p1}
              p2={p2}
              starter={round % 2 === 0 ? 'p1' : 'p2'}
              best={summary.best[soloId]}
              net={net}
              onEnd={finish}
            />
          )}
          {waitingForState && (
            <div className="net-wait">
              <span className="invite-pulse">🌐</span>
              <p>Verbinde mit {p1.name} …</p>
            </div>
          )}
        </div>
      )}

      {phase === 'result' && result && !partnerGone && (
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
            {theyWantAgain && !iWantAgain && <p className="result-again">🔁 {partner.name} will nochmal!</p>}
            <div className="btn-row">
              <button className="btn primary" onClick={again} disabled={iWantAgain}>
                {iWantAgain ? `⏳ Warte auf ${partner.name}` : '🔁 Nochmal'}
              </button>
              <button className="btn soft" onClick={toLobby}>
                Menü
              </button>
            </div>
          </div>
        </div>
      )}

      {partnerGone && (
        <div className="game-result-backdrop">
          <div className="game-result">
            <div className="result-emoji">👋</div>
            <h2>{partner.name} hat das Spiel verlassen</h2>
            <p className="result-text">Vielleicht später eine Revanche? 💞</p>
            <div className="btn-row">
              <button className="btn primary" onClick={toLobby}>
                Zum Menü
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}
