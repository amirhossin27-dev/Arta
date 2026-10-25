import { describe, expect, it } from 'vitest';
import {
  BOOST,
  LAPS,
  VMAX,
  WALL,
  ahead,
  applyZap,
  buildTrack,
  bump,
  decideOnline,
  fmtTime,
  hitBananas,
  kiInput,
  kiVmax,
  locate,
  newCourse,
  newKart,
  packKart,
  pickItem,
  seeded,
  stepKart,
  sweepBananas,
  tickCourse,
  trackPoint,
  unpackHazards,
  type Input,
  type KartEvent,
  type KartState,
  type Track,
} from '../kart';

const track = buildTrack();
const DT = 1 / 60;

/** Lässt Karts fahren, bis alle im Ziel sind (oder die Zeit um ist). */
function race(drivers: ((k: KartState, rival: KartState | null, rnd: () => number) => Input)[], seed = 1, maxT = 180) {
  const rnd = seeded(seed);
  const ks = drivers.map((_, i) => newKart(track, i === 0 ? 15 : -15));
  const course = newCourse(track);
  const events: KartEvent[][] = ks.map(() => []);
  let t = 0;
  while (t < maxT && ks.some((k) => k.fin === null)) {
    t += DT;
    ks.forEach((k, i) => {
      const rival = ks.length > 1 ? ks[1 - i] : null;
      stepKart(k, drivers[i](k, rival, rnd), DT, track, t, events[i], {
        rnd,
        course,
        leading: rival ? ahead(k, rival) : true,
        solo: ks.length === 1,
        target: rival,
        vmaxMul: i === 1 ? kiVmax(k, rival) : 1,
      });
    });
    if (ks.length === 2) {
      const [a, b] = ks;
      hitBananas(a, b.haz, events[0]);
      hitBananas(b, a.haz, events[1]);
      sweepBananas(a, b.hits);
      sweepBananas(b, a.hits);
      applyZap(a, b.zap, events[0]);
      applyZap(b, a.zap, events[1]);
      const ax = a.x;
      const ay = a.y;
      bump(a, b.x, b.y, 0.5);
      bump(b, ax, ay, 0.5);
    }
    tickCourse(course, DT);
  }
  return { ks, events, t };
}

const ki = (k: KartState, rival: KartState | null, rnd: () => number) => kiInput(k, track, rival, rnd, DT);

/** Wie ein Mensch mit zwei Knöpfen: nur ganz links, gerade oder ganz rechts. */
const thumbs = (k: KartState, rival: KartState | null, rnd: () => number): Input => {
  const inp = kiInput(k, track, rival, rnd, DT);
  return { steer: Math.abs(inp.steer) > 0.35 ? Math.sign(inp.steer) : 0, use: inp.use };
};

describe('Herz-Kart: Strecke', () => {
  it('ist ein geschlossener Rundkurs mit gleichmäßigen Abständen', () => {
    expect(track.len).toBeGreaterThan(2500);
    expect(track.len).toBeLessThan(3400);
    for (let i = 0; i < track.n; i++) {
      const j = (i + 1) % track.n;
      const d = Math.hypot(track.px[j] - track.px[i], track.py[j] - track.py[i]);
      expect(d).toBeGreaterThan(track.spacing * 0.9);
      expect(d).toBeLessThan(track.spacing * 1.05);
      expect(Math.hypot(track.dx[i], track.dy[i])).toBeCloseTo(1, 5);
    }
  });

  it('kommt sich nirgends selbst zu nahe und hat keine zu engen Kurven', () => {
    for (let i = 0; i < track.n; i += 2) {
      for (let j = 0; j < track.n; j += 2) {
        const sep = Math.min(Math.abs(i - j), track.n - Math.abs(i - j));
        if (sep < 40) continue;
        expect(Math.hypot(track.px[i] - track.px[j], track.py[i] - track.py[j])).toBeGreaterThan(WALL * 2);
      }
    }
    for (let i = 0; i < track.n; i++) {
      const j = (i + 1) % track.n;
      const turn = Math.abs(Math.atan2(track.dx[i] * track.dy[j] - track.dy[i] * track.dx[j], track.dx[i] * track.dx[j] + track.dy[i] * track.dy[j]));
      expect(track.spacing / turn).toBeGreaterThan(45);
    }
  });

  it('findet zu jedem Punkt die Stelle auf der Strecke und die seitliche Lage', () => {
    const rnd = seeded(5);
    for (let k = 0; k < 300; k++) {
      const s = rnd() * track.len;
      const lat = (rnd() - 0.5) * 2 * 60;
      const p = trackPoint(track, s, lat);
      const l = locate(track, p.x, p.y);
      let ds = Math.abs(l.s - s);
      ds = Math.min(ds, track.len - ds);
      expect(ds).toBeLessThan(3);
      expect(l.lat).toBeCloseTo(lat, 0);
    }
  });

  it('ist auf jedem Handy gleich (Bäume, Boxen)', () => {
    const again: Track = buildTrack();
    expect(again.trees).toEqual(track.trees);
    expect(again.boxes).toEqual(track.boxes);
    expect(track.boxes).toHaveLength(8);
    expect(track.trees.length).toBeGreaterThan(50);
  });
});

