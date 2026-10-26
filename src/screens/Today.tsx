import type { MouseEvent } from 'react';
import { MEAL_LABEL } from '../data/recipes';
import { MOODS } from '../data/messages';
import { PlanRow } from '../components/exercise';
import { PersonSteps } from '../components/steps';
import { Bar, ProgressRing } from '../components/ui';
import { dailyLove, dailyQuestion } from '../lib/daily';
import { diffDays, formatLong, greeting } from '../lib/date';
import { cls, usePeople, useToday } from '../lib/hooks';
import { isLive } from '../lib/live';
import { heartBurst, showLove } from '../lib/love';
import {
  activeDates,
  activeMinutes,
  burnedFor,
  coupleStreak,
  heartsOn,
  levelInfo,
  mealsFor,
  moodOn,
  planFor,
  points,
  SLOT_LABEL,
  SLOT_ORDER,
  streak,
  sumMeals,
  unreadNotes,
  weekDone,
} from '../lib/stats';
import { actions, useData, useDevice } from '../lib/store';
import { fill } from '../lib/text';
import type { MealType, Person, Slot } from '../lib/types';
import { nav } from '../lib/ui';
import { CycleTodayCard } from './Cycle';

const MEAL_SLOT: Record<MealType, Slot> = { fruehstueck: 'morgens', mittag: 'mittags', snack: 'mittags', abend: 'abends' };

export function sendHeartWithLove(e: MouseEvent, partnerName: string) {
  heartBurst(e, '❤️', 10);
  const count = actions.sendHeart();
  if (count === 1) {
    showLove({ emoji: '❤️', title: 'Herz verschickt!', text: `${partnerName} bekommt es ${isLive() ? 'sofort' : 'beim nächsten Sync'}.`, tone: 'love' });
  } else if (count % 10 === 0) {
    showLove({ emoji: '🍭', title: `${count} Herzen heute!`, text: 'Ihr seid zuckersüß. 💕', tone: 'love' });
  }
}

function PersonDay({ person, isMe, date }: { person: Person; isMe: boolean; date: string }) {
  const data = useData();
  const plan = planFor(data, date, person.id);
  const done = plan.filter((p) => p.done).length;
  const eaten = sumMeals(mealsFor(data, date, person.id)).kcal;
  const burned = burnedFor(data, date, person.id);
  const mood = moodOn(data, date, person.id);
  const s = streak(data, person.id, date);
  return (
    <div className={cls('person-day', isMe && 'me')}>
      <div className="person-head">
        <span className="avatar big">{person.emoji}</span>
        <div>
          <b>{isMe ? 'Du' : person.name}</b>
          <span className="muted">{mood ? `${mood} heute` : s > 0 ? `🔥 Serie: ${s} ${s === 1 ? 'Tag' : 'Tage'}` : 'bereit für heute'}</span>
        </div>
      </div>
      <div className="person-ring">
        <ProgressRing value={done} max={Math.max(plan.length, 1)} size={64} stroke={7} className="sport">
          <b>
            {done}/{plan.length}
          </b>
        </ProgressRing>
        <div className="person-facts">
          <span>⏱️ {activeMinutes(data, date, person.id)} Min aktiv</span>
          <span>🔥 {burned} kcal</span>
        </div>
      </div>
      <div className="person-kcal">
        <div className="row-between">
          <span className="muted">🍽️ {eaten} kcal</span>
          <span className="muted">/ {person.kcalGoal}</span>
        </div>
        <Bar value={eaten} max={person.kcalGoal + burned} className="food" />
      </div>
      <PersonSteps person={person} isMe={isMe} date={date} />
      {!isMe && (
        <div className="btn-row tight">
          <button className="btn soft small" onClick={() => nav.open({ type: 'cheer' })}>
            📣 Anfeuern
          </button>
          <button className="btn soft small" onClick={(e) => sendHeartWithLove(e, person.name)} aria-label={`Herz an ${person.name}`}>
            ❤️
          </button>
        </div>
      )}
    </div>
  );
}

