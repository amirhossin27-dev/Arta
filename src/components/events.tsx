import { useState } from 'react';
import { useCalSeen } from '../lib/calendar';
import { useCalendarUrls } from '../lib/calendarFeed';
import { diffDays, formatDateTime, fromKey, weekdayShort } from '../lib/date';
import {
  ALARMS_ALLDAY,
  ALARMS_TIMED,
  anniversaryYears,
  countdown,
  EVENT_KINDS,
  past,
  REPEAT_LABEL,
  timeText,
  upcoming,
  type Occurrence,
} from '../lib/events';
import { cls, usePeople, useToday } from '../lib/hooks';
import { openIcs, singleEventIcs, useRelayCalendar } from '../lib/ics';
import { liveAvailable, useLive } from '../lib/live';
import { heartBurst, showLove } from '../lib/love';
import { actions, getData, useData } from '../lib/store';
import type { CalEvent, Repeat } from '../lib/types';
import { nav } from '../lib/ui';
import { CopyBox } from './healthSetup';
import { Empty, Segmented, Sheet } from './ui';

const MONTHS_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const monthTitle = (key: string) => new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(fromKey(key));

function DateBadge({ date, today }: { date: string; today: string }) {
  const d = fromKey(date);
  return (
    <span className={cls('date-badge', date === today && 'today')} aria-hidden="true">
      <small>{weekdayShort(date)}</small>
      <b>{d.getDate()}</b>
      <small>{MONTHS_SHORT[d.getMonth()]}</small>
    </span>
  );
}

function titleOf(o: Occurrence): string {
  if (!o.virtual) return o.event.title;
  const years = anniversaryYears(o);
  return years > 0 ? `Unser ${years}. Jahrestag` : 'Unser Jahrestag';
}

/** Der Jahrestag kommt aus den Einstellungen – dort wird er auch geändert. */
function openOccurrence(o: Occurrence, back?: boolean) {
  if (o.virtual) nav.open({ type: 'settings' });
  else nav.open({ type: 'event', id: o.event.id, back });
}

export function EventRow({ o, today, onOpen }: { o: Occurrence; today: string; onOpen: () => void }) {
  const data = useData();
  const e = o.event;
  const person = e.who === 'both' ? undefined : data.persons[e.who];
  const soon = o.start <= today || diffDays(today, o.start) <= 1;
  return (
    <button className={cls('event-row', o.virtual && 'virtual', o.end < today && 'past')} onClick={onOpen}>
      <DateBadge date={o.start} today={today} />
      <span className="event-main">
        <b>
          {e.emoji} {titleOf(o)}
        </b>
        <span className="muted small">
          {timeText(o, today)}
          {e.place ? ` · 📍 ${e.place}` : ''}
        </span>
        <span className="event-tags">
          <span className={cls('event-tag', soon && 'hot')}>{countdown(o, today)}</span>
          {e.repeat && <span className="event-tag">🔁 {REPEAT_LABEL[e.repeat]}</span>}
          <span className="event-tag">{person ? `${person.emoji} ${person.name}` : '💑 ihr beide'}</span>
        </span>
      </span>
    </button>
  );
}

/** Karte auf „Heute“: die nächsten Termine. */
export function UpcomingCard() {
  const data = useData();
  const today = useToday();
  const all = upcoming(data, today);
  const soon = all.filter((o) => diffDays(today, o.start) <= 30);
  const list = (soon.length ? soon : all).slice(0, 3);
  return (
    <div className="card events-card">
      <div className="card-head">
        <h2>📅 Unsere Termine</h2>
        <button className="link" onClick={() => nav.open({ type: 'events' })}>
          Alle{all.length > list.length ? ` (${all.length})` : ''}
        </button>
      </div>
      {list.length ? (
        <div className="event-list">
          {list.map((o) => (
            <EventRow key={o.event.id} o={o} today={today} onOpen={() => openOccurrence(o)} />
          ))}
        </div>
      ) : (
        <p className="muted small">Noch nichts geplant. Tragt Dates, Arzttermine oder Geburtstage ein – sie landen auf beiden Handys und auf Wunsch im iPhone-Kalender. ✨</p>
      )}
      <button className="btn soft block small events-add" onClick={() => nav.open({ type: 'event' })}>
        + Termin eintragen
      </button>
    </div>
  );
}

