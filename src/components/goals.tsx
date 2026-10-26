import { addDays, diffDays, formatShort, startOfWeek, weekdayShort } from '../lib/date';
import { cls, usePeople, useToday } from '../lib/hooks';
import { activeDates, bestCoupleStreak, coupleStreak, streak, weekByDay, weekDone } from '../lib/stats';
import { actions, useData } from '../lib/store';
import { nav } from '../lib/ui';
import { Chips, ProgressRing, Sheet, Stepper } from './ui';

export const WEEK_GOAL_MIN = 2;
export const WEEK_GOAL_MAX = 30;

/** Schnellwahl fürs Wochenziel – gezählt werden die Einheiten von euch beiden zusammen. */
const WEEK_GOAL_PRESETS: [number, string][] = [
  [4, '🌱 Sanfter Start'],
  [6, '🙂 Locker'],
  [10, '💪 Aktiv'],
  [14, '🔥 Jeden Tag'],
  [20, '🏆 Profis'],
];

const units = (n: number) => `${n} ${n === 1 ? 'Einheit' : 'Einheiten'}`;
const days = (n: number) => `${n} ${n === 1 ? 'Tag' : 'Tage'}`;

/** „10 Einheiten“ → was das für jeden von euch bedeutet. */
export function weekGoalHint(goal: number): string {
  const each = goal / 2;
  const rhythm =
    each <= 2 ? 'ideal zum Reinkommen' : each <= 4 ? 'also etwa jeden zweiten Tag eine' : each < 7 ? 'also an den meisten Tagen eine' : each === 7 ? 'also jeden Tag eine' : 'also an manchen Tagen auch zwei';
  return `Das sind etwa ${units(Math.round(each))} für jeden von euch – ${rhythm}.`;
}

/** Wochenziel einstellen: Plus/Minus, Schnellwahl und was das Ziel bedeutet. */
export function WeekGoalPicker() {
  const data = useData();
  const { partner } = usePeople();
  const goal = data.couple.weeklyGoal;
  const set = (weeklyGoal: number) => actions.updateCouple({ weeklyGoal });
  return (
    <>
      <Stepper value={goal} min={WEEK_GOAL_MIN} max={WEEK_GOAL_MAX} onChange={set} label={goal === 1 ? 'Einheit' : 'Einheiten'} />
      <Chips value={String(goal)} onChange={(v) => set(Number(v))} options={WEEK_GOAL_PRESETS.map(([n, label]) => [String(n), `${label} · ${n}`] as [string, string])} />
      <p className="muted small">
        {weekGoalHint(goal)} Das Ziel gilt für euch beide – {partner.name} sieht die Änderung auch.
      </p>
    </>
  );
}

// ───────────────────────── Wochenziel ─────────────────────────

