import { useEffect, useRef, useState } from 'react';
import { CHEERS, PERSON_EMOJIS } from '../data/messages';
import { formatDateTime, todayKey } from '../lib/date';
import { cls, usePeople } from '../lib/hooks';
import { heartBurst, showLove } from '../lib/love';
import { ACTIVITY_LABEL, suggestKcalGoal, type Activity, type Sex } from '../lib/nutrition';
import { actions, getData, normalizeData, useData, useDevice, commitData } from '../lib/store';
import { mergeData } from '../lib/sync';
import { applySync, createShareText, joinWith, summarize, type ApplyResult } from '../lib/syncFlow';
import { other, type Person, type PersonId, type PopupFreq } from '../lib/types';
import { nav } from '../lib/ui';
import { Segmented, Sheet } from './ui';

// ───────────────────────── Sync ─────────────────────────

export function SyncSheet({ code, onClose }: { code?: string; onClose: () => void }) {
  const device = useDevice();
  const { me, partner } = usePeople();
  const [share, setShare] = useState<{ text: string; link: string } | null>(null);
  const [status, setStatus] = useState('');
  const [input, setInput] = useState(code ?? '');
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [busy, setBusy] = useState(false);
  const autoApplied = useRef(false);

  const prepare = async () => {
    const s = await createShareText();
    setShare(s);
    return s;
  };

  const sendShare = async () => {
    const s = share ?? (await prepare());
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Arta-Sync', text: s.text });
        setStatus('Gesendet! 💞');
        return;
      }
    } catch {
      // abgebrochen – zeige Alternativen
    }
    setStatus('Teilen ist hier nicht verfügbar – nutze WhatsApp oder Kopieren.');
  };

  const whatsapp = async () => {
    const s = share ?? (await prepare());
    window.open(`https://wa.me/?text=${encodeURIComponent(s.text)}`, '_blank', 'noopener');
  };

  const copy = async () => {
    const s = share ?? (await prepare());
    try {
      await navigator.clipboard.writeText(s.text);
      setStatus('Kopiert! Jetzt in den Chat mit deinem Schatz einfügen. 📋');
    } catch {
      setStatus('Kopieren nicht möglich – markiere den Text unten und kopiere ihn von Hand.');
    }
  };

  const apply = async (text = input) => {
    setBusy(true);
    const r = await applySync(text);
    setBusy(false);
    setResult(r);
    if (r.ok) {
      setInput('');
      showLove({ emoji: '🔄', title: `Synchronisiert mit ${r.partnerName}`, text: summarize(r.stats), tone: 'love' });
      if (r.newHearts > 0) {
        heartBurst(undefined, '❤️', Math.min(r.newHearts, 20));
        showLove({ emoji: '❤️', title: `${r.newHearts}× Herz von ${r.partnerName}`, text: 'Da denkt jemand ganz fest an dich!', tone: 'love' });
      }
    }
  };

  useEffect(() => {
    if (code && !autoApplied.current) {
      autoApplied.current = true;
      void apply(code);
    }
  }, [code]);

  const takeOver = () => {
    if (result && !result.ok && result.payload) {
      joinWith(result.payload);
      setResult(null);
      showLove({ emoji: '💞', title: 'Neu verbunden!', text: 'Ihr seid jetzt auf demselben Stand.', tone: 'party', big: true });
      onClose();
    }
  };

  return (
    <Sheet title="🔄 Paar-Sync" onClose={onClose}>
      <p className="lead">Arta speichert alles nur auf euren Handys – ganz ohne Konto oder Server. Mit einem Link bringt ihr euch gegenseitig auf den gleichen Stand.</p>
      <ol className="how">
        <li>
          Tippe auf <b>„Link senden“</b> und schick ihn {partner.name}.
        </li>
        <li>{partner.name} öffnet den Link – oder fügt die Nachricht unten bei „Stand übernehmen“ ein.</li>
        <li>Pläne, Essen, Einkaufsliste, Botschaften und Herzen werden zusammengeführt. Am besten macht ihr das in beide Richtungen.</li>
      </ol>

      <div className="inset">
        <h3>📤 Meinen Stand an {partner.name} senden</h3>
        <button className="btn primary block" onClick={sendShare}>
          Link senden 💞
        </button>
        <div className="btn-row">
          <button className="btn soft" onClick={whatsapp}>
            📱 WhatsApp
          </button>
          <button className="btn soft" onClick={copy}>
            📋 Kopieren
          </button>
        </div>
        {status && <p className="hint">{status}</p>}
        {share && <textarea className="code-box" readOnly value={share.text} rows={3} onFocus={(e) => e.target.select()} />}
      </div>

      <div className="inset">
        <h3>📥 Stand von {partner.name} übernehmen</h3>
        <textarea value={input} onChange={(e) => setInput(e.target.value)} rows={3} placeholder="Link oder ganze Nachricht hier einfügen …" />
        <button className="btn soft block" onClick={() => apply()} disabled={!input.trim() || busy}>
          {busy ? 'Übernehme …' : 'Übernehmen'}
        </button>
        {result && !result.ok && (
          <div className={cls('notice', result.reason === 'own' ? 'info' : 'warn')}>
            <p>{result.message}</p>
            {result.reason === 'same-person' && result.payload && (
              <>
                <p>
                  Ihr habt Arta wohl beide neu eingerichtet. Willst du als <b>{result.payload.data.persons[other(result.payload.from)].name}</b> mit dem Stand von{' '}
                  {result.payload.data.persons[result.payload.from].name} weitermachen? Deine bisherigen Einträge auf diesem Handy werden dabei ersetzt.
                </p>
                <button className="btn primary block" onClick={takeOver}>
                  Ja, Stand übernehmen
                </button>
              </>
            )}
          </div>
        )}
        {result?.ok && <p className="notice ok">✓ {summarize(result.stats)}</p>}
      </div>

      <p className="hint">
        Letzter Sync auf diesem Handy: {device.lastSyncAt ? formatDateTime(device.lastSyncAt) : 'noch nie'}. Du bist hier {me.emoji} {me.name}.
      </p>
      <p className="hint">
        📱 iPhone-Tipp: Ist Arta auf dem Home-Bildschirm installiert, öffnen Links sich in Safari statt in der App. Dann einfach die ganze Nachricht kopieren und hier einfügen.
      </p>
    </Sheet>
  );
}

