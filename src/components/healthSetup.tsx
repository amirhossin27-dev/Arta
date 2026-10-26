import { useEffect, useState } from 'react';
import { formatTime, relativeDay } from '../lib/date';
import { HEALTH_BODY, HEALTH_PREFIX, useHealth } from '../lib/health';
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

function CopyBox({ label, text }: { label: string; text: string }) {
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
            ⚠️ Dein Kurzbefehl kommt an, aber ohne Schrittzahl. Ist in Schritt 3 statt des Worts SCHRITTE die Variable <b>„Health-Samples“</b> eingesetzt?
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
              Füge die Aktion <b>„Health-Samples suchen“</b> hinzu. Typ: <b>Schritte</b> · Filter: <b>Startdatum ist heute</b> · <b>Gruppieren nach: Tag</b>.
            </li>
            <li>
              Füge die Aktion <b>„Text“</b> hinzu und kopiere diesen Text hinein:
              <CopyBox label="Text" text={HEALTH_BODY} />
              Lösche dann das Wort <b>SCHRITTE</b> und setze an genau der Stelle die Variable <b>„Health-Samples“</b> ein (Leiste über der Tastatur). Die
              Anführungszeichen drumherum bleiben stehen.
            </li>
            <li>
              Füge die Aktion <b>„Inhalte von URL abrufen“</b> hinzu und ersetze die Adresse durch deine:
              <CopyBox label="Adresse" text={url} />
              Tippe auf den Pfeil in der Aktion: <b>Methode: PUT</b> · <b>Anfragetext: Datei</b> · als Datei die Variable <b>„Text“</b>.
            </li>
            <li>
              Tippe unten auf <b>▶︎</b>. Beim ersten Mal fragt das iPhone, ob der Kurzbefehl Health lesen und die Adresse aufrufen darf – beide Male{' '}
              <b>Erlauben</b>. Oben in diesem Fenster erscheint dann ✅.
            </li>
          </ol>

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
              Kurzbefehle das nicht können. Verbindet ihr den Live-Sync einmal neu, ändert sich die Adresse – dann kopiere sie hier neu in Schritt 4.
            </p>
          </details>
          <p className="hint">Android hat keine Kurzbefehle – dort bleibt „Mitzählen“ oder Eintragen aus Google Fit / Samsung Health.</p>
        </>
      )}
    </Sheet>
  );
}