export function WeekGoalSheet({ onClose }: { onClose: () => void }) {
  const data = useData();
  const { me, partner } = usePeople();
  const today = useToday();
  const goal = data.couple.weeklyGoal;
  const week = weekDone(data, today);
  const mine = week[me.id];
  const theirs = week[partner.id];
  const left = Math.max(goal - week.total, 0);
  const sunday = addDays(startOfWeek(today), 6);
  const daysLeft = diffDays(today, sunday) + 1;
  const byDay = weekByDay(data, today);
  const top = Math.max(2, ...byDay.map((x) => Math.max(x.a, x.b)));
  const past = [1, 2, 3, 4].map((i) => {
    const start = addDays(startOfWeek(today), -7 * i);
    return { start, total: weekDone(data, start).total };
  });

  return (
    <Sheet title="🎯 Unser Wochenziel" onClose={onClose}>
      <div className="goal-big">
        <ProgressRing value={week.total} max={goal} size={150} stroke={13} className="sport">
          <b>
            {week.total}/{goal}
          </b>
          <span>Einheiten</span>
        </ProgressRing>
        <p className="goal-status">
          {left === 0
            ? '🎉 Geschafft! Alles, was diese Woche noch dazukommt, ist Bonus.'
            : daysLeft === 1
              ? `Heute ist der letzte Tag: noch ${units(left)} bis zum Ziel.`
              : `Noch ${units(left)} bis Sonntag – ihr habt noch ${days(daysLeft)} Zeit. 💪`}
        </p>
        <p className="muted small center">Jede Sport-Einheit, die du oder {partner.name} abhakt, zählt. Montags fangt ihr wieder bei 0 an.</p>
      </div>

      <div className="inset">
        <h3>📅 Diese Woche</h3>
        <div className="steps-bars goal-bars" role="img" aria-label={`Diese Woche: du ${units(mine)}, ${partner.name} ${units(theirs)}`}>
          {byDay.map((x) => (
            <div key={x.date} className={cls('steps-day', x.date === today && 'today active')}>
              <span className="goal-count">{x.a + x.b || ''}</span>
              <span className="steps-pair">
                <span className="steps-bar sport-me" style={{ height: `${(x[me.id] / top) * 100}%` }} />
                <span className="steps-bar partner" style={{ height: `${(x[partner.id] / top) * 100}%` }} />
              </span>
              <span className="steps-wd">{weekdayShort(x.date)}</span>
            </div>
          ))}
        </div>
        <p className="steps-legend">
          <span>
            <i className="dot sport-me" /> Du {mine}
          </span>
          <span>
            <i className="dot partner" /> {partner.name} {theirs}
          </span>
        </p>
      </div>

      <div className="inset">
        <h3>🎯 Ziel einstellen</h3>
        <WeekGoalPicker />
      </div>

      <div className="inset">
        <h3>💡 Gut zu wissen</h3>
        <ul className="how">
          <li>Gezählt werden nur abgehakte Einheiten aus dem Tagesplan (✓) – geplant allein reicht nicht.</li>
          <li>Ihr sammelt zusammen: Wer wie viele schafft, ist egal. Hauptsache, ihr kommt gemeinsam ans Ziel.</li>
          <li>Eine gemeinsame Einheit 💑 zählt für jeden von euch, also doppelt.</li>
          <li>Ist das Ziel voll, gibt’s eine kleine Feier. 🎉</li>
        </ul>
      </div>

      <div className="inset">
        <h3>🗓️ Die letzten Wochen</h3>
        {past.map((w) => (
          <div key={w.start} className="goal-week">
            <span className="muted small">
              {formatShort(w.start)} – {formatShort(addDays(w.start, 6))}
            </span>
            <span className="goal-week-bar">
              <span style={{ width: `${Math.min(w.total / goal, 1) * 100}%` }} />
            </span>
            <b className="small">{w.total >= goal ? `${w.total} ✓` : w.total}</b>
          </div>
        ))}
        <p className="muted small">Gemessen am aktuellen Ziel von {units(goal)}.</p>
      </div>

      <button
        className="btn primary block"
        onClick={() => {
          onClose();
          nav.setSportDate(today);
          nav.setTab('sport');
        }}
      >
        💪 Einheit planen
      </button>
    </Sheet>
  );
}

// ───────────────────────── Paar-Serie ─────────────────────────