// ───────────────────────── Anfeuern ─────────────────────────

export function CheerSheet({ onClose }: { onClose: () => void }) {
  const { partner } = usePeople();
  const [custom, setCustom] = useState('');
  const send = (text: string) => {
    actions.sendNote(text, { kind: 'cheer' });
    heartBurst(undefined, '📣', 6);
    showLove({ emoji: '📣', title: `${partner.name} angefeuert!`, text: `„${text}“ – kommt beim nächsten Sync an.`, tone: 'sport' });
    onClose();
  };
  return (
    <Sheet title={`📣 ${partner.name} anfeuern`} onClose={onClose}>
      <p className="lead">Ein kleiner Motivationsschub – {partner.name} sieht ihn als Einblendung in der App.</p>
      <div className="cheer-grid">
        {CHEERS.map((c) => (
          <button key={c} className="cheer-btn" onClick={() => send(c)}>
            {c}
          </button>
        ))}
      </div>
      <div className="add-form">
        <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Eigene Anfeuerung …" maxLength={140} />
        <button className="btn primary" onClick={() => custom.trim() && send(custom.trim())} disabled={!custom.trim()}>
          📣
        </button>
      </div>
    </Sheet>
  );
}

// ───────────────────────── Wer bist du? ─────────────────────────

export function WhoSheet({ onClose }: { onClose: () => void }) {
  const data = useData();
  const device = useDevice();
  const choose = (id: PersonId) => {
    if (id !== device.me) {
      actions.setMe(id);
      showLove({ emoji: data.persons[id].emoji, title: `Hallo ${data.persons[id].name}!`, text: 'Jetzt bist du dran. 💞', tone: 'love' });
    }
    onClose();
  };
  return (
    <Sheet title="Wer nutzt Arta gerade?" onClose={onClose}>
      <div className="who-grid">
        {(['a', 'b'] as const).map((id) => (
          <button key={id} className={cls('who-btn', device.me === id && 'active')} onClick={() => choose(id)}>
            <span className="avatar huge">{data.persons[id].emoji}</span>
            <b>{data.persons[id].name}</b>
            {device.me === id && <span className="muted small">aktiv</span>}
          </button>
        ))}
      </div>
      <p className="hint">Nutzt ihr ein gemeinsames Gerät, könnt ihr hier wechseln. Habt ihr zwei Handys, bleibt jeder einfach bei sich und ihr synchronisiert über 🔄.</p>
    </Sheet>
  );
}

