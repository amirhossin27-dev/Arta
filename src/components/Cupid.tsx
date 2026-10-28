import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { DAILY_LOVE } from '../data/messages';
import { aimAt, coverWidth, CUPID_SIZE, flightPose, heartClip, HEART_POINTS, planFlight, standOff, type FlightPlan, type Point, type Pose } from '../lib/cupid';
import { cls, usePeople } from '../lib/hooks';
import { localPhotoIds, photoUrl, usePhotoUrl } from '../lib/photoStore';
import { CUPID_INTERVAL, livePhotos, nextPhoto, onCupidRequest, type CupidRequest } from '../lib/photos';
import { pickRandom, pickSeeded } from '../lib/random';
import { actions, getData, useData, useDevice } from '../lib/store';
import { fill } from '../lib/text';
import { nav, useUI } from '../lib/ui';

/** Der erste Flug nach dem Öffnen – nach der Begrüßung, aber bevor man die App wieder zumacht. */
const FIRST_DELAY = 25_000;
/** Erst wenn man so lange unter „Heute“ oder „Liebe“ ist (ohne offenes Fenster), kommt Amor. */
const SETTLE = 2500;
/** Bis dahin zeigt Amor „Tipp mich an!“. */
const HINT_TAPS = 3;

const LINES = ['Schöne Erinnerung 💞', 'Ihr zwei 🥰', 'Weißt du noch? ✨', 'Mein Lieblingsbild 💗', 'Das sind wir 💑', 'Hach … 🥹'];

/** Solange ein Spiel oder ein großer Liebesgruß zu sehen ist, wartet Amor. */
const busy = () => !!document.querySelector('.game-screen, .love-modal');

interface Flight {
  key: number;
  plan: FlightPlan;
  photoId?: string;
  label?: string;
}

interface Shot {
  key: number;
  from: Pose;
  dir: 1 | -1;
  photoId?: string;
  label?: string;
}

/**
 * Alle paar Minuten fliegt ein kleiner Amor über „Heute“ und „Liebe“. Wer ihn antippt, sieht ihn
 * einen Pfeil in ein Riesenherz schießen – daraus öffnet sich eins eurer Fotos im Vollbild.
 */
export function Cupid() {
  const ui = useUI();
  const device = useDevice();
  const freq = device.photoFreq ?? 'normal';
  const [flight, setFlight] = useState<Flight | null>(null);
  const [shot, setShot] = useState<Shot | null>(null);
  const due = useRef(Date.now() + FIRST_DELAY);
  const pending = useRef<CupidRequest | null>(null);
  const recent = useRef<string[]>([]);
  const calm = (ui.tab === 'heute' || ui.tab === 'liebe') && !ui.sheet;
  const calmSince = useRef(Date.now());
  const live = useRef({ calm, freq, flight, shot });
  live.current = { calm, freq, flight, shot };

  const rest = useCallback(() => {
    const f = live.current.freq;
    due.current = Date.now() + (pending.current ? 2500 : f === 'aus' ? Infinity : CUPID_INTERVAL[f]);
  }, []);

  const launch = useCallback(() => {
    const req = pending.current;
    pending.current = null;
    const have = localPhotoIds();
    const ids = livePhotos(getData())
      .filter((p) => have.has(p.id))
      .map((p) => p.id);
    const id = req && have.has(req.id) ? req.id : nextPhoto(ids, recent.current);
    if (id) {
      recent.current = [...recent.current.filter((x) => x !== id), id].slice(-40);
      void photoUrl(id, 'full'); // schon mal laden, bis er angetippt wird
    }
    setFlight({ key: Date.now(), plan: planFlight(window.innerWidth, window.innerHeight), photoId: id, label: req && id === req.id ? req.label : undefined });
  }, []);

  // „Bring das mal vorbei“: fliegt er schon, nimmt er dieses Foto mit, sonst kommt er gleich.
  useEffect(
    () =>
      onCupidRequest((r) => {
        if (live.current.flight) setFlight((f) => (f ? { ...f, photoId: r.id, label: r.label } : f));
        else {
          pending.current = r;
          due.current = Math.min(due.current, Date.now() + 1200);
        }
      }),
    [],
  );

  // Andere Seite oder ein Fenster geöffnet: Amor verschwindet und kommt später wieder.
  useEffect(() => {
    calmSince.current = Date.now();
    if (calm || !live.current.flight) return;
    const f = live.current.flight;
    if (f.photoId && !pending.current) pending.current = { id: f.photoId, label: f.label };
    setFlight(null);
    due.current = Date.now() + 1500;
  }, [calm]);

  // Häufigkeit geändert: ab jetzt neu zählen (beim Start gilt FIRST_DELAY).
  const lastFreq = useRef(freq);
  useEffect(() => {
    if (lastFreq.current === freq) return;
    lastFreq.current = freq;
    if (!live.current.flight && !live.current.shot && !pending.current) rest();
  }, [freq, rest]);

  useEffect(() => {
    const t = window.setInterval(() => {
      const { calm, freq, flight, shot } = live.current;
      if (flight || shot || Date.now() < due.current) return;
      if (!calm || Date.now() - calmSince.current < SETTLE || document.visibilityState !== 'visible' || busy()) return;
      if (freq === 'aus' && !pending.current) return;
      launch();
    }, 1000);
    return () => window.clearInterval(t);
  }, [launch]);

  const hint = flight?.label ? `${flight.label} – tipp mich an!` : (device.cupidTaps ?? 0) < HINT_TAPS ? 'Tipp mich an! 💘' : undefined;

  return (
    <>
      {flight && (
        <CupidFlight
          key={flight.key}
          plan={flight.plan}
          hint={hint}
          onTap={(pose) => {
            actions.countCupidTap();
            setShot({ key: Date.now(), from: pose, dir: flight.plan.dir, photoId: flight.photoId, label: flight.label });
            setFlight(null);
          }}
          onGone={() => {
            setFlight(null);
            rest();
          }}
        />
      )}
      {shot && (
        <CupidShot
          key={shot.key}
          shot={shot}
          onDone={() => {
            setShot(null);
            rest();
          }}
        />
      )}
    </>
  );
}

