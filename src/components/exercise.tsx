import { useState, type MouseEvent } from 'react';
import {
  EXERCISE_BY_ID,
  LEVEL_LABEL,
  MUSCLE_BY_ID,
  MUSCLES,
  PLACE_LABEL,
  REGION_LABEL,
  type BodyRegion,
  type Exercise,
  type Muscle,
} from '../data/exercises';
import { celebrateDone } from '../lib/celebrate';
import { addDays, formatShort, relativeDay, startOfWeek, todayKey } from '../lib/date';
import { cls, usePeople } from '../lib/hooks';
import { heartBurst, showLove } from '../lib/love';
import { exerciseKcal } from '../lib/nutrition';
import { musclesThisWeek, SLOT_LABEL, SLOT_ORDER } from '../lib/stats';
import { actions, useData, type Who } from '../lib/store';
import type { PlanItem, Slot } from '../lib/types';
import { nav } from '../lib/ui';
import { Segmented, Sheet } from './ui';
import { Timer } from './Timer';

export function ExerciseCard({ ex, date, planned }: { ex: Exercise; date: string; planned: boolean }) {
  const { me } = usePeople();
  return (
    <div className="ex-card">
      <button className="ex-main" onClick={() => nav.open({ type: 'exercise', id: ex.id, date })}>
        <span className="ex-emoji">{ex.emoji}</span>
        <span className="ex-info">
          <b>{ex.name}</b>
          <span className="muted">
            {ex.amount}
            {!ex.amount.includes('Min') && ` · ${ex.minutes} Min`} · ~{exerciseKcal(ex, me.weightKg)} kcal
          </span>
          <span className="ex-tags">
            <span className={cls('tag', `cat-${ex.category}`)}>{ex.category}</span>
            <span className="level" aria-label={LEVEL_LABEL[ex.level]}>
              {'●'.repeat(ex.level)}
              <span className="level-off">{'●'.repeat(3 - ex.level)}</span>
            </span>
            {ex.outdoor && <span className="tag">🌳 draußen</span>}
          </span>
        </span>
      </button>
      <button
        className={cls('add-btn', planned && 'planned')}
        onClick={() => nav.open({ type: 'exercise', id: ex.id, date, planFirst: true })}
        aria-label={planned ? 'Bereits eingeplant – nochmal einplanen' : 'Einplanen'}
      >
        {planned ? '✓' : '+'}
      </button>
    </div>
  );
}

export function PlanRow({ item, editable }: { item: PlanItem; editable: boolean }) {
  const data = useData();
  const ex = EXERCISE_BY_ID[item.exerciseId];
  const creator = data.persons[item.createdBy];
  const toggle = (e: MouseEvent<HTMLButtonElement>) => {
    if (!editable) return;
    const done = !item.done;
    actions.setPlanDone(item.id, done);
    if (done) {
      heartBurst(e, '💪', 6);
      heartBurst(e, '❤️', 4);
      celebrateDone(item.id);
    }
  };
  return (
    <div className={cls('plan-row', item.done && 'done')}>
      <button className="check" onClick={toggle} disabled={!editable} aria-label={item.done ? 'Als offen markieren' : 'Als erledigt markieren'}>
        {item.done ? '✓' : ''}
      </button>
      <button className="plan-info" onClick={() => nav.open({ type: 'exercise', id: ex.id, date: item.date })}>
        <b>
          {ex.emoji} {ex.name}
        </b>
        <span className="muted">
          {SLOT_LABEL[item.slot].emoji} {item.time ?? SLOT_LABEL[item.slot].label} · {ex.amount}
          {item.groupId && ' · 💑 zusammen'}
          {item.createdBy !== item.personId && ` · von ${creator.name} eingeplant 💌`}
        </span>
      </button>
      {editable && (
        <button className="icon-btn small ghost" onClick={() => actions.removePlan(item.id)} aria-label="Aus dem Plan entfernen">
          ✕
        </button>
      )}
    </div>
  );
}

const REGIONS: BodyRegion[] = ['oben', 'mitte', 'unten'];

