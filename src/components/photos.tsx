import { useEffect, useRef, useState } from 'react';
import { formatDateTime } from '../lib/date';
import { cls, usePeople } from '../lib/hooks';
import { useLive } from '../lib/live';
import { showLove } from '../lib/love';
import { askPersistentStorage, deletePhoto, preparePhoto, savePhoto, useLocalPhotos, usePhotoUrl } from '../lib/photoStore';
import { livePhotos, MAX_PHOTOS, requestSlide } from '../lib/photos';
import { uid } from '../lib/random';
import { actions, useData, useDevice } from '../lib/store';
import { other, type Photo, type PhotoFreq } from '../lib/types';
import { nav } from '../lib/ui';
import { Empty, Segmented, Sheet } from './ui';

/** So viele Fotos zeigt das Album, bevor „Alle anzeigen“ kommt. */
const PREVIEW = 9;

/** Wie oft Fotos in den Hintergrund gleiten – im Album und in den Einstellungen. */
export function PhotoFreqPicker() {
  const device = useDevice();
  return (
    <Segmented
      value={device.photoFreq ?? 'normal'}
      onChange={(v: PhotoFreq) => actions.setPhotoFreq(v)}
      small
      options={[
        ['oft', 'Oft'],
        ['normal', 'Normal'],
        ['selten', 'Selten'],
        ['aus', 'Aus'],
      ]}
    />
  );
}

function PhotoTile({ photo }: { photo: Photo }) {
  const { partner } = usePeople();
  const live = useLive();
  const url = usePhotoUrl(photo.id, 'thumb');
  const here = useLocalPhotos().has(photo.id);
  return (
    <button className={cls('photo-tile', !url && 'waiting')} onClick={() => nav.open({ type: 'photo', id: photo.id })} aria-label={photo.caption || 'Foto ansehen'}>
      {url ? <img src={url} alt="" draggable={false} /> : <span className="photo-wait">{here ? '' : live ? '⏳' : '☁️'}</span>}
      {!url && !here && <span className="photo-wait-text">{live ? 'kommt …' : `bei ${partner.name}`}</span>}
    </button>
  );
}

/** „Unsere Fotos“ unter Liebe: Fotos hinzufügen, ansehen und einstellen, wie oft sie erscheinen. */
export function PhotoAlbum() {
  const data = useData();
  const { partner } = usePeople();
  const live = useLive();
  const photos = livePhotos(data);
  const [showAll, setShowAll] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const free = MAX_PHOTOS - photos.length;
  const shown = showAll ? photos : photos.slice(0, PREVIEW);

  const add = async (files: File[]) => {
    setError('');
    if (!files.length) return;
    const list = files.slice(0, Math.max(0, free));
    if (!list.length) return setError(`Das Album ist voll (${MAX_PHOTOS} Fotos). Lösche ein altes, um Platz zu schaffen.`);
    askPersistentStorage();
    setProgress({ done: 0, total: list.length });
    let newest: string | undefined;
    let failed = 0;
    let full = false;
    for (let i = 0; i < list.length; i++) {
      try {
        const p = await preparePhoto(list[i]);
        const id = uid();
        await savePhoto(id, p.full, p.thumb);
        actions.addPhoto({ id, w: p.w, h: p.h });
        newest = id;
      } catch (e) {
        failed++;
        if (e instanceof DOMException && e.name === 'QuotaExceededError') {
          full = true;
          break;
        }
      }
      setProgress({ done: i + 1, total: list.length });
    }
    setProgress(null);
    const skipped = files.length - list.length;
    if (full) setError('Auf dem Handy ist kein Platz mehr für weitere Fotos.');
    else if (failed) setError(failed === 1 ? 'Ein Foto ließ sich nicht öffnen.' : `${failed} Fotos ließen sich nicht öffnen.`);
    else if (skipped) setError(`Das Album ist voll – ${skipped} Foto${skipped === 1 ? '' : 's'} passte${skipped === 1 ? '' : 'n'} nicht mehr hinein.`);
    if (newest) {
      const n = list.length - failed;
      showLove({
        emoji: '📸',
        title: n === 1 ? 'Foto hinzugefügt!' : `${n} Fotos hinzugefügt!`,
        text: live ? `Ab und zu gleiten sie in den Hintergrund – auch bei ${partner.name}. 💞` : 'Ab und zu gleiten sie jetzt sanft in den Hintergrund. 💞',
        tone: 'love',
      });
      requestSlide({ id: newest, label: 'Neu in eurem Album 💞' });
    }
  };

  return (
    <div className="card photo-card">
      <div className="card-head">
        <h2>📸 Unsere Fotos</h2>
        {photos.length > 0 && (
          <button className="btn soft small" onClick={() => fileRef.current?.click()} disabled={!!progress || free <= 0}>
            + Fotos
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          void add(files);
        }}
      />
      {photos.length === 0 ? (
        <Empty emoji="🖼️" title="Noch keine gemeinsamen Fotos">
          <p>Füge eure Lieblingsbilder hinzu – ab und zu gleitet eins sanft in den Hintergrund der App. 💞</p>
          <button className="btn primary" onClick={() => fileRef.current?.click()} disabled={!!progress}>
            📷 Fotos auswählen
          </button>
        </Empty>
      ) : (
        <>
          <div className="photo-grid">
            {shown.map((p) => (
              <PhotoTile key={p.id} photo={p} />
            ))}
          </div>
          {photos.length > PREVIEW && (
            <button className="link" onClick={() => setShowAll((s) => !s)}>
              {showAll ? 'Weniger anzeigen' : `Alle ${photos.length} Fotos anzeigen`}
            </button>
          )}
        </>
      )}
      {progress && (
        <p className="hint">
          ⏳ Foto {Math.min(progress.done + 1, progress.total)} von {progress.total} wird vorbereitet …
        </p>
      )}
      {error && <p className="notice warn small">{error}</p>}
      <div className="photo-freq">
        <span className="field-label">Im Hintergrund zeigen</span>
        <PhotoFreqPicker />
      </div>
      {live ? (
        <p className="hint">⚡ Verschlüsselt geteilt – eure Fotos landen auch auf dem Handy von {partner.name}.</p>
      ) : (
        <p className="hint">
          Die Fotos bleiben auf diesem Handy. Mit dem Live-Sync landen sie verschlüsselt auch bei {partner.name}.{' '}
          <button className="link inline" onClick={() => nav.open({ type: 'sync' })}>
            Paar-Sync öffnen
          </button>
        </p>
      )}
    </div>
  );
}

