import { useState, type MouseEvent } from 'react';
import {
  BABY_SIZES,
  CHANCE_LABEL,
  CYCLE_DISCLAIMER,
  CYCLE_FACTS,
  FERTILITY_LABEL,
  FLOWS,
  INFO_TOPICS,
  LOVE_LOGGED,
  LOVE_LOGGED_FERTILE,
  PHASES,
  SYMPTOM_BY_ID,
  SYMPTOMS,
  TESTS,
  TTC_STAGES,
} from '../data/cycle';
import { ProgressRing, Segmented, Stepper } from '../components/ui';
import {
  cycleDayEntry,
  dayInfo,
  DEFAULT_CYCLE,
  DEFAULT_PERIOD,
  dueDate,
  fillCycle,
  getCycle,
  loveDaysBetween,
  loveHistory,
  loveOn,
  MAX_LOVE,
  MERGE_DAYS,
  periodAt,
  periodEnd,
  phaseSegments,
  pregnancyWeek,
  ttcStatus,
  type Cycle as CycleData,
  type Fertility,
  type TtcStatus,
} from '../lib/cycle';
import { addDays, diffDays, formatDate, formatLong, formatShort, fromKey, relativeDay, toKey, weekdayShort } from '../lib/date';
import { cls, useToday } from '../lib/hooks';
import { heartBurst, showLove } from '../lib/love';
import { pickRandom, pickSeeded, seededShuffle } from '../lib/random';
import { actions, getData, useData, useDevice } from '../lib/store';
import { other, type Flow, type PersonId, type TestResult } from '../lib/types';
import { nav } from '../lib/ui';

const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const WEEK_HEAD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

/** Namen aus Sicht dieses Handys: Person mit Zyklus und ihr Gegenüber. */
function useCycleNames(c: CycleData) {
  const data = useData();
  const device = useDevice();
  const owner = data.persons[c.owner];
  const partner = data.persons[other(c.owner)];
  const isOwner = device.me === c.owner;
  return { owner, partner, isOwner, names: { name: owner.name, partner: partner.name } };
}

function inDays(n: number): string {
  if (n === 0) return 'heute';
  if (n === 1) return 'morgen';
  return `in ${n} Tagen`;
}

/** Fruchtbarkeit – im Kinderwunsch-Modus als Chance formuliert. */
function chanceText(f: Fertility, ttc?: boolean) {
  return ttc ? CHANCE_LABEL[f] : { ...FERTILITY_LABEL[f], label: `Fruchtbarkeit ${FERTILITY_LABEL[f].label}` };
}

function setLove(e: MouseEvent, c: CycleData, date: string, count: number) {
  const before = loveOn(getData(), date);
  actions.setLoveDay(date, count);
  if (count <= before) return;
  heartBurst(e, '💞', 8);
  if (before > 0) return;
  const f = dayInfo(c, date).fertility;
  const fertile = c.settings.ttc && f && f !== 'niedrig';
  showLove({ emoji: '💞', title: 'Eingetragen', text: pickRandom(fertile ? LOVE_LOGGED_FERTILE : LOVE_LOGGED), tone: 'love' });
}

// ───────────────────────── Einrichten ─────────────────────────

function CycleSetup() {
  const data = useData();
  const device = useDevice();
  const today = useToday();
  const [owner, setOwner] = useState<PersonId>(device.me);
  const [last, setLast] = useState('');
  const [periodLength, setPeriodLength] = useState(DEFAULT_PERIOD);
  const [cycleLength, setCycleLength] = useState(DEFAULT_CYCLE);
  const [ttc, setTtc] = useState(false);
  const ownerName = data.persons[owner].name;

  const start = () => {
    actions.setupCycle({ personId: owner, cycleLength, periodLength, ...(ttc && { ttc, ttcSince: today }) }, last || undefined);
    showLove(
      ttc
        ? { emoji: '🍼', title: 'Kinderwunsch-Kalender ist bereit!', text: 'Arta zeigt euch die besten Tage – der Rest ist Liebe. 💕', tone: 'love', big: true }
        : { emoji: '🌸', title: 'Periodenkalender ist bereit!', text: 'Je mehr ihr eintragt, desto genauer werden die Vorhersagen. 💕', tone: 'love', big: true },
    );
  };

  return (
    <div className="card cycle-setup">
      <div className="cycle-setup-emoji">🌸</div>
      <h2 className="center">Periodenkalender einrichten</h2>
      <p className="muted center">Tragt die Periode ein und Arta zeigt, in welcher Zyklusphase ihr gerade seid, wann die nächste Periode kommt und wann die fruchtbaren Tage sind – mit Tipps für euch beide.</p>

      <div className="inset">
        <span className="field-label">Wessen Zyklus möchtet ihr festhalten?</span>
        <Segmented
          value={owner}
          onChange={setOwner}
          small
          options={(['a', 'b'] as const).map((id) => [id, `${data.persons[id].emoji} ${id === device.me ? 'Meinen' : data.persons[id].name}`])}
        />
        <label className="field">
          <span className="field-label">Erster Tag der letzten Periode</span>
          <input type="date" value={last} max={today} min={addDays(today, -90)} onChange={(e) => setLast(e.target.value)} />
        </label>
        <div className="row-between">
          <span className="field-label">Periode dauert meist</span>
          <Stepper value={periodLength} min={2} max={10} onChange={setPeriodLength} label="Tage" />
        </div>
        <div className="row-between">
          <span className="field-label">Zyklus dauert meist</span>
          <Stepper value={cycleLength} min={20} max={45} onChange={setCycleLength} label="Tage" />
        </div>
        <p className="hint">Nicht sicher? Lasst einfach 28 und 5 Tage stehen – ab zwei eingetragenen Perioden rechnet Arta mit euren echten Werten.</p>
        <label className="toggle-line">
          <input type="checkbox" checked={ttc} onChange={(e) => setTtc(e.target.checked)} />
          🍼 Wir wünschen uns ein Baby – Kinderwunsch-Modus
        </label>
      </div>

      <button className="btn primary block" onClick={start}>
        Kalender starten 🌸
      </button>
      <p className="hint">
        Die Einträge werden über den Paar-Sync zwischen euch geteilt, damit ihr euch gegenseitig unterstützen könnt.
        {owner !== device.me && ` Am besten trägt ${ownerName} selbst ein – ihr könnt aber beide.`}
      </p>
      <p className="notice warn small">⚠️ {CYCLE_DISCLAIMER}</p>
    </div>
  );
}

