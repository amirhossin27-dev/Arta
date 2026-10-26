import { useEffect, useRef, useState } from 'react';
import { RANDOM_POPUPS } from './data/messages';
import { AddMealSheet, RecipeSheet } from './components/food';
import { FoodScanSheet } from './components/foodScan';
import { ExerciseSheet } from './components/exercise';
import { GameScreen } from './games/GameScreen';
import { ArcadeInvite } from './games/Invite';
import { LoveLayer } from './components/LoveLayer';
import { CheerSheet, CoupleSheet, SettingsSheet, SyncSheet } from './components/sheets';
import { StreakSheet, WeekGoalSheet } from './components/goals';
import { HealthSheet } from './components/healthSetup';
import { StepsSheet, useStepMoments } from './components/steps';
import { dailyLove } from './lib/daily';
import { todayKey } from './lib/date';
import { cls, usePeople, useVisible } from './lib/hooks';
import { useLive, useLiveStatus } from './lib/live';
import { showLove } from './lib/love';
import { pickRandom } from './lib/random';
import { alive, pendingSurprises, unreadNotes } from './lib/stats';
import { actions, getData, getDevice, useData, useDevice } from './lib/store';
import { fill } from './lib/text';
import { other } from './lib/types';
import { nav, useUI, type Tab } from './lib/ui';
import { Food } from './screens/Food';
import { Games } from './screens/Games';
import { Love } from './screens/Love';
import { Onboarding } from './screens/Onboarding';
import { Shopping } from './screens/Shopping';
import { Sport } from './screens/Sport';
import { Today } from './screens/Today';

const TABS: { id: Tab; label: string; emoji: string }[] = [
  { id: 'heute', label: 'Heute', emoji: '🏠' },
  { id: 'sport', label: 'Sport', emoji: '💪' },
  { id: 'essen', label: 'Essen', emoji: '🥗' },
  { id: 'einkauf', label: 'Einkauf', emoji: '🛒' },
  { id: 'liebe', label: 'Liebe', emoji: '💞' },
  { id: 'spiele', label: 'Spiele', emoji: '🎮' },
];

const POPUP_INTERVAL = { oft: 90_000, normal: 4 * 60_000, selten: 10 * 60_000 } as const;

/** Während ein Fenster oder ein Spiel offen ist, stören wir nicht mit Einblendungen. */
const busy = () => !!document.querySelector('.sheet, .game-screen');

function currentNames() {
  const d = getData();
  const me = getDevice().me;
  return { me: d.persons[me].name, partner: d.persons[other(me)].name };
}

/** Kleine Liebes-Einblendungen: Tagesgruß, neue Botschaften, Überraschungen und zufällige Grüße. */
function useLoveMoments(onboarded: boolean) {
  const data = useData();
  const device = useDevice();
  const visible = useVisible();
  const shown = useRef(new Set<string>());

  // Liebe des Tages – einmal pro Tag beim Öffnen
  useEffect(() => {
    if (!onboarded) return;
    const today = todayKey();
    if (getDevice().lastDailyPopup === today) return;
    const t = window.setTimeout(() => {
      actions.markDailyPopup(today);
      showLove({ emoji: '💌', title: 'Liebe des Tages', text: fill(dailyLove(today), currentNames()), big: true, tone: 'love' });
    }, 900);
    return () => window.clearTimeout(t);
  }, [onboarded, device.me]);

  // Neue Botschaften & Anfeuerungen vom Partner sofort zeigen – im Hintergrund erst bei der Rückkehr
  // (dort meldet sich solange das Handy mit einer Mitteilung).
  useEffect(() => {
    if (!onboarded || !visible) return;
    const fresh = unreadNotes(data, device.me).filter((n) => !shown.current.has(n.id));
    if (!fresh.length) return;
    const partner = data.persons[other(device.me)].name;
    for (const n of fresh) {
      shown.current.add(n.id);
      showLove(
        n.kind === 'cheer'
          ? { emoji: '📣', title: `${partner} feuert dich an!`, text: n.text, tone: 'sport' }
          : { emoji: '💌', title: `Botschaft von ${partner}`, text: n.text, tone: 'love', big: fresh.length === 1 },
      );
    }
    actions.markNotesSeen(fresh.map((n) => n.id));
  }, [onboarded, data.notes, device.me, data, visible]);

  // Überraschungen & zufällige Liebesgrüße
  useEffect(() => {
    if (!onboarded) return;
    const revealSurprise = () => {
      const d = getData();
      const me = getDevice().me;
      const s = pendingSurprises(d, me)[0];
      if (!s) return false;
      actions.markNotesSeen([s.id]);
      showLove({ emoji: '🎁', title: `Überraschung von ${d.persons[s.from].name}!`, text: s.text, big: true, tone: 'party' });
      return true;
    };
    // Erste Überraschung kommt nach einer kleinen Weile – nicht sofort (und nicht mitten im Spiel).
    let first: number | undefined;
    const tryFirst = () => {
      if (busy() || document.visibilityState === 'hidden') first = window.setTimeout(tryFirst, 15_000);
      else revealSurprise();
    };
    first = window.setTimeout(tryFirst, 20_000 + Math.random() * 40_000);
    let interval: number | undefined;
    if (device.popupFreq !== 'aus') {
      interval = window.setInterval(() => {
        if (document.visibilityState !== 'visible' || busy()) return;
        if (revealSurprise()) return;
        showLove({ emoji: pickRandom(['💗', '💞', '✨', '🌷', '💌', '🥰']), text: fill(pickRandom(RANDOM_POPUPS), currentNames()), tone: 'love' });
      }, POPUP_INTERVAL[device.popupFreq]);
    }
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, [onboarded, device.popupFreq, device.me]);
}

/** Antippen einer Mitteilung öffnet den passenden Bereich (`#tab=liebe` oder Nachricht vom Service Worker). */
function useOpenFromNotification() {
  useEffect(() => {
    const go = (tab: unknown) => {
      if (!TABS.some((t) => t.id === tab)) return;
      if (tab === 'liebe') nav.setLoveView('wir');
      nav.setTab(tab as Tab);
    };
    const m = window.location.hash.match(/tab=([a-z]+)/);
    if (m) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      go(m[1]);
    }
    const onMessage = (e: MessageEvent) => {
      if (e.data?.arta === 'open') go(e.data.tab);
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage);
  }, []);
}