export function StreakSheet({ onClose }: { onClose: () => void }) {
  const data = useData();
  const { me, partner } = usePeople();
  const today = useToday();
  const n = coupleStreak(data, today);
  const best = Math.max(bestCoupleStreak(data), n);
  const myDays = activeDates(data, me.id);
  const theirDays = activeDates(data, partner.id);
  const meToday = myDays.has(today);
  const partnerToday = theirDays.has(today);
  const what = data.couple.streakSteps ? 'eine Sport-Einheit abgehakt oder ihr Schrittziel erreicht' : 'eine Sport-Einheit abgehakt';
  const history = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));

  const todayLine =
    meToday && partnerToday
      ? `Heute wart ihr beide aktiv – eure Serie steht bei ${days(n)}. 💞`
      : meToday
        ? `Du bist heute schon dabei. Sobald ${partner.name} auch aktiv ist, geht eure Serie auf ${days(n + 1)}.`
        : partnerToday
          ? `${partner.name} war heute schon aktiv. Jetzt du – dann geht eure Serie auf ${days(n + 1)}!`
          : n > 0
            ? `Heute ist noch offen. Ihr habt bis Mitternacht Zeit, damit eure ${days(n)} weiterlaufen.`
            : 'Heute ist ein guter Tag, um eine neue Serie zu starten. 🌱';

  return (
    <Sheet title="🔥 Unsere Paar-Serie" onClose={onClose}>
      <div className="goal-big">
        <div className={cls('streak-flame', n === 0 && 'cold')}>
          <span aria-hidden="true">🔥</span>
          <b>{n}</b>
        </div>
        <p className="goal-status">{n === 0 ? 'Gerade keine Serie' : `${days(n)} in Folge beide aktiv`}</p>
        <p className="muted small center">
          Die Paar-Serie zählt die Tage hintereinander, an denen ihr <b>beide</b> mindestens {what} habt. Einstellen müsst ihr dafür nichts – sie zählt von selbst.
        </p>
      </div>

      <div className="inset">
        <h3>☀️ Heute</h3>
        <div className="streak-today">
          {[
            { who: me, name: 'Du', on: meToday },
            { who: partner, name: partner.name, on: partnerToday },
          ].map((x) => (
            <span key={x.who.id} className={cls('streak-who', x.on && 'on')}>
              <span className="avatar">{x.who.emoji}</span>
              <span className="grow">{x.name}</span>
              <b>{x.on ? '✓ aktiv' : 'noch offen'}</b>
            </span>
          ))}
        </div>
        <p className="small">{todayLine}</p>
        {!meToday ? (
          <button
            className="btn primary block"
            onClick={() => {
              onClose();
              nav.setSportDate(today);
              nav.setTab('sport');
            }}
          >
            💪 Einheit für heute planen
          </button>
        ) : (
          !partnerToday && (
            <button
              className="btn soft block"
              onClick={() => {
                onClose();
                nav.open({ type: 'cheer' });
              }}
            >
              📣 {partner.name} anfeuern
            </button>
          )
        )}
      </div>

      <div className="inset">
        <h3>🗓️ Die letzten 14 Tage</h3>
        <div className="streak-days">
          {history.map((day) => {
            const a = myDays.has(day);
            const b = theirDays.has(day);
            return (
              <div key={day} className={cls('streak-day', a && b && 'both', a !== b && 'half', day === today && 'today')} title={day}>
                <span className="streak-mark">{a && b ? '💞' : a ? me.emoji : b ? partner.emoji : ''}</span>
                <span className="steps-wd">{weekdayShort(day)}</span>
              </div>
            );
          })}
        </div>
        <p className="steps-legend">
          <span>💞 beide aktiv</span>
          <span>
            {me.emoji}/{partner.emoji} nur einer
          </span>
        </p>
      </div>

      <div className="inset">
        <h3>🏆 Rekorde</h3>
        <div className="streak-records">
          <div>
            <b>{days(best)}</b>
            <span className="muted small">Paar-Rekord</span>
          </div>
          <div>
            <b>{days(streak(data, me.id, today))}</b>
            <span className="muted small">deine Serie</span>
          </div>
          <div>
            <b>{days(streak(data, partner.id, today))}</b>
            <span className="muted small">Serie von {partner.name}</span>
          </div>
        </div>
      </div>

      <div className="inset">
        <h3>⚙️ Was zählt als aktiver Tag?</h3>
        <p className="muted small">Immer: mindestens eine abgehakte Sport-Einheit (✓). Auf Wunsch zählt auch ein Spaziergang-Tag mit:</p>
        <label className="toggle-line">
          <input type="checkbox" checked={!!data.couple.streakSteps} onChange={(e) => actions.updateCouple({ streakSteps: e.target.checked })} />
          👣 Erreichtes Schrittziel zählt auch
        </label>
        <p className="muted small">Gilt für euch beide und für eure eigenen Serien.</p>
      </div>

      <p className="hint center">Kein Stress: Die Serie reißt erst, wenn ein Tag zu Ende geht, an dem nicht ihr beide aktiv wart.</p>
    </Sheet>
  );
}