// ───────────────────────── Überblick ─────────────────────────

function PhaseBar({ c }: { c: CycleData }) {
  const L = c.length;
  const day = c.todayInfo.cycleDay;
  const segments = phaseSegments(L, c.stats.periodLength, c.ovDay);
  const pos = day ? Math.min((day - 0.5) / L, 1) * 100 : undefined;
  return (
    <div className="phase-bar" aria-hidden="true">
      <div className="phase-track">
        {segments.map(([ph, n]) => (
          <span key={ph} className={`phase-seg ph-${ph}`} style={{ flexGrow: n }}>
            {n >= 3 && PHASES[ph].emoji}
          </span>
        ))}
      </div>
      {pos !== undefined && <span className="phase-marker" style={{ left: `${pos}%` }} />}
      <div className="phase-scale">
        <span>Tag 1</span>
        <span>Tag {L}</span>
      </div>
    </div>
  );
}

function CycleHero({ c }: { c: CycleData }) {
  const { isOwner, owner, partner } = useCycleNames(c);
  const t = c.todayInfo;
  const phase = t.phase ? PHASES[t.phase] : undefined;
  const L = c.length;
  const ttc = c.settings.ttc;
  const untilNext = c.next ? diffDays(c.today, c.next) : undefined;
  const open = c.open && diffDays(c.open.start, c.today) <= c.stats.periodLength + 3 ? c.open : undefined;
  const yesterday = addDays(c.today, -1);

  const start = (e: MouseEvent) => {
    actions.startPeriod(c.today);
    heartBurst(e, '🌸', 8);
    showLove(
      isOwner
        ? { emoji: '🌸', title: 'Periode eingetragen', text: `Gönn dir Ruhe und Wärme. ${partner.name} sieht es nach dem Sync und kann dich verwöhnen. 💕`, tone: 'love' }
        : { emoji: '🌸', title: 'Periode eingetragen', text: `Lieb, dass du an ${owner.name} denkst. Wärmflasche schon bereit? 😉`, tone: 'love' },
    );
  };

  const end = (date: string) => {
    if (!open) return;
    actions.endPeriod(open.id, date);
    showLove({ emoji: '🌱', title: 'Periode vorbei!', text: 'Jetzt kommt die Energie langsam zurück. Im Kalender kannst du das Ende jederzeit anpassen.', tone: 'love' });
  };

  return (
    <div className="hero hero-cycle" data-phase={t.phase ?? 'none'} data-deco={phase?.emoji ?? '🌸'}>
      <p className="eyebrow">
        {isOwner ? 'Mein Zyklus' : `Zyklus von ${owner.name}`}
        {ttc && ' · 🍼 Kinderwunsch'}
      </p>
      {!c.last ? (
        <>
          <h1>Wann war die letzte Periode?</h1>
          <p className="hero-sub">Tippe unten im Kalender auf den ersten Tag – oder trag sie hier ein, sobald sie beginnt.</p>
        </>
      ) : (
        <div className="cycle-hero-main">
          <ProgressRing value={Math.min(t.cycleDay ?? 0, L)} max={L} size={112} stroke={11} className="on-hero">
            <span>Tag</span>
            <b>{t.cycleDay}</b>
            <span>von {L}</span>
          </ProgressRing>
          <div className="cycle-hero-text">
            {phase && (
              <h1>
                {phase.emoji} {phase.name}
              </h1>
            )}
            <p className="hero-sub">{phase?.season} · {phase?.short}</p>
          </div>
        </div>
      )}
      {c.last && (
        <div className="hero-meta">
          {c.current ? (
            <span>🩸 Periode · Tag {diffDays(c.current.start, c.today) + 1}</span>
          ) : c.lateBy > 0 ? (
            <span>⏳ {c.lateBy === 1 ? 'Seit 1 Tag' : `Seit ${c.lateBy} Tagen`} überfällig</span>
          ) : (
            untilNext !== undefined && <span>🩸 Periode {inDays(untilNext)}</span>
          )}
          {t.fertility && t.phase !== 'spaet' && (
            <span>
              {chanceText(t.fertility, ttc).emoji} {chanceText(t.fertility, ttc).label}
            </span>
          )}
          {c.fertile && !c.current && diffDays(c.today, c.fertile.ovulation) >= 0 && (
            <span>
              🥚 Eisprung {t.byTest && c.fertile.ovulation === c.ovulation ? 'laut Test' : 'ca.'} {relativeDay(c.fertile.ovulation, c.today)}
            </span>
          )}
        </div>
      )}
      {c.last && <PhaseBar c={c} />}
      <div className="btn-row">
        {open ? (
          <>
            <button className="btn glass small" onClick={() => end(c.today)}>
              ✓ Heute letzter Tag
            </button>
            {yesterday >= open.start && (
              <button className="btn glass small" onClick={() => end(yesterday)}>
                War gestern vorbei
              </button>
            )}
          </>
        ) : (
          !c.current && (
            <button className="btn glass" onClick={start}>
              🩸 Periode hat heute begonnen
            </button>
          )
        )}
      </div>
    </div>
  );
}

// ───────────────────────── Heute: Symptome ─────────────────────────

