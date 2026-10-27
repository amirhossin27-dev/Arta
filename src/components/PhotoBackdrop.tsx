import { useCallback, useEffect, useRef, useState } from 'react';
import { cls } from '../lib/hooks';
import { localPhotoIds, useLocalPhotos, usePhotoUrl } from '../lib/photoStore';
import { livePhotos, nextSlide, onSlideRequest, PHOTO_INTERVAL, PHOTO_SHOW_MS, type SlideRequest } from '../lib/photos';
import { pickSeeded } from '../lib/random';
import { getData, useData, useDevice } from '../lib/store';

/** Das erste Foto nach dem Öffnen – erst nach der Begrüßung, nicht sofort. */
const FIRST_DELAY = 9000;
const OUT_MS = 1500;

const LINES = ['Schöne Erinnerung 💞', 'Ihr zwei 🥰', 'Weißt du noch? ✨', 'Mein Lieblingsbild 💗', 'Das sind wir 💑', 'Hach … 🥹'];

/** Während ein Fenster oder ein Spiel offen ist, kommt kein neues Foto. */
const busy = () => !!document.querySelector('.sheet, .game-screen');

interface Slide extends SlideRequest {
  key: number;
  /** Welche Kamerafahrt (langsamer Zoom) – damit nicht jedes Foto gleich wirkt. */
  move: number;
}

/**
 * Gemeinsame Fotos gleiten ab und zu sanft in den Hintergrund, bleiben eine Weile stehen und
 * ziehen dann weiter. Die Karten werden solange leicht durchsichtig.
 */
export function PhotoBackdrop() {
  const data = useData();
  const device = useDevice();
  const local = useLocalPhotos();
  const freq = device.photoFreq ?? 'normal';
  const [slide, setSlide] = useState<Slide | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const recent = useRef<string[]>([]);
  const current = useRef<Slide | null>(null);
  current.current = slide;
  const url = usePhotoUrl(slide?.id, 'full');

  const show = useCallback((req: SlideRequest) => {
    recent.current = [...recent.current.filter((id) => id !== req.id), req.id].slice(-40);
    setLoaded(false);
    setLeaving(false);
    setSlide({ ...req, key: Date.now(), move: Math.floor(Math.random() * 4) });
  }, []);

  useEffect(() => onSlideRequest(show), [show]);

  // Von selbst: kurz nach dem Öffnen und dann in der gewählten Häufigkeit.
  useEffect(() => {
    if (freq === 'aus') return;
    const tick = () => {
      // Ein Foto, das gerade zu sehen ist (z. B. ein neues vom Schatz), nicht verdrängen.
      if (current.current || document.visibilityState !== 'visible' || busy()) return;
      const have = localPhotoIds();
      const id = nextSlide(
        livePhotos(getData())
          .filter((p) => have.has(p.id))
          .map((p) => p.id),
        recent.current,
      );
      if (id) show({ id });
    };
    const first = window.setTimeout(tick, FIRST_DELAY);
    const every = window.setInterval(tick, PHOTO_INTERVAL[freq]);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
    };
  }, [freq, show]);

  // Stehen lassen, dann weiterziehen.
  useEffect(() => {
    if (!slide || !loaded) return;
    const out = window.setTimeout(() => setLeaving(true), PHOTO_SHOW_MS);
    const gone = window.setTimeout(() => setSlide((s) => (s?.key === slide.key ? null : s)), PHOTO_SHOW_MS + OUT_MS);
    return () => {
      window.clearTimeout(out);
      window.clearTimeout(gone);
    };
  }, [slide, loaded]);

  // Gelöscht, während es zu sehen ist?
  const rec = slide ? data.photos[slide.id] : undefined;
  useEffect(() => {
    if (slide && (!rec || rec.deleted || !local.has(slide.id))) setSlide(null);
  }, [slide, rec, local]);

  // Auch beim Weiterziehen noch Milchglas – sonst blitzt das Foto kurz scharf durch die Karten.
  const on = !!slide && loaded;
  useEffect(() => {
    document.body.classList.toggle('photo-on', on);
    return () => document.body.classList.remove('photo-on');
  }, [on]);

  if (!slide || !url) return null;
  const text = slide.label ?? rec?.caption ?? pickSeeded(LINES, slide.id);

  return (
    <>
      <div className={cls('photo-backdrop', `move-${slide.move}`, loaded && 'in', leaving && 'out')} key={slide.key} aria-hidden="true">
        <img src={url} alt="" onLoad={() => setLoaded(true)} onError={() => setSlide(null)} />
        <div className="photo-backdrop-fade" />
      </div>
      {loaded && !leaving && (
        <div className="photo-pill" key={`pill-${slide.key}`} aria-hidden="true">
          📸 {text}
        </div>
      )}
    </>
  );
}
