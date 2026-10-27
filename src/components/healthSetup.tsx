import { useEffect, useState } from 'react';
import { formatTime, relativeDay } from '../lib/date';
import { HEALTH_PREFIX, useHealth } from '../lib/health';
import { usePeople } from '../lib/hooks';
import { deriveRoom, liveAvailable } from '../lib/live';
import { LIVE_DB_URL } from '../lib/liveConfig';
import { formatSteps } from '../lib/steps';
import { useDevice } from '../lib/store';
import { nav } from '../lib/ui';
import { Sheet } from './ui';

/** Adresse, an die der Kurzbefehl die Schritte schickt – hängt vom Live-Raum und von dir ab. */
function useHealthUrl(): string | undefined {
  const device = useDevice();
  const [url, setUrl] = useState<string>();
  const secret = device.live?.secret;
  useEffect(() => {
    setUrl(undefined);
    if (!secret || !liveAvailable()) return;
    let alive = true;
    deriveRoom(secret)
      .then(({ id }) => alive && setUrl(`${LIVE_DB_URL}/rooms/${id}/${HEALTH_PREFIX}${device.me}.json`))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [secret, device.me]);
  return url;
}

export function CopyBox({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ohne Zwischenablage-Recht: Text markieren, dann kann man selbst kopieren.
    }
  };
  return (
    <div className="copy-box">
      <textarea className="code-box" readOnly value={text} rows={text.length > 80 ? 3 : 2} onFocus={(e) => e.target.select()} aria-label={label} />
      <button className="btn soft small" onClick={copy}>
        {copied ? '✓ Kopiert' : `📋 ${label} kopieren`}
      </button>
    </div>
  );
}

/** Felder für „Haupttext anfordern: JSON“ – ergibt {"v":1,"at":{".sv":"timestamp"},"iv":"health","ct":"8432"}. */
const JSON_FIELDS = [
  { type: 'Zahl', key: 'v', value: '1' },
  { type: 'Wörterbuch', key: 'at', value: 'darin ein Feld:' },
  { type: 'Text', key: '.sv', value: 'timestamp', inner: true },
  { type: 'Text', key: 'iv', value: 'health' },
  { type: 'Text', key: 'ct', value: 'Variable „Health-Messungen“ → Wert' },
];