// ───── Amor gemalt ─────

/** Kleiner Amor mit Flügeln, Locken und Bogen – schaut nach rechts. */
function CupidFigure({ aiming = false }: { aiming?: boolean }) {
  return (
    <svg className={cls('cupid-svg', aiming && 'aiming')} viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <radialGradient id="cupid-skin" cx="42%" cy="35%" r="70%">
          <stop offset="0" stopColor="#ffe6d4" />
          <stop offset="1" stopColor="#f5b892" />
        </radialGradient>
        <linearGradient id="cupid-wing" x1="1" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#ffc9de" />
        </linearGradient>
        <linearGradient id="cupid-hair" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffdc7a" />
          <stop offset="1" stopColor="#e9a93a" />
        </linearGradient>
      </defs>

      {/* Flügel (hinten, vorne) */}
      <g className="cupid-wing far">
        <path d="M58 60 C50 40 36 26 18 24 C22 31 20 35 14 39 C22 43 21 47 15 52 C24 55 27 59 24 64 C36 66 47 65 58 63 Z" fill="url(#cupid-wing)" opacity="0.7" />
      </g>
      <g className="cupid-wing near">
        <path d="M58 60 C50 40 34 22 12 20 C17 28 15 33 8 37 C17 42 16 47 9 52 C19 56 22 60 18 66 C32 69 46 67 58 63 Z" fill="url(#cupid-wing)" stroke="#ffb3cf" strokeWidth="1.2" />
        <path d="M54 58 C44 46 30 36 16 30 M52 61 C42 54 28 49 14 46 M52 63 C42 61 32 60 20 60" stroke="#ffc2d9" strokeWidth="1.1" fill="none" strokeLinecap="round" />
      </g>

      {/* Köcher mit Herzpfeilen */}
      <g transform="rotate(-38 50 62)">
        <path d="M47 46 l-3 -6 l6 0 Z M53 45 l-3 -6 l6 0 Z" fill="#ff5c93" />
        <rect x="43" y="46" width="12" height="24" rx="4" fill="#c94a78" />
        <rect x="43" y="52" width="12" height="3" fill="#f6c453" />
      </g>

      {/* Beine */}
      <ellipse cx="49" cy="89" rx="7" ry="11" transform="rotate(58 49 89)" fill="url(#cupid-skin)" />
      <ellipse cx="59" cy="94" rx="7" ry="11" transform="rotate(28 59 94)" fill="url(#cupid-skin)" />

      {/* Körper mit Tuch */}
      <ellipse cx="63" cy="72" rx="15" ry="16" fill="url(#cupid-skin)" />
      <path d="M48 77 Q63 91 78 76 L77 84 Q63 98 50 86 Z" fill="#fff1f7" stroke="#ff9fc1" strokeWidth="1.2" />
      <path d="M53 59 Q66 67 74 82" stroke="#ff6f9f" strokeWidth="4.5" fill="none" strokeLinecap="round" />

      {/* hinterer Arm: hält die Sehne */}
      <path className="cupid-arm rest" d="M60 65 Q72 73 86 66" stroke="#f4bc98" strokeWidth="6" fill="none" strokeLinecap="round" />
      <path className="cupid-arm drawn" d="M60 65 Q66 72 75 66" stroke="#f4bc98" strokeWidth="6" fill="none" strokeLinecap="round" />

      {/* Kopf */}
      <circle cx="56" cy="45" r="4" fill="#f4bc98" />
      <circle cx="67" cy="42" r="17" fill="url(#cupid-skin)" />
      <g fill="url(#cupid-hair)">
        <circle cx="51" cy="40" r="6.5" />
        <circle cx="53" cy="31" r="7.5" />
        <circle cx="61" cy="25" r="7.5" />
        <circle cx="70" cy="24" r="6.5" />
        <circle cx="78" cy="28" r="5.5" />
        <circle cx="49" cy="49" r="4.5" />
      </g>
      <path d="M79 30 q5 -1 3 5 q-2 2 -4 0" stroke="#e9a93a" strokeWidth="2" fill="none" strokeLinecap="round" />
      <ellipse cx="72" cy="42" rx="2.3" ry="3.1" fill="#3b2330" />
      <ellipse cx="80" cy="41.5" rx="2.1" ry="2.9" fill="#3b2330" />
      <circle cx="72.9" cy="40.8" r="0.9" fill="#fff" />
      <circle cx="80.8" cy="40.3" r="0.8" fill="#fff" />
      <circle cx="68" cy="48.5" r="3.2" fill="#ff8fb1" opacity="0.55" />
      <circle cx="82.5" cy="47.5" r="2.5" fill="#ff8fb1" opacity="0.55" />
      <path d="M74 50 q3 3 6 -0.2" stroke="#c2456e" strokeWidth="1.8" fill="none" strokeLinecap="round" />

      {/* Bogen, Sehne, Pfeil */}
      <path d="M86 45 Q101 66 86 87" stroke="#c98a2b" strokeWidth="3.6" fill="none" strokeLinecap="round" />
      <line className="cupid-string rest" x1="86" y1="45" x2="86" y2="87" stroke="#fff3d6" strokeWidth="1.2" />
      <polyline className="cupid-string drawn" points="86,45 75,66 86,87" stroke="#fff3d6" strokeWidth="1.2" fill="none" />
      <g className="cupid-nocked">
        <line x1="75" y1="66" x2="106" y2="66" stroke="#a8692e" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M75 66 l-5 -4 M75 66 l-5 4 M78 66 l-5 -4 M78 66 l-5 4" stroke="#ff7aa8" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M106 62 c2 -3 6 -2 6 1 c0 3 -4 5 -6 7 c-2 -2 -6 -4 -6 -7 c0 -3 4 -4 6 -1 Z" fill="#ff2e6e" transform="rotate(90 106 66)" />
      </g>

      {/* vorderer Arm: hält den Bogen */}
      <path d="M72 63 Q84 60 95 66" stroke="#f7c6a6" strokeWidth="6.5" fill="none" strokeLinecap="round" />
      <circle cx="95" cy="66" r="3.8" fill="#f7c6a6" />
    </svg>
  );
}

