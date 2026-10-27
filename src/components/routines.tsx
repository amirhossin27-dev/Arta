import { useEffect, useState, type MouseEvent } from 'react';
import {
  HEALTH_DISCLAIMER,
  HEALTH_TIPS,
  PRESET_BY_ID,
  ROUTINE_EMOJIS,
  ROUTINE_NUDGES,
  ROUTINE_PRESETS,
  ROUTINE_REMINDERS,
  ROUTINES_ALL_DONE,
  TIP_CATEGORIES,
  type HealthTip,
  type TipCategory,
} from '../data/health';
import { todayKey } from '../lib/date';
import { cls, usePeople, useToday } from '../lib/hooks';
import { openIcs, useRelayCalendar } from '../lib/ics';
import { heartBurst, showLove } from '../lib/love';
import { notifyActive, showLocal } from '../lib/notify';
import { pickRandom } from '../lib/random';
import {
  allDone,
  clockTime,
  dailyTip,
  dueRoutines,
  fillRoutine,
  icsFileName,
  markReminded,
  MAX_ROUTINES,
  remindedOn,
  routineIcs,
  routineLabel,
  routineStatus,
  slotOf,
  validTime,
} from '../lib/routines';
import { SLOT_LABEL } from '../lib/stats';
import { actions, getData, getDevice, useData } from '../lib/store';
import { other, type Person, type Routine } from '../lib/types';
import { nav, type SheetState } from '../lib/ui';
import { Chips, Segmented, Sheet } from './ui';

const timeLabel = (r: { time: string }) => `${SLOT_LABEL[slotOf(r.time)].emoji} ${r.time}`;

function names() {
  const d = getData();
  const me = getDevice().me;
  return { me: d.persons[me].name, partner: d.persons[other(me)].name };
}

function addPreset(id: string, e?: MouseEvent) {
  const p = PRESET_BY_ID[id];
  if (!p) return;
  const added = actions.addRoutine({ id: p.id, emoji: p.emoji, name: p.name, time: p.time, remind: true });
  if (!added) {
    showLove({ emoji: '🌿', text: `Mehr als ${MAX_ROUTINES} Routinen werden unübersichtlich – nimm vorher eine raus.`, tone: 'info' });
    return;
  }
  // Ist die Uhrzeit heute schon vorbei, nicht sofort daran erinnern.
  if (p.time <= clockTime()) markReminded(todayKey(), [added]);
  if (e) heartBurst(e, p.emoji, 5);
  showLove({ emoji: p.emoji, title: `${p.name} ist jetzt deine Routine`, text: `Arta erinnert dich täglich um ${p.time}. 💚`, tone: 'food' });
}

function toggleRoutine(r: Routine, date: string, done: boolean, e: MouseEvent) {
  actions.setRoutineDone(date, r.id, done);
  if (!done) return;
  heartBurst(e, '💚', 6);
  const d = getData();
  if (allDone(routineStatus(d, date, getDevice().me))) {
    showLove({ emoji: '🌿', title: 'Alle Routinen geschafft!', text: fillRoutine(pickRandom(ROUTINES_ALL_DONE), r, names()), tone: 'party' });
  }
}

// ───── Heute-Karte ─────

function RoutineRow({ r, done, date }: { r: Routine; done: boolean; date: string }) {
  return (
    <div className={cls('plan-row routine-row', done && 'done')}>
      <button className="check" onClick={(e) => toggleRoutine(r, date, !done, e)} aria-label={done ? `${r.name} wieder öffnen` : `${r.name} abhaken`}>
        {done ? '✓' : ''}
      </button>
      <button className="plan-info" onClick={(e) => toggleRoutine(r, date, !done, e)}>
        <b>{routineLabel(r)}</b>
        <span className="muted">
          {timeLabel(r)}
          {r.remind ? ' · 🔔' : ''}
        </span>
      </button>
    </div>
  );
}