// ───────────────────────── Einstellungen ─────────────────────────

function KcalHelper({ person, onDone }: { person: Person; onDone: () => void }) {
  const [sex, setSex] = useState<Sex>('w');
  const [age, setAge] = useState('30');
  const [height, setHeight] = useState('170');
  const [activity, setActivity] = useState<Activity>(1.375);
  const [goal, setGoal] = useState<'-1' | '0' | '1'>('0');
  const kcal = suggestKcalGoal({
    sex,
    age: Number(age) || 30,
    heightCm: Number(height) || 170,
    weightKg: person.weightKg,
    activity,
    goal: Number(goal) as -1 | 0 | 1,
  });
  return (
    <div className="inset">
      <p className="muted small">Grober Richtwert nach der Mifflin-St-Jeor-Formel mit {person.weightKg} kg.</p>
      <Segmented
        value={sex}
        onChange={setSex}
        small
        options={[
          ['w', 'weiblich'],
          ['m', 'männlich'],
          ['d', 'divers'],
        ]}
      />
      <div className="field-row">
        <label className="field">
          <span className="field-label">Alter</span>
          <input inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value.replace(/\D/g, ''))} />
        </label>
        <label className="field">
          <span className="field-label">Größe (cm)</span>
          <input inputMode="numeric" value={height} onChange={(e) => setHeight(e.target.value.replace(/\D/g, ''))} />
        </label>
      </div>
      <label className="field">
        <span className="field-label">Alltag</span>
        <select value={activity} onChange={(e) => setActivity(Number(e.target.value) as Activity)}>
          {ACTIVITY_LABEL.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
      </label>
      <Segmented
        value={goal}
        onChange={setGoal}
        small
        options={[
          ['-1', 'Abnehmen'],
          ['0', 'Halten'],
          ['1', 'Aufbauen'],
        ]}
      />
      <button
        className="btn primary block"
        onClick={() => {
          actions.updatePerson(person.id, { kcalGoal: kcal });
          onDone();
        }}
      >
        {kcal} kcal übernehmen
      </button>
    </div>
  );
}

function NumberField({ label, value, min, max, onCommit }: { label: string; value: number; min: number; max: number; onCommit: (v: number) => void }) {
  const [text, setText] = useState(String(value).replace('.', ','));
  useEffect(() => setText(String(value).replace('.', ',')), [value]);
  const commit = () => {
    const v = Number(text.replace(',', '.'));
    if (Number.isFinite(v) && v >= min && v <= max) onCommit(v);
    else setText(String(value).replace('.', ','));
  };
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()} />
    </label>
  );
}

