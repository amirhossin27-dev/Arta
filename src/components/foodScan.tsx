import { useEffect, useRef, useState } from 'react';
import { MEAL_ORDER, MEAL_SHORT } from '../data/recipes';
import { celebrateMeal } from '../lib/celebrate';
import {
  analyzeFood,
  gramStep,
  itemKcal,
  looksLikeApiKey,
  prepareImage,
  scanErrorText,
  scanTotals,
  setApiKey,
  useApiKey,
  type PreparedImage,
  type ScanItem,
  type ScanResult,
} from '../lib/foodScan';
import { cls, usePeople } from '../lib/hooks';
import { actions, type Who } from '../lib/store';
import type { MealType } from '../lib/types';
import { Segmented, Sheet } from './ui';

const LOADING_LINES = [
  'Arta schaut genau hin … 👀',
  'Schätze die Portion …',
  'Suche nach versteckten Soßen … 🕵️',
  'Zähle die Kalorien …',
  'Prüfe auf Liebe … 💕',
];

const PORTIONS: [string, string][] = [
  ['0.5', '½'],
  ['0.75', '¾'],
  ['1', 'Alles'],
  ['1.5', '1½×'],
  ['2', '2×'],
];

const CONFIDENCE_LABEL = { hoch: '🎯 ziemlich sicher', mittel: '🤔 gute Schätzung', niedrig: '🌫️ grobe Schätzung' } as const;

type Phase = 'pick' | 'loading' | 'result' | 'error';

export function FoodScanSheet({ date, meal, onClose }: { date: string; meal: MealType; onClose: () => void }) {
  return (
    <Sheet title="📸 Essen erkennen" onClose={onClose}>
      <FoodScan date={date} meal={meal} onDone={onClose} />
    </Sheet>
  );
}

/**
 * Foto → KI-Schätzung → anpassbare Zutatenliste → Eintrag.
 * Mit `who` (aus dem Eintragen-Sheet) sind Mahlzeit und Person schon gewählt.
 */