function PartnerRoutines({ partner, date }: { partner: Person; date: string }) {
  const data = useData();
  const s = routineStatus(data, date, partner.id);
  const [nudged, setNudged] = useState<Set<string>>(new Set());
  if (!s.routines.length) return null;
  const nudge = (r: Routine, e: MouseEvent) => {
    actions.sendNote(fillRoutine(pickRandom(ROUTINE_NUDGES), r, names()), { kind: 'cheer' });
    setNudged((n) => new Set(n).add(r.id));
    heartBurst(e, '💌', 6);
    showLove({ emoji: '💌', title: `Erinnerung an ${partner.name} geschickt`, text: `${routineLabel(r)} – mit ganz viel Liebe.`, tone: 'love' });
  };
  return (
    <div className="routine-partner">
      <p className="routine-partner-head">
        <span>
          {partner.emoji} {partner.name}
        </span>
        <span className="muted small">{allDone(s) ? '🎉 alles geschafft' : `${s.done.size}/${s.routines.length} erledigt`}</span>
      </p>
      <div className="routine-chips">
        {s.routines.map((r) =>
          s.done.has(r.id) ? (
            <span key={r.id} className="routine-chip done">
              ✓ {routineLabel(r)}
            </span>
          ) : nudged.has(r.id) ? (
            <span key={r.id} className="routine-chip">
              {routineLabel(r)} · 💌 erinnert
            </span>
          ) : (
            <button key={r.id} className="routine-chip open" onClick={(e) => nudge(r, e)} aria-label={`${partner.name} an ${r.name} erinnern`}>
              {routineLabel(r)} · 💌
            </button>
          ),
        )}
      </div>
      {!allDone(s) && <p className="hint">Tipp auf eine offene Routine, um {partner.name} liebevoll zu erinnern.</p>}
    </div>
  );
}

function TipBody({ tip, mine }: { tip: HealthTip; mine: Routine[] }) {
  const preset = tip.routine ? PRESET_BY_ID[tip.routine] : undefined;
  const has = preset && mine.some((r) => r.id === preset.id);
  return (
    <>
      <b className="health-tip-title">{tip.title}</b>
      <p className="health-tip-text">{tip.text}</p>
      {preset &&
        (has ? (
          <span className="health-tip-has">✓ {preset.emoji} Schon in deinen Routinen</span>
        ) : (
          <button className="btn soft small" onClick={(e) => addPreset(preset.id, e)}>
            + {preset.emoji} Als tägliche Routine
          </button>
        ))}
    </>
  );
}

/** „🌿 Gesundheit“ unter Heute: Tipp des Tages, eigene Routinen zum Abhaken und die vom Schatz. */
export function HealthCard() {
  const data = useData();
  const today = useToday();
  const { me, partner } = usePeople();
  const [offset, setOffset] = useState(0);
  const tip = dailyTip(today, offset);
  const mine = routineStatus(data, today, me.id);
  return (
    <div className="card health-card">
      <div className="card-head">
        <h2>🌿 Gesundheit</h2>
        <button className="link" onClick={() => nav.open({ type: 'gesund' })}>
          Routinen & Tipps
        </button>
      </div>

      <div className="health-tip">
        <span className="health-tip-emoji" aria-hidden="true">
          {tip.emoji}
        </span>
        <div className="health-tip-body">
          <p className="eyebrow">{offset ? 'Noch ein Tipp' : 'Tipp des Tages'}</p>
          <TipBody tip={tip} mine={mine.routines} />
        </div>
        <button className="icon-btn small health-tip-next" onClick={() => setOffset((o) => o + 1)} aria-label="Noch ein Tipp">
          🔀
        </button>
      </div>

      <div className="routine-head">
        <h3>Meine Routinen</h3>
        {mine.routines.length > 0 && (
          <span className={cls('routine-count', allDone(mine) && 'all')}>
            {mine.done.size}/{mine.routines.length}
          </span>
        )}
      </div>
      {mine.routines.length === 0 ? (
        <div className="empty small">
          <p>Kleine tägliche Dinge nur für dich – z. B. ☀️ Vitamin D zum Frühstück oder 🌿 Schwarzkümmelöl am Abend. Arta erinnert dich daran.</p>
          <div className="routine-chips">
            {['vitamin-d', 'schwarzkuemmel', 'vitamine', 'wasser'].map((id) => (
              <button key={id} className="routine-chip open" onClick={(e) => addPreset(id, e)}>
                + {routineLabel(PRESET_BY_ID[id])}
              </button>
            ))}
            <button className="routine-chip" onClick={() => nav.open({ type: 'gesund' })}>
              Mehr …
            </button>
          </div>
        </div>
      ) : (
        mine.routines.map((r) => <RoutineRow key={r.id} r={r} done={mine.done.has(r.id)} date={today} />)
      )}

      <PartnerRoutines partner={partner} date={today} />
    </div>
  );
}

// ───── Kalender ─────

type CalendarRoute = 'relay' | 'file';

/**
 * Kann das Push-Relay einen Kalendertermin als echte Antwort ausliefern? Dann öffnet sich auf dem
 * iPhone „Zum Kalender hinzufügen“ – Dateien aus der App heraus landen dort sonst nur im Download.
 */
function useCalendarRoute(): CalendarRoute {
  return useRelayCalendar() ? 'relay' : 'file';
}