/** Kurzer Hinweis in der Terminliste: Kommen die Termine schon in den iPhone-Kalender? */
function CalendarHint() {
  const seen = useCalSeen();
  const { me, partner } = usePeople();
  const mine = seen[me.id];
  return (
    <button className={cls('inset calendar-hint', !!mine && 'ok')} onClick={() => nav.open({ type: 'calendar', back: true })}>
      <span className="calendar-hint-emoji">📲</span>
      <span className="grow">
        {mine ? (
          <>
            <b>Im iPhone-Kalender abonniert ✓</b>
            <span className="muted small">zuletzt abgeholt {formatDateTime(mine)}</span>
          </>
        ) : (
          <>
            <b>In den iPhone-Kalender holen</b>
            <span className="muted small">Einmal abonnieren – dann kommen alle Termine von dir und {partner.name} automatisch.</span>
          </>
        )}
      </span>
      <span className="muted">›</span>
    </button>
  );
}

export function EventsSheet({ onClose }: { onClose: () => void }) {
  const data = useData();
  const today = useToday();
  const [showPast, setShowPast] = useState(false);
  const list = upcoming(data, today);
  const old = showPast ? past(data, today) : [];
  const groups: [string, Occurrence[]][] = [];
  for (const o of list) {
    const title = monthTitle(o.start);
    const last = groups[groups.length - 1];
    if (last?.[0] === title) last[1].push(o);
    else groups.push([title, [o]]);
  }
  return (
    <Sheet title="📅 Unsere Termine" onClose={onClose}>
      <button className="btn primary block" onClick={() => nav.open({ type: 'event', back: true })}>
        + Neuer Termin
      </button>
      {liveAvailable() && <CalendarHint />}
      {list.length === 0 && (
        <Empty emoji="🗓️" title="Noch keine Termine">
          Plant etwas Schönes zusammen – ein Date, einen Ausflug, den nächsten Urlaub. 💞
        </Empty>
      )}
      {groups.map(([title, items]) => (
        <section key={title} className="event-group">
          <p className="slot-label">{title}</p>
          <div className="event-list">
            {items.map((o) => (
              <EventRow key={o.event.id} o={o} today={today} onOpen={() => openOccurrence(o, true)} />
            ))}
          </div>
        </section>
      ))}
      <button className="link events-past-toggle" onClick={() => setShowPast((p) => !p)}>
        {showPast ? 'Vergangene ausblenden' : '🕰️ Vergangene Termine anzeigen'}
      </button>
      {showPast &&
        (old.length ? (
          <div className="event-list">
            {old.map((o) => (
              <EventRow key={o.event.id} o={o} today={today} onOpen={() => openOccurrence(o, true)} />
            ))}
          </div>
        ) : (
          <p className="muted small">Noch keine vergangenen Termine.</p>
        ))}
    </Sheet>
  );
}

// ───────────────────────── Eintragen & Ändern ─────────────────────────

type Who = 'both' | 'me' | 'partner';

