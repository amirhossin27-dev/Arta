import { describe, expect, it } from 'vitest';
import {
  ARENA,
  BALL_V,
  EYE,
  HALF,
  HOME,
  MAG,
  MAX_HP,
  SPAWNS,
  TARGET_SPOTS,
  WIN,
  botThink,
  collide,
  decide,
  findPath,
  fire,
  followMe,
  inPoly,
  los,
  moveFighter,
  navGrid,
  newBot,
  newFighter,
  packMe,
  pickSpawn,
  respawn,
  scoreOf,
  segBody,
  segTarget,
  segWorld,
  spawnTarget,
  startReload,
  stepBall,
  takeHit,
  tickFighter,
  walkable,
  type Ball,
  type Fighter,
  type Target,
  type V2,
} from '../strike';
import { GAME_BY_ID } from '../registry';
import type { Side } from '../logic';

const DT = 1 / 60;

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const area = (pts: V2[]) => pts.reduce((a, p, i) => a + p[0] * pts[(i + 1) % pts.length][1] - pts[(i + 1) % pts.length][0] * p[1], 0) / 2;

describe('Herz-Strike: Arena', () => {
  it('ist registriert, mit KI, online und allein', () => {
    const g = GAME_BY_ID.strike;
    expect(g.name).toBe('Herz-Strike');
    expect(g.modes).toEqual(expect.arrayContaining(['cpu', 'online', 'solo']));
    expect(g.scoreLabel).toBe('Treffer');
  });

  it('hat Grundrisse gegen den Uhrzeigersinn und ist für beide Seiten gleich', () => {
    for (const b of ARENA) expect(area(b.pts)).toBeGreaterThan(0);
    // Gespiegelt an z = 0: zu jeder Deckung gibt es ein Gegenstück
    for (const b of ARENA) {
      const twin = ARENA.find((o) => o.kind === b.kind && Math.abs(o.cx - b.cx) < 0.01 && Math.abs(o.cz + b.cz) < 0.01);
      expect(twin, `${b.kind} bei ${b.cx}/${b.cz}`).toBeTruthy();
    }
  });

  it('Startplätze liegen frei und sind voneinander aus erreichbar', () => {
    for (const [x, z] of SPAWNS) {
      expect(ARENA.some((b) => inPoly(x, z, b.pts))).toBe(false);
      expect(collide(x, z)).toEqual([x, z]);
    }
    const path = findPath([SPAWNS[HOME.p1][0], SPAWNS[HOME.p1][1]], [SPAWNS[HOME.p2][0], SPAWNS[HOME.p2][1]]);
    expect(path.length).toBeGreaterThan(0);
    let cur: V2 = [SPAWNS[HOME.p1][0], SPAWNS[HOME.p1][1]];
    for (const p of path) {
      expect(walkable(cur, p)).toBe(true);
      cur = p;
    }
    expect(Math.hypot(cur[0] - SPAWNS[HOME.p2][0], cur[1] - SPAWNS[HOME.p2][1])).toBeLessThan(0.6);
  });

  it('das Laufraster sperrt Deckungen und den Rand', () => {
    const g = navGrid();
    const free = g.reduce((n, v) => n + (v ? 0 : 1), 0);
    expect(free / g.length).toBeGreaterThan(0.6);
    expect(free / g.length).toBeLessThan(0.95);
  });

  it('schiebt Spieler aus Deckungen und hält sie in der Arena', () => {
    const can = ARENA.find((b) => b.kind === 'can')!;
    const [x, z] = collide(can.cx + 0.1, can.cz);
    expect(inPoly(x, z, can.pts)).toBe(false);
    const [ex, ez] = collide(HALF + 3, -HALF - 3);
    expect(ex).toBeLessThan(HALF);
    expect(ez).toBeGreaterThan(-HALF);
  });

  it('Sichtlinien: das Herz in der Mitte verdeckt, darüber hinweg sieht man', () => {
    expect(los([0, EYE, -8], [0, EYE, 8])).toBe(false);
    expect(los([0, 3.5, -8], [0, 3.5, 8])).toBe(true);
    const h = segWorld([0, 1, -8], [0, 1, 8])!;
    expect(h.b).toBeGreaterThanOrEqual(0);
    expect(ARENA[h.b].kind).toBe('heart');
    // Aufprall auf der Südseite, Normale zeigt zum Schützen
    expect(h.p[2]).toBeLessThan(0);
    expect(h.n[2]).toBeLessThan(-0.5);
  });

  it('Boden und Außenwand fangen Kugeln', () => {
    const floor = segWorld([5, 1, 14], [5, -1, 14])!;
    expect(floor.b).toBe(-1);
    expect(floor.p[1]).toBeCloseTo(0, 5);
    const wall = segWorld([16, 1, 14], [19, 1, 14])!;
    expect(wall.b).toBe(-2);
    expect(wall.n[0]).toBe(-1);
    // über die Wand hinweg fliegt sie davon
    expect(segWorld([16, 5, 14], [19, 5, 14])).toBeNull();
  });

  it('trifft Körper als stehenden Zylinder', () => {
    expect(segBody([0, 1, -3], [0, 1, 3], 0, 0)).toBeCloseTo((3 - 0.5) / 6, 5);
    expect(segBody([0, 2.2, -3], [0, 2.2, 3], 0, 0)).toBeNull();
    expect(segBody([2, 1, -3], [2, 1, 3], 0, 0)).toBeNull();
  });
});