/** Muss direkt aus dem Antippen heraus laufen, sonst blockiert Safari das neue Fenster. */
function openCalendar(r: Routine, route: CalendarRoute) {
  const d = getData();
  const me = getDevice().me;
  const url = new URL('./#tab=heute', window.location.href).href;
  const ics = routineIcs(r, me, todayKey(), url);
  openIcs(ics, icsFileName(r).replace(/\.ics$/, ''));
  const how = route === 'relay' ? 'Tippe auf „Hinzufügen“' : 'Öffne die geladene Datei und tippe auf „Hinzufügen“';
  showLove({
    emoji: '📅',
    title: 'Ab in den Kalender',
    text: `${how} – dann erinnert dich dein Handy jeden Tag um ${r.time} an ${routineLabel(r)}, ${d.persons[me].name}. 💚`,
    tone: 'info',
    duration: 6500,
  });
}

// ───── Sheet ─────

function RoutineEditor({ r, route }: { r: Routine; route: CalendarRoute }) {
  const [confirm, setConfirm] = useState(false);
  const preset = PRESET_BY_ID[r.id];
  return (
    <div className="inset routine-edit">
      <div className="routine-edit-head">
        <b className="grow">{routineLabel(r)}</b>
        {confirm ? (
          <>
            <button className="btn ghost small" onClick={() => setConfirm(false)}>
              Behalten
            </button>
            <button className="btn danger small" onClick={() => actions.removeRoutine(r.id)}>
              Entfernen
            </button>
          </>
        ) : (
          <>
            <button
              className={cls('icon-btn small routine-bell', r.remind && 'on')}
              onClick={() => actions.updateRoutine(r.id, { remind: !r.remind })}
              aria-pressed={r.remind}
              aria-label={r.remind ? 'Erinnerung ausschalten' : 'Erinnerung einschalten'}
            >
              {r.remind ? '🔔' : '🔕'}
            </button>
            <button className="icon-btn small ghost" onClick={() => setConfirm(true)} aria-label={`${r.name} entfernen`}>
              ✕
            </button>
          </>
        )}
      </div>
      {preset && <p className="muted small">{preset.hint}</p>}
      <div className="routine-edit-row">
        <input
          type="time"
          aria-label="Uhrzeit"
          value={r.time}
          onChange={(e) => {
            if (!validTime(e.target.value)) return;
            actions.updateRoutine(r.id, { time: e.target.value });
            if (e.target.value <= clockTime()) markReminded(todayKey(), [r.id]);
          }}
        />
        <button className="btn soft small" onClick={() => openCalendar(r, route)}>
          📅 In den Kalender
        </button>
      </div>
      <span className="routine-edit-status">{r.remind ? `🔔 Arta erinnert dich täglich um ${r.time}.` : '🔕 Keine Erinnerung – nur zum Abhaken.'}</span>
    </div>
  );
}

function CustomRoutine() {
  const [emoji, setEmoji] = useState(ROUTINE_EMOJIS[0]);
  const [name, setName] = useState('');
  const [time, setTime] = useState('20:00');
  const add = (e: MouseEvent) => {
    if (!name.trim() || !validTime(time)) return;
    const id = actions.addRoutine({ emoji, name, time, remind: true });
    if (!id) return;
    if (time <= clockTime()) markReminded(todayKey(), [id]);
    heartBurst(e, emoji, 5);
    setName('');
  };
  return (
    <div className="inset">
      <h3>✏️ Eigene Routine</h3>
      <div className="routine-emojis" role="radiogroup" aria-label="Symbol">
        {ROUTINE_EMOJIS.map((x) => (
          <button key={x} className={cls('routine-emoji', x === emoji && 'active')} onClick={() => setEmoji(x)} role="radio" aria-checked={x === emoji}>
            {x}
          </button>
        ))}
      </div>
      <div className="routine-edit-row">
        <label className="field grow">
          <span className="field-label">Was?</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Eisen, Zink, Augentropfen" maxLength={40} />
        </label>
        <label className="field">
          <span className="field-label">Uhrzeit</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
      </div>
      <button className="btn primary block" onClick={add} disabled={!name.trim() || !validTime(time)}>
        Hinzufügen
      </button>
    </div>
  );
}

