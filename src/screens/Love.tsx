import { useState } from 'react';
import { COMPLIMENTS, COUPON_TEMPLATES, DATE_IDEAS, type DateCategory } from '../data/messages';
import { Chips, Empty, Segmented } from '../components/ui';
import { dailyQuestion } from '../lib/daily';
import { diffDays, formatDate, formatDateTime, nextAnniversary } from '../lib/date';
import { cls, usePeople, useToday } from '../lib/hooks';
import { useLive } from '../lib/live';
import { heartBurst, showLove } from '../lib/love';
import { pickRandom } from '../lib/random';
import { alive, heartsOn, notesFor, pendingSurprises } from '../lib/stats';
import { actions, useData, useDevice } from '../lib/store';
import { nav, useUI } from '../lib/ui';
import { Cycle } from './Cycle';
import { sendHeartWithLove } from './Today';

const MILESTONES = [100, 200, 365, 500, 730, 1000, 1500, 2000, 2500, 3000, 3650, 5000];

function Together() {
  const data = useData();
  const { me, partner } = usePeople();
  const today = useToday();
  const anniversary = data.couple.anniversary;
  const days = anniversary ? diffDays(anniversary, today) : undefined;
  const next = anniversary ? nextAnniversary(anniversary, today) : undefined;
  const milestone = days !== undefined ? MILESTONES.find((m) => m > days) : undefined;

  return (
    <div className="hero hero-heart" data-deco="❤️">
      <div className="couple-big">
        <span>{me.emoji}</span>
        <span className="pulse-heart">❤️</span>
        <span>{partner.emoji}</span>
      </div>
      <h1 className="center">
        {me.name} &amp; {partner.name}
      </h1>
      {days !== undefined && days >= 0 && next ? (
        <>
          <p className="together-days">
            <b>{days}</b> Tage zusammen
          </p>
          <div className="hero-meta center">
            {next.inDays === 0 ? (
              <span>🎉 Heute ist euer {next.years}. Jahrestag!</span>
            ) : (
              <span>
                🎂 noch {next.inDays} Tage bis zum {next.years}. Jahrestag
              </span>
            )}
            {milestone && <span>✨ Tag {milestone} in {milestone - days} Tagen</span>}
          </div>
          <p className="hero-sub center">seit dem {formatDate(anniversary!)}</p>
        </>
      ) : (
        <button className="btn glass" onClick={() => nav.open({ type: 'settings' })}>
          📅 Kennenlerndatum eintragen
        </button>
      )}
    </div>
  );
}

