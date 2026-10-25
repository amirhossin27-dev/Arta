import type { CSSProperties } from 'react';
import { duelTotals, gameSummary } from '../games/logic';
import { CATEGORY_INFO, GAMES, type GameCategory, type GameMeta } from '../games/registry';
import { cls, usePeople } from '../lib/hooks';
import { useLive } from '../lib/live';
import { useData } from '../lib/store';
import { nav } from '../lib/ui';

function GameCard({ game }: { game: GameMeta }) {
  const data = useData();
  const { me, partner } = usePeople();
  const s = gameSummary(data, game.id);
  const duel = game.modes.some((m) => m !== 'solo');
  let stat: string | undefined;
  if (duel && s.wins.a + s.wins.b + s.draws > 0) {
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
          {game.modes.includes('online') && <span className="tag">🌐 online</span>}
          {game.modes.includes('cpu') && <span className="tag">🤖 gegen KI</span>}
          {duel && game.modes.includes('solo') && <span className="tag">🙋 allein</span>}
          {stat && <span className="tag stat">{stat}</span>}
        </span>
      </span>
      <span className="game-go" aria-hidden="true">
        ▶
      </span>
    </button>
  );
}

const SECTIONS: GameCategory[] = ['karten', 'brett', 'raten', 'arcade'];

export function Games() {
  const data = useData();
  const { me, partner } = usePeople();
  const live = useLive();
  const totals = duelTotals(data);
  const mine = totals.wins[me.id];
  const theirs = totals.wins[partner.id];
  const leader = mine === theirs ? null : mine > theirs ? me : partner;

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

      <div className={cls('online-banner', live && 'on')}>
        <span className="online-banner-emoji">🌐</span>
        <span className="grow">
          {live ? (
            <>
              <b>Online spielen ist bereit.</b> Wählt im Spiel „🌐 Online“ – {partner.name} bekommt die Einladung direkt aufs Handy.
            </>
          ) : (
            <>
              <b>Online gegeneinander spielen?</b> Einmal per Live-Sync verbinden – dann klappt's auch aus der Ferne.
            </>
          )}
        </span>
        {!live && (
          <button className="btn soft small" onClick={() => nav.open({ type: 'sync' })}>
            🔄 Verbinden
          </button>
        )}
      </div>

      {SECTIONS.map((cat) => (
        <div key={cat}>
          <div className="section-title">
            <span className="section-emoji">{CATEGORY_INFO[cat].emoji}</span>
            <div>
              <h2>{CATEGORY_INFO[cat].title}</h2>
              <p className="muted">{CATEGORY_INFO[cat].text}</p>
            </div>
          </div>
          <div className="game-list">
            {GAMES.filter((g) => g.category === cat).map((g) => (
              <GameCard key={g.id} game={g} />
            ))}
          </div>
        </div>
      ))}

      <p className="hint center">Siege und Rekorde teilt ihr beim 🔄 Paar-Sync automatisch.</p>
    </section>
  );
}
