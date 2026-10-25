import { useEffect, useRef, useState } from 'react';
import { PERSON_EMOJIS } from '../data/messages';
import { todayKey } from '../lib/date';
import { cls } from '../lib/hooks';
import { showLove } from '../lib/love';
import { actions } from '../lib/store';
import { joinWith, readCode } from '../lib/syncFlow';
import { other } from '../lib/types';

type Step = 'welcome' | 'me' | 'partner' | 'date' | 'join';

function EmojiPicker({ value, onChange }: { value: string; onChange: (e: string) => void }) {
  return (
    <div className="emoji-picker">
      {PERSON_EMOJIS.map((e) => (
        <button key={e} className={cls('emoji-opt', e === value && 'active')} onClick={() => onChange(e)} aria-label={e}>
          {e}
        </button>
      ))}
    </div>
  );
}

/** Erst nach dem Wechsel in die App zeigen – sonst verschwindet die Einblendung mit diesem Bildschirm. */
const showAfterSwitch = (popup: Parameters<typeof showLove>[0]) => window.setTimeout(() => showLove(popup), 300);

export function Onboarding({ initialCode }: { initialCode?: string }) {
  const [step, setStep] = useState<Step>(initialCode ? 'join' : 'welcome');
  const [meName, setMeName] = useState('');
  const [meEmoji, setMeEmoji] = useState('🦁');
  const [partnerName, setPartnerName] = useState('');
  const [partnerEmoji, setPartnerEmoji] = useState('🦋');
  const [anniversary, setAnniversary] = useState('');
  const [code, setCode] = useState(initialCode ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const finish = () => {
    actions.setupCouple({ meName: meName.trim(), meEmoji, partnerName: partnerName.trim(), partnerEmoji, anniversary });
    showAfterSwitch({
      emoji: '💞',
      title: `Willkommen, ${meName.trim()}!`,
      text: `Schön, dass ihr da seid. Schick ${partnerName.trim()} gleich über 🔄 einen Sync-Link, dann seid ihr verbunden.`,
      big: true,
      tone: 'party',
    });
  };

  const join = async (text = code) => {
    setBusy(true);
    setError('');
    try {
      const payload = await readCode(text);
      const { liveJoined } = joinWith(payload);
      const meP = payload.data.persons[other(payload.from)];
      const partnerP = payload.data.persons[payload.from];
      showAfterSwitch({
        emoji: '💞',
        title: `Hallo ${meP.name}!`,
        text: liveJoined
          ? `Du bist jetzt mit ${partnerP.name} live verbunden – ab sofort synchronisiert Arta eure Handys automatisch. ⚡`
          : `Du bist jetzt mit ${partnerP.name} verbunden. Schick über 🔄 auch deinen Stand zurück.`,
        big: true,
        tone: 'party',
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Das hat nicht geklappt.');
    } finally {
      setBusy(false);
    }
  };

  // Über einen Sync-Link geöffnet: direkt verbinden.
  const autoJoined = useRef(false);
  useEffect(() => {
    if (!initialCode || autoJoined.current) return;
    autoJoined.current = true;
    void join(initialCode);
  }, []);

  return (
    <div className="onboarding">
      <div className="floating-hearts" aria-hidden="true">
        {Array.from({ length: 12 }, (_, i) => (
          <span key={i} style={{ left: `${(i * 83) % 100}%`, animationDelay: `${i * 0.7}s` }}>
            {['❤️', '💕', '💖', '💗'][i % 4]}
          </span>
        ))}
      </div>

      <div className="onboarding-card">
        {step === 'welcome' && (
          <>
            <div className="logo-big">💞</div>
            <h1>Willkommen bei Arta</h1>
            <p className="lead">Eure gemeinsame App für Liebe, Sport &amp; gutes Essen. Plant zusammen, motiviert euch gegenseitig und schickt euch kleine Liebesbotschaften.</p>
            <ul className="feature-list">
              <li>💪 Jeden Tag neue Workouts für zuhause, draußen &amp; zu zweit</li>
              <li>🥗 Gesunde Rezepte mit Kalorien &amp; Tagesbilanz</li>
              <li>🛒 Gemeinsame Einkaufsliste</li>
              <li>💌 Liebesbotschaften, Herzen &amp; Gutscheine</li>
            </ul>
            <button className="btn primary block big" onClick={() => setStep('me')}>
              Los geht’s 💞
            </button>
            <button className="btn ghost block" onClick={() => setStep('join')}>
              Mein Schatz nutzt Arta schon
            </button>
          </>
        )}

        {step === 'me' && (
          <>
            <p className="step-dot">Schritt 1 von 3</p>
            <h1>Wie heißt du?</h1>
            <input className="big-input" value={meName} onChange={(e) => setMeName(e.target.value)} placeholder="Dein Name" autoFocus maxLength={24} />
            <p className="field-label">Dein Symbol</p>
            <EmojiPicker value={meEmoji} onChange={setMeEmoji} />
            <button className="btn primary block big" onClick={() => setStep('partner')} disabled={!meName.trim()}>
              Weiter
            </button>
          </>
        )}

        {step === 'partner' && (
          <>
            <p className="step-dot">Schritt 2 von 3</p>
            <h1>Und dein Schatz?</h1>
            <input className="big-input" value={partnerName} onChange={(e) => setPartnerName(e.target.value)} placeholder="Name deines Schatzes" autoFocus maxLength={24} />
            <p className="field-label">Symbol für {partnerName.trim() || 'deinen Schatz'}</p>
            <EmojiPicker value={partnerEmoji} onChange={setPartnerEmoji} />
            <div className="btn-row">
              <button className="btn ghost" onClick={() => setStep('me')}>
                Zurück
              </button>
              <button className="btn primary grow" onClick={() => setStep('date')} disabled={!partnerName.trim()}>
                Weiter
              </button>
            </div>
          </>
        )}

        {step === 'date' && (
          <>
            <p className="step-dot">Schritt 3 von 3</p>
            <div className="couple-big small">
              <span>{meEmoji}</span>
              <span className="pulse-heart">❤️</span>
              <span>{partnerEmoji}</span>
            </div>
            <h1>Seit wann seid ihr ein Paar?</h1>
            <p className="muted">Dann zählt Arta eure gemeinsamen Tage und erinnert euch an Jahrestage. (Optional)</p>
            <input className="big-input" type="date" value={anniversary} onChange={(e) => setAnniversary(e.target.value)} max={todayKey()} />
            <div className="btn-row">
              <button className="btn ghost" onClick={() => setStep('partner')}>
                Zurück
              </button>
              <button className="btn primary grow" onClick={finish}>
                {anniversary ? 'Fertig 💞' : 'Überspringen & loslegen'}
              </button>
            </div>
          </>
        )}

        {step === 'join' && (
          <>
            <div className="logo-big">🔗</div>
            <h1>Mit deinem Schatz verbinden</h1>
            <p className="lead">Bitte deinen Schatz, in Arta auf 🔄 zu tippen und dir den Link zu schicken. Öffne den Link – oder füge die ganze Nachricht hier ein:</p>
            <textarea value={code} onChange={(e) => setCode(e.target.value)} rows={4} placeholder="Link oder Nachricht einfügen …" />
            {error && <p className="error">{error}</p>}
            <div className="btn-row">
              <button className="btn ghost" onClick={() => setStep('welcome')}>
                Zurück
              </button>
              <button className="btn primary grow" onClick={() => join()} disabled={!code.trim() || busy}>
                {busy ? 'Verbinde …' : 'Verbinden 💞'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