export function EventSheet({ id, date, back, onClose }: { id?: string; date?: string; back?: boolean; onClose: () => void }) {
  const data = useData();
  const { me, partner } = usePeople();
  const today = useToday();
  const live = useLive();
  const seen = useCalSeen();
  const relay = useRelayCalendar();
  const found = id ? data.events[id] : undefined;
  const existing = found && !found.deleted ? found : undefined;
  const [emoji, setEmoji] = useState(existing?.emoji ?? '💞');
  const [title, setTitle] = useState(existing?.title ?? '');
  const [day, setDay] = useState(existing?.date ?? date ?? today);
  const [allDay, setAllDay] = useState(existing ? !existing.time : false);
  const [time, setTime] = useState(existing?.time ?? '19:00');
  const [endTime, setEndTime] = useState(existing?.endTime ?? '');
  const [endDate, setEndDate] = useState(existing?.endDate ?? '');
  const [who, setWho] = useState<Who>(!existing || existing.who === 'both' ? 'both' : existing.who === me.id ? 'me' : 'partner');
  const [repeat, setRepeat] = useState<Repeat | 'nie'>(existing?.repeat ?? 'nie');
  const [alarm, setAlarm] = useState(existing?.alarm ?? 0);
  const [place, setPlace] = useState(existing?.place ?? '');
  const [note, setNote] = useState(existing?.note ?? '');
  const [toPhone, setToPhone] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const subscribed = !!seen[me.id];
  const close = back ? () => nav.open({ type: 'events' }) : onClose;

  const alarms = allDay ? ALARMS_ALLDAY : ALARMS_TIMED;
  // Beim Umschalten ganztägig ↔ Uhrzeit passt die alte Erinnerung oft nicht mehr.
  const alarmValue = alarms.some(([v]) => v === alarm) ? alarm : allDay ? -540 : 60;
  const kind = EVENT_KINDS.find((k) => k.emoji === emoji);
  const finalTitle = title.trim() || (kind && kind.label !== 'Sonstiges' ? kind.label : '');
  const timed = !allDay && !!time;
  const canSave = !!finalTitle && !!day;

  const pickKind = (k: (typeof EVENT_KINDS)[number]) => {
    // Titel nur vorschlagen, solange er leer ist oder noch der vorige Vorschlag drinsteht.
    if (!title.trim() || EVENT_KINDS.some((x) => x.label === title.trim())) setTitle(k.label === 'Sonstiges' ? '' : k.label);
    setEmoji(k.emoji);
  };

  const input = (): Omit<CalEvent, 'id' | 'updatedAt' | 'createdBy' | 'createdAt' | 'tz'> => ({
    title: finalTitle,
    emoji,
    date: day,
    time: timed ? time : undefined,
    endTime: timed ? endTime || undefined : undefined,
    endDate: !timed && endDate > day ? endDate : undefined,
    who: who === 'both' ? 'both' : who === 'me' ? me.id : partner.id,
    repeat: repeat === 'nie' ? undefined : repeat,
    alarm: alarmValue || undefined,
    place,
    note,
  });

  const names = { a: data.persons.a.name, b: data.persons.b.name };

  const save = () => {
    if (!canSave) return;
    let evId = existing?.id;
    if (existing) actions.updateEvent(existing.id, input());
    else evId = actions.addEvent(input());
    const ev = evId ? getData().events[evId] : undefined;
    // Noch im selben Antippen öffnen – sonst blockt der Browser das neue Fenster.
    if (ev && toPhone && !subscribed) openIcs(singleEventIcs(ev, names), ev.title);
    heartBurst(undefined, emoji, 6);
    showLove({
      emoji,
      title: existing ? 'Termin geändert' : 'Termin eingetragen!',
      text: `${partner.name} sieht ihn ${live ? 'sofort' : 'beim nächsten Sync'}.${subscribed ? ' Dein iPhone-Kalender holt ihn sich automatisch. 📲' : ''}`,
      tone: 'love',
    });
    close();
  };

  return (
    <Sheet
      title={existing ? `${existing.emoji} Termin` : '📅 Neuer Termin'}
      onClose={close}
      footer={
        <button className="btn primary block" onClick={save} disabled={!canSave}>
          {existing ? 'Speichern' : 'Eintragen 💞'}
        </button>
      }
    >
      <div className="chips event-kinds">
        {EVENT_KINDS.map((k) => (
          <button key={k.emoji} className={cls('chip', emoji === k.emoji && 'active')} onClick={() => pickKind(k)}>
            {k.emoji} {k.label}
          </button>
        ))}
      </div>
      <label className="field">
        <span className="field-label">Was?</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder={kind && kind.label !== 'Sonstiges' ? kind.label : 'z. B. Abendessen bei Mama'} />
      </label>
      <div className="field-row">
        <label className="field">
          <span className="field-label">Wann?</span>
          <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} />
        </label>
        <label className="toggle-line event-allday">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
          Ganztägig
        </label>
      </div>
      {allDay ? (
        <label className="field">
          <span className="field-label">Bis (optional, z. B. für den Urlaub)</span>
          <input type="date" value={endDate} min={day} onChange={(e) => setEndDate(e.target.value)} />
        </label>
      ) : (
        <div className="field-row">
          <label className="field">
            <span className="field-label">Von</span>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Bis (optional)</span>
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </label>
        </div>
      )}
      <span className="field-label">Für wen?</span>
      <Segmented
        value={who}
        onChange={setWho}
        options={[
          ['both', '💑 Uns beide'],
          ['me', `${me.emoji} ${me.name}`],
          ['partner', `${partner.emoji} ${partner.name}`],
        ]}
      />
      <span className="field-label">Wiederholen</span>
      <Segmented
        value={repeat}
        onChange={setRepeat}
        small
        options={[
          ['nie', 'Nie'],
          ['woche', 'Wöchentl.'],
          ['monat', 'Monatl.'],
          ['jahr', 'Jährlich'],
        ]}
      />
      <div className="field-row">
        <label className="field">
          <span className="field-label">Erinnerung im Kalender</span>
          <select value={alarmValue} onChange={(e) => setAlarm(Number(e.target.value))}>
            {alarms.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Wo? (optional)</span>
          <input value={place} onChange={(e) => setPlace(e.target.value)} maxLength={120} placeholder="Ort" />
        </label>
      </div>
      <label className="field">
        <span className="field-label">Notiz (optional)</span>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} placeholder="Was sollen wir mitbringen? Tisch reserviert? …" />
      </label>

      {subscribed ? (
        <p className="hint">📲 Kommt über dein Kalender-Abo automatisch in deinen iPhone-Kalender.</p>
      ) : existing ? (
        <div className="inset">
          <button className="btn soft block" onClick={() => openIcs(singleEventIcs(existing, names), existing.title)}>
            📲 In meinen iPhone-Kalender
          </button>
          <p className="muted small">
            {relay === false
              ? 'Das Handy lädt dafür eine Kalender-Datei herunter – öffne sie und tippe auf „Hinzufügen“.'
              : 'Safari zeigt den Termin – tippe auf „Zum Kalender hinzufügen“.'}{' '}
            Einzeln übernommene Termine ändern sich im iPhone-Kalender nicht mit.{' '}
            <button className="link inline" onClick={() => nav.open({ type: 'calendar', back })}>
              Mit dem Kalender-Abo
            </button>{' '}
            geht alles automatisch.
          </p>
        </div>
      ) : (
        <label className="toggle-line">
          <input type="checkbox" checked={toPhone} onChange={(e) => setToPhone(e.target.checked)} />
          Danach auch in meinen iPhone-Kalender übernehmen
        </label>
      )}

      {existing && (
        <>
          <p className="hint">
            Eingetragen von {data.persons[existing.createdBy].name} · {formatDateTime(existing.createdAt)}
          </p>
          {confirmDelete ? (
            <div className="notice warn">
              <p>Termin „{existing.title}“ für euch beide löschen?</p>
              <div className="btn-row">
                <button className="btn ghost" onClick={() => setConfirmDelete(false)}>
                  Abbrechen
                </button>
                <button
                  className="btn danger"
                  onClick={() => {
                    actions.removeEvent(existing.id);
                    showLove({ emoji: '🗑️', title: 'Termin gelöscht', text: `Auch bei ${partner.name}${subscribed ? ' und in deinem Kalender-Abo' : ''}.`, tone: 'love' });
                    close();
                  }}
                >
                  Löschen
                </button>
              </div>
            </div>
          ) : (
            <button className="btn danger-ghost block" onClick={() => setConfirmDelete(true)}>
              Termin löschen
            </button>
          )}
        </>
      )}
    </Sheet>
  );
}