function PersonSettings({ person }: { person: Person }) {
  const [helper, setHelper] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  return (
    <div className="inset person-settings">
      <div className="person-settings-head">
        <button className="avatar huge" onClick={() => setEmojiOpen((o) => !o)} aria-label="Symbol ändern">
          {person.emoji}
        </button>
        <label className="field grow">
          <span className="field-label">Name</span>
          <input value={person.name} maxLength={24} onChange={(e) => actions.updatePerson(person.id, { name: e.target.value })} />
        </label>
      </div>
      {emojiOpen && (
        <div className="emoji-picker">
          {PERSON_EMOJIS.map((e) => (
            <button
              key={e}
              className={cls('emoji-opt', e === person.emoji && 'active')}
              onClick={() => {
                actions.updatePerson(person.id, { emoji: e });
                setEmojiOpen(false);
              }}
            >
              {e}
            </button>
          ))}
        </div>
      )}
      <div className="field-row">
        <NumberField label="Gewicht (kg)" value={person.weightKg} min={30} max={300} onCommit={(weightKg) => actions.updatePerson(person.id, { weightKg })} />
        <NumberField label="kcal-Ziel / Tag" value={person.kcalGoal} min={800} max={6000} onCommit={(kcalGoal) => actions.updatePerson(person.id, { kcalGoal: Math.round(kcalGoal) })} />
      </div>
      <button className="link" onClick={() => setHelper((h) => !h)}>
        {helper ? 'Rechner schließen' : '🧮 kcal-Ziel berechnen'}
      </button>
      {helper && <KcalHelper person={person} onDone={() => setHelper(false)} />}
    </div>
  );
}

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const data = useData();
  const device = useDevice();
  const [confirmReset, setConfirmReset] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify({ app: 'arta-backup', v: 1, at: Date.now(), data: getData() }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `arta-backup-${todayKey()}.json`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const importBackup = async (file: File) => {
    try {
      const json = JSON.parse(await file.text());
      if (json?.app !== 'arta-backup') throw new Error('kein Backup');
      const { data: merged } = mergeData(getData(), normalizeData(json.data), device.me);
      commitData(merged);
      setImportMsg('✓ Backup eingespielt.');
    } catch {
      setImportMsg('Das ist keine gültige Arta-Backup-Datei.');
    }
  };

  return (
    <Sheet title="⚙️ Einstellungen" onClose={onClose}>
      <h3>💑 Wir zwei</h3>
      <PersonSettings person={data.persons[device.me]} />
      <PersonSettings person={data.persons[other(device.me)]} />

      <h3>📅 Unser Paar</h3>
      <div className="inset">
        <label className="field">
          <span className="field-label">Zusammen seit</span>
          <input type="date" value={data.couple.anniversary ?? ''} max={todayKey()} onChange={(e) => actions.updateCouple({ anniversary: e.target.value || undefined })} />
        </label>
        <label className="field">
          <span className="field-label">Gemeinsames Wochenziel: {data.couple.weeklyGoal} Einheiten</span>
          <input type="range" min={2} max={30} value={data.couple.weeklyGoal} onChange={(e) => actions.updateCouple({ weeklyGoal: Number(e.target.value) })} />
        </label>
      </div>

      <h3>💗 Liebes-Einblendungen</h3>
      <div className="inset">
        <p className="muted small">Wie oft sollen kleine Liebesgrüße zwischendurch auftauchen?</p>
        <Segmented
          value={device.popupFreq}
          onChange={(v: PopupFreq) => actions.setPopupFreq(v)}
          small
          options={[
            ['oft', 'Oft'],
            ['normal', 'Normal'],
            ['selten', 'Selten'],
            ['aus', 'Aus'],
          ]}
        />
      </div>

      <h3>📱 Dieses Handy</h3>
      <div className="inset">
        <p className="muted small">Wer nutzt dieses Gerät?</p>
        <Segmented
          value={device.me}
          onChange={(v: PersonId) => actions.setMe(v)}
          small
          options={(['a', 'b'] as const).map((id) => [id, `${data.persons[id].emoji} ${data.persons[id].name}`])}
        />
        <button
          className="btn soft block"
          onClick={() => {
            onClose();
            nav.open({ type: 'sync' });
          }}
        >
          🔄 Paar-Sync öffnen
        </button>
      </div>

      <h3>💾 Daten</h3>
      <div className="inset">
        <p className="muted small">Alles bleibt auf deinem Gerät. Ein Backup schützt vor Datenverlust, z. B. beim Handywechsel.</p>
        <div className="btn-row">
          <button className="btn soft" onClick={exportBackup}>
            ⬇️ Backup sichern
          </button>
          <button className="btn soft" onClick={() => fileRef.current?.click()}>
            ⬆️ Backup laden
          </button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importBackup(f);
            e.target.value = '';
          }}
        />
        {importMsg && <p className="hint">{importMsg}</p>}
        {!confirmReset ? (
          <button className="btn danger-ghost block" onClick={() => setConfirmReset(true)}>
            Alles löschen …
          </button>
        ) : (
          <div className="notice warn">
            <p>Wirklich alle Daten auf diesem Handy löschen? Das kann nicht rückgängig gemacht werden.</p>
            <div className="btn-row">
              <button className="btn ghost" onClick={() => setConfirmReset(false)}>
                Abbrechen
              </button>
              <button
                className="btn danger"
                onClick={() => {
                  actions.resetAll();
                  onClose();
                }}
              >
                Ja, löschen
              </button>
            </div>
          </div>
        )}
      </div>
      <p className="hint center">Arta · mit ❤️ gemacht für euch zwei</p>
    </Sheet>
  );
}
