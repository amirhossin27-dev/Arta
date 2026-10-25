import { describe, expect, it } from 'vitest';
import { emptyData } from '../store';
import { buildPayload, decodePayload, encodePayload, extractCode, mergeData } from '../sync';
import type { AppData } from '../types';

function withNote(d: AppData, id: string, updatedAt: number, extra: Partial<AppData['notes'][string]> = {}): AppData {
  return {
    ...d,
    notes: {
      ...d.notes,
      [id]: { id, from: 'b', to: 'a', text: 'Ich hab dich lieb', kind: 'note', surprise: false, createdAt: updatedAt, seen: false, updatedAt, ...extra },
    },
  };
}

describe('Paar-Sync', () => {
  it('kodiert und dekodiert verlustfrei', async () => {
    const d = withNote(emptyData(), 'n1', Date.now());
    d.persons.a = { ...d.persons.a, name: 'Amir', updatedAt: 5 };
    const code = await encodePayload(buildPayload(d, 'a', 'dev-1', '2026-10-25'));
    expect(code[0]).toBe('z');
    const back = await decodePayload(code);
    expect(back.from).toBe('a');
    expect(back.data.persons.a.name).toBe('Amir');
    expect(back.data.notes.n1.text).toBe('Ich hab dich lieb');
  });

  it('findet den Code in einer weitergeleiteten Nachricht', async () => {
    const code = await encodePayload(buildPayload(emptyData(), 'b', 'dev-2', '2026-10-25'));
    const msg = `💞 Arta-Update von Arta 🦋\nTipp auf den Link:\nhttps://example.github.io/Arta/#sync=${code}`;
    expect(extractCode(msg)).toBe(code);
    expect(extractCode(code)).toBe(code);
    expect(extractCode('Hallo Schatz')).toBeNull();
  });

  it('lehnt beschädigte Codes ab', async () => {
    await expect(decodePayload('zKAPUTT')).rejects.toThrow();
    await expect(decodePayload('xabc')).rejects.toThrow();
  });

  it('führt nach last-writer-wins zusammen und zählt neue Botschaften', () => {
    const local = withNote(emptyData(), 'old', 100, { text: 'alt' });
    const remote = withNote(withNote(emptyData(), 'old', 200, { text: 'neu', seen: true }), 'fresh', 300);
    const { data, stats } = mergeData(local, remote, 'a');
    expect(data.notes.old.text).toBe('neu');
    expect(data.notes.fresh).toBeDefined();
    expect(stats.newNotes).toBe(1);
  });

  it('verrät Überraschungen nicht als normale Botschaft', () => {
    const remote = withNote(emptyData(), 's', 100, { surprise: true });
    const { stats } = mergeData(emptyData(), remote, 'a');
    expect(stats.newNotes).toBe(0);
    expect(stats.newSurprises).toBe(1);
  });

  it('überschreibt keine neueren lokalen Änderungen', () => {
    const local = withNote(emptyData(), 'n', 500, { seen: true });
    const remote = withNote(emptyData(), 'n', 400, { seen: false });
    const { data, stats } = mergeData(local, remote, 'a');
    expect(data.notes.n.seen).toBe(true);
    expect(stats.changed).toBe(0);
  });

  it('übernimmt Löschungen (Tombstones)', () => {
    const local = withNote(emptyData(), 'n', 100);
    const remote = withNote(emptyData(), 'n', 200, { deleted: true });
    expect(mergeData(local, remote, 'a').data.notes.n.deleted).toBe(true);
  });

  it('schickt nur aktuelle Tagesdaten mit', () => {
    const d = emptyData();
    d.plan = {
      alt: { id: 'alt', date: '2026-01-01', personId: 'a', exerciseId: 'plank', slot: 'morgens', createdBy: 'a', done: true, updatedAt: 1 },
      neu: { id: 'neu', date: '2026-10-20', personId: 'a', exerciseId: 'plank', slot: 'morgens', createdBy: 'a', done: true, updatedAt: 2 },
    };
    const p = buildPayload(d, 'a', 'dev', '2026-10-25');
    expect(Object.keys(p.data.plan)).toEqual(['neu']);
  });
});