describe('Herz-Kart: Fahren', () => {
  it('die KI fährt drei Runden in einer knappen Minute, ohne an die Hecke zu fahren', () => {
    const { ks, events } = race([ki]);
    const k = ks[0];
    expect(k.fin).not.toBeNull();
    expect(k.fin!).toBeGreaterThan(35);
    expect(k.fin!).toBeLessThan(70);
    expect(k.lap).toBe(LAPS);
    expect(events[0].filter((e) => e === 'lap')).toHaveLength(LAPS - 2);
    expect(events[0].filter((e) => e === 'final')).toHaveLength(1);
    expect(events[0]).not.toContain('wall');
  });

  it('auch mit zwei Knöpfen (nur ganz links / ganz rechts) kommt man gut rum', () => {
    const { ks, events } = race([thumbs], 3);
    expect(ks[0].fin).not.toBeNull();
    expect(ks[0].fin!).toBeLessThan(75);
    expect(events[0].filter((e) => e === 'wall').length).toBeLessThan(3);
  });

  it('KI gegen KI: beide kommen ins Ziel, es wird geschubst, geworfen und getroffen', () => {
    let items = 0;
    let finishes = 0;
    for (const seed of [1, 2, 3, 4]) {
      const { ks, events } = race([ki, ki], seed);
      finishes += ks.filter((k) => k.fin !== null).length;
      items += events.flat().filter((e) => e === 'item').length;
      expect(Math.abs(ks[0].fin! - ks[1].fin!)).toBeLessThan(15);
    }
    expect(finishes).toBe(8);
    expect(items).toBeGreaterThan(10);
  });

  it('Gas gibt das Kart selbst, Wiese bremst, Turbo beschleunigt', () => {
    const rnd = seeded(1);
    const course = newCourse(track);
    const k = newKart(track, 0);
    const ev: KartEvent[] = [];
    for (let i = 0; i < 120; i++) stepKart(k, kiInput(k, track, null, rnd, DT), DT, track, i * DT, ev, { rnd, course, leading: true });
    expect(k.v).toBeGreaterThan(VMAX * 0.95);
    k.item = 'pilz';
    stepKart(k, { steer: 0, use: true }, DT, track, 2, ev, { rnd, course, leading: true });
    expect(ev).toContain('pilz');
    expect(k.item).toBeNull();
    for (let i = 0; i < 30; i++) stepKart(k, kiInput(k, track, null, rnd, DT), DT, track, 2, ev, { rnd, course, leading: true });
    expect(k.v).toBeGreaterThan(VMAX + 30);
    expect(k.v).toBeLessThanOrEqual(BOOST);
    // Ab auf die Wiese
    for (let i = 0; i < 200; i++) {
      stepKart(k, { steer: 0, use: false }, DT, track, 3, ev, { rnd, course, leading: true });
      k.a = Math.atan2(track.dy[k.seg], track.dx[k.seg]);
      k.lat = 60;
    }
    expect(k.v).toBeLessThan(VMAX * 0.6);
  });

  it('Abkürzen übers Gras zählt nicht als Fortschritt, und an der Hecke ist Schluss', () => {
    const rnd = seeded(1);
    const course = newCourse(track);
    const k = newKart(track, 0);
    const before = k.prog;
    // Quer rüber zur anderen Seite des Herzens "teleportieren"
    const far = trackPoint(track, track.len * 0.5, 0);
    k.x = far.x;
    k.y = far.y;
    stepKart(k, { steer: 0, use: false }, DT, track, 0, [], { rnd, course, leading: true });
    expect(Math.abs(k.prog - before)).toBeLessThan(5);
    // Geradeaus ins Grüne: die Hecke hält das Kart auf
    const ev: KartEvent[] = [];
    const k2 = newKart(track, 0);
    k2.a += Math.PI / 2;
    for (let i = 0; i < 240; i++) stepKart(k2, { steer: 0, use: false }, DT, track, 0, ev, { rnd, course, leading: true });
    expect(Math.abs(k2.lat)).toBeLessThanOrEqual(WALL + 0.01);
    expect(ev).toContain('wall');
  });

  it('Kurve halten startet einen Drift, kurzes Loslassen nicht – erst langes Loslassen gibt den Mini-Turbo', () => {
    const rnd = seeded(1);
    const course = newCourse(track);
    const k = newKart(track, 0);
    k.v = VMAX;
    const ev: KartEvent[] = [];
    // Das Kart bleibt auf der Mittellinie, nur die Steuerung zählt.
    const drive = (steer: number, frames: number) => {
      for (let i = 0; i < frames; i++) {
        stepKart(k, { steer, use: false }, DT, track, 0, ev, { rnd, course, leading: true });
        const p = trackPoint(track, k.s, 0);
        k.x = p.x;
        k.y = p.y;
        k.lat = 0;
      }
    };
    drive(1, 12);
    expect(k.driftDir).toBe(0);
    drive(1, 30);
    expect(k.driftDir).toBe(1);
    drive(0, 10);
    expect(k.driftDir).toBe(1);
    drive(1, 40);
    expect(k.drift).toBeGreaterThan(1.1);
    expect(ev).not.toContain('turbo');
    drive(0, 25);
    expect(ev).toContain('turbo');
    expect(k.driftDir).toBe(0);
    expect(k.boost).toBeGreaterThan(0.4);
  });
});