/** Ein Pfeil mit Herzspitze; Spitze rechts. */
function CupidArrow() {
  return (
    <svg viewBox="0 0 64 18" aria-hidden="true">
      <line x1="8" y1="9" x2="54" y2="9" stroke="#a8692e" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M8 9 l-6 -6 M8 9 l-6 6 M12 9 l-6 -6 M12 9 l-6 6 M16 9 l-6 -6 M16 9 l-6 6" stroke="#ff7aa8" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M64 9 C60 4 54 2 52 5 C50 8 52 9 52 9 C52 9 50 10 52 13 C54 16 60 14 64 9 Z" fill="#ff2e6e" />
    </svg>
  );
}

// ───── Der Flug ─────

const boxTransform = (p: Point) => `translate3d(${p.x - CUPID_SIZE / 2}px, ${p.y - CUPID_SIZE / 2}px, 0)`;
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function CupidFlight({ plan, hint, onTap, onGone }: { plan: FlightPlan; hint?: string; onTap: (p: Pose) => void; onGone: () => void }) {
  const box = useRef<HTMLButtonElement>(null);
  const figure = useRef<HTMLDivElement>(null);
  const trail = useRef<HTMLDivElement>(null);
  const pose = useRef<Pose>(flightPose(plan, 0));
  const hit = useRef(false);
  const cb = useRef({ onTap, onGone });
  cb.current = { onTap, onGone };

  useLayoutEffect(() => {
    let raf = 0;
    let lastTrail = 0;
    const calm = reduceMotion();
    const start = performance.now();
    const step = (now: number) => {
      const t = now - start;
      if (t >= plan.duration) return cb.current.onGone();
      const p = flightPose(plan, t);
      pose.current = p;
      if (box.current) box.current.style.transform = boxTransform(p);
      if (figure.current) figure.current.style.transform = `scaleX(${plan.dir}) rotate(${p.tilt}deg)`;
      if (!calm && trail.current && t - lastTrail > 320) {
        lastTrail = t;
        const s = document.createElement('span');
        s.className = 'cupid-spark';
        s.textContent = Math.random() < 0.7 ? '♥' : '✦';
        s.style.left = `${p.x - plan.dir * 36}px`;
        s.style.top = `${p.y + 8 + (Math.random() - 0.5) * 14}px`;
        trail.current.appendChild(s);
        window.setTimeout(() => s.remove(), 1600);
      }
      raf = requestAnimationFrame(step);
    };
    step(start);
    return () => cancelAnimationFrame(raf);
  }, [plan]);

  const tap = () => {
    if (hit.current) return;
    hit.current = true;
    cb.current.onTap(pose.current);
  };

  return (
    <div className="cupid-flight">
      <div className="cupid-trail" ref={trail} />
      <button
        ref={box}
        className="cupid"
        style={{ transform: boxTransform(pose.current) }}
        onPointerDown={(e) => {
          e.preventDefault();
          tap();
        }}
        onClick={tap}
        onContextMenu={(e) => e.preventDefault()}
        aria-label="Amor antippen – er zeigt dir ein Foto"
      >
        <div className="cupid-figure" ref={figure}>
          <CupidFigure />
        </div>
        {hint && <span className="cupid-bubble">{hint}</span>}
      </button>
    </div>
  );
}