/** Welche Muskelgruppen diese Woche schon dran waren – offene führen zu passenden Übungen. */
export function MuscleCheck({ date, onFind }: { date: string; onFind: (m: Muscle) => void }) {
  const data = useData();
  const { me } = usePeople();
  const hits = musclesThisWeek(data, date, me.id);
  const count = MUSCLES.filter((m) => hits.has(m.id)).length;
  const week = startOfWeek(date);
  const weekLabel = week === startOfWeek(todayKey()) ? 'diese Woche' : `Woche ab ${formatShort(week)}`;
  return (
    <div className="card muscle-check">
      <div className="card-head">
        <h2>🗺️ Muskel-Check</h2>
        <span className="muted small">
          {count}/{MUSCLES.length} · {weekLabel}
        </span>
      </div>
      {REGIONS.map((r) => (
        <div key={r} className="muscle-region">
          <span className="muscle-region-label">
            {REGION_LABEL[r].emoji} {REGION_LABEL[r].label}
          </span>
          <div className="muscle-chips">
            {MUSCLES.filter((m) => m.region === r).map((m) => {
              const n = hits.get(m.id) ?? 0;
              return (
                <button key={m.id} className={cls('muscle-chip', n > 0 && 'hit')} onClick={() => onFind(m.id)}>
                  {n > 0 && '✓ '}
                  {m.label}
                  {n > 1 && <small> ×{n}</small>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <p className="hint">
        {count === MUSCLES.length
          ? 'Ganzkörper-Woche geschafft – jede Muskelgruppe war dran! 🏆'
          : 'Zählt deine erledigten Einheiten von Montag bis Sonntag. Tipp auf eine Muskelgruppe, um passende Übungen zu finden.'}
      </p>
    </div>
  );
}

function guessSlot(): Slot {
  const h = new Date().getHours();
  return h < 11 ? 'morgens' : h < 16 ? 'mittags' : 'abends';
}

function PlanForm({ ex, defaultDate, onDone }: { ex: Exercise; defaultDate: string; onDone: () => void }) {
  const { me, partner } = usePeople();
  const [who, setWho] = useState<Who>(ex.place === 'zusammen' ? 'both' : 'me');
  const [slot, setSlot] = useState<Slot>(guessSlot);
  const [time, setTime] = useState('');
  const today = todayKey();
  const [date, setDate] = useState(defaultDate < today ? today : defaultDate);
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));

  const submit = () => {
    actions.addPlan({ date, exerciseId: ex.id, slot, time, who });
    const text =
      who === 'partner'
        ? `Für ${partner.name} eingeplant – eine kleine Challenge mit Liebe! 😜`
        : who === 'both'
          ? 'Gemeinsam eingeplant! Zusammen macht’s doppelt Spaß. 💞'
          : 'Eingeplant! Du schaffst das. 💪';
    showLove({ emoji: '📅', title: `${ex.name} · ${relativeDay(date)}`, text, tone: 'sport' });
    onDone();
  };

  return (
    <div className="inset plan-form">
      <h3>📅 Einplanen</h3>
      <label className="field-label">Für wen?</label>
      <Segmented
        value={who}
        onChange={setWho}
        options={[
          ['me', `${me.emoji} Mich`],
          ['partner', `${partner.emoji} ${partner.name}`],
          ['both', '💑 Uns beide'],
        ]}
      />
      <label className="field-label">Wann?</label>
      <Segmented value={slot} onChange={setSlot} options={SLOT_ORDER.map((s) => [s, `${SLOT_LABEL[s].emoji} ${SLOT_LABEL[s].label}`])} />
      <div className="field-row">
        <label className="field">
          <span className="field-label">Tag</span>
          <select value={date} onChange={(e) => setDate(e.target.value)}>
            {days.map((d) => (
              <option key={d} value={d}>
                {relativeDay(d, today)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Uhrzeit (optional)</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
      </div>
      <button className="btn primary block" onClick={submit}>
        Einplanen
      </button>
    </div>
  );
}

export function ExerciseSheet({ id, date, planFirst, onClose }: { id: string; date?: string; planFirst?: boolean; onClose: () => void }) {
  const ex = EXERCISE_BY_ID[id];
  const { me, partner } = usePeople();
  if (!ex) return null;
  const form = <PlanForm ex={ex} defaultDate={date ?? todayKey()} onDone={onClose} />;
  return (
    <Sheet title={`${ex.emoji} ${ex.name}`} onClose={onClose}>
      <div className="badges">
        <span className="badge">
          {PLACE_LABEL[ex.place].emoji} {PLACE_LABEL[ex.place].label}
        </span>
        <span className={cls('badge', `cat-${ex.category}`)}>{ex.category}</span>
        <span className="badge">{LEVEL_LABEL[ex.level]}</span>
        {ex.outdoor && <span className="badge">🌳 draußen</span>}
      </div>
      <p className="lead">{ex.description}</p>
      <div className="facts">
        <div>
          <b>{ex.amount}</b>
          <span>Umfang</span>
        </div>
        <div>
          <b>{ex.minutes} Min</b>
          <span>Dauer</span>
        </div>
        <div>
          <b>~{exerciseKcal(ex, me.weightKg)}</b>
          <span>kcal {me.name}</span>
        </div>
        <div>
          <b>~{exerciseKcal(ex, partner.weightKg)}</b>
          <span>kcal {partner.name}</span>
        </div>
      </div>
      {ex.muscles.length > 0 && (
        <>
          <h3>{ex.category === 'Mobilität' ? '🧘 Das lockerst du' : '💪 Das trainierst du'}</h3>
          <div className="badges">
            {ex.muscles.map((m, i) => (
              <span key={m} className={cls('badge', i === 0 && 'muscle-main')}>
                {MUSCLE_BY_ID[m].label}
              </span>
            ))}
          </div>
        </>
      )}
      {planFirst && form}
      <h3>So geht’s</h3>
      <ol className="steps">
        {ex.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      {ex.tip && <p className="tip">💡 {ex.tip}</p>}
      {ex.timer && (
        <>
          <h3>⏱️ Timer</h3>
          <Timer seconds={ex.timer} />
        </>
      )}
      {!planFirst && form}
    </Sheet>
  );
}