function NoteComposer() {
  const { partner } = usePeople();
  const live = useLive();
  const [text, setText] = useState('');
  const [surprise, setSurprise] = useState(false);

  const send = () => {
    if (!text.trim()) return;
    actions.sendNote(text, { surprise });
    showLove({
      emoji: surprise ? '🎁' : '💌',
      title: surprise ? 'Überraschung versteckt!' : 'Botschaft gespeichert!',
      text: live
        ? surprise
          ? `Sie taucht bei ${partner.name} zu einem zufälligen Zeitpunkt auf. 🤫`
          : `${partner.name} bekommt sie sofort.`
        : `${partner.name} bekommt sie beim nächsten Sync${surprise ? ' – zu einem zufälligen Zeitpunkt. 🤫' : '.'}`,
      tone: 'love',
    });
    setText('');
    setSurprise(false);
  };

  const whatsapp = () => {
    if (!text.trim()) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(`💌 ${text.trim()}`)}`, '_blank', 'noopener');
  };

  return (
    <div className="card">
      <h2>💌 Liebesbotschaft schreiben</h2>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={500} placeholder={`Was möchtest du ${partner.name} sagen?`} />
      <div className="chips">
        <button className="chip" onClick={() => setText(pickRandom(COMPLIMENTS))}>
          🎲 Inspiration
        </button>
        <button className="chip" onClick={() => setText((t) => `${t}${t && !t.endsWith(' ') ? ' ' : ''}❤️`)}>
          + ❤️
        </button>
        <button className="chip" onClick={() => setText((t) => `${t}${t && !t.endsWith(' ') ? ' ' : ''}😘`)}>
          + 😘
        </button>
      </div>
      <label className="toggle-line">
        <input type="checkbox" checked={surprise} onChange={(e) => setSurprise(e.target.checked)} />
        🎁 Als Überraschung – taucht bei {partner.name} irgendwann zufällig auf
      </label>
      <div className="btn-row">
        <button className="btn primary" onClick={send} disabled={!text.trim()}>
          In Arta senden 💌
        </button>
        <button className="btn soft" onClick={whatsapp} disabled={!text.trim()}>
          📱 Per WhatsApp
        </button>
      </div>
      {live ? (
        <p className="hint">⚡ Ihr seid live verbunden – Botschaften kommen bei {partner.name} sofort an.</p>
      ) : (
        <p className="hint">
          Botschaften erreichen {partner.name} über den Paar-Sync.{' '}
          <button className="link inline" onClick={() => nav.open({ type: 'sync' })}>
            Jetzt synchronisieren
          </button>
        </p>
      )}
    </div>
  );
}

function Inbox() {
  const data = useData();
  const device = useDevice();
  const { me, partner } = usePeople();
  const [box, setBox] = useState<'inbox' | 'sent'>('inbox');
  const { inbox, sent } = notesFor(data, device.me);
  const surprises = pendingSurprises(data, device.me).length;
  const list = box === 'inbox' ? inbox : sent;

  return (
    <div className="card">
      <Segmented
        value={box}
        onChange={setBox}
        options={[
          ['inbox', `📬 Von ${partner.name} (${inbox.length})`],
          ['sent', `📤 Gesendet (${sent.length})`],
        ]}
      />
      {box === 'inbox' && surprises > 0 && (
        <p className="surprise-hint">
          🎁 {surprises === 1 ? 'Eine Überraschung wartet' : `${surprises} Überraschungen warten`} auf dich … lass dich überraschen!
        </p>
      )}
      {list.length === 0 ? (
        <Empty emoji={box === 'inbox' ? '📭' : '✉️'} title={box === 'inbox' ? 'Noch keine Post' : 'Noch nichts gesendet'}>
          {box === 'inbox' ? `Sobald ${partner.name} dir etwas schickt und ihr synchronisiert, landet es hier.` : 'Schreib oben deine erste Liebesbotschaft!'}
        </Empty>
      ) : (
        <div className="notes">
          {list.map((n) => {
            const from = data.persons[n.from];
            const mine = n.from === me.id;
            return (
              <div key={n.id} className={cls('note', mine && 'mine', n.kind === 'cheer' && 'cheer')}>
                <span className="avatar">{from.emoji}</span>
                <div className="note-bubble">
                  <p>
                    {n.kind === 'cheer' && '📣 '}
                    {n.text}
                  </p>
                  <span className="note-meta">
                    {formatDateTime(n.createdAt)}
                    {n.surprise && ' · 🎁 Überraschung'}
                    {mine && (n.seen ? ' · gelesen ✓✓' : ' · noch nicht gelesen')}
                  </span>
                </div>
                {mine && (
                  <button className="icon-btn small ghost" onClick={() => actions.deleteNote(n.id)} aria-label="Botschaft löschen">
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Coupons() {
  const data = useData();
  const device = useDevice();
  const { partner } = usePeople();
  const [box, setBox] = useState<'mine' | 'given'>('mine');
  const [creating, setCreating] = useState(false);
  const [custom, setCustom] = useState('');
  const all = alive(data.coupons).sort((a, b) => b.createdAt - a.createdAt);
  const mine = all.filter((c) => c.to === device.me);
  const given = all.filter((c) => c.from === device.me);
  const list = box === 'mine' ? mine : given;

  const give = (title: string, emoji: string) => {
    actions.addCoupon(title, emoji);
    setCreating(false);
    setCustom('');
    setBox('given');
    showLove({ emoji: '🎟️', title: 'Gutschein verschenkt!', text: `„${title}“ – ${partner.name} wird sich freuen. 💝`, tone: 'love' });
  };

  return (
    <div className="card">
      <div className="card-head">
        <h2>🎟️ Gutscheine</h2>
        <button className="btn soft small" onClick={() => setCreating((c) => !c)}>
          {creating ? 'Abbrechen' : '+ Verschenken'}
        </button>
      </div>
      {creating && (
        <div className="inset">
          <p className="muted">Wähle einen Gutschein für {partner.name}:</p>
          <div className="coupon-templates">
            {COUPON_TEMPLATES.map((t) => (
              <button key={t.title} className="chip" onClick={() => give(t.title, t.emoji)}>
                {t.emoji} {t.title}
              </button>
            ))}
          </div>
          <div className="add-form">
            <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Oder eigener Gutschein …" maxLength={80} />
            <button className="btn primary" onClick={() => custom.trim() && give(custom.trim(), '💝')} disabled={!custom.trim()}>
              🎁
            </button>
          </div>
        </div>
      )}
      <Segmented
        value={box}
        onChange={setBox}
        small
        options={[
          ['mine', `Für mich (${mine.filter((c) => !c.redeemedAt).length})`],
          ['given', `Verschenkt (${given.length})`],
        ]}
      />
      {list.length === 0 ? (
        <p className="muted center">{box === 'mine' ? `Noch keine Gutscheine von ${partner.name}. Vielleicht mal einen Wink geben? 😉` : 'Verschenke deinen ersten Gutschein!'}</p>
      ) : (
        <div className="coupons">
          {list.map((c) => (
            <div key={c.id} className={cls('coupon', !!c.redeemedAt && 'redeemed')}>
              <span className="coupon-emoji">{c.emoji}</span>
              <div className="coupon-body">
                <b>{c.title}</b>
                <span className="muted small">
                  {c.redeemedAt ? `eingelöst ${formatDateTime(c.redeemedAt)}` : box === 'mine' ? `von ${data.persons[c.from].name}` : `für ${data.persons[c.to].name}`}
                </span>
              </div>
              {box === 'mine' && !c.redeemedAt && (
                <button
                  className="btn primary small"
                  onClick={(e) => {
                    actions.redeemCoupon(c.id);
                    heartBurst(e, c.emoji, 8);
                    showLove({ emoji: c.emoji, title: 'Gutschein eingelöst!', text: `„${c.title}“ – sag ${partner.name} Bescheid und genießt es! 💕`, big: true, tone: 'party' });
                  }}
                >
                  Einlösen
                </button>
              )}
              {box === 'given' && !c.redeemedAt && (
                <button className="icon-btn small ghost" onClick={() => actions.deleteCoupon(c.id)} aria-label="Gutschein zurückziehen">
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DateIdeas() {
  const [cat, setCat] = useState<'alle' | DateCategory>('alle');
  const pool = DATE_IDEAS.filter((d) => cat === 'alle' || d.category === cat);
  const [idea, setIdea] = useState(() => pickRandom(DATE_IDEAS));
  const roll = (c = cat) => {
    const options = DATE_IDEAS.filter((d) => (c === 'alle' || d.category === c) && d !== idea);
    setIdea(pickRandom(options.length ? options : pool));
  };
  return (
    <div className="card date-card">
      <h2>🎲 Date-Idee</h2>
      <Chips
        value={cat}
        onChange={(c) => {
          setCat(c);
          roll(c);
        }}
        options={[
          ['alle', 'Alle'],
          ['Aktiv', '🏃 Aktiv'],
          ['Kulinarisch', '🍝 Kulinarisch'],
          ['Gemütlich', '🛋️ Gemütlich'],
          ['Abenteuer', '🧭 Abenteuer'],
        ]}
      />
      <div className="date-idea" key={idea.text}>
        <span className="date-emoji">{idea.emoji}</span>
        <div>
          <span className="tag">{idea.category}</span>
          <p>{idea.text}</p>
        </div>
      </div>
      <button className="btn soft block" onClick={() => roll()}>
        🔀 Andere Idee
      </button>
    </div>
  );
}

function Us() {
  const data = useData();
  const device = useDevice();
  const { partner } = usePeople();
  const today = useToday();
  const sentToday = heartsOn(data, today, device.me);
  const receivedToday = heartsOn(data, today, partner.id);

  return (
    <>
      <Together />

      <div className="card heart-card">
        <button className="big-heart" onClick={(e) => sendHeartWithLove(e, partner.name)} aria-label={`Herz an ${partner.name} senden`}>
          ❤️
        </button>
        <div>
          <b>Herz an {partner.name} senden</b>
          <p className="muted">
            Heute {sentToday}× gesendet · {receivedToday}× von {partner.name} bekommen
          </p>
        </div>
      </div>

      <NoteComposer />
      <Inbox />
      <Coupons />
      <DateIdeas />

      <div className="card question-card">
        <p className="eyebrow">💬 Frage des Tages</p>
        <p className="big-text">{dailyQuestion(today)}</p>
        <p className="hint">Fragt euch das heute Abend beim Essen. 🍽️</p>
      </div>
    </>
  );
}

export function Love() {
  const { loveView } = useUI();
  return (
    <section className="screen">
      <Segmented
        value={loveView}
        onChange={nav.setLoveView}
        options={[
          ['wir', '💞 Wir zwei'],
          ['zyklus', '🌸 Zyklus'],
        ]}
      />
      {loveView === 'zyklus' ? <Cycle /> : <Us />}
    </section>
  );
}
