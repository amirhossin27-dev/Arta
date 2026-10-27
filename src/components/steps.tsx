import { useEffect, useRef, useState } from 'react';
import { PARTNER_STEP_GOAL } from '../data/messages';
import { diffDays, formatTime, relativeDay, todayKey, weekdayShort } from '../lib/date';
import { useHealth, withHealth } from '../lib/health';
import { cls, usePeople } from '../lib/hooks';
import { useLive } from '../lib/live';
import { showLove } from '../lib/love';
import { addMySteps, pedometerSupported, setMySteps, startPedometer, stopPedometer, usePedometer } from '../lib/pedometer';
import { pickRandom } from '../lib/random';
import { formatSteps, goalReached, MAX_STEPS, STEP_GOALS, stepDuel, stepsKcal, stepsKm, stepsOn, weekSteps, type DaySteps } from '../lib/steps';
import { actions, getData, getDevice, useData, useDevice } from '../lib/store';
import { fill } from '../lib/text';
import { other, type Person } from '../lib/types';
import { nav } from '../lib/ui';
import { Bar, Chips, ProgressRing, Sheet } from './ui';

/**
 * Schritte eines Tages – bei dir selbst inklusive der gerade gezählten, noch nicht gespeicherten,
 * und bei beiden inklusive dessen, was Apple Health schon gemeldet hat.
 */
function useSteps(date: string, person: Person): DaySteps & { counting: boolean } {
  const data = useData();
  const device = useDevice();
  const pedo = usePedometer();
  useHealth();
  const s = stepsOn(data, date, person.id);
  const counting = person.id === device.me && pedo.running && pedo.date === date;
  const own = { ...s, count: s.count + (counting ? pedo.pending : 0) };
  return { ...withHealth(own, person.id), counting };
}

/** Kompakte Schritte-Zeile für „Unser Tag“. */
export function PersonSteps({ person, isMe, date }: { person: Person; isMe: boolean; date: string }) {
  const s = useSteps(date, person);
  const body = (
    <>
      <div className="row-between">
        <span className="muted">
          👣 {formatSteps(s.count)}
          {s.counting && <span className="steps-live" aria-label="zählt gerade mit" />}
        </span>
        <span className="muted">{s.count >= s.goal ? '🏆' : `/ ${formatSteps(s.goal)}`}</span>
      </div>
      <Bar value={s.count} max={s.goal} className="steps" />
    </>
  );
  if (!isMe) {
    return (
      <div className="person-steps" aria-label={`${person.name}: ${formatSteps(s.count)} von ${formatSteps(s.goal)} Schritten`}>
        {body}
      </div>
    );
  }
  return (
    <button className="person-steps" onClick={() => nav.open({ type: 'steps', date })} aria-label={`Deine Schritte: ${formatSteps(s.count)} von ${formatSteps(s.goal)} – eintragen`}>
      {body}
    </button>
  );
}

function StepsRing({ person, isMe, date }: { person: Person; isMe: boolean; date: string }) {
  const s = useSteps(date, person);
  return (
    <div className={cls('steps-person', isMe && 'me')}>
      <ProgressRing value={s.count} max={s.goal} size={92} stroke={9} className="steps">
        <b>{formatSteps(s.count)}</b>
        <span>/ {formatSteps(s.goal)}</span>
      </ProgressRing>
      <span className="steps-name">
        {person.emoji} {isMe ? 'Du' : person.name}
        {s.counting && <span className="steps-live" aria-label="zählt gerade mit" />}
      </span>
      <span className="muted small">{s.count ? `≈ ${stepsKm(s.count)}` : 'noch keine'}</span>
      {s.healthAt && <span className="steps-source">🍎 Health · {formatTime(s.healthAt)}</span>}
    </div>
  );
}

function WeekBars({ date }: { date: string }) {
  const data = useData();
  const { me, partner } = usePeople();
  useHealth();
  const mine = weekSteps(data, date, me.id).map((d) => withHealth(d, me.id));
  const theirs = weekSteps(data, date, partner.id).map((d) => withHealth(d, partner.id));
  const top = Math.max(me.stepGoal, partner.stepGoal, ...mine.map((d) => d.count), ...theirs.map((d) => d.count));
  const sum = (days: DaySteps[]) => formatSteps(days.reduce((acc, d) => acc + d.count, 0));
  const today = todayKey();
  return (
    <div className="steps-week">
      <div className="steps-bars" role="img" aria-label={`Diese Woche: du ${sum(mine)}, ${partner.name} ${sum(theirs)} Schritte`}>
        {mine.map((d, i) => (
          <button key={d.date} className={cls('steps-day', d.date === date && 'active', d.date === today && 'today')} onClick={() => nav.setSportDate(d.date)} aria-label={d.date}>
            <span className="steps-pair">
              <span className="steps-bar me" style={{ height: `${(d.count / top) * 100}%` }} />
              <span className="steps-bar partner" style={{ height: `${(theirs[i].count / top) * 100}%` }} />
            </span>
            <span className="steps-wd">{weekdayShort(d.date)}</span>
          </button>
        ))}
      </div>
      <p className="steps-legend">
        <span>
          <i className="dot me" /> Du {sum(mine)}
        </span>
        <span>
          <i className="dot partner" /> {partner.name} {sum(theirs)}
        </span>
        <span className="muted">diese Woche</span>
      </p>
    </div>
  );
}