/** Wurde die App über einen Sync-Link geöffnet? */
function useSyncLink(): string | undefined {
  const [code] = useState(() => {
    const m = window.location.hash.match(/sync=([A-Za-z0-9_-]+)/);
    if (m) window.history.replaceState(null, '', window.location.pathname + window.location.search);
    return m?.[1];
  });
  return code;
}

export default function App() {
  const data = useData();
  const device = useDevice();
  const ui = useUI();
  const { me, partner } = usePeople();
  const linkCode = useSyncLink();
  const live = useLive();
  const liveStatus = useLiveStatus();
  useLoveMoments(device.onboarded);
  useStepMoments(device.onboarded);
  useOpenFromNotification();

  useEffect(() => {
    if (linkCode && device.onboarded) nav.open({ type: 'sync', code: linkCode });
    // Link geöffnet, während die App schon läuft
    const onHash = () => {
      const m = window.location.hash.match(/sync=([A-Za-z0-9_-]+)/);
      if (!m) return;
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      if (getDevice().onboarded) nav.open({ type: 'sync', code: m[1] });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (!device.onboarded) {
    return (
      <>
        <Onboarding initialCode={linkCode} />
        <LoveLayer />
      </>
    );
  }

  const unread = alive(data.notes).filter((n) => n.to === device.me && !n.seen && !n.surprise).length;
  const openShopping = alive(data.shopping).filter((s) => !s.done).length;
  const badges: Partial<Record<Tab, number>> = { liebe: unread, einkauf: openShopping };
  const close = nav.close;
  const sheet = ui.sheet;

  return (
    <div className="app" data-tab={ui.tab}>
      <header className="topbar">
        <button className="brand" onClick={() => nav.setTab('heute')}>
          <span className="brand-heart">❤</span> Arta
        </button>
        <div className="topbar-actions">
          <button className="couple-chip" onClick={() => nav.open({ type: 'couple' })} aria-label={`Wir zwei: du bist ${me.name}`}>
            <span className="avatar sm active">{me.emoji}</span>
            <span className="couple-chip-heart">♥</span>
            <span className="avatar sm">{partner.emoji}</span>
          </button>
          <button className="icon-btn sync-btn" onClick={() => nav.open({ type: 'sync' })} aria-label={live ? `Paar-Sync (live: ${liveStatus.state})` : 'Paar-Sync'}>
            🔄
            {live && <span className={cls('live-dot', liveStatus.state)} aria-hidden="true" />}
          </button>
          <button className="icon-btn" onClick={() => nav.open({ type: 'settings' })} aria-label="Einstellungen">
            ⚙️
          </button>
        </div>
      </header>

      <main key={ui.tab}>
        {ui.tab === 'heute' && <Today />}
        {ui.tab === 'sport' && <Sport />}
        {ui.tab === 'essen' && <Food />}
        {ui.tab === 'einkauf' && <Shopping />}
        {ui.tab === 'liebe' && <Love />}
        {ui.tab === 'spiele' && <Games />}
      </main>

      <nav className="tabbar" aria-label="Bereiche">
        {TABS.map((t) => (
          <button key={t.id} className={cls('tab', ui.tab === t.id && 'active')} data-tab={t.id} onClick={() => nav.setTab(t.id)} aria-current={ui.tab === t.id ? 'page' : undefined}>
            <span className="tab-icon">{t.emoji}</span>
            <span className="tab-label">{t.label}</span>
            {!!badges[t.id] && <span className="tab-badge">{badges[t.id]}</span>}
          </button>
        ))}
      </nav>

      {sheet?.type === 'exercise' && <ExerciseSheet key={sheet.id} id={sheet.id} date={sheet.date} planFirst={sheet.planFirst} onClose={close} />}
      {sheet?.type === 'recipe' && <RecipeSheet key={sheet.id} id={sheet.id} date={sheet.date} onClose={close} />}
      {sheet?.type === 'addMeal' && <AddMealSheet date={sheet.date} meal={sheet.meal} onClose={close} />}
      {sheet?.type === 'foodScan' && <FoodScanSheet date={sheet.date} meal={sheet.meal} onClose={close} />}
      {sheet?.type === 'sync' && <SyncSheet code={sheet.code} onClose={close} />}
      {sheet?.type === 'settings' && <SettingsSheet onClose={close} />}
      {sheet?.type === 'cheer' && <CheerSheet onClose={close} />}
      {sheet?.type === 'couple' && <CoupleSheet onClose={close} />}
      {sheet?.type === 'weekGoal' && <WeekGoalSheet onClose={close} />}
      {sheet?.type === 'streak' && <StreakSheet onClose={close} />}
      {sheet?.type === 'steps' && <StepsSheet date={sheet.date} onClose={close} />}
      {sheet?.type === 'health' && <HealthSheet onClose={close} />}
      {sheet?.type === 'game' && <GameScreen key={`${sheet.id}-${sheet.join ?? ''}`} id={sheet.id} join={sheet.join} onClose={close} />}
      {live && <ArcadeInvite />}

      <LoveLayer />
    </div>
  );
}
