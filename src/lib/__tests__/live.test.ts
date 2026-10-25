import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyStreamEvent, deriveRoom, newRoom, seal, unseal } from '../live';
import { emptyData } from '../store';
import { buildPayload, decodePayload, encodePayload } from '../sync';
import type { AppData } from '../types';

function busyCouple(): AppData {
  const d = emptyData();
  for (let day = 0; day < 45; day++) {
    const date = `2026-10-${String((day % 28) + 1).padStart(2, '0')}`;
    for (const personId of ['a', 'b'] as const) {
      for (let i = 0; i < 6; i++) {
        const id = `m${day}${personId}${i}`;
        d.meals[id] = { id, date, personId, meal: 'mittag', name: 'Bowl mit Quinoa', emoji: '🥗', kcal: 540, protein: 30, carbs: 60, fat: 18, createdBy: personId, updatedAt: Date.now() };
      }
      const pid = `p${day}${personId}`;
      d.plan[pid] = { id: pid, date, personId, exerciseId: 'plank', slot: 'abends', createdBy: personId, done: true, updatedAt: Date.now() };
    }
  }
  return d;
}

describe('Live-Sync: Verschlüsselung', () => {
  it('leitet aus dem Geheimnis immer denselben Raum ab', async () => {
    const room = newRoom();
    expect(room.secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const [a, b] = await Promise.all([deriveRoom(room.secret), deriveRoom(room.secret)]);
    expect(a.id).toBe(b.id);
    expect(a.id).toMatch(/^[0-9a-f]{32}$/);
    expect((await deriveRoom(newRoom().secret)).id).not.toBe(a.id);
  });

  it('ver- und entschlüsselt einen Stand verlustfrei', async () => {
    const { key } = await deriveRoom(newRoom().secret);
    const d = emptyData();
    d.persons.a = { ...d.persons.a, name: 'Amir', updatedAt: 9 };
    const node = await seal(buildPayload(d, 'a', 'dev-1', '2026-10-25'), key);
    expect(node.ct).not.toContain('Amir');
    const back = await unseal(node, key);
    expect(back.from).toBe('a');
    expect(back.data.persons.a.name).toBe('Amir');
  });

  it('lässt sich mit einem fremden Schlüssel nicht lesen', async () => {
    const mine = await deriveRoom(newRoom().secret);
    const theirs = await deriveRoom(newRoom().secret);
    const node = await seal(buildPayload(emptyData(), 'a', 'dev-1', '2026-10-25'), mine.key);
    await expect(unseal(node, theirs.key)).rejects.toThrow();
  });

  it('bleibt auch für ein fleißiges Paar klein genug für die Datenbank', async () => {
    const { key } = await deriveRoom(newRoom().secret);
    const node = await seal(buildPayload(busyCouple(), 'a', 'dev-1', '2026-10-25'), key);
    // Regel in database.rules.json: ct ≤ 1 000 000 Zeichen
    expect(node.ct.length).toBeLessThan(100_000);
  });
});

describe('Live-Sync: Firebase-Ereignisse', () => {
  it('übernimmt den ganzen Raum beim ersten put', () => {
    const { room, touched } = applyStreamEvent({}, 'put', '/', { d1: { at: 1 }, d2: { at: 2 } });
    expect(room).toEqual({ d1: { at: 1 }, d2: { at: 2 } });
    expect(touched.sort()).toEqual(['d1', 'd2']);
  });

  it('ersetzt einzelne Geräte und Felder', () => {
    let { room } = applyStreamEvent({}, 'put', '/', { d1: { at: 1, ct: 'x' } });
    ({ room } = applyStreamEvent(room, 'put', '/d2', { at: 5 }));
    expect(room.d2).toEqual({ at: 5 });
    const r = applyStreamEvent(room, 'put', '/d1/ct', 'y');
    expect(r.room.d1).toEqual({ at: 1, ct: 'y' });
    expect(r.touched).toEqual(['d1']);
  });

  it('versteht patch und Löschungen', () => {
    const start = { d1: { at: 1 }, d2: { at: 2 } };
    const p = applyStreamEvent(start, 'patch', '/', { d1: { at: 3 }, d3: { at: 4 } });
    expect(p.room).toEqual({ d1: { at: 3 }, d2: { at: 2 }, d3: { at: 4 } });
    expect(p.touched.sort()).toEqual(['d1', 'd3']);
    const del = applyStreamEvent(p.room, 'put', '/d2', null);
    expect(del.room.d2).toBeUndefined();
    expect(del.touched).toEqual([]);
    expect(applyStreamEvent(p.room, 'put', '/', null).room).toEqual({});
  });
});

describe('Live-Sync: Einladung', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('VITE_ARTA_DB_URL', 'https://arta-test.example.app/');
    vi.stubGlobal('EventSource', class {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('steckt den Raum in den Link und prüft ihn beim Öffnen', async () => {
    const room = newRoom();
    const p = { ...buildPayload(emptyData(), 'a', 'dev-1', '2026-10-25'), live: room };
    const back = await decodePayload(await encodePayload(p));
    expect(back.live).toEqual(room);
    const broken = await decodePayload(await encodePayload({ ...p, live: { secret: 'kurz', since: 1 } }));
    expect(broken.live).toBeUndefined();
  });

  it('nimmt den neueren Raum, damit beide im selben landen', async () => {
    const live = await import('../live');
    const { actions, getDevice } = await import('../store');
    expect(live.liveAvailable()).toBe(true);
    const own = live.ensureRoom()!;
    expect(getDevice().live?.secret).toBe(own.secret);
    expect(live.ensureRoom()?.secret).toBe(own.secret);

    expect(live.adoptRoom({ secret: newRoom().secret, since: own.since - 1000 })).toBe(false);
    expect(getDevice().live?.secret).toBe(own.secret);

    const newer = { secret: newRoom().secret, since: own.since + 1000 };
    expect(live.adoptRoom(newer)).toBe(true);
    expect(getDevice().live?.secret).toBe(newer.secret);

    // Neues Handy übernimmt beim Beitreten immer den Raum der Einladung.
    const older = { secret: newRoom().secret, since: 1 };
    expect(live.adoptRoom(older, true)).toBe(true);
    expect(getDevice().live?.secret).toBe(older.secret);
    actions.setLive(undefined);
  });

  it('bleibt ohne eingerichtete Datenbank beim Link-Sync', async () => {
    vi.stubEnv('VITE_ARTA_DB_URL', '');
    const live = await import('../live');
    expect(live.liveAvailable()).toBe(false);
    expect(live.ensureRoom()).toBeUndefined();
    expect(live.adoptRoom(newRoom())).toBe(false);
  });
});