export function Today() {
  const data = useData();
  const device = useDevice();
  const { me, partner, names } = usePeople();
  const today = useToday();
  const g = greeting();
  const pts = points(data);
  const lvl = levelInfo(pts);
  const week = weekDone(data, today);
  const cStreak = coupleStreak(data, today);
  const meActive = activeDates(data, me.id).has(today);
  const partnerActive = activeDates(data, partner.id).has(today);
  const streakSub =
    meActive && partnerActive
      ? 'heute beide ✓'
      : meActive
        ? `heute fehlt ${partner.name}`
        : partnerActive
          ? 'heute fehlst du'
          : cStreak > 0
            ? 'heute noch offen'
            : 'Tage beide aktiv';
  const goalLeft = Math.max(data.couple.weeklyGoal - week.total, 0);
  const unread = unreadNotes(data, device.me);
  const plan = planFor(data, today, me.id);
  const meals = mealsFor(data, today, me.id);
  const myMood = moodOn(data, today, me.id);
  const partnerMood = moodOn(data, today, partner.id);
  const partnerHearts = heartsOn(data, today, partner.id);
  const togetherDays = data.couple.anniversary ? diffDays(data.couple.anniversary, today) : undefined;

  return (
    <section className="screen">
      <div className="hero hero-love" data-deco="💞">
        <div className="hero-top">
          <div>
            <p className="eyebrow">{formatLong(today)}</p>
            <h1>
              {g.text}, {me.name} {g.emoji}
            </h1>
          </div>
          <button className="heart-btn" onClick={(e) => sendHeartWithLove(e, partner.name)} aria-label={`Herz an ${partner.name} senden`}>
            ❤️
          </button>
        </div>
        <p className="hero-quote">„{fill(dailyLove(today), names)}“</p>
        <div className="hero-meta">
          {togetherDays !== undefined && togetherDays >= 0 && <span>💑 {togetherDays} Tage zusammen</span>}
          {partnerHearts > 0 && (
            <span>
              ❤️ {partnerHearts}× von {partner.name}
            </span>
          )}
        </div>
      </div>

      {unread.length > 0 && (
        <button className="banner" onClick={() => nav.setTab('liebe')}>
          💌 {partner.name} hat dir {unread.length === 1 ? 'eine Botschaft' : `${unread.length} Botschaften`} geschickt
        </button>
      )}

      <CycleTodayCard />

      <div className="stats-row">
        <div className="stat">
          <span className="stat-emoji">{lvl.current.emoji}</span>
          <b>{pts}</b>
          <span className="muted">Herzpunkte</span>
          <Bar value={lvl.progress} max={1} className="love" />
          <span className="stat-sub">{lvl.current.name}</span>
        </div>
        <button className="stat tappable" onClick={() => nav.open({ type: 'streak' })} aria-label={`Paar-Serie: ${cStreak} ${cStreak === 1 ? 'Tag' : 'Tage'} – antippen für Details`}>
          <span className="stat-more" aria-hidden="true">
            ›
          </span>
          <span className="stat-emoji">🔥</span>
          <b>{cStreak}</b>
          <span className="muted">Paar-Serie</span>
          <span className="stat-sub">{streakSub}</span>
        </button>
        <button className="stat tappable" onClick={() => nav.open({ type: 'weekGoal' })} aria-label={`Wochenziel: ${week.total} von ${data.couple.weeklyGoal} – antippen zum Einstellen`}>
          <span className="stat-more" aria-hidden="true">
            ›
          </span>
          <span className="stat-emoji">🎯</span>
          <b>
            {week.total}/{data.couple.weeklyGoal}
          </b>
          <span className="muted">Wochenziel</span>
          <Bar value={week.total} max={data.couple.weeklyGoal} className="sport" />
          <span className="stat-sub">{goalLeft > 0 ? `noch ${goalLeft} ${goalLeft === 1 ? 'Einheit' : 'Einheiten'}` : '🎉 geschafft!'}</span>
        </button>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Unser Tag</h2>
          {lvl.next && (
            <span className="muted small">
              noch {lvl.next.min - pts} Punkte bis {lvl.next.emoji}
            </span>
          )}
        </div>
        <div className="duo-grid">
          <PersonDay person={me} isMe date={today} />
          <PersonDay person={partner} isMe={false} date={today} />
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h2>Mein Tagesplan</h2>
          <button
            className="link"
            onClick={() => {
              nav.setSportDate(today);
              nav.setTab('sport');
            }}
          >
            + Einheit
          </button>
        </div>
        {plan.length === 0 && meals.length === 0 ? (
          <div className="empty small">
            <p>Noch nichts geplant. Such dir im Sport-Tab ein paar Grundeinheiten aus und trag dein Essen ein. ✨</p>
            <div className="btn-row">
              <button className="btn primary small" onClick={() => nav.setTab('sport')}>
                💪 Tagesangebot
              </button>
              <button className="btn soft small" onClick={() => nav.setTab('essen')}>
                🥗 Essen
              </button>
            </div>
          </div>
        ) : (
          SLOT_ORDER.map((slot) => {
            const items = plan.filter((p) => p.slot === slot);
            const slotMeals = meals.filter((m) => MEAL_SLOT[m.meal] === slot);
            if (!items.length && !slotMeals.length) return null;
            return (
              <div key={slot} className="slot">
                <p className="slot-label">
                  {SLOT_LABEL[slot].emoji} {SLOT_LABEL[slot].label}
                </p>
                {items.map((p) => (
                  <PlanRow key={p.id} item={p} editable />
                ))}
                {slotMeals.map((m) => (
                  <button key={m.id} className="timeline-meal" onClick={() => nav.setTab('essen')}>
                    <span>{m.emoji}</span>
                    <span className="grow">
                      {MEAL_LABEL[m.meal].label}: {m.name}
                    </span>
                    <span className="muted">{m.kcal} kcal</span>
                  </button>
                ))}
              </div>
            );
          })
        )}
      </div>

      <div className="card">
        <h2>Wie fühlst du dich heute?</h2>
        <div className="mood-row">
          {MOODS.map((m) => (
            <button
              key={m.emoji}
              className={cls('mood', myMood === m.emoji && 'active')}
              onClick={(e) => {
                actions.setMood(m.emoji);
                heartBurst(e, m.emoji, 5);
              }}
              aria-label={m.label}
            >
              <span>{m.emoji}</span>
              <small>{m.label}</small>
            </button>
          ))}
        </div>
        {partnerMood && (
          <p className="muted center">
            {partner.emoji} {partner.name} fühlt sich heute {MOODS.find((m) => m.emoji === partnerMood)?.label ?? ''} {partnerMood}
          </p>
        )}
      </div>

      <div className="card question-card">
        <p className="eyebrow">💬 Frage des Tages für euch</p>
        <p className="big-text">{dailyQuestion(today)}</p>
      </div>
    </section>
  );
}
