import { describe, expect, it } from 'vitest';
import { deriveRoom, liveSummary, newRoom } from '../live';
import { HELP_UPLOAD_AFTER, livePhotos, nextSlide, planPhotoSync } from '../photos';
import { sealPhoto, unsealPhoto } from '../photoSync';
import { actions, commitData, emptyData, getData, getDevice } from '../store';
import { buildPayload, mergeData } from '../sync';
import type { Photo, PersonId } from '../types';

const NOW = 1_800_000_000_000;

function photo(id: string, by: PersonId, extra: Partial<Photo> = {}): Photo {
  return { id, by, createdAt: NOW - 1000, w: 1280, h: 960, updatedAt: 1, ...extra };
}

function plan(photos: Photo[], local: string[], remote: string[], me: PersonId = 'a') {
  return planPhotoSync({
    photos: Object.fromEntries(photos.map((p) => [p.id, p])),
    local: new Set(local),
    remote: new Set(remote),
    me,
    now: NOW,
  });
}

describe('Foto-Abgleich', () => {
  it('lädt eigene neue Fotos hoch und holt die des Partners', () => {
    const p = plan([photo('mine01', 'a'), photo('hers01', 'b')], ['mine01'], ['hers01']);
    expect(p.upload).toEqual(['mine01']);
    expect(p.download).toEqual(['hers01']);
    expect(p.remove).toEqual([]);
    expect(p.waiting).toBe(0);
  });

  it('wartet, solange das Bild des Partners noch nicht im Raum liegt', () => {
    const p = plan([photo('hers01', 'b')], [], []);
    expect(p.download).toEqual([]);
    expect(p.upload).toEqual([]);
    expect(p.waiting).toBe(1);
  });

  it('hilft beim Hochladen erst aus, wenn das andere Handy es lange nicht schafft', () => {
    const fresh = plan([photo('hers01', 'b')], ['hers01'], []);
    expect(fresh.upload).toEqual([]);
    const old = plan([photo('hers01', 'b', { createdAt: NOW - HELP_UPLOAD_AFTER - 1 })], ['hers01'], []);
    expect(old.upload).toEqual(['hers01']);
  });

  it('räumt gelöschte Fotos aus dem Raum, lässt unbekannte Einträge aber in Ruhe', () => {
    const p = plan([photo('gone01', 'b', { deleted: true })], ['gone01'], ['gone01', 'unknown1']);
    expect(p.remove).toEqual(['gone01']);
    expect(p.download).toEqual([]);
  });

  it('meldet eigene Fotos als bereit, sobald sie im Raum liegen', () => {
    expect(plan([photo('mine01', 'a')], ['mine01'], ['mine01']).markReady).toEqual(['mine01']);
    expect(plan([photo('mine01', 'a', { ready: true })], ['mine01'], ['mine01']).markReady).toEqual([]);
    expect(plan([photo('hers01', 'b')], ['hers01'], ['hers01']).markReady).toEqual([]);
  });

  it('nimmt die neuesten Fotos zuerst dran', () => {
    const p = plan([photo('old001', 'b', { createdAt: 1 }), photo('new001', 'b', { createdAt: 5 })], [], ['old001', 'new001']);
    expect(p.download).toEqual(['new001', 'old001']);
  });
});

describe('Diashow im Hintergrund', () => {
  it('zeigt jedes Foto, bevor sich eins wiederholt', () => {
    const ids = ['a1', 'b2', 'c3', 'd4', 'e5'];
    const recent: string[] = [];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 4; i++) {
      const next = nextSlide(ids, recent, rnd)!;
      expect(recent).not.toContain(next);
      recent.push(next);
    }
  });

  it('kommt mit einem einzigen oder gar keinem Foto zurecht', () => {
    expect(nextSlide(['solo'], ['solo'])).toBe('solo');
    expect(nextSlide([], [])).toBeUndefined();
  });

  it('kennt nur nicht gelöschte Fotos, neueste zuerst', () => {
    const d = emptyData();
    d.photos = {
      x: photo('x', 'a', { createdAt: 1 }),
      y: photo('y', 'b', { createdAt: 3 }),
      z: photo('z', 'a', { createdAt: 2, deleted: true }),
    };
    expect(livePhotos(d).map((p) => p.id)).toEqual(['y', 'x']);
  });
});

describe('Fotos im Sync', () => {
  it('schickt die Foto-Liste immer komplett mit – die Bilder selbst nicht', () => {
    const d = emptyData();
    d.photos = { old: photo('old', 'a', { createdAt: 1, updatedAt: 1 }) };
    const payload = buildPayload(d, 'a', 'dev-1', '2026-10-26');
    expect(Object.keys(payload.data.photos)).toEqual(['old']);
    expect(JSON.stringify(payload).length).toBeLessThan(2000);
  });

  it('zählt neue Fotos vom Partner', () => {
    const remote = emptyData();
    remote.photos = { p1: photo('p1', 'b'), p2: photo('p2', 'a') };
    const { stats } = mergeData(emptyData(), remote, 'a');
    expect(stats.newPhotos).toBe(1);
    expect(liveSummary(stats)).toContain('1 neues Foto');
  });

  it('nur das eigene Handy beschriftet oder löscht ein Foto', () => {
    commitData(emptyData());
    const me = getDevice().me;
    actions.addPhoto({ id: 'mine01', w: 10, h: 10 });
    const d = getData();
    commitData({ ...d, photos: { ...d.photos, hers01: photo('hers01', me === 'a' ? 'b' : 'a') } });

    actions.setPhotoCaption('mine01', '  Rom 🇮🇹 ');
    actions.setPhotoCaption('hers01', 'Nicht meins');
    actions.removePhoto('hers01');
    expect(getData().photos.mine01.caption).toBe('Rom 🇮🇹');
    expect(getData().photos.mine01.by).toBe(me);
    expect(getData().photos.hers01.caption).toBeUndefined();
    expect(getData().photos.hers01.deleted).toBeUndefined();

    actions.removePhoto('mine01');
    expect(getData().photos.mine01.deleted).toBe(true);
    commitData(emptyData());
  });
});

describe('Foto-Raum', () => {
  it('liegt getrennt vom Raum der Geräte-Stände', async () => {
    const keys = await deriveRoom(newRoom().secret);
    expect(keys.photos).toMatch(/^[0-9a-f]{32}$/);
    expect(keys.photos).not.toBe(keys.id);
  });

  it('verschlüsselt Bilder verlustfrei und passt zu den Datenbank-Regeln', async () => {
    const { key } = await deriveRoom(newRoom().secret);
    const bytes = new Uint8Array(300_000).map((_, i) => (i * 31) & 255);
    const node = await sealPhoto(bytes, key);
    expect(node.v).toBe(1);
    expect(node.iv.length).toBeLessThanOrEqual(32);
    expect(node.ct.length).toBeLessThanOrEqual(1_000_000);
    expect(await unsealPhoto(node, key)).toEqual(bytes);
    const other = await deriveRoom(newRoom().secret);
    await expect(unsealPhoto(node, other.key)).rejects.toThrow();
  });
});