/** Schritte-Karte im Sport-Tab: beide nebeneinander, Mitzählen, Eintragen und die Woche. */
export function StepsCard({ date }: { date: string }) {
  const { me, partner } = usePeople();
  const live = useLive();
  const pedo = usePedometer();
  const today = todayKey();
  const isToday = date === today;
  const future = diffDays(today, date) > 0;
  const mine = useSteps(date, me).count;
  const theirs = useSteps(date, partner).count;
  return (
    <div className="card steps-card">
      <div className="card-head">
        <h2>👣 Schritte</h2>
        <span className="muted small">{mine + theirs ? `zusammen ${formatSteps(mine + theirs)}` : relativeDay(date)}</span>
      </div>
      <div className="duo-grid">
        <StepsRing person={me} isMe date={date} />
        <StepsRing person={partner} isMe={false} date={date} />
      </div>
      {!future && <p className="steps-duel">{stepDuel(mine, theirs, partner.name)}</p>}
      {isToday && (
        <div className="btn-row">
          {pedometerSupported() && (
            <button className={cls('btn small', pedo.running ? 'soft' : 'primary')} onClick={() => (pedo.running ? stopPedometer() : void startPedometer())}>
              {pedo.running ? `⏸ Stopp (+${formatSteps(pedo.session)})` : '▶ Mitzählen'}
            </button>
          )}
          <button className="btn soft small" onClick={() => nav.open({ type: 'steps', date })}>
            ✏️ Eintragen
          </button>
        </div>
      )}
      {!isToday && !future && (
        <button className="btn soft small block" onClick={() => nav.open({ type: 'steps', date })}>
          ✏️ Schritte für {relativeDay(date) === 'Gestern' ? 'gestern' : relativeDay(date)} eintragen
        </button>
      )}
      {pedo.error && isToday && <p className="hint">{pedo.error}</p>}
      {pedo.running && isToday && !pedo.sensing && <p className="hint">Warte auf den Bewegungssensor …</p>}
      <WeekBars date={date} />
      <p className="hint">
        Die Schritte von {partner.name} {live ? 'erscheinen hier automatisch.' : 'siehst du nach dem nächsten Sync.'}
      </p>
    </div>
  );
}

/** Eigene Schritte zählen, eintragen und das Tagesziel wählen. */
export function StepsSheet({ date, onClose }: { date: string; onClose: () => void }) {
  const { me } = usePeople();
  const pedo = usePedometer();
  const health = useHealth()[me.id];
  const s = useSteps(date, me);
  const [text, setText] = useState('');
  const isToday = date === todayKey();
  const value = Number(text.replace(/\D/g, ''));
  const valid = text.trim() !== '' && value <= MAX_STEPS;

  const save = () => {
    if (!valid) return;
    setMySteps(date, value);
    setText('');
  };

  return (
    <Sheet title={`👣 Meine Schritte · ${relativeDay(date)}`} onClose={onClose}>
      <div className="steps-big">
        <ProgressRing value={s.count} max={s.goal} size={150} stroke={13} className="steps">
          <b>{formatSteps(s.count)}</b>
          <span>von {formatSteps(s.goal)}</span>
        </ProgressRing>
        <p className="muted small center">
          ≈ {stepsKm(s.count)} · ≈ {stepsKcal(s.count, me.weightKg)} kcal
        </p>
      </div>

      {isToday && pedometerSupported() && (
        <div className="inset">
          <h3>📱 Schrittzähler</h3>
          <p className="muted small">
            Zählt mit dem Bewegungssensor, solange Arta geöffnet ist. Das Display bleibt dafür an – nimm das Handy einfach in die Hand oder in die Jackentasche.
          </p>
          <button className={cls('btn block', pedo.running ? 'soft' : 'primary')} onClick={() => (pedo.running ? stopPedometer() : void startPedometer())}>
            {pedo.running ? `⏸ Stoppen · ${formatSteps(pedo.session)} gezählt` : '▶ Jetzt mitzählen'}
          </button>
          {pedo.running && !pedo.sensing && <p className="hint">Warte auf den Bewegungssensor …</p>}
          {pedo.error && <p className="hint">{pedo.error}</p>}
        </div>
      )}

      <div className="inset">
        <h3>✏️ Eintragen</h3>
        <p className="muted small">
          {isToday && health && !health.broken
            ? 'Mit Apple Health verbunden: Der nächste Stand aus Health ersetzt deine Zahl wieder. Nur was du unten von Hand dazuzählst, bleibt obendrauf.'
            : 'Am genauesten: die Zahl aus der Health-App (iPhone), Google Fit oder Samsung Health übernehmen. Die zählen den ganzen Tag, auch wenn Arta zu ist.'}
        </p>
        <div className="add-form">
          <input
            inputMode="numeric"
            placeholder={`Schritte ${isToday ? 'heute' : 'an dem Tag'}, z. B. 8432`}
            value={text}
            onChange={(e) => setText(e.target.value.replace(/[^\d.]/g, ''))}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            aria-label="Schritte insgesamt"
          />
          <button className="btn primary" onClick={save} disabled={!valid} aria-label="Übernehmen">
            ✓
          </button>
        </div>
        {text.trim() !== '' && !valid && <p className="hint">Höchstens {formatSteps(MAX_STEPS)} Schritte.</p>}
        <p className="muted small">Spaziergang ohne Handy? Einfach dazuzählen:</p>
        <div className="btn-row">
          {[500, 1000, 2500].map((n) => (
            <button key={n} className="btn soft small" onClick={() => addMySteps(date, n)}>
              +{formatSteps(n)}
            </button>
          ))}
        </div>
      </div>

      <div className="inset">
        <h3>🎯 Mein Tagesziel</h3>
        <Chips
          value={String(me.stepGoal)}
          onChange={(v) => actions.setStepGoal(Number(v))}
          options={STEP_GOALS.map((g) => [String(g), formatSteps(g)] as [string, string])}
        />
        <p className="muted small">Jeder Tag mit erreichtem Ziel bringt euch 5 Herzpunkte. 💗</p>
      </div>

      <HealthLink steps={s} />

      <details className="steps-why">
        <summary>Warum kann Arta nicht selbst in Apple Health schauen?</summary>
        <p className="muted small">
          Arta ist eine Web-App. Browser lassen Web-Apps weder an Apple Health noch an Google Fit, und den Bewegungssensor gibt es nur, solange die App offen und
          das Display an ist. Deshalb der Umweg über einen Kurzbefehl: Der darf Apple Health lesen und schickt die Zahl an Arta, auch wenn Arta zu ist.
        </p>
      </details>
    </Sheet>
  );
}