/** Schritt-für-Schritt: iPhone-Kurzbefehl, der Apple-Health-Schritte an Arta schickt. */
export function HealthSheet({ onClose }: { onClose: () => void }) {
  const device = useDevice();
  const { partner } = usePeople();
  const health = useHealth()[device.me];
  const url = useHealthUrl();

  return (
    <Sheet title="🍎 Apple Health verbinden" onClose={onClose}>
      <p className="lead">
        Ein Kurzbefehl auf deinem iPhone liest deine Schritte aus Apple Health und schickt sie an Arta – auch wenn Arta zu ist. {partner.name} sieht sie dann sofort.
      </p>

      <div className={health && !health.broken ? 'inset health-status ok' : 'inset health-status'}>
        {health?.broken ? (
          <p>
            ⚠️ Dein Kurzbefehl kommt an, aber ohne Schrittzahl. Steht in Schritt 4 bei <code>ct</code> die Variable <b>„Health-Messungen“</b> mit{' '}
            <b>„Wert“</b>?
          </p>
        ) : health ? (
          <p>
            ✅ <b>Verbunden!</b> Zuletzt kamen {formatSteps(health.count)} Schritte an ({relativeDay(health.date)}, {formatTime(health.at)} Uhr).
          </p>
        ) : (
          <p>⏳ Noch nichts angekommen. Sobald dein Kurzbefehl einmal gelaufen ist, steht hier ✅.</p>
        )}
      </div>

      {!device.live || !url ? (
        <div className="inset">
          <p>Dafür braucht ihr den Live-Sync – darüber kommen die Schritte zu Arta. Verbinde zuerst eure Handys.</p>
          <button className="btn primary block" onClick={() => nav.open({ type: 'sync' })}>
            🔄 Live-Sync einrichten
          </button>
        </div>
      ) : (
        <>
          <h3>1 · Kurzbefehl bauen (einmalig)</h3>
          <ol className="how">
            <li>
              Öffne die App <b>Kurzbefehle</b>, tippe oben rechts auf <b>+</b> und nenne den Kurzbefehl <b>„Arta Schritte“</b>.
            </li>
            <li>
              Füge die Aktion <b>„Health-Messungen suchen“</b> hinzu (heißt manchmal auch „Health-Samples suchen“). Typ: <b>Schritte</b> · Filter:{' '}
              <b>Startdatum ist heute</b> · <b>Gruppieren nach: Tag</b> · <b>Fehlende ausfüllen: aus</b>.
              <br />
              Trägst du eine <b>Apple Watch</b> (oder zählt noch eine andere App Schritte)? Dann tippe auf <b>Filter hinzufügen</b>: <b>Quelle ist</b> deine
              Apple Watch – oder dein iPhone, wenn du die Uhr nicht den ganzen Tag trägst. Sonst zählt jeder Schritt doppelt: Die Health-App rechnet Doppeltes
              heraus, ein Kurzbefehl nicht.
            </li>
            <li>
              Füge direkt darunter <b>„Inhalte von URL abrufen“</b> hinzu und ersetze die Adresse durch deine:
              <CopyBox label="Adresse" text={url} />
              Tippe auf den Pfeil in der Aktion: <b>Methode: PUT</b> · <b>Haupttext anfordern: JSON</b>. Eine Aktion „Text“ brauchst du nicht.
            </li>
            <li>
              Lege unter JSON mit <b>„Neues Feld hinzufügen“</b> diese vier Felder an – Schlüssel genau so, klein geschrieben:
              <ul className="json-fields">
                {JSON_FIELDS.map((f) => (
                  <li key={f.key} className={f.inner ? 'inner' : undefined}>
                    <span className="json-type">{f.inner ? `↳ ${f.type}` : f.type}</span>
                    <span>
                      <code>{f.key}</code> → {f.value}
                    </span>
                  </li>
                ))}
              </ul>
              Bei <code>ct</code>: ins Wertfeld tippen, oben über der Tastatur die Variable <b>„Health-Messungen“</b> wählen, dann auf die blaue Variable tippen und{' '}
              <b>„Wert“</b> auswählen.
            </li>
            <li>
              Tippe unten auf <b>▶︎</b>. Beim ersten Mal fragt das iPhone, ob der Kurzbefehl Health lesen und die Adresse aufrufen darf – beide Male{' '}
              <b>Erlauben</b>. Als Antwort steht dann z. B. <code>"ct" : "5123"</code> da, und oben in diesem Fenster erscheint ✅.
            </li>
          </ol>

          <details className="steps-why">
            <summary>Es klappt nicht?</summary>
            <ul className="how small">
              <li>
                <b>„Invalid data; couldn't parse JSON“</b>: Bei „Haupttext anfordern“ steht noch <b>Datei</b> oder <b>Formular</b>. Stell auf <b>JSON</b> um und
                lösch eine eventuelle Aktion „Text“ – dann baut das iPhone die Nachricht selbst, ohne Tippfehler.
              </li>
              <li>
                <b>„Permission denied“</b>: Prüf die Feldtypen – <code>v</code> muss <b>Zahl</b> sein, <code>ct</code> <b>Text</b>, <code>at</code>{' '}
                <b>Wörterbuch</b> – und die Schlüssel ohne Leerzeichen. Habt ihr den Live-Sync neu verbunden, kopier die Adresse neu.
              </li>
              <li>
                <b>⚠️ oben trotz Antwort</b>: Bei <code>ct</code> fehlt die Variable, oder es ist nicht „Wert“ ausgewählt.
              </li>
              <li>
                <b>Mehr Schritte als in der Health-App</b> (oben bei ✅ steht eine viel größere Zahl): Zwei Geräte zählen mit, meist iPhone und Apple Watch. Füg
                in Schritt 2 den Filter <b>Quelle</b> hinzu – dann kommt beim nächsten Lauf die richtige Zahl an und ersetzt die alte.
              </li>
            </ul>
          </details>

          <h3>2 · Automatisch laufen lassen</h3>
          <ol className="how" start={6}>
            <li>
              In Kurzbefehle unten auf <b>Automation</b> → <b>+</b> → <b>App</b>. Wähle Apps, die du oft benutzt (z. B. WhatsApp, Instagram, Safari), dann{' '}
              <b>Wird geschlossen</b> und <b>Sofort ausführen</b>. Weiter → <b>„Arta Schritte“</b> wählen.
            </li>
            <li>
              Für einen vollständigen Tag noch eine zweite Automation: <b>Tageszeit</b> 21:30, <b>Sofort ausführen</b>, wieder „Arta Schritte“.
            </li>
          </ol>
          <p className="hint">
            Ab dann läuft alles unbemerkt im Hintergrund. Gut zu wissen: Bei gesperrtem iPhone kommt auch ein Kurzbefehl nicht an Health – deshalb der Trick mit „App
            wird geschlossen“, dann ist das iPhone sicher entsperrt.
          </p>
          <details className="steps-why">
            <summary>Was wird dabei verschickt?</summary>
            <p className="muted small">
              Nur deine heutige Schrittzahl, an eure geheime Raum-Adresse in eurer Datenbank. Anders als eure übrigen Daten ist sie nicht verschlüsselt, weil
              Kurzbefehle das nicht können. Verbindet ihr den Live-Sync einmal neu, ändert sich die Adresse – dann kopiere sie hier neu in Schritt 3.
            </p>
          </details>
          <p className="hint">Android hat keine Kurzbefehle – dort bleibt „Mitzählen“ oder Eintragen aus Google Fit / Samsung Health.</p>
        </>
      )}
    </Sheet>
  );
}