describe('Herz-Kart: Items', () => {
  it('wer vorne liegt, bekommt eher Bananen, wer hinten liegt, eher Herzpfeile – allein nur Pilze', () => {
    const rnd = seeded(9);
    const count = (leading: boolean) => {
      const c = { pilz: 0, banane: 0, pfeil: 0 };
      for (let i = 0; i < 2000; i++) c[pickItem(rnd, leading, false)]++;
      return c;
    };
    const front = count(true);
    const back = count(false);
    expect(front.banane).toBeGreaterThan(front.pfeil * 2);
    expect(back.pfeil).toBeGreaterThan(back.banane * 2);
    for (let i = 0; i < 50; i++) expect(pickItem(rnd, false, true)).toBe('pilz');
  });

  it('eine Banane bringt den anderen ins Schleudern und wird dann weggeräumt', () => {
    const rnd = seeded(1);
    const course = newCourse(track);
    const owner = newKart(track, 0);
    const victim = newKart(track, 0);
    owner.item = 'banane';
    stepKart(owner, { steer: 0, use: true }, DT, track, 0, [], { rnd, course, leading: true });
    expect(owner.haz).toHaveLength(1);
    const b = owner.haz[0];
    victim.x = b.x;
    victim.y = b.y;
    const ev: KartEvent[] = [];
    hitBananas(victim, owner.haz, ev);
    expect(ev).toContain('hit');
    expect(victim.spin).toBeGreaterThan(0);
    // Nochmal drüber: zählt nicht doppelt
    victim.spin = 0;
    hitBananas(victim, owner.haz, ev);
    expect(victim.spin).toBe(0);
    sweepBananas(owner, victim.hits);
    expect(owner.haz).toHaveLength(0);
  });

  it('höchstens drei Bananen liegen gleichzeitig', () => {
    const rnd = seeded(1);
    const course = newCourse(track);
    const k = newKart(track, 0);
    for (let i = 0; i < 5; i++) {
      k.item = 'banane';
      stepKart(k, { steer: 0, use: true }, DT, track, 0, [], { rnd, course, leading: true });
    }
    expect(k.haz.filter((h) => h.k === 'banane')).toHaveLength(3);
  });

  it('der Herzpfeil fliegt dem anderen hinterher und trifft', () => {
    const rnd = seeded(1);
    const course = newCourse(track);
    const shooter = newKart(track, 0);
    const target = newKart(track, 0);
    const p = trackPoint(track, 150, 20);
    target.x = p.x;
    target.y = p.y;
    shooter.item = 'pfeil';
    const ev: KartEvent[] = [];
    for (let i = 0; i < 120 && shooter.zap === 0; i++) stepKart(shooter, { steer: 0, use: i === 0 }, DT, track, 0, ev, { rnd, course, leading: false, target });
    expect(ev).toContain('fire');
    expect(ev).toContain('zap');
    expect(shooter.zap).toBe(1);
    expect(shooter.haz).toHaveLength(0);
    const hit: KartEvent[] = [];
    applyZap(target, shooter.zap, hit);
    expect(hit).toEqual(['hit']);
    applyZap(target, shooter.zap, hit);
    expect(hit).toHaveLength(1);
  });

  it('Item-Boxen geben nach kurzem Roulette ein Item und sind dann kurz weg', () => {
    const rnd = seeded(1);
    const course = newCourse(track);
    const k = newKart(track, 0);
    k.x = track.boxes[0].x;
    k.y = track.boxes[0].y;
    k.seg = locate(track, k.x, k.y).i;
    k.s = locate(track, k.x, k.y).s;
    k.prog = k.s;
    const ev: KartEvent[] = [];
    stepKart(k, { steer: 0, use: false }, DT, track, 0, ev, { rnd, course, leading: true });
    expect(ev).toContain('box');
    expect(course.boxes[0]).toBeGreaterThan(0);
    for (let i = 0; i < 70; i++) stepKart(k, { steer: 0, use: false }, DT, track, 0, ev, { rnd, course, leading: true });
    expect(ev).toContain('item');
    expect(k.item).not.toBeNull();
  });
});