/** Ein Foto groß ansehen – eigene Fotos lassen sich beschriften und löschen. */
export function PhotoSheet({ id, onClose }: { id: string; onClose: () => void }) {
  const data = useData();
  const device = useDevice();
  const live = useLive();
  const photo = data.photos[id];
  const list = livePhotos(data);
  const index = list.findIndex((p) => p.id === id);
  const url = usePhotoUrl(id, 'full');
  const here = useLocalPhotos().has(id);
  const [caption, setCaption] = useState(photo?.caption ?? '');
  const [confirm, setConfirm] = useState(false);

  // Beim Blättern die Bildunterschrift des neuen Fotos übernehmen.
  useEffect(() => {
    setCaption(data.photos[id]?.caption ?? '');
    setConfirm(false);
  }, [id]);

  if (!photo || photo.deleted) {
    return (
      <Sheet title="📸 Foto" onClose={onClose}>
        <Empty emoji="🗑️" title="Dieses Foto gibt es nicht mehr" />
      </Sheet>
    );
  }

  const mine = photo.by === device.me;
  const owner = data.persons[photo.by];
  const go = (step: number) => {
    const next = list[(index + step + list.length) % list.length];
    if (next) nav.open({ type: 'photo', id: next.id });
  };
  const saveCaption = () => {
    if (mine && caption.trim() !== (photo.caption ?? '')) actions.setPhotoCaption(id, caption);
  };

  return (
    <Sheet title={photo.caption ? `📸 ${photo.caption}` : '📸 Foto'} onClose={onClose}>
      <div className="photo-view" style={{ aspectRatio: `${photo.w} / ${photo.h}` }}>
        {url ? (
          <img src={url} alt={photo.caption ?? 'Gemeinsames Foto'} draggable={false} />
        ) : (
          <div className="photo-view-wait">
            {here ? '' : live ? `⏳ Das Foto ist noch unterwegs von ${owner.name}s Handy …` : `☁️ Das Foto liegt auf ${owner.name}s Handy – mit dem Live-Sync kommt es auch hierher.`}
          </div>
        )}
        {list.length > 1 && (
          <>
            <button className="photo-nav prev" onClick={() => go(-1)} aria-label="Vorheriges Foto">
              ‹
            </button>
            <button className="photo-nav next" onClick={() => go(1)} aria-label="Nächstes Foto">
              ›
            </button>
          </>
        )}
      </div>
      <p className="muted small center">
        {owner.emoji} von {mine ? 'dir' : owner.name} · {formatDateTime(photo.createdAt)}
        {list.length > 1 && ` · ${index + 1}/${list.length}`}
      </p>
      {mine ? (
        <label className="field">
          <span className="field-label">Bildunterschrift</span>
          <input
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            onBlur={saveCaption}
            onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
            maxLength={80}
            placeholder="z. B. Unser erster Urlaub 🌊"
          />
        </label>
      ) : (
        photo.caption && <p className="big-text center">„{photo.caption}“</p>
      )}
      <div className="btn-row">
        <button
          className="btn primary"
          disabled={!url}
          onClick={() => {
            saveCaption();
            onClose();
            requestSlide({ id });
          }}
        >
          ✨ Im Hintergrund zeigen
        </button>
        {mine && !confirm && (
          <button className="btn danger-ghost" onClick={() => setConfirm(true)}>
            🗑️ Löschen
          </button>
        )}
      </div>
      {mine && confirm && (
        <div className="notice warn">
          <p>Foto löschen? Es verschwindet auch vom Handy von {data.persons[other(photo.by)].name}.</p>
          <div className="btn-row">
            <button className="btn ghost" onClick={() => setConfirm(false)}>
              Behalten
            </button>
            <button
              className="btn danger"
              onClick={() => {
                actions.removePhoto(id);
                void deletePhoto(id).catch(() => undefined);
                onClose();
              }}
            >
              Löschen
            </button>
          </div>
        </div>
      )}
      {!mine && <p className="hint">Nur {owner.name} kann dieses Foto beschriften oder löschen.</p>}
    </Sheet>
  );
}
