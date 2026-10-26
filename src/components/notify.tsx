import { useState } from 'react';
import { usePeople } from '../lib/hooks';
import { useLive } from '../lib/live';
import { disableNotify, enableNotify, notifySupport, pushPossible, testNotify, useNotifyState } from '../lib/notify';
import { useDevice } from '../lib/store';
import { nav } from '../lib/ui';
import { Segmented } from './ui';

const isAndroid = () => /Android/.test(navigator.userAgent);

function BlockedHelp() {
  return (
    <div className="notice warn">
      <p>
        Mitteilungen sind für Arta gerade blockiert.{' '}
        {isAndroid()
          ? 'Halte das Arta-Symbol gedrückt → App-Info → Benachrichtigungen, und erlaube sie dort.'
          : 'Erlaube sie in den Einstellungen deines Handys bzw. Browsers (Website-Einstellungen → Benachrichtigungen).'}
      </p>
    </div>
  );
}

/** „🔔 Mitteilungen“ in den Einstellungen. */
export function NotifySettings() {
  const device = useDevice();
  const { permission, push, lastSend } = useNotifyState();
  const live = useLive();
  const { partner } = usePeople();
  const [asking, setAsking] = useState(false);
  const support = notifySupport();
  const on = device.notify !== false && permission === 'granted';

  const choose = async (v: 'an' | 'aus') => {
    if (v === 'aus') return disableNotify();
    setAsking(true);
    await enableNotify();
    setAsking(false);
  };

  return (
    <div className="inset">
      <p className="muted small">
        Dein Handy meldet sich, wenn {partner.name} dir eine Botschaft, Herzen, einen Gutschein oder eine Spiel-Einladung schickt.
      </p>
      {support === 'install' && (
        <p className="hint">
          📲 Auf dem iPhone gehen Mitteilungen erst, wenn Arta auf dem Home-Bildschirm liegt: in Safari auf Teilen ⬆️ → „Zum Home-Bildschirm“ und Arta dann von dort öffnen.
        </p>
      )}
      {support === 'none' && <p className="hint">Dieser Browser kann leider keine Mitteilungen anzeigen.</p>}
      {support === 'ok' && permission === 'denied' && <BlockedHelp />}
      {support === 'ok' && permission !== 'denied' && (
        <Segmented
          value={on ? 'an' : 'aus'}
          onChange={(v) => void choose(v)}
          small
          options={[
            ['an', asking ? '… einen Moment' : '🔔 An'],
            ['aus', '🔕 Aus'],
          ]}
        />
      )}
      {on && (
        <>
          <p className="hint">
            {!live
              ? `Damit etwas ankommt, müsst ihr live verbunden sein – das geht über 🔄 Paar-Sync.`
              : push === 'on'
                ? '✓ Kommt auch an, wenn Arta ganz geschlossen ist.'
                : push === 'pending'
                  ? 'Mitteilungen werden eingerichtet …'
                  : pushPossible() && push === 'error'
                    ? 'Push ließ sich auf diesem Handy nicht einrichten – Mitteilungen kommen, solange Arta läuft (auch im Hintergrund).'
                    : 'Mitteilungen kommen, solange Arta läuft – auch im Hintergrund. Ist die App ganz geschlossen, siehst du alles beim nächsten Öffnen.'}
          </p>
          {lastSend && !lastSend.ok && <p className="hint">⚠️ Die letzte Mitteilung an {partner.name} kam nicht durch ({lastSend.detail}).</p>}
          <button className="btn soft block" onClick={() => testNotify(partner.name)}>
            🔔 Probe-Mitteilung
          </button>
        </>
      )}
      {!live && !on && support === 'ok' && permission !== 'denied' && (
        <button
          className="link"
          onClick={() => {
            nav.close();
            nav.open({ type: 'sync' });
          }}
        >
          ⚡ Live-Sync einrichten
        </button>
      )}
    </div>
  );
}

/** Einmalige Frage unter „Liebe“, sobald ihr live verbunden seid. */
export function NotifyPrompt() {
  const device = useDevice();
  const { permission } = useNotifyState();
  const live = useLive();
  const { partner } = usePeople();
  if (!live || device.notify !== undefined || notifySupport() !== 'ok' || permission !== 'default') return null;
  return (
    <div className="card notify-prompt">
      <span className="notify-prompt-emoji">🔔</span>
      <div className="grow">
        <b>Soll dein Handy Bescheid geben, wenn {partner.name} dir schreibt?</b>
        <p className="muted small">
          {pushPossible() ? 'Auch wenn Arta gerade geschlossen ist.' : 'Auch wenn Arta gerade im Hintergrund läuft.'} Ausschalten kannst du es jederzeit in den ⚙️ Einstellungen.
        </p>
        <div className="btn-row">
          <button className="btn primary small" onClick={() => void enableNotify()}>
            Ja, gerne 💞
          </button>
          <button className="btn ghost small" onClick={disableNotify}>
            Nein danke
          </button>
        </div>
      </div>
    </div>
  );
}
