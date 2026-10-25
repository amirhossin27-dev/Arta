import type { CSSProperties } from 'react';
import { duelTotals, gameSummary } from '../games/logic';
import { GAMES, type GameMeta } from '../games/registry';
import { cls, usePeople } from '../lib/hooks';
import { useData } from '../lib/store';
import { nav } from '../lib/ui';

function GameCard({ game }: { game: GameMeta }) {
  const data = useData();
  const { me, partner } = usePeople();
  const s = gameSummary(data, game.id);
  const duo = game.modes.includes('duo');
  let stat: string | undefined;
  if (duo && s.wins.a + s.wins.b + s.draws > 0) {
    stat = `${me.emoji} ${s.wins[me.id]} : ${s.wins[partner.id]} ${partner.emoji}`;
  } else if (game.modes.includes('solo') && (s.best[me.id] !== undefined || s.best[partner.id] !== undefined)) {
    stat = `🏆 ${me.emoji} ${s.best[me.id] ?? '–'} · ${partner.emoji} ${s.best[partner.id] ?? '–'}`;
  }

  return (
    <button className="game-card" onClick={() => nav.open({ type: 'game', id: game.id })} style={{ '--g1': game.colors[0], '--g2': game.colors[1] } as CSSProperties}>
      <span className="game-icon">{game.emoji}</span>
      <span className="game-info">
        <b>{game.name}</b>
        <span className="muted">{game.tagline}</span>
        <span className="game-tags">
          <span className="tag">⏱ {game.minutes}</span>
          {game.modes.includes('cpu') && <span className="tag">🤖 auch gegen Arta</span>}
          {duo && game.modes.includes('solo') && <span className="tag">🙋 auch allein</span>}
          {stat && <span className="tag stat">{stat}</span>}
        </span>
      </span>
      <span className="game-go" aria-hidden="true">
        ▶
      </span>
    </button>
  );
}

export function Games() {
  const data = useData();
  const { me, partner } = usePeople();
  const totals = duelTotals(data);
  const mine = totals.wins[me.id];
  const theirs = totals.wins[partner.id];
  const leader = mine === theirs ? null : mine > theirs ? me : partner;
  const duoGames = GAMES.filter((g) => g.modes.includes('duo'));
  const soloGames = GAMES.filter((g) => !g.modes.includes('duo'));

  return (
    <section className="screen">
      <div className="hero hero-game" data-deco="🕹️">
        <p className="eyebrow">Arta Arcade</p>
        <h1>Spielzeit für euch zwei</h1>
        <p className="hero-sub">Kurze Runden, große Gefühle – und wer verliert, schuldet vielleicht einen Kuss. 😘</p>
        <div className="duel-score">
          <div className={cls('duel-side', leader === me && 'lead')}>
            <span className="duel-avatar">{me.emoji}</span>
            <b>{mine}</b>
            <span>{me.name}</span>
          </div>
          <span className="duel-vs">{leader ? '👑' : 'VS'}</span>
          <div className={cls('duel-side', leader === partner && 'lead')}>
            <span className="duel-avatar">{partner.emoji}</span>
            <b>{theirs}</b>
            <span>{partner.name}</span>
          </div>
        </div>
        <p className="hero-sub small center">
          {totals.wins.a + totals.wins.b + totals.draws === 0
            ? 'Noch keine Duelle – wer traut sich zuerst?'
            : leader
              ? `${leader.name} führt in der Gesamtwertung aller Duelle!`
              : 'Gleichstand in der Gesamtwertung – perfekt ausbalanciert. 💞'}
        </p>
      </div>

      <div className="section-title">
        <span className="section-emoji">👫</span>
        <div>
          <h2>Zu zweit</h2>
          <p className="muted">An einem Handy gegeneinander – oder gegen Arta 🤖</p>
        </div>
      </div>
      <div className="game-list">
        {duoGames.map((g) => (
          <GameCard key={g.id} game={g} />
        ))}
      </div>

      <div className="section-title">
        <span className="section-emoji">🕹️</span>
        <div>
          <h2>Solo-Klassiker</h2>
          <p className="muted">Jeder spielt für sich – wer hält den Rekord?</p>
        </div>
      </div>
      <div className="game-list">
        {soloGames.map((g) => (
          <GameCard key={g.id} game={g} />
        ))}
      </div>

      <p className="hint center">Siege und Rekorde teilt ihr beim 🔄 Paar-Sync automatisch.</p>
    </section>
  );
}