function DayLog({ c, date, compact }: { c: CycleData; date: string; compact?: boolean }) {
  const data = useData();
  const { isOwner, names } = useCycleNames(c);
  const entry = cycleDayEntry(data, date, c.owner);
  const symptoms = entry?.symptoms ?? [];

  const toggle = (id: string) => {
    actions.logCycleDay(date, { symptoms: symptoms.includes(id) ? symptoms.filter((s) => s !== id) : [...symptoms, id] });
  };
  const setFlow = (flow: Flow) => actions.logCycleDay(date, { flow: entry?.flow === flow ? undefined : flow });
  const setTest = (key: 'lh' | 'hcg', result: TestResult) => {
    const off = entry?.[key] === result;
    actions.logCycleDay(date, { [key]: off ? undefined : result });
    if (off || result !== 'pos') return;
    showLove(
      key === 'lh'
        ? { emoji: '🧪', title: 'Ovulationstest positiv!', text: 'Der Eisprung kommt wahrscheinlich in den nächsten 1–2 Tagen. Heute und die nächsten 2 Tage sind eure besten Tage. 💞', tone: 'love', big: true }
        : { emoji: '🤰', title: 'Positiver Test!', text: 'Herzlichen Glückwunsch, ihr zwei! 🎉 Vereinbart bald einen Termin bei der Frauenärztin.', tone: 'party', big: true },
    );
  };

  return (
    <div className="day-log">
      <span className="field-label">Blutung</span>
      <div className="chips">
        {FLOWS.map((f) => (
          <button key={f.id} className={cls('chip', entry?.flow === f.id && 'active')} onClick={() => setFlow(f.id)}>
            {f.emoji} {f.label}
          </button>
        ))}
      </div>
      <span className="field-label">{isOwner ? 'Wie fühlst du dich?' : `Wie fühlt sich ${names.name}?`}</span>
      <div className="chips">
        {SYMPTOMS.map((s) => (
          <button key={s.id} className={cls('chip', symptoms.includes(s.id) && 'active')} onClick={() => toggle(s.id)}>
            {s.emoji} {s.label}
          </button>
        ))}
      </div>
      {c.settings.ttc && (
        <>
          <span className="field-label">Tests</span>
          <div className="chips">
            {TESTS.flatMap((t) =>
              (['neg', 'pos'] as const).map((r) => (
                <button key={t.key + r} className={cls('chip', entry?.[t.key] === r && 'active', r === 'pos' && 'chip-pos')} onClick={() => setTest(t.key, r)}>
                  {t.emoji} {t.label} {r === 'pos' ? '＋' : '−'}
                </button>
              )),
            )}
          </div>
        </>
      )}
      {!compact && (
        <input
          key={`${date}-${entry?.note ?? ''}`}
          defaultValue={entry?.note ?? ''}
          maxLength={200}
          placeholder="Notiz (optional) …"
          onBlur={(e) => {
            const note = e.target.value.trim();
            if (note !== (entry?.note ?? '')) actions.logCycleDay(date, { note: note || undefined });
          }}
        />
      )}
    </div>
  );
}