describe('Herz-Kart: online', () => {
  it('ein Kart passt kompakt in eine Nachricht', () => {
    const k = newKart(track, 15);
    k.haz.push({ id: 3, k: 'banane', x: 100.123, y: 200.456, a: 1.23456, t: 2 });
    k.hits = [7];
    k.zap = 2;
    const nk = packKart(k, 12.345);
    const back = JSON.parse(JSON.stringify(nk));
    expect(back.el).toBe(12.3);
    expect(back.z).toBe(2);
    expect(back.hi).toEqual([7]);
    expect(unpackHazards(back.h)).toEqual([{ id: 3, k: 'banane', x: 100.1, y: 200.5, a: 1.235, t: 0 }]);
    expect(JSON.stringify(nk).length).toBeLessThan(200);
  });

  it('entscheidet den Sieger erst, wenn es sicher ist', () => {
    expect(decideOnline({ fin: 50, el: 51 }, { fin: null, el: 49.5 })).toBeNull();
    expect(decideOnline({ fin: 50, el: 51 }, { fin: null, el: 50.2 })).toBe('p1');
    expect(decideOnline({ fin: 50, el: 51 }, { fin: 49.8, el: 50 })).toBe('p2');
    expect(decideOnline({ fin: null, el: 47 }, { fin: 48, el: 48.5 })).toBeNull();
    expect(decideOnline({ fin: null, el: 48.1 }, { fin: 48, el: 48.5 })).toBe('p2');
    expect(decideOnline({ fin: null, el: 30 }, { fin: null, el: 30 })).toBeNull();
  });

  it('formatiert Rennzeiten', () => {
    expect(fmtTime(0)).toBe('0:00.0');
    expect(fmtTime(65.37)).toBe('1:05.4');
  });
});