export function FoodScan({ date, meal: initialMeal, who: fixedWho, onDone }: { date: string; meal: MealType; who?: Who; onDone: () => void }) {
  const key = useApiKey();
  const { me } = usePeople();
  const [editKey, setEditKey] = useState(false);
  const [phase, setPhase] = useState<Phase>('pick');
  const [image, setImage] = useState<PreparedImage | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [items, setItems] = useState<ScanItem[]>([]);
  const [portion, setPortion] = useState('1');
  const [hint, setHint] = useState('');
  const [error, setError] = useState('');
  const [meal, setMeal] = useState<MealType>(initialMeal);
  const [line, setLine] = useState(0);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    if (phase !== 'loading') return;
    setLine(0);
    const t = window.setInterval(() => setLine((l) => (l + 1) % LOADING_LINES.length), 1800);
    return () => window.clearInterval(t);
  }, [phase]);

  if (!key || editKey) return <AiKeySetup hasKey={!!key} onDone={() => setEditKey(false)} />;

  const run = async (img: PreparedImage, hintText: string) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setPhase('loading');
    setError('');
    try {
      const r = await analyzeFood(img, { hint: hintText, signal: ctrl.signal });
      if (ctrl.signal.aborted) return;
      setResult(r);
      setItems(r.items);
      setPortion('1');
      setPhase('result');
    } catch (e) {
      if (ctrl.signal.aborted) return;
      setError(scanErrorText(e));
      setPhase('error');
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const img = await prepareImage(file);
      setImage(img);
      setHint('');
      void run(img, '');
    } catch (e) {
      setError(scanErrorText(e));
      setPhase('error');
    }
  };

  const restart = () => {
    abortRef.current?.abort();
    setPhase('pick');
    setResult(null);
    setItems([]);
    setImage(null);
  };

  const factor = Number(portion);
  const totals = scanTotals(items, factor);

  const log = (who: Who) => {
    if (!result) return;
    actions.addMeal({ date, meal, name: result.dish, emoji: result.emoji, ...totals, who });
    celebrateMeal(result.dish);
    onDone();
  };

  const changeGrams = (index: number, dir: 1 | -1) =>
    setItems(items.map((it, i) => (i === index ? { ...it, grams: Math.max(5, it.grams + dir * gramStep(it.grams - (dir < 0 ? 1 : 0))) } : it)));

  return (
    <div className="scan">
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
      <input ref={galleryRef} type="file" accept="image/*" hidden onChange={(e) => void onFile(e.target.files?.[0])} />

      {phase === 'pick' && (
        <>
          <div className="scan-pick">
            <button className="scan-shot" onClick={() => cameraRef.current?.click()}>
              <span className="scan-shot-icon">📷</span>
              <b>Foto aufnehmen</b>
            </button>
            <button className="scan-shot alt" onClick={() => galleryRef.current?.click()}>
              <span className="scan-shot-icon">🖼️</span>
              <b>Aus der Galerie</b>
            </button>
          </div>
          <p className="tip">💡 Am besten schräg von oben, mit dem ganzen Teller im Bild. Besteck daneben hilft der KI, die Größe einzuschätzen.</p>
          <button className="link center-link" onClick={() => setEditKey(true)}>
            🔑 KI-Schlüssel ändern
          </button>
        </>
      )}

      {phase !== 'pick' && image && (
        <div className={cls('scan-photo', phase === 'loading' && 'scanning')}>
          <img src={image.url} alt="Dein Essen" />
          {phase === 'loading' && <span className="scan-beam" />}
        </div>
      )}

      {phase === 'loading' && (
        <div className="scan-loading" role="status">
          <span className="scan-plate">🍽️</span>
          <p key={line}>{LOADING_LINES[line]}</p>
        </div>
      )}

      {phase === 'error' && (
        <div className="scan-error">
          <p>😕 {error}</p>
          <div className="btn-row">
            {image && (
              <button className="btn primary" onClick={() => void run(image, hint)}>
                🔄 Nochmal versuchen
              </button>
            )}
            <button className="btn soft" onClick={restart}>
              📷 Neues Foto
            </button>
          </div>
        </div>
      )}

      {phase === 'result' && result && !result.isFood && (
        <div className="scan-error">
          <p>🤔 Hmm, da sehe ich kein Essen. {result.note}</p>
          <button className="btn primary block" onClick={restart}>
            📷 Neues Foto
          </button>
        </div>
      )}

      {phase === 'result' && result && result.isFood && (
        <>
          <div className="scan-head">
            <span className="scan-dish-emoji">{result.emoji}</span>
            <div className="grow">
              <h3>{result.dish}</h3>
              <span className="badge soft">{CONFIDENCE_LABEL[result.confidence]}</span>
            </div>
          </div>
          {result.note && <p className="scan-note">{result.note}</p>}

          <div className="facts food">
            <div>
              <b>{totals.kcal}</b>
              <span>kcal</span>
            </div>
            <div>
              <b>{totals.protein} g</b>
              <span>Eiweiß</span>
            </div>
            <div>
              <b>{totals.carbs} g</b>
              <span>Kohlenhydrate</span>
            </div>
            <div>
              <b>{totals.fat} g</b>
              <span>Fett</span>
            </div>
          </div>

          <div className="section-head">
            <h3>Erkannt</h3>
            <span className="muted">Mengen anpassbar</span>
          </div>
          <ul className="scan-items">
            {items.map((it, index) => (
              <li key={`${it.name}-${index}`}>
                <span className="scan-item-emoji">{it.emoji}</span>
                <span className="scan-item-info">
                  <b>{it.name}</b>
                  <span className="muted">{itemKcal(it, factor)} kcal</span>
                </span>
                <span className="scan-grams">
                  <button className="icon-btn small" onClick={() => changeGrams(index, -1)} aria-label={`${it.name}: weniger`} disabled={it.grams <= 5}>
                    −
                  </button>
                  <span>{it.grams} g</span>
                  <button className="icon-btn small" onClick={() => changeGrams(index, 1)} aria-label={`${it.name}: mehr`}>
                    +
                  </button>
                </span>
                <button className="icon-btn small ghost" onClick={() => setItems(items.filter((_, i) => i !== index))} aria-label={`${it.name} entfernen`}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
          {!items.length && <p className="hint center">Alles entfernt – mach einfach ein neues Foto.</p>}

          <p className="field-label">Wie viel davon hast du gegessen?</p>
          <Segmented value={portion} onChange={setPortion} small options={PORTIONS} />

          <div className="scan-fix">
            <input value={hint} onChange={(e) => setHint(e.target.value)} placeholder="Stimmt was nicht? z. B. „Das ist Tofu, kein Hähnchen“" maxLength={300} />
            <button className="btn soft" onClick={() => image && void run(image, hint)} disabled={!hint.trim()}>
              🔄 Neu schätzen
            </button>
          </div>

          <div className="inset">
            <h3>🍽️ Eintragen</h3>
            {!fixedWho && <Segmented value={meal} onChange={setMeal} small options={MEAL_ORDER.map((m) => [m, MEAL_SHORT[m]])} />}
            {fixedWho ? (
              <button className="btn primary block" onClick={() => log(fixedWho)} disabled={!items.length}>
                ✓ {totals.kcal} kcal eintragen
              </button>
            ) : (
              <div className="btn-row">
                <button className="btn primary" onClick={() => log('me')} disabled={!items.length}>
                  {me.emoji} Für mich
                </button>
                <button className="btn soft" onClick={() => log('both')} disabled={!items.length}>
                  💑 Für uns beide
                </button>
              </div>
            )}
          </div>
          <button className="link center-link" onClick={restart}>
            📷 Anderes Foto
          </button>
          <p className="hint">Die Werte sind eine KI-Schätzung aus dem Foto und können danebenliegen – Mengen lieber kurz prüfen.</p>
        </>
      )}
    </div>
  );
}

function AiKeySetup({ hasKey, onDone }: { hasKey: boolean; onDone: () => void }) {
  const [value, setValue] = useState('');
  const valid = looksLikeApiKey(value);

  const save = () => {
    if (!valid) return;
    setApiKey(value);
    onDone();
  };

  return (
    <div className="scan-setup">
      <div className="scan-setup-hero">
        <span>🤖📸</span>
        <h3>{hasKey ? 'KI-Schlüssel ändern' : 'Foto-Erkennung einrichten'}</h3>
        <p className="muted">
          Arta erkennt dein Essen mit Claude, der KI von Anthropic. Dafür braucht die App einen eigenen API-Schlüssel – einmal pro Handy, danach geht’s mit
          einem Foto.
        </p>
      </div>
      <ol className="steps">
        <li>
          <span>
            Auf{' '}
            <a href="https://console.anthropic.com/" target="_blank" rel="noreferrer">
              console.anthropic.com
            </a>{' '}
            ein Konto anlegen.
          </span>
        </li>
        <li>
          <span>Unter „Billing“ Guthaben aufladen – 5 $ reichen für etwa 200 Fotos (ca. 2–3 Cent pro Foto).</span>
        </li>
        <li>
          <span>Unter „API Keys“ auf „Create Key“ tippen und den Schlüssel kopieren.</span>
        </li>
        <li>
          <span>Hier einfügen und speichern.</span>
        </li>
      </ol>
      <label className="field">
        <span className="field-label">API-Schlüssel</span>
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="sk-ant-…"
          onKeyDown={(e) => e.key === 'Enter' && save()}
        />
      </label>
      {value && !valid && <p className="hint">Der Schlüssel beginnt mit „sk-ant-“ – bitte komplett einfügen.</p>}
      <button className="btn primary block" onClick={save} disabled={!valid}>
        🔑 Schlüssel speichern
      </button>
      {hasKey && (
        <div className="btn-row">
          <button className="btn soft" onClick={onDone}>
            Zurück
          </button>
          <button
            className="btn danger-ghost"
            onClick={() => {
              setApiKey('');
              onDone();
            }}
          >
            Schlüssel löschen
          </button>
        </div>
      )}
      <p className="hint">
        🔒 Der Schlüssel bleibt nur auf diesem Handy und wird weder synchronisiert noch ins Backup gepackt. Fotos gehen nur zur Erkennung an Anthropic und werden in
        Arta nicht gespeichert. Tipp: In der Konsole unter „Limits“ ein Monatslimit setzen.
      </p>
    </div>
  );
}