function TodayCard({ c }: { c: CycleData }) {
  const data = useData();
  const { isOwner, names } = useCycleNames(c);
  const entry = cycleDayEntry(data, c.today, c.owner);
  const [edit, setEdit] = useState(false);
  const symptoms = (entry?.symptoms ?? []).map((id) => SYMPTOM_BY_ID[id]).filter(Boolean);

  if (!isOwner && !edit) {
    return (
      <div className="card">
        <div className="card-head">
          <h2>💬 So geht's {names.name} heute</h2>
          <button className="link" onClick={() => setEdit(true)}>
            Eintragen
          </button>
        </div>
        {symptoms.length || entry?.flow || entry?.lh || entry?.hcg ? (
          <div className="symptom-list">
            {entry?.flow && <span className="tag">{FLOWS.find((f) => f.id === entry.flow)?.emoji} {FLOWS.find((f) => f.id === entry.flow)?.label}</span>}
            {symptoms.map((s) => (
              <span key={s.id} className="tag">
                {s.emoji} {s.label}
              </span>
            ))}
            {TESTS.map(
              (t) =>
                entry?.[t.key] && (
                  <span key={t.key} className="tag">
                    {t.emoji} {t.label} {entry[t.key] === 'pos' ? 'positiv' : 'negativ'}
                  </span>
                ),
            )}
          </div>
        ) : (
          <p className="muted">{names.name} hat heute noch nichts eingetragen. Frag doch einfach mal nach. 💕</p>
        )}
        {entry?.note && <p className="cycle-note">„{entry.note}“</p>}
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-head">
        <h2>{isOwner ? '📝 Wie geht’s dir heute?' : `📝 Für ${names.name} eintragen`}</h2>
        {!isOwner && (
          <button className="link" onClick={() => setEdit(false)}>
            Fertig
          </button>
        )}
      </div>
      <DayLog c={c} date={c.today} />
      {isOwner && <p className="hint">Deine Einträge sieht {names.partner} nach dem Sync – zusammen mit passenden Tipps, wie {names.partner} dir guttun kann.</p>}
    </div>
  );
}

// ───────────────────────── Tipps & Phase ─────────────────────────

function TipsCard({ c }: { c: CycleData }) {
  const data = useData();
  const { isOwner, owner, partner, names } = useCycleNames(c);
  const [who, setWho] = useState<'self' | 'partner'>(isOwner ? 'self' : 'partner');
  const phaseId = c.todayInfo.phase ?? 'follikel';
  const phase = PHASES[phaseId];
  const entry = cycleDayEntry(data, c.today, c.owner);
  const symptoms = (entry?.symptoms ?? []).map((id) => SYMPTOM_BY_ID[id]).filter(Boolean);
  // Im Kinderwunsch-Modus passen die Tipps zur Etappe auf dem Weg zum Baby.
  const ttc = c.settings.ttc ? ttcStatus(data, c) : undefined;
  const source = ttc ? TTC_STAGES[ttc.stage] : phase;
  const tips = seededShuffle(who === 'self' ? source.self : source.partner, `${c.today}-${who}`).slice(0, 3);
  const fact = pickSeeded(CYCLE_FACTS, `fact-${c.today}`);

  return (
    <div className="card tips-card">
      <h2>💡 Tipps für heute</h2>
      <Segmented
        value={who}
        onChange={setWho}
        small
        options={[
          ['self', `${owner.emoji} Für ${isOwner ? 'dich' : owner.name}`],
          ['partner', `${partner.emoji} Für ${isOwner ? partner.name : 'dich'}`],
        ]}
      />
      <ul className="tip-list">
        {symptoms.map((s) => (
          <li key={s.id}>
            <span className="tip-emoji">{s.emoji}</span>
            <span>
              <b>{s.label}:</b> {fillCycle(who === 'self' ? s.self : s.partner, names)}
            </span>
          </li>
        ))}
        {tips.map((tip) => (
          <li key={tip}>
            <span className="tip-emoji">{source.emoji}</span>
            <span>{fillCycle(tip, names)}</span>
          </li>
        ))}
      </ul>
      <div className="fact">
        <span className="eyebrow">✨ Wusstet ihr schon?</span>
        <p>{fact}</p>
      </div>
    </div>
  );
}

function PhaseCard({ c }: { c: CycleData }) {
  const { names } = useCycleNames(c);
  const phaseId = c.todayInfo.phase;
  if (!phaseId) return null;
  const phase = PHASES[phaseId];
  const f = c.todayInfo.fertility;
  return (
    <div className="card phase-card" data-phase={phaseId}>
      <div className="card-head">
        <h2>
          {phase.emoji} {phase.name} – was heißt das?
        </h2>
      </div>
      <p>{fillCycle(phase.body, names)}</p>
      <p className="muted">{fillCycle(phase.feel, names)}</p>
      {f && phaseId !== 'spaet' && (
        <div className={cls('fertility-box', `fert-${f}`)}>
          <b>
            {c.settings.ttc ? `${CHANCE_LABEL[f].emoji} Heute: ${CHANCE_LABEL[f].label}` : `${FERTILITY_LABEL[f].emoji} Fruchtbarkeit heute: ${FERTILITY_LABEL[f].label}`}
          </b>
          <span>{(c.settings.ttc ? CHANCE_LABEL : FERTILITY_LABEL)[f].text}</span>
          {c.fertile && (
            <span className="small">
              Fruchtbares Fenster: {formatShort(c.fertile.start)} – {formatShort(c.fertile.end)} · Eisprung ca. {formatShort(c.fertile.ovulation)}
            </span>
          )}
        </div>
      )}
      <div className="phase-tips">
        <button className="phase-tip" onClick={() => nav.setTab('sport')}>
          <span className="tip-emoji">💪</span>
          <span>
            <b>Sport</b>
            {fillCycle(phase.sport, names)}
          </span>
        </button>
        <button className="phase-tip" onClick={() => nav.setTab('essen')}>
          <span className="tip-emoji">🥗</span>
          <span>
            <b>Essen</b>
            {fillCycle(phase.food, names)}
          </span>
        </button>
      </div>
    </div>
  );
}

// ───────────────────────── Liebe & Kinderwunsch ─────────────────────────

function whenLabel(c: CycleData, date: string): string {
  if (date === c.today) return 'Heute';
  if (date === addDays(c.today, -1)) return 'Gestern';
  return 'An diesem Tag';
}

/** „Heute haben wir uns geliebt“ – nach dem Eintragen mit Zähler. */
function LoveToggle({ c, date }: { c: CycleData; date: string }) {
  const data = useData();
  const n = loveOn(data, date);
  if (!n) {
    return (
      <button className="btn soft block love-btn" onClick={(e) => setLove(e, c, date, 1)}>
        💞 {whenLabel(c, date)} haben wir uns geliebt
      </button>
    );
  }
  return (
    <div className="love-row">
      <span>💞 Uns geliebt</span>
      <Stepper value={n} min={0} max={MAX_LOVE} onChange={(k) => actions.setLoveDay(date, k)} label="mal" />
    </div>
  );
}

/** Tage nebeneinander: fruchtbar eingefärbt, mit 💞 zum Antippen. */
function LoveStrip({ c, from, days = 7 }: { c: CycleData; from: string; days?: number }) {
  const data = useData();
  return (
    <div className="love-strip">
      {Array.from({ length: days }, (_, i) => addDays(from, i)).map((k) => {
        const info = dayInfo(c, k);
        const n = loveOn(data, k);
        const fert = !info.period && info.fertility && info.fertility !== 'niedrig' ? info.fertility : undefined;
        return (
          <button
            key={k}
            className={cls('love-day', fert && `fertile-${fert}`, info.period && 'period', n > 0 && 'on', k === c.today && 'today')}
            disabled={k > c.today}
            aria-pressed={n > 0}
            aria-label={`${formatDate(k)}: ${n > 0 ? 'uns geliebt' : 'nichts eingetragen'}`}
            onClick={(e) => setLove(e, c, k, n > 0 ? 0 : 1)}
          >
            <span className="ld-wd">{k === c.today ? 'Heute' : weekdayShort(k)}</span>
            <span className="ld-num">{fromKey(k).getDate()}</span>
            <span className="ld-heart">{n > 0 ? '💞' : '♡'}</span>
            {n > 1 && <span className="ld-count">{n}</span>}
            {info.ovulation && <span className="ld-ovu">🥚</span>}
          </button>
        );
      })}
    </div>
  );
}

function stageHead(s: TtcStatus, c: CycleData): { title: string; sub: string } {
  const w = s.window;
  switch (s.stage) {
    case 'positiv': {
      const week = pregnancyWeek(c.last!.start, c.today);
      return {
        title: 'Positiver Test – herzlichen Glückwunsch!',
        sub: `Falls sich das bestätigt: SSW ${week.weeks}+${week.days} · errechneter Termin ${formatDate(dueDate(c.last!.start, c.stats.cycleLength))}`,
      };
    }
    case 'periode':
      return {
        title: 'Neuer Zyklus, neue Chance',
        sub: s.days > 0 ? `Das fruchtbare Fenster beginnt ${inDays(s.days)} (${formatShort(w.start)}).` : 'Das fruchtbare Fenster beginnt schon bald nach der Periode.',
      };
    case 'vorher':
      return {
        title: s.days === 1 ? 'Morgen beginnt das fruchtbare Fenster' : `Noch ${s.days} Tage bis zum fruchtbaren Fenster`,
        sub: `${formatShort(w.start)} – ${formatShort(w.end)} · Eisprung ca. ${formatShort(w.ovulation)}`,
      };
    case 'fenster': {
      const f = c.todayInfo.fertility ?? 'mittel';
      return { title: `Fruchtbares Fenster · Tag ${s.days} von 7`, sub: `${CHANCE_LABEL[f].emoji} Heute ${CHANCE_LABEL[f].label}: ${CHANCE_LABEL[f].text}` };
    }
    case 'warten':
      return {
        title: 'Zwei-Wochen-Warten',
        sub: `Noch ${s.days} ${s.days === 1 ? 'Tag' : 'Tage'} bis zum Test – ab ${formatShort(s.testDay!)} ist er aussagekräftig.`,
      };
    case 'test':
      return {
        title: 'Zeit für einen Test',
        sub:
          c.lateBy > 0
            ? `Die Periode ist seit ${c.lateBy === 1 ? '1 Tag' : `${c.lateBy} Tagen`} überfällig – am besten mit Morgenurin testen.`
            : 'Heute wäre die Periode fällig – jetzt ist ein Test aussagekräftig.',
      };
  }
}

/** Wie lief das Timing in diesem Zyklus? */
function timingText(s: TtcStatus, top: number): string | undefined {
  if (s.stage === 'fenster') {
    return s.loveInWindow === 0
      ? 'Noch kein 💞 im Fenster – heute wäre ein schöner Tag dafür. 😉'
      : `💞 An ${s.loveInWindow} ${s.loveInWindow === 1 ? 'Tag' : 'Tagen'} im Fenster – weiter so, alle 1 bis 2 Tage reicht völlig.`;
  }
  if (s.stage !== 'warten' && s.stage !== 'test') return undefined;
  if (s.loveInWindow >= 2 && top >= 1) return 'Super Timing! Mehr könnt ihr nicht tun – jetzt heißt es Daumen drücken. 🤞';
  if (s.loveInWindow >= 1) return `💞 An ${s.loveInWindow} ${s.loveInWindow === 1 ? 'Tag' : 'Tagen'} im Fenster. Die besten Chancen bringen die 2 Tage vor dem Eisprung.`;
  return 'In diesem Fenster ist kein 💞 eingetragen. Vergessen? Tippt einfach unten auf die Tage.';
}

/** Kinderwunsch: Wo steht ihr, wann sind die besten Tage – und wie war euer Timing? */
function BabyCard({ c }: { c: CycleData }) {
  const data = useData();
  const s = ttcStatus(data, c);
  if (!s) return null;
  const head = stageHead(s, c);
  const w = s.window;
  const top = c.today >= addDays(w.ovulation, -2) ? loveDaysBetween(data, addDays(w.ovulation, -2), w.ovulation < c.today ? w.ovulation : c.today) : 0;
  const timing = timingText(s, top);
  const history = loveHistory(data, c).filter((h) => !h.running);
  // Zyklen, bevor ihr überhaupt etwas eingetragen habt, lassen wir weg.
  while (history.length && history[history.length - 1].days === 0) history.pop();
  const week = s.stage === 'positiv' ? pregnancyWeek(c.last!.start, c.today) : undefined;
  const size = week ? [...BABY_SIZES].reverse().find((b) => b.week <= week.weeks) : undefined;

  return (
    <div className="card baby-card" data-stage={s.stage}>
      <div className="card-head">
        <h2>🍼 Unser Babywunsch</h2>
        <span className="tag">Zyklus {s.round}</span>
      </div>
      <div className="baby-stage">
        <span className="baby-stage-emoji">{TTC_STAGES[s.stage].emoji}</span>
        <span>
          <b>{head.title}</b>
          <span className="small">{head.sub}</span>
        </span>
      </div>
      {size && (
        <p className="small">
          Das Baby wäre jetzt etwa so groß wie {size.text} {size.emoji}
        </p>
      )}

      <span className="field-label">Fruchtbares Fenster · tippt an, wann ihr euch geliebt habt</span>
      <LoveStrip c={c} from={w.start} />
      {timing && <p className="baby-timing">{timing}</p>}
      {s.stage !== 'positiv' && <LoveToggle c={c} date={c.today} />}

      {c.todayInfo.byTest ? (
        <p className="hint">🧪 Eisprung per Ovulationstest bestimmt – Fenster und Periode sind jetzt genauer berechnet.</p>
      ) : (
        (s.stage === 'fenster' || (s.stage === 'vorher' && s.days <= 4)) && (
          <p className="hint">🧪 Ovulationstests helfen beim Timing: Ist einer positiv, tragt ihn unter „Wie geht’s dir heute?“ ein – Arta rechnet den Eisprung dann neu.</p>
        )
      )}
      {s.round >= 7 && s.stage !== 'positiv' && (
        <p className="hint">💞 Klappt es nach 12 Zyklen nicht (ab 35 Jahren nach 6), lasst euch beide beraten. Das ist häufig – und oft gut behandelbar.</p>
      )}

      {history.length > 0 && (
        <details className="topic love-history">
          <summary>📈 Rückblick: euer Timing</summary>
          <ul className="period-history">
            {history.map((h) => (
              <li key={h.start}>
                <span className="nowrap">
                  Ab {formatShort(h.start)}
                  {h.byTest && ' 🧪'}
                </span>
                <span className="muted small">
                  💞 {h.days} {h.days === 1 ? 'Tag' : 'Tage'} · {h.inWindow} im Fenster
                </span>
              </li>
            ))}
          </ul>
          <p className="hint">Gezählt werden Tage, an denen ihr euch geliebt habt. Das Fenster sind die 5 Tage vor dem Eisprung und der Tag danach.</p>
        </details>
      )}
    </div>
  );
}

/** Ohne Kinderwunsch-Modus: Liebe einfach diskret festhalten. */
function LoveCard({ c }: { c: CycleData }) {
  const data = useData();
  const days = loveDaysBetween(data, c.last!.start, c.today);
  const fertile = c.ovulation && c.today >= addDays(c.ovulation, -5) ? loveDaysBetween(data, addDays(c.ovulation, -5), addDays(c.ovulation, 1)) : 0;
  const startTtc = () => {
    actions.updateCycle({ ttc: true, ttcSince: c.today });
    showLove({ emoji: '🍼', title: 'Kinderwunsch-Modus an', text: 'Arta zeigt euch jetzt die besten Tage, eure Chancen und wann sich ein Test lohnt. Viel Liebe euch zwei! 💕', tone: 'love', big: true });
  };
  return (
    <div className="card love-card">
      <h2>💞 Zweisamkeit</h2>
      <p className="muted small">Tragt ein, wann ihr euch geliebt habt – ganz diskret, nur für euch zwei.</p>
      <LoveStrip c={c} from={addDays(c.today, -6)} />
      <LoveToggle c={c} date={c.today} />
      <p className="hint">
        In diesem Zyklus an {days} {days === 1 ? 'Tag' : 'Tagen'}
        {fertile > 0 && `, davon ${fertile} an fruchtbaren Tagen`}. Frühere Tage tragt ihr im Kalender nach.
      </p>
      <button className="btn ghost block" onClick={startTtc}>
        🍼 Wir wünschen uns ein Baby
      </button>
    </div>
  );
}

// ───────────────────────── Kalender ─────────────────────────

function monthDays(month: string): (string | null)[] {
  const first = fromKey(month);
  const offset = (first.getDay() + 6) % 7;
  const count = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = Array.from({ length: offset }, () => null);
  for (let d = 1; d <= count; d++) cells.push(toKey(new Date(first.getFullYear(), first.getMonth(), d)));
  return cells;
}

function shiftMonth(month: string, n: number): string {
  const d = fromKey(month);
  return toKey(new Date(d.getFullYear(), d.getMonth() + n, 1));
}

function DayDetail({ c, date }: { c: CycleData; date: string }) {
  const { isOwner, names } = useCycleNames(c);
  const info = dayInfo(c, date);
  const period = periodAt(c, date);
  const past = date <= c.today;
  // Noch blutend, obwohl die übliche Dauer schon vorbei ist? Dann Periode verlängern statt neu beginnen.
  const recent = !period ? [...c.periods].reverse().find((p) => p.start < date && diffDays(p.start, date) < MERGE_DAYS) : undefined;
  const phase = info.phase ? PHASES[info.phase] : undefined;

  return (
    <div className="inset day-detail">
      <div className="row-between">
        <h3>{formatLong(date)}</h3>
        {date === c.today && <span className="tag">heute</span>}
      </div>
      {phase && info.cycleDay ? (
        <p>
          Zyklustag <b>{info.cycleDay}</b> · {phase.emoji} {phase.name}
          {info.predicted && <span className="muted"> (Prognose)</span>}
        </p>
      ) : (
        <p className="muted">Für diesen Tag gibt es noch keine Zyklusdaten.</p>
      )}
      {info.fertility && info.phase !== 'spaet' && (
        <p className="small">
          {chanceText(info.fertility, c.settings.ttc).emoji} {chanceText(info.fertility, c.settings.ttc).label}
          {info.ovulation && (info.byTest ? ' · 🥚 Eisprung laut Ovulationstest' : ' · 🥚 voraussichtlicher Eisprung')}
        </p>
      )}

      {past && period && (
        <div className="period-box">
          <span>
            🩸 Periode ab {formatShort(period.start)}
            {period.end ? ` bis ${formatShort(period.end)} (${diffDays(period.start, period.end) + 1} Tage)` : ' – Ende noch nicht eingetragen'}
          </span>
          <div className="btn-row tight-wrap">
            {period.end !== date && (
              <button className="btn soft small" onClick={() => actions.endPeriod(period.id, date)}>
                Hier war der letzte Tag
              </button>
            )}
            {period.end && period.end === date && (
              <button className="btn soft small" onClick={() => actions.endPeriod(period.id)}>
                Ende wieder offen
              </button>
            )}
            <button className="btn ghost small" onClick={() => actions.removePeriod(period.id)}>
              Periode löschen
            </button>
          </div>
        </div>
      )}
      {past && !period && recent && (
        <button className="btn soft block" onClick={() => actions.endPeriod(recent.id, date)}>
          🩸 Periode ging bis zu diesem Tag
        </button>
      )}
      {past && !period && !recent && (
        <button
          className="btn soft block"
          onClick={(e) => {
            actions.startPeriod(date);
            heartBurst(e, '🌸', 6);
          }}
        >
          🩸 Periode hat an diesem Tag begonnen
        </button>
      )}
      {past && <LoveToggle c={c} date={date} />}
      {date === c.today ? (
        <p className="hint">Wie es heute geht, tragt ihr oben ein. ☝️</p>
      ) : past ? (
        <DayLog c={c} date={date} />
      ) : (
        <p className="hint">Für Tage in der Zukunft zeigt Arta nur die Prognose. {isOwner ? 'Trag ein, sobald es so weit ist.' : `${names.name} kann eintragen, sobald es so weit ist.`}</p>
      )}
    </div>
  );
}

function CalendarCard({ c }: { c: CycleData }) {
  const data = useData();
  const [month, setMonth] = useState(() => c.today.slice(0, 8) + '01');
  const [selected, setSelected] = useState(c.today);
  const cells = monthDays(month);
  const m = fromKey(month);

  return (
    <div className="card cal-card">
      <div className="cal-head">
        <button className="icon-btn small" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Voriger Monat">
          ‹
        </button>
        <b>
          {MONTHS[m.getMonth()]} {m.getFullYear()}
        </b>
        <button className="icon-btn small" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="Nächster Monat">
          ›
        </button>
      </div>
      <div className="cal-grid">
        {WEEK_HEAD.map((w) => (
          <span key={w} className="cal-wd">
            {w}
          </span>
        ))}
        {cells.map((k, i) => {
          if (!k) return <span key={`x${i}`} />;
          const info = dayInfo(c, k);
          const entry = cycleDayEntry(data, k, c.owner);
          const love = loveOn(data, k);
          const fertile = !info.period && info.fertility && info.fertility !== 'niedrig' ? info.fertility : undefined;
          return (
            <button
              key={k}
              className={cls(
                'cal-day',
                info.period === 'logged' && 'period',
                info.period === 'predicted' && 'period-pred',
                fertile && `fertile-${fertile}`,
                info.predicted && 'future',
                k === c.today && 'today',
                k === selected && 'selected',
              )}
              onClick={() => setSelected(k)}
              aria-label={formatDate(k)}
            >
              <span className="cal-num">{fromKey(k).getDate()}</span>
              {info.ovulation && !info.period && <span className="cal-ovu">🥚</span>}
              {love > 0 && <span className="cal-love">💞</span>}
              {entry && (entry.symptoms.length > 0 || entry.flow || entry.note || entry.lh || entry.hcg) && <span className="cal-dot" />}
            </button>
          );
        })}
      </div>
      <div className="cal-legend">
        <span>
          <i className="lg period" /> Periode
        </span>
        <span>
          <i className="lg period-pred" /> erwartet
        </span>
        <span>
          <i className="lg fertile-hoch" /> fruchtbar
        </span>
        <span>🥚 Eisprung</span>
        <span>💞 Zweisamkeit</span>
        <span>
          <i className="lg dot" /> Eintrag
        </span>
      </div>
      {month !== c.today.slice(0, 8) + '01' && (
        <button
          className="link center-link"
          onClick={() => {
            setMonth(c.today.slice(0, 8) + '01');
            setSelected(c.today);
          }}
        >
          ↩︎ Zurück zu heute
        </button>
      )}
      <DayDetail c={c} date={selected} />
    </div>
  );
}

// ───────────────────────── Statistik ─────────────────────────

function StatsCard({ c }: { c: CycleData }) {
  const { isOwner, owner } = useCycleNames(c);
  const [settings, setSettings] = useState(false);
  const s = c.stats;
  const history = [...c.periods].reverse().slice(0, 6);
  const regular = s.measured >= 3 && s.longest! - s.shortest! <= 7;

  return (
    <div className="card">
      <div className="card-head">
        <h2>📊 {isOwner ? 'Mein' : 'Der'} Zyklus in Zahlen</h2>
        <button className="link" onClick={() => setSettings((o) => !o)}>
          {settings ? 'Fertig' : '⚙️ Anpassen'}
        </button>
      </div>
      <div className="cycle-stats">
        <div>
          <b>{s.cycleLength}</b>
          <span>Tage Zyklus</span>
        </div>
        <div>
          <b>{s.periodLength}</b>
          <span>Tage Periode</span>
        </div>
        <div>
          <b>{c.periods.length}</b>
          <span>eingetragen</span>
        </div>
      </div>
      <p className="hint">
        {s.measured === 0
          ? 'Noch Standardwerte – ab zwei eingetragenen Perioden rechnet Arta mit euren echten Abständen.'
          : `Durchschnitt aus ${s.measured === 1 ? 'einem Zyklus' : `${s.measured} Zyklen`}${s.measured > 1 ? ` (${s.shortest}–${s.longest} Tage)` : ''}.`}
        {regular && ' Sehr regelmäßig – die Vorhersagen sind entsprechend verlässlicher. 👍'}
        {s.measured >= 3 && !regular && ' Die Länge schwankt etwas, die Vorhersagen sind deshalb ungenauer.'}
      </p>

      {c.predictions.length > 0 && (
        <>
          <span className="field-label">Nächste Perioden (Prognose)</span>
          <div className="symptom-list">
            {c.predictions.map((p) => (
              <span key={p} className="tag pred-tag">
                🩸 {formatShort(p)}
              </span>
            ))}
          </div>
        </>
      )}

      {history.length > 0 && (
        <>
          <span className="field-label">Letzte Perioden</span>
          <ul className="period-history">
            {history.map((p) => {
              const idx = c.periods.indexOf(p);
              const nextStart = c.periods[idx + 1]?.start;
              const len = diffDays(p.start, periodEnd(p, s.periodLength)) + 1;
              return (
                <li key={p.id}>
                  <span>
                    🩸 {formatShort(p.start)} – {formatShort(periodEnd(p, s.periodLength))}
                  </span>
                  <span className="muted small">
                    {len} Tage{!p.end && ' (geschätzt)'}
                    {nextStart && ` · Zyklus ${diffDays(p.start, nextStart)} Tage`}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {settings && <CycleSettingsBox c={c} ownerName={owner.name} />}
    </div>
  );
}

function CycleSettingsBox({ c, ownerName }: { c: CycleData; ownerName: string }) {
  const data = useData();
  const device = useDevice();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="inset">
      <p className="muted small">Diese Werte gelten, solange noch zu wenige Perioden eingetragen sind.</p>
      <div className="row-between">
        <span className="field-label">Periode dauert meist</span>
        <Stepper value={c.settings.periodLength} min={2} max={10} onChange={(periodLength) => actions.updateCycle({ periodLength })} label="Tage" />
      </div>
      <div className="row-between">
        <span className="field-label">Zyklus dauert meist</span>
        <Stepper value={c.settings.cycleLength} min={20} max={45} onChange={(cycleLength) => actions.updateCycle({ cycleLength })} label="Tage" />
      </div>
      <label className="toggle-line">
        <input type="checkbox" checked={!!c.settings.ttc} onChange={(e) => actions.updateCycle(e.target.checked ? { ttc: true, ttcSince: c.today } : { ttc: false, ttcSince: undefined })} />
        🍼 Kinderwunsch-Modus
      </label>
      {c.settings.ttc && (
        <label className="field">
          <span className="field-label">Wir wünschen uns ein Baby seit</span>
          <input type="date" value={c.settings.ttcSince ?? ''} max={c.today} onChange={(e) => e.target.value && actions.updateCycle({ ttcSince: e.target.value })} />
        </label>
      )}
      <span className="field-label">Wessen Zyklus?</span>
      <Segmented
        value={c.owner}
        onChange={(personId: PersonId) => actions.updateCycle({ personId })}
        small
        options={(['a', 'b'] as const).map((id) => [id, `${data.persons[id].emoji} ${id === device.me ? 'Meiner' : data.persons[id].name}`])}
      />
      {!confirm ? (
        <button className="btn danger-ghost block" onClick={() => setConfirm(true)}>
          Periodenkalender ausschalten …
        </button>
      ) : (
        <div className="notice warn">
          <p>Kalender für {ownerName} ausschalten? Die bisherigen Einträge bleiben gespeichert und sind wieder da, wenn ihr ihn neu einrichtet.</p>
          <div className="btn-row">
            <button className="btn ghost" onClick={() => setConfirm(false)}>
              Abbrechen
            </button>
            <button className="btn danger" onClick={() => actions.disableCycle()}>
              Ausschalten
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Wissen ─────────────────────────

function DueDateCalc({ c }: { c: CycleData }) {
  const [lmp, setLmp] = useState(c.last?.start ?? '');
  const due = lmp ? dueDate(lmp, c.stats.cycleLength) : undefined;
  const week = lmp && lmp <= c.today ? pregnancyWeek(lmp, c.today) : undefined;
  const size = week ? [...BABY_SIZES].reverse().find((b) => b.week <= week.weeks) : undefined;
  return (
    <div className="inset due-calc">
      <h3>🗓️ Geburtstermin-Rechner</h3>
      <label className="field">
        <span className="field-label">Erster Tag der letzten Periode</span>
        <input type="date" value={lmp} max={c.today} min={addDays(c.today, -300)} onChange={(e) => setLmp(e.target.value)} />
      </label>
      {due && (
        <p>
          Errechneter Termin: <b>{formatDate(due)}</b>
        </p>
      )}
      {week && week.weeks <= 42 && (
        <p className="small">
          Falls eine Schwangerschaft besteht, wäre heute <b>SSW {week.weeks}+{week.days}</b>
          {size && (
            <>
              {' '}
              – das Baby wäre etwa so groß wie {size.text} {size.emoji}
            </>
          )}
          .
        </p>
      )}
      <p className="hint">Gerechnet nach der Naegele-Regel (letzte Periode + 280 Tage, angepasst an {c.stats.cycleLength} Tage Zyklus). Den genauen Termin bestimmt die Frauenärztin per Ultraschall.</p>
    </div>
  );
}

function KnowledgeCard({ c }: { c: CycleData }) {
  const { names } = useCycleNames(c);
  const L = c.stats.cycleLength;
  const P = c.stats.periodLength;
  const segments = phaseSegments(L, P);
  let from = 1;
  return (
    <div className="card knowledge">
      <h2>📚 Wissen für euch zwei</h2>
      <details className="topic">
        <summary>🔄 Der Zyklus kurz erklärt</summary>
        <p className="muted small">So sieht ein Zyklus mit {L} Tagen und {P} Tagen Periode ungefähr aus:</p>
        <ul className="phase-list">
          {segments.map(([ph, n]) => {
            const start = from;
            from += n;
            return (
              <li key={ph}>
                <b>
                  {PHASES[ph].emoji} {PHASES[ph].name}
                </b>{' '}
                <span className="muted small">
                  Tag {start}
                  {n > 1 && `–${start + n - 1}`} · {PHASES[ph].season}
                </span>
                <p className="small">{fillCycle(PHASES[ph].body, names)}</p>
              </li>
            );
          })}
        </ul>
      </details>
      {INFO_TOPICS.map((t) => (
        <details key={t.id} className="topic">
          <summary>
            {t.emoji} {t.title}
          </summary>
          {t.intro && <p className="small">{t.intro}</p>}
          <ul className="topic-points">
            {t.points.map((p) => (
              <li key={p}>{fillCycle(p, names)}</li>
            ))}
          </ul>
          {t.partner && (
            <div className="topic-partner">
              <b>🤝 Für {names.partner}:</b>
              <ul className="topic-points">
                {t.partner.map((p) => (
                  <li key={p}>{fillCycle(p, names)}</li>
                ))}
              </ul>
            </div>
          )}
          {t.id === 'schwanger' && <DueDateCalc c={c} />}
        </details>
      ))}
    </div>
  );
}

// ───────────────────────── Bildschirm ─────────────────────────

export function Cycle() {
  const data = useData();
  const today = useToday();
  const c = getCycle(data, today);
  if (!c) return <CycleSetup />;
  return (
    <>
      <CycleHero c={c} />
      {c.last && c.settings.ttc && <BabyCard c={c} />}
      {c.last && <TodayCard c={c} />}
      {c.last && <TipsCard c={c} />}
      {c.last && !c.settings.ttc && <LoveCard c={c} />}
      <CalendarCard c={c} />
      {c.last && <PhaseCard c={c} />}
      <StatsCard c={c} />
      <KnowledgeCard c={c} />
      <p className="notice warn small">⚠️ {CYCLE_DISCLAIMER}</p>
    </>
  );
}

/** Kleiner Hinweis auf der Heute-Seite. */
export function CycleTodayCard() {
  const data = useData();
  const device = useDevice();
  const today = useToday();
  const c = getCycle(data, today);
  if (!c?.last || !c.todayInfo.phase) return null;
  const isOwner = device.me === c.owner;
  const names = { name: data.persons[c.owner].name, partner: data.persons[other(c.owner)].name };
  const phase = PHASES[c.todayInfo.phase];
  const ttc = c.settings.ttc ? ttcStatus(data, c) : undefined;
  const source = ttc ? TTC_STAGES[ttc.stage] : phase;
  const tip = pickSeeded(isOwner ? source.self : source.partner, `${today}-today-${isOwner}`);
  const untilNext = c.next ? diffDays(today, c.next) : undefined;
  const chance = c.todayInfo.fertility && CHANCE_LABEL[c.todayInfo.fertility];
  const ttcLine =
    ttc?.stage === 'positiv'
      ? 'Positiver Test 🎉'
      : ttc?.stage === 'fenster' && chance
        ? `Fruchtbare Tage · ${chance.label}`
        : ttc?.stage === 'vorher' && ttc.days <= 3
          ? `Fruchtbare Tage beginnen ${inDays(ttc.days)}`
          : ttc?.stage === 'warten'
            ? `Test in ${ttc.days} ${ttc.days === 1 ? 'Tag' : 'Tagen'} sinnvoll`
            : ttc?.stage === 'test'
              ? 'Zeit für einen Test 🧪'
              : undefined;
  const status = ttcLine
    ? ttcLine
    : c.current
    ? `Periode · Tag ${diffDays(c.current.start, today) + 1}`
    : c.lateBy > 0
      ? `Periode seit ${c.lateBy} ${c.lateBy === 1 ? 'Tag' : 'Tagen'} überfällig`
      : untilNext !== undefined && untilNext <= 3
        ? `Periode kommt voraussichtlich ${inDays(untilNext)}`
        : `Zyklustag ${c.todayInfo.cycleDay} · ${phase.name}`;
  return (
    <button className="card cycle-today" data-phase={c.todayInfo.phase} onClick={nav.openCycle}>
      <span className="cycle-today-emoji">{ttcLine ? source.emoji : phase.emoji}</span>
      <span className="cycle-today-text">
        <b>
          {isOwner ? 'Dein Zyklus' : names.name}: {status}
        </b>
        <span className="muted small">💡 {fillCycle(tip, names)}</span>
      </span>
      <span className="muted">›</span>
    </button>
  );
}