describe('Herz-Strike: Schießen', () => {
  it('die Kugel landet dort, wo das Fadenkreuz hinzeigt', () => {
    const f = newFighter(HOME.p1);
    f.x = -14;
    f.z = 10;
    f.yaw = -Math.PI / 2; // nach Westen auf die Wand
    const b = fire(f, 'p1', 1, () => 0.5)!;
    expect(b).toBeTruthy();
    let hit: ReturnType<typeof stepBall> = null;
    for (let i = 0; i < 120 && !hit; i++) hit = stepBall(b, DT, {});
    expect(hit?.k).toBe('world');
    if (hit?.k !== 'world') return;
    expect(hit.p[0]).toBeCloseTo(-HALF, 3);
    expect(Math.abs(hit.p[1] - EYE)).toBeLessThan(0.08);
    expect(Math.abs(hit.p[2] - 10)).toBeLessThan(0.08);
  });

  it('Magazin, Feuerpause und Nachladen', () => {
    const f = newFighter(HOME.p1);
    let shots = 0;
    for (let i = 0; i < 600; i++) {
      if (fire(f, 'p1', i)) shots++;
      tickFighter(f, DT);
    }
    expect(shots).toBe(MAG);
    expect(startReload(f)).toBe(true);
    for (let i = 0; i < 100; i++) tickFighter(f, DT);
    expect(f.ammo).toBe(MAG);
  });

  it('drei Treffer: voller Farbe, Punkt für den anderen, dann Schutz nach dem Neustart', () => {
    const fs: Record<Side, Fighter> = { p1: newFighter(HOME.p1), p2: newFighter(HOME.p2) };
    expect(takeHit(fs.p2)).toBe(false);
    expect(takeHit(fs.p2)).toBe(false);
    expect(takeHit(fs.p2)).toBe(true);
    expect(fs.p2.alive).toBe(false);
    expect(scoreOf(fs, 'p1')).toBe(1);
    expect(takeHit(fs.p2)).toBe(false);
    let r = null;
    for (let i = 0; i < 300 && r !== 'respawn'; i++) r = tickFighter(fs.p2, DT);
    expect(r).toBe('respawn');
    respawn(fs.p2, pickSpawn(fs.p1));
    expect(fs.p2.hp).toBe(MAX_HP);
    expect(fs.p2.shield).toBeGreaterThan(0);
    expect(takeHit(fs.p2)).toBe(false);
    expect(fs.p2.hp).toBe(MAX_HP);
  });

  it('entscheidet: erster mit 5 Punkten, nach der Zeit der mit mehr', () => {
    const fs: Record<Side, Fighter> = { p1: newFighter(HOME.p1), p2: newFighter(HOME.p2) };
    expect(decide(fs, false)).toBeNull();
    fs.p2.deaths = 2;
    expect(decide(fs, false)).toBeNull();
    expect(decide(fs, true)).toBe('p1');
    fs.p1.deaths = 2;
    expect(decide(fs, true)).toBeNull();
    fs.p1.deaths = WIN;
    expect(decide(fs, false)).toBe('p2');
  });

  it('Pappziele klappen hoch und lassen sich treffen', () => {
    expect(TARGET_SPOTS.length).toBeGreaterThan(8);
    const list: Target[] = [];
    const t = spawnTarget(list, [0, -15], seeded(3))!;
    expect(t).toBeTruthy();
    expect(segTarget([0, 1, -15], [t.x, 1.2, t.z], t)).toBeNull(); // liegt noch
    t.up = 1;
    const from: [number, number, number] = [t.x + Math.sin(t.yaw) * 4, 1.2, t.z + Math.cos(t.yaw) * 4];
    expect(segTarget(from, [t.x - Math.sin(t.yaw), 1.2, t.z - Math.cos(t.yaw)], t)).not.toBeNull();
    expect(segTarget(from, [t.x - Math.sin(t.yaw), 2.4, t.z - Math.cos(t.yaw)], t)).toBeNull();
  });
});