/** Kleine Einblendung, wenn der Partner sein Schrittziel schafft. */
export function useStepMoments(onboarded: boolean) {
  const data = useData();
  const device = useDevice();
  const health = useHealth();
  const seen = useRef<{ key: string; count: number } | null>(null);
  useEffect(() => {
    if (!onboarded) return;
    const partnerId = other(device.me);
    const today = todayKey();
    const s = withHealth(stepsOn(data, today, partnerId), partnerId);
    const key = `${today}-${partnerId}`;
    const prev = seen.current;
    seen.current = { key, count: s.count };
    // Beim Öffnen der App (oder nach Mitternacht) nur merken, nicht feiern.
    if (!prev || prev.key !== key || !goalReached(prev.count, s.count, s.goal)) return;
    const d = getData();
    const names = { me: d.persons[getDevice().me].name, partner: d.persons[partnerId].name };
    showLove({
      emoji: '👣',
      title: `${names.partner} hat ${formatSteps(s.goal)} Schritte geschafft!`,
      text: fill(pickRandom(PARTNER_STEP_GOAL), names),
      tone: 'party',
    });
  }, [onboarded, data.steps, device.me, data, health]);
}

/** Hinweis im Schritte-Fenster: Apple Health verbunden (und was zur Health-Zahl dazukommt) – oder wie man es verbindet. */
function HealthLink({ steps }: { steps: DaySteps }) {
  const device = useDevice();
  const health = useHealth()[device.me];
  const { date } = steps;
  const extra = steps.extra ?? 0;
  const since = health?.date === date && health.at === steps.healthAt ? steps.count - health.count - extra : 0;
  const added = [since > 0 && `+${formatSteps(since)} seitdem in Arta gezählt`, extra > 0 && `+${formatSteps(extra)} von Hand`].filter(Boolean);
  return (
    <div className="inset">
      <h3>🍎 Automatisch aus Apple Health</h3>
      {health?.broken ? (
        <p className="muted small">⚠️ Dein Kurzbefehl schickt keine Schrittzahl mit – schau in die Anleitung, Schritt 4.</p>
      ) : health ? (
        <p className="muted small">
          ✅ Verbunden – zuletzt {formatSteps(health.count)} Schritte ({relativeDay(health.date)}, {formatTime(health.at)} Uhr).
          {health.date !== date && ' Für diesen Tag kam noch nichts an.'}
          {added.length > 0 && ` Dazu: ${added.join(' · ')}.`}
        </p>
      ) : (
        <p className="muted small">iPhone: Ein Kurzbefehl schickt deine Schritte aus Apple Health an Arta – auch wenn Arta zu ist. Einmal 5 Minuten einrichten, danach läuft es von allein.</p>
      )}
      <button className="btn soft block" onClick={() => nav.open({ type: 'health' })}>
        {health ? 'Anleitung ansehen' : '🍎 Apple Health verbinden'}
      </button>
    </div>
  );
}
