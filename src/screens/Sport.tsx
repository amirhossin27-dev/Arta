import { useState } from 'react';
import { EXERCISES, PLACE_LABEL, type ExerciseCategory } from '../data/exercises';
import { ExerciseCard, PlanRow } from '../components/exercise';
import { Chips, Empty, Segmented, WeekStrip } from '../components/ui';
import { dailyUnits } from '../lib/daily';
import { formatShort, relativeDay, todayKey } from '../lib/date';
import { usePeople } from '../lib/hooks';
import { useLive } from '../lib/live';
import { activeMinutes, burnedFor, planFor } from '../lib/stats';
import { useData } from '../lib/store';
import type { Place } from '../lib/types';
import { nav, useUI } from '../lib/ui';

type View = 'angebot' | 'plan' | 'alle';

function dayWord(date: string): string {
  const label = relativeDay(date);
  return ['Heute', 'Morgen', 'Gestern'].includes(label) ? label.toLowerCase() : `den ${formatShort(date)}`;
}

const SECTIONS: { place: Place; sub: string }[] = [
  { place: 'zuhause', sub: 'Ohne Geräte, auf kleinstem Raum' },
  { place: 'draussen', sub: 'Frische Luft tanken' },
  { place: 'zusammen', sub: 'Partner-Übungen – nur im Team möglich' },
];

export function Sport() {
  const data = useData();
  const { me, partner } = usePeople();
  const live = useLive();
  const { sportDate: date } = useUI();
  const [view, setView] = useState<View>('angebot');
  const [place, setPlace] = useState<'alle' | Place>('alle');
  const [cat, setCat] = useState<'alle' | ExerciseCategory>('alle');
  const [query, setQuery] = useState('');

  const units = dailyUnits(date);
  const myPlan = planFor(data, date, me.id);
  const partnerPlan = planFor(data, date, partner.id);
  const planned = new Set(myPlan.map((p) => p.exerciseId));
  const done = myPlan.filter((p) => p.done).length;

  const filtered = EXERCISES.filter(
    (e) =>
      (place === 'alle' || e.place === place) &&
      (cat === 'alle' || e.category === cat) &&
      (!query.trim() || e.name.toLowerCase().includes(query.trim().toLowerCase())),
  );

  return (
    <section className="screen">
      <div className="hero hero-sport" data-deco="💪">
        <p className="eyebrow">{relativeDay(date)}</p>
        <h1>Bewegung, die verbindet</h1>
        <div className="hero-stats">
          <div>
            <b>
              {done}/{myPlan.length}
            </b>
            <span>erledigt</span>
          </div>
          <div>
            <b>{activeMinutes(data, date, me.id)}</b>
            <span>aktive Min.</span>
          </div>
          <div>
            <b>{burnedFor(data, date, me.id)}</b>
            <span>kcal verbrannt</span>
          </div>
        </div>
      </div>

      <WeekStrip value={date} onChange={nav.setSportDate} marks={(k) => planFor(data, k, me.id).length} />
      {date !== todayKey() && (
        <button className="link center-link" onClick={() => nav.setSportDate(todayKey())}>
          ↩︎ Zurück zu heute
        </button>
      )}

      <Segmented
        value={view}
        onChange={setView}
        options={[
          ['angebot', '✨ Angebot'],
          ['plan', `📋 Plan (${myPlan.length})`],
          ['alle', '🔎 Alle'],
        ]}
      />

      {view === 'angebot' && (
        <>
          <p className="intro">Jeden Tag neue Grundeinheiten – such dir aus, was zu deinem Tag passt, und plan es mit „+“ ein.</p>
          {SECTIONS.map(({ place: p, sub }) => {
            const list = p === 'zuhause' ? units.zuhause : p === 'draussen' ? units.draussen : units.zusammen;
            return (
              <div key={p} className="section">
                <div className="section-title">
                  <span className="section-emoji">{PLACE_LABEL[p].emoji}</span>
                  <div>
                    <h2>{PLACE_LABEL[p].label}</h2>
                    <p className="muted">{sub}</p>
                  </div>
                </div>
                <div className="ex-list">
                  {list.map((ex) => (
                    <ExerciseCard key={ex.id} ex={ex} date={date} planned={planned.has(ex.id)} />
                  ))}
                </div>
              </div>
            );
          })}
        </>
      )}

      {view === 'plan' && (
        <>
          <div className="card">
            <div className="card-head">
              <h2>
                {me.emoji} Mein Plan
              </h2>
              <span className="muted small">{relativeDay(date)}</span>
            </div>
            {myPlan.length ? (
              myPlan.map((p) => <PlanRow key={p.id} item={p} editable />)
            ) : (
              <Empty emoji="🗓️" title="Noch keine Einheiten geplant">
                <button className="btn primary small" onClick={() => setView('angebot')}>
                  Zum Tagesangebot
                </button>
              </Empty>
            )}
          </div>
          <div className="card">
            <div className="card-head">
              <h2>
                {partner.emoji} Plan von {partner.name}
              </h2>
              <button className="btn soft small" onClick={() => nav.open({ type: 'cheer' })}>
                📣 Anfeuern
              </button>
            </div>
            {partnerPlan.length ? (
              partnerPlan.map((p) => <PlanRow key={p.id} item={p} editable={false} />)
            ) : (
              <p className="muted">
                {partner.name} hat für {dayWord(date)} noch nichts geplant. Plan doch eine kleine Challenge ein – im Tagesangebot bei
                „Für wen?“ einfach {partner.name} wählen. 😉
              </p>
            )}
            <p className="hint">
              Was {partner.name} auf dem eigenen Handy plant, {live ? 'erscheint hier automatisch.' : 'siehst du nach dem nächsten Sync.'}
            </p>
          </div>
        </>
      )}

      {view === 'alle' && (
        <>
          <input className="search" type="search" placeholder="Übung suchen …" value={query} onChange={(e) => setQuery(e.target.value)} />
          <Chips
            value={place}
            onChange={setPlace}
            options={[
              ['alle', 'Alle Orte'],
              ['zuhause', '🏠 Zuhause'],
              ['draussen', '🌳 Draußen'],
              ['zusammen', '💑 Zusammen'],
            ]}
          />
          <Chips
            value={cat}
            onChange={setCat}
            options={[
              ['alle', 'Alle'],
              ['Kraft', 'Kraft'],
              ['Cardio', 'Cardio'],
              ['Core', 'Core'],
              ['Ausdauer', 'Ausdauer'],
              ['Mobilität', 'Mobilität'],
            ]}
          />
          <div className="ex-list">
            {filtered.map((ex) => (
              <ExerciseCard key={ex.id} ex={ex} date={date} planned={planned.has(ex.id)} />
            ))}
            {!filtered.length && <Empty emoji="🤷" title="Keine Übung gefunden" />}
          </div>
        </>
      )}
    </section>
  );
}