describe('Herz-Strike: online', () => {
  it('packt den eigenen Stand kompakt und führt ihn drüben nach', () => {
    const f = newFighter(HOME.p1);
    f.x = 3.14159;
    f.z = -2.71828;
    f.vx = 1;
    f.deaths = 2;
    const ball: Ball = { n: 7, side: 'p1', p: [1, 1.4, 2], v: [0, 0, BALL_V], t: 0, real: true };
    const pk = JSON.parse(JSON.stringify(packMe(f, [ball], [{ n: 3, p: [0.5, 1.2, 0.25] }])));
    expect(pk.x).toBe(3.14);
    expect(pk.sb[0][0]).toBe(7);
    expect(pk.ht[0]).toEqual([3, 0.5, 1.2, 0.25]);
    const remote = newFighter(HOME.p2);
    for (let i = 0; i < 60; i++) followMe(remote, pk, 0, DT);
    expect(remote.x).toBeCloseTo(3.14, 1);
    expect(remote.deaths).toBe(2);
  });
});

describe('Herz-Strike: KI', () => {
  /** Zwei KIs gegeneinander, bis jemand gewinnt */
  function duel(seed: number, maxT = 400) {
    const rnd = seeded(seed);
    const fs: Record<Side, Fighter> = { p1: newFighter(HOME.p1), p2: newFighter(HOME.p2) };
    const bots = { p1: newBot(), p2: newBot() };
    const balls: Ball[] = [];
    let n = 0;
    let shots = 0;
    let hits = 0;
    let t = 0;
    while (t < maxT) {
      t += DT;
      for (const side of ['p1', 'p2'] as Side[]) {
        const me = fs[side];
        const foe = fs[side === 'p1' ? 'p2' : 'p1'];
        const o = botThink(bots[side], me, foe, DT, rnd, 0.45);
        moveFighter(me, o.mx, o.mz, DT);
        if (o.reload) startReload(me);
        if (o.fire) {
          const b = fire(me, side, ++n, rnd, 0.012);
          if (b) {
            balls.push(b);
            shots++;
          }
        }
        if (tickFighter(me, DT) === 'respawn') {
          respawn(me, pickSpawn(foe, rnd));
          bots[side] = newBot();
        }
      }
      for (let k = balls.length - 1; k >= 0; k--) {
        const h = stepBall(balls[k], DT, fs);
        if (!h) continue;
        balls.splice(k, 1);
        if (h.k === 'body') {
          hits++;
          takeHit(fs[h.side]);
        }
      }
      if (decide(fs, false)) break;
    }
    return { t, shots, hits, win: decide(fs, false), score: [scoreOf(fs, 'p1'), scoreOf(fs, 'p2')] };
  }

  it('findet den Gegner, trifft und beendet ein Spiel', () => {
    const results = [1, 2, 3].map((s) => duel(s));
    for (const r of results) {
      expect(r.win, JSON.stringify(r)).not.toBeNull();
      expect(r.hits).toBeGreaterThanOrEqual(WIN * MAX_HP);
      // Nicht jeder Schuss sitzt – aber auch nicht fast keiner
      expect(r.hits / r.shots).toBeGreaterThan(0.12);
      expect(r.hits / r.shots).toBeLessThan(0.85);
    }
  });

  it('läuft nicht durch Deckungen', () => {
    const rnd = seeded(9);
    const me = newFighter(HOME.p2);
    const foe = newFighter(HOME.p1);
    const bot = newBot();
    for (let i = 0; i < 60 * 20; i++) {
      const o = botThink(bot, me, foe, DT, rnd, 0.45);
      moveFighter(me, o.mx, o.mz, DT);
      for (const b of ARENA) expect(inPoly(me.x, me.z, b.pts)).toBe(false);
    }
    // und kommt dabei auf den Spieler zu
    expect(Math.hypot(me.x - foe.x, me.z - foe.z)).toBeLessThan(20);
  });
});