function RoutinesView() {
  const data = useData();
  const { me, partner } = usePeople();
  const route = useCalendarRoute();
  const mine = routineStatus(data, todayKey(), me.id).routines;
  const open = ROUTINE_PRESETS.filter((p) => !mine.some((r) => r.id === p.id));
  return (
    <>
      <p className="muted">Deine täglichen kleinen Dinge für dich. Abhaken kannst du sie unter 🏠 Heute – {partner.name} sieht, was du geschafft hast, und kann dich liebevoll erinnern.</p>
      {mine.map((r) => (
        <RoutineEditor key={r.id} r={r} route={route} />
      ))}
      {open.length > 0 && mine.length < MAX_ROUTINES && (
        <>
          <h3>Vorschläge</h3>
          <div className="routine-presets">
            {open.map((p) => (
              <button key={p.id} className="routine-preset" onClick={(e) => addPreset(p.id, e)}>
                <span className="routine-preset-emoji">{p.emoji}</span>
                <span className="grow">
                  <b>{p.name}</b>
                  <span className="muted small">{timeLabel(p)}</span>
                </span>
                <span className="routine-preset-add" aria-hidden="true">+</span>
              </button>
            ))}
          </div>
        </>
      )}
      {mine.length < MAX_ROUTINES && <CustomRoutine />}
      <div className="notice info small">
        <b>So erinnert dich Arta</b>
        <span>🔔 Zur Uhrzeit kommt eine kleine Einblendung, sobald Arta offen ist – und eine Mitteilung, solange Arta im Hintergrund läuft ({notifyActive() ? 'Mitteilungen sind an' : 'Mitteilungen in ⚙️ Einstellungen einschalten'}).</span>
        <span>📅 Damit sich dein Handy auch bei geschlossener App meldet: „Kalender“ legt einen täglichen Termin mit Hinweis an.</span>
      </div>
    </>
  );
}

function TipsView() {
  const data = useData();
  const { me } = usePeople();
  const [cat, setCat] = useState<TipCategory | 'alle'>('alle');
  const mine = routineStatus(data, todayKey(), me.id).routines;
  const tips = cat === 'alle' ? HEALTH_TIPS : HEALTH_TIPS.filter((t) => t.category === cat);
  return (
    <>
      <div className="health-filter">
        <Chips value={cat} onChange={setCat} options={[['alle', '✨ Alle'], ...TIP_CATEGORIES.map((c): [TipCategory, string] => [c.id, `${c.emoji} ${c.label}`])]} />
      </div>
      <div className="health-tips">
        {tips.map((t) => (
          <div key={t.id} className="health-tip">
            <span className="health-tip-emoji" aria-hidden="true">
              {t.emoji}
            </span>
            <div className="health-tip-body">
              <TipBody tip={t} mine={mine} />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

type GesundView = NonNullable<Extract<SheetState, { type: 'gesund' }>['view']>;

export function GesundSheet({ view: initial = 'routinen', onClose }: { view?: GesundView; onClose: () => void }) {
  const [view, setView] = useState<GesundView>(initial);
  return (
    <Sheet title="🌿 Gesundheit" onClose={onClose}>
      <Segmented
        value={view}
        onChange={setView}
        options={[
          ['routinen', '💚 Meine Routinen'],
          ['tipps', '💡 Tipps'],
        ]}
      />
      {view === 'routinen' ? <RoutinesView /> : <TipsView />}
      <p className="health-disclaimer">⚕️ {HEALTH_DISCLAIMER}</p>
    </Sheet>
  );
}

// ───── Erinnerungen ─────

/** Während eines Spiels stören wir nicht – die Erinnerung kommt danach. */
const playing = () => !!document.querySelector('.game-screen');

/** Erinnert zur Uhrzeit an offene Routinen: als Einblendung oder – im Hintergrund – als Mitteilung. */
export function useRoutineReminders(onboarded: boolean) {
  useEffect(() => {
    if (!onboarded) return;
    const check = () => {
      const today = todayKey();
      const me = getDevice().me;
      const due = dueRoutines(routineStatus(getData(), today, me), clockTime(), remindedOn(today));
      if (!due.length) return;
      const hidden = document.visibilityState === 'hidden';
      // Im Hintergrund ohne Mitteilungen: beim Zurückkommen erinnern.
      if (hidden ? !notifyActive() : playing()) return;
      markReminded(
        today,
        due.map((r) => r.id),
      );
      const n = names();
      const one = due.length === 1;
      if (hidden) {
        void showLocal({
          title: one ? `${routineLabel(due[0])} 💚` : 'Deine Routinen warten 💚',
          body: one ? fillRoutine(pickRandom(ROUTINE_REMINDERS), due[0], n) : due.map(routineLabel).join(' · '),
          tag: `routine-${today}`,
          tab: 'heute',
        });
        return;
      }
      showLove({
        emoji: due[0].emoji,
        title: one ? 'Kleine Erinnerung für dich' : 'Zeit für deine Routinen',
        text: one ? fillRoutine(pickRandom(ROUTINE_REMINDERS), due[0], n) : `${due.map(routineLabel).join(' · ')} – abhaken unter 🏠 Heute. 💚`,
        tone: 'food',
        duration: 6000,
      });
    };
    const first = window.setTimeout(check, 3000);
    const id = window.setInterval(check, 30_000);
    document.addEventListener('visibilitychange', check);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', check);
    };
  }, [onboarded]);
}