// ───────────────────────── Kalender-Abo ─────────────────────────

export function CalendarSheet({ back, onClose }: { back?: boolean; onClose: () => void }) {
  const live = useLive();
  const { me, partner } = usePeople();
  const relay = useRelayCalendar();
  const urls = useCalendarUrls();
  const seen = useCalSeen();
  const close = back ? () => nav.open({ type: 'events' }) : onClose;
  const mine = seen[me.id];
  const theirs = seen[partner.id];

  return (
    <Sheet title="📲 iPhone-Kalender" onClose={close}>
      <p className="lead">
        Hol dir eure gemeinsamen Termine in den Kalender deines iPhones. Einmal abonnieren – danach kommen neue Termine von dir und {partner.name} von allein dazu, Änderungen und
        Löschungen auch.
      </p>

      {!live ? (
        <div className="notice warn">
          <p>
            Dafür braucht ihr den <b>Live-Sync</b>: Das Abo liest eure Termine aus eurem gemeinsamen, verschlüsselten Live-Raum. Tippe auf 🔄 und schick {partner.name} einmal den
            Link.
          </p>
          <button className="btn soft block" onClick={() => nav.open({ type: 'sync' })}>
            🔄 Paar-Sync öffnen
          </button>
        </div>
      ) : relay === false ? (
        <div className="notice warn">
          <p>
            Der Arta-Push-Relay kann noch keine Kalender. Wer ihn bei Cloudflare eingerichtet hat, fügt dort einmal den neuen Code aus <code>push-relay/worker.js</code> ein
            (Anleitung in <code>push-relay/README.md</code>, dauert 2 Minuten).
          </p>
          <p>Bis dahin kannst du jeden Termin einzeln mit „📲 In meinen iPhone-Kalender“ übernehmen.</p>
        </div>
      ) : relay === undefined || !urls ? (
        <p className="muted">Prüfe den Kalender-Dienst …</p>
      ) : (
        <>
          <div className={cls('inset health-status', !!mine && 'ok')}>
            {mine ? (
              <p>
                ✓ Dein Kalender ist abonniert und hat die Termine zuletzt <b>{formatDateTime(mine)}</b> abgeholt.
              </p>
            ) : (
              <p>⏳ Noch nicht abonniert – oder dein iPhone hat noch nicht abgeholt. Nach dem Abonnieren steht hier, wann es zuletzt geklappt hat.</p>
            )}
            <p className="muted small">
              {theirs ? `✓ ${partner.name} hat auch abonniert (zuletzt ${formatDateTime(theirs)}).` : `${partner.name} kann das genauso auf dem eigenen Handy einrichten.`}
            </p>
          </div>

          <a className="btn primary block" href={urls.webcal}>
            📅 {mine ? 'Noch einmal abonnieren' : 'Kalender abonnieren'}
          </a>
          <ol className="how">
            <li>
              Tippe auf „Kalender abonnieren“ und bestätige mit <b>„Abonnieren“</b>.
            </li>
            <li>
              Je nach iPhone fragt es noch nach Name, Farbe und Ort – einfach mit <b>„Hinzufügen“</b> bzw. <b>„Fertig“</b> bestätigen.
            </li>
            <li>
              Fertig! Im Kalender heißt er <b>„Arta 💞 {me.name} & {partner.name}“</b>.
            </li>
          </ol>

          <h3>Gut zu wissen</h3>
          <ul className="how">
            <li>
              ⏱️ Das iPhone holt neue Termine selbst ab – nicht sekundenschnell, meist innerhalb von 15 Minuten bis ein paar Stunden. Wann zuletzt, steht oben. In Arta selbst sind
              Termine sofort auf beiden Handys.
            </li>
            <li>
              🔔 Damit die Erinnerungen aus Arta klingeln: Ist beim Abo „Hinweise entfernen“ bzw. „Erinnerungen entfernen“ an, schalte es aus (Kalender-App → Kalender → ⓘ neben
              „Arta“).
            </li>
            <li>✏️ Im iPhone-Kalender kannst du die Termine nur ansehen – eintragen und ändern geht hier in Arta.</li>
          </ul>

          <details className="calendar-manual">
            <summary>Klappt der Knopf nicht? Von Hand einrichten</summary>
            <CopyBox label="Abo-Adresse" text={urls.https} />
            <p className="muted small">
              <b>iPhone:</b> Einstellungen → Kalender → Accounts → Account hinzufügen → Andere → „Kalenderabo hinzufügen“ → Adresse einfügen → Weiter → Sichern.
            </p>
            <p className="muted small">
              <b>Android / Google Kalender:</b> am Computer calendar.google.com öffnen → bei „Weitere Kalender“ auf ＋ → „Per URL“ → Adresse einfügen.
            </p>
          </details>

          <p className="hint">
            🔒 Die Adresse ist wie ein Schlüssel zu euren Terminen – nicht weitergeben. In der Datenbank bleiben die Termine verschlüsselt; nur beim Abholen entschlüsselt der
            Arta-Relay sie kurz für deinen Kalender.
          </p>
        </>
      )}
    </Sheet>
  );
}