// ───── Schuss ins Herz und das Foto ─────

type Phase = 'aim' | 'shoot' | 'hit' | 'open' | 'expand' | 'show' | 'close';

/** Feste Zeiten (ms), wie lange eine Phase dauert, bevor die nächste kommt. */
const NEXT: Partial<Record<Phase, [Phase, number]>> = {
  aim: ['shoot', 420],
  shoot: ['hit', 380],
  open: ['expand', 280],
  expand: ['show', 860],
};

/** So lange wartet das Herz höchstens auf das Foto, sonst öffnet sich ein Liebesgruß. */
const PHOTO_WAIT = 2500;

function CupidShot({ shot, onDone }: { shot: Shot; onDone: () => void }) {
  const data = useData();
  const device = useDevice();
  const { me, partner } = usePeople();
  const [phase, setPhase] = useState<Phase>('aim');
  const [aimed, setAimed] = useState(false);
  const [pulsed, setPulsed] = useState(false);
  const url = usePhotoUrl(shot.photoId, 'full');
  /** null = lädt noch, false = kein Foto (dann ein Liebesgruß). */
  const [photoOk, setPhotoOk] = useState<boolean | null>(shot.photoId ? null : false);
  const arrow = useRef<HTMLDivElement>(null);
  const [note] = useState(() => fill(pickRandom(DAILY_LOVE), { me: me.name, partner: partner.name }));

  // Geometrie einmal beim Antippen festlegen.
  const [geo] = useState(() => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const heart = { x: w / 2, y: h * 0.46 };
    const size = Math.min(w * 0.7, h * 0.42, 320);
    const at = standOff(shot.from, heart, size * 0.5 + CUPID_SIZE * 0.5 + 6, w, h);
    const aim = aimAt(at, heart);
    const d = Math.hypot(heart.x - at.x, heart.y - at.y) || 1;
    const u = { x: (heart.x - at.x) / d, y: (heart.y - at.y) / d };
    const deg = (Math.atan2(u.y, u.x) * 180) / Math.PI;
    const from = { x: at.x + u.x * 36, y: at.y + u.y * 36 };
    const to = { x: heart.x - u.x * size * 0.06, y: heart.y - u.y * size * 0.06 };
    return { w, h, heart, size, at, aim, deg, from, to, cover: coverWidth(heart, w, h) };
  });

  // Erst die Flugpose zeigen, dann zum Herz drehen.
  useEffect(() => {
    const r = requestAnimationFrame(() => requestAnimationFrame(() => setAimed(true)));
    return () => cancelAnimationFrame(r);
  }, []);

  useEffect(() => {
    const next = NEXT[phase];
    if (!next) return;
    const t = window.setTimeout(() => setPhase(next[0]), next[1]);
    return () => window.clearTimeout(t);
  }, [phase]);

  // Getroffen: Das Herz pocht kurz, und sobald das Foto bereit ist, öffnet es sich.
  useEffect(() => {
    if (phase !== 'hit') return;
    const t = window.setTimeout(() => setPulsed(true), 480);
    return () => window.clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase === 'hit' && pulsed && photoOk !== null) setPhase('open');
  }, [phase, pulsed, photoOk]);

  useEffect(() => {
    if (photoOk !== null) return;
    const t = window.setTimeout(() => setPhotoOk((ok) => (ok === null ? false : ok)), PHOTO_WAIT);
    return () => window.clearTimeout(t);
  }, [photoOk]);

  // Gelöscht, während es zu sehen ist?
  const rec = shot.photoId ? data.photos[shot.photoId] : undefined;
  useEffect(() => {
    if (shot.photoId && photoOk && (!rec || rec.deleted)) setPhase('close');
  }, [rec, photoOk, shot.photoId]);

  // Der Pfeil fliegt.
  const arrowAt = (p: Point) => `translate3d(${p.x - 64}px, ${p.y - 9}px, 0) rotate(${geo.deg}deg)`;
  useLayoutEffect(() => {
    if (phase !== 'shoot' || !arrow.current?.animate) return;
    arrow.current.animate([{ transform: arrowAt(geo.from) }, { transform: arrowAt(geo.to) }], { duration: 360, easing: 'cubic-bezier(0.3, 0.6, 0.4, 1)', fill: 'forwards' });
  }, [phase]);

  useEffect(() => {
    if (phase !== 'close') return;
    const t = window.setTimeout(onDone, 380);
    return () => window.clearTimeout(t);
  }, [phase, onDone]);

  const showing = phase === 'show';
  const close = () => showing && setPhase('close');
  useEffect(() => {
    if (!showing) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPhase('close');
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showing]);

  const opened = phase === 'open' || phase === 'expand' || phase === 'show' || phase === 'close';
  const flipped = aimed ? geo.aim.flip : shot.dir < 0;
  const leaving = phase !== 'aim' && phase !== 'shoot';
  const figure: CSSProperties = { transform: `scaleX(${flipped ? -1 : 1}) rotate(${aimed ? geo.aim.angle : shot.from.tilt}deg)` };
  const boxAt = aimed ? geo.at : shot.from;
  const box: CSSProperties = {
    transform: leaving ? `translate3d(${geo.at.x - CUPID_SIZE / 2 + (flipped ? 60 : -60)}px, ${-CUPID_SIZE * 1.6}px, 0)` : boxTransform(boxAt),
    opacity: leaving ? 0 : 1,
  };
  const clip =
    phase === 'show' || phase === 'close' ? undefined : heartClip(geo.heart, phase === 'expand' ? geo.cover : geo.size);
  const photoStyle: CSSProperties = clip ? { clipPath: clip, WebkitClipPath: clip } : {};
  const heartStyle: CSSProperties = { left: geo.heart.x - geo.size / 2, top: geo.heart.y - geo.size / 2, width: geo.size, height: geo.size };

  const mine = rec?.by === device.me;
  const caption = shot.label ?? rec?.caption ?? (shot.photoId ? pickSeeded(LINES, shot.photoId) : '');
  const anyPhotos = livePhotos(data).length > 0;

  return (
    <div
      className={cls('cupid-shot', `phase-${phase}`)}
      onClick={close}
      onContextMenu={(e) => e.preventDefault()}
      role="dialog"
      aria-label={photoOk ? 'Ein Foto von Amor' : 'Ein Liebesgruß von Amor'}
    >
      <div className="cupid-dim" />

      {!opened || phase === 'open' || phase === 'expand' ? (
        <div className={cls('cupid-heart', phase === 'hit' && 'hit', opened && 'gone')} style={heartStyle}>
          <svg viewBox="-0.5 -0.5 1 1" aria-hidden="true">
            <defs>
              <radialGradient id="cupid-heart-fill" cx="38%" cy="30%" r="80%">
                <stop offset="0" stopColor="#ff9cc2" />
                <stop offset="0.55" stopColor="#ff3f80" />
                <stop offset="1" stopColor="#c8124f" />
              </radialGradient>
            </defs>
            <polygon points={HEART_POINTS} fill="url(#cupid-heart-fill)" />
            <ellipse cx="-0.25" cy="-0.2" rx="0.075" ry="0.04" transform="rotate(-40 -0.25 -0.2)" fill="#fff" opacity="0.35" />
          </svg>
          {phase === 'hit' && (
            <div className="cupid-burst" aria-hidden="true">
              {Array.from({ length: 12 }, (_, i) => (
                <span key={i} style={{ '--a': `${i * 30}deg` } as CSSProperties}>
                  {i % 3 ? '♥' : '✦'}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {(phase === 'shoot' || phase === 'hit' || phase === 'open') && (
        <div className={cls('cupid-arrow', phase === 'open' && 'gone')} ref={arrow} style={{ transform: arrowAt(phase === 'shoot' ? geo.from : geo.to) }}>
          <CupidArrow />
        </div>
      )}

      {!opened || phase === 'open' ? (
        <div className="cupid cupid-still" style={box}>
          <div className="cupid-figure" style={figure}>
            <CupidFigure aiming={aimed && phase === 'aim'} />
          </div>
        </div>
      ) : null}

      {/* Das Foto lädt schon, während Amor zielt – sichtbar wird es erst im Herz. */}
      <div className={cls('cupid-photo', opened && 'in', !photoOk && 'note')} style={photoStyle} aria-hidden={!opened}>
        {photoOk !== false && url ? (
          <>
            <img className="cupid-photo-blur" src={url} alt="" draggable={false} />
            <img
              className="cupid-photo-img"
              src={url}
              alt={rec?.caption ?? 'Euer Foto'}
              draggable={false}
              onLoad={() => setPhotoOk((ok) => (ok === null ? true : ok))}
              onError={() => setPhotoOk(false)}
            />
          </>
        ) : (
          photoOk === false && (
            <div className="cupid-note">
              <div className="cupid-note-emoji">💘</div>
              <p className="cupid-note-text">{note}</p>
              {anyPhotos ? (
                <p className="cupid-note-hint">Eure Fotos sind noch unterwegs – beim nächsten Mal bringe ich eins mit. – Amor</p>
              ) : (
                <>
                  <p className="cupid-note-hint">Noch keine gemeinsamen Fotos? Legt welche unter „Liebe“ an – dann zeige ich sie euch hier. – Amor</p>
                  {showing && (
                    <button
                      className="btn primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        nav.setLoveView('wir');
                        nav.setTab('liebe');
                        setPhase('close');
                      }}
                    >
                      📸 Fotos hinzufügen
                    </button>
                  )}
                </>
              )}
            </div>
          )
        )}
      </div>

      {showing && photoOk && (
        <div className="cupid-caption">
          <span className="cupid-caption-text">📸 {caption}</span>
          {rec && <span className="cupid-caption-by">von {mine ? 'dir' : data.persons[rec.by].name}</span>}
        </div>
      )}
      {showing && <div className="cupid-close-hint">Tippe irgendwo, um zu schließen</div>}
    </div>
  );
}
