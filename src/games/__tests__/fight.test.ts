import { describe, expect, it } from 'vitest';
import {
  INTRO_T,
  KO_T,
  NO_INPUT,
  POWER_MAX,
  ROUND_TIME,
  STAGE_W,
  applyBlow,
  followFlow,
  followNet,
  kiInput,
  newKi,
  newWorld,
  packFighter,
  packFlow,
  stepWorld,
  type Blow,
  type Input,
  type World,
} from '../fight';
import { FIGHTERS, fighterById, lookOf } from '../fighters';
import { GAME_BY_ID } from '../registry';
import type { Side } from '../logic';

const DT = 1 / 60;
const BOTH = { local: ['p1', 'p2'] as Side[], flow: true };

type Inputs = Partial<Record<Side, Partial<Input>>>;

/** Kampf ohne Vorspann, die beiden stehen sich nah gegenüber. */
function arena(id1 = 'kai', id2 = 'mila', gap = 75): World {
  const w = newWorld(id1, id2);
  w.ph = 'fight';
  w.phT = 0;
  w.fx = [];
  w.f.p1.x = 500;
  w.f.p2.x = 500 + gap;
  return w;
}

const inp = (i?: Partial<Input>): Input => ({ ...NO_INPUT, ...i });

/** Rechnet Bilder weiter. `at` legt fest, in welchem Bild welche Taste gedrückt (oder gehalten) wird. */
function run(w: World, frames: number, at: (frame: number) => Inputs = () => ({})) {
  for (let i = 0; i < frames; i++) {
    const want = at(i);
    stepWorld(w, { p1: inp(want.p1), p2: inp(want.p2) }, DT, BOTH);
  }
}

/** Kleiner, fester Zufall für die KI */
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

describe('Herz-Fighter: Kämpfer', () => {
  it('jeder Kämpfer hat Werte, Aussehen und eine Spezialattacke', () => {
    expect(FIGHTERS.length).toBeGreaterThanOrEqual(2);
    const ids = new Set<string>();
    for (const f of FIGHTERS) {
      expect(ids.has(f.id)).toBe(false);
      ids.add(f.id);
      expect(f.hp).toBeGreaterThan(500);
      expect(f.special.name.length).toBeGreaterThan(2);
      expect(f.special.hits).toBeGreaterThanOrEqual(1);
      expect(f.special.dmg).toBeGreaterThan(0);
      expect(['projectile', 'rush']).toContain(f.special.kind);
      // Die zweite Farbvariante (gleicher Kämpfer auf beiden Seiten) sieht anders aus.
      expect(lookOf(f, true)).not.toEqual(lookOf(f, false));
    }
  });

  it('unbekannte Kämpfer fallen auf den ersten zurück', () => {
    expect(fighterById('gibtsnicht').id).toBe(FIGHTERS[0].id);
  });

  it('gleicher Kämpfer auf beiden Seiten: rechts in der zweiten Farbe', () => {
    const w = newWorld('kai', 'kai');
    expect(w.f.p1.alt).toBe(false);
    expect(w.f.p2.alt).toBe(true);
  });

  it('steht im Spielemenü bei den Arcade-Spielen, mit KI, zu zweit und online', () => {
    const g = GAME_BY_ID.fight;
    expect(g.name).toBe('Herz-Fighter');
    expect(g.category).toBe('action');
    expect(g.modes).toEqual(expect.arrayContaining(['cpu', 'duo', 'online']));
  });
});

describe('Herz-Fighter: Kampf', () => {
  it('beginnt mit Vorspann, dann läuft die Uhr', () => {
    const w = newWorld('kai', 'mila');
    expect(w.ph).toBe('intro');
    expect(w.f.p1.x).toBeLessThan(w.f.p2.x);
    expect(w.f.p1.hp).toBe(fighterById('kai').hp);
    run(w, Math.ceil(INTRO_T / DT) + 2);
    expect(w.ph).toBe('fight');
    run(w, 60);
    expect(w.clock).toBeLessThan(ROUND_TIME);
  });

  it('im Vorspann wirken keine Tasten', () => {
    const w = newWorld('kai', 'mila');
    const x = w.f.p1.x;
    run(w, 30, () => ({ p1: { x: 1, punch: true } }));
    expect(w.f.p1.x).toBe(x);
    expect(w.f.p2.hp).toBe(w.f.p2.maxHp);
  });

  it('laufen und springen', () => {
    const w = arena('kai', 'mila', 400);
    run(w, 30, () => ({ p1: { x: 1 } }));
    expect(w.f.p1.x).toBeGreaterThan(530);
    run(w, 6, (i) => ({ p1: { jump: i === 0 } }));
    expect(w.f.p1.y).toBeGreaterThan(0);
    run(w, 90);
    expect(w.f.p1.y).toBe(0);
  });

  it('ein Schlag trifft aus der Nähe und lädt den Powerbalken', () => {
    const w = arena();
    run(w, 30, (i) => ({ p1: { punch: i === 0 } }));
    expect(w.f.p2.hp).toBeLessThan(w.f.p2.maxHp);
    expect(w.f.p1.power).toBeGreaterThan(0);
    expect(w.f.p2.power).toBeGreaterThan(0);
  });

  it('aus der Ferne geht der Schlag ins Leere', () => {
    const w = arena('kai', 'mila', 320);
    run(w, 40, (i) => ({ p1: { punch: i === 0 } }));
    expect(w.f.p2.hp).toBe(w.f.p2.maxHp);
  });

  it('wer vom Gegner weg hält, blockt und verliert kaum etwas', () => {
    const open = arena();
    run(open, 40, (i) => ({ p1: { kick: i === 0 } }));
    const blocked = arena();
    // p2 steht rechts – weg heißt nach rechts halten
    run(blocked, 40, (i) => ({ p1: { kick: i === 0 }, p2: { x: 1 } }));
    const lostOpen = open.f.p2.maxHp - open.f.p2.hp;
    const lostBlocked = blocked.f.p2.maxHp - blocked.f.p2.hp;
    expect(lostOpen).toBeGreaterThan(40);
    expect(lostBlocked).toBeLessThan(lostOpen / 4);
    expect(blocked.fx.some((e) => e.k === 'block')).toBe(true);
  });

  it('Schlag, Schlag, Schlag ist eine Kombo, die umwirft', () => {
    const w = arena();
    const states = new Set<string>();
    let best = 0;
    for (let i = 0; i < 70; i++) {
      run(w, 1, () => ({ p1: { punch: i % 10 === 0 && i < 40 } }));
      states.add(w.f.p2.st);
      best = Math.max(best, w.f.p1.shown);
    }
    expect(best).toBeGreaterThanOrEqual(3);
    expect(states.has('air') || states.has('down')).toBe(true);
  });

  it('Spezialattacke nur mit vollem Balken – dann leert er sich', () => {
    const w = arena('kai', 'mila', 300);
    w.f.p1.power = POWER_MAX - 1;
    run(w, 5, (i) => ({ p1: { special: i === 0 } }));
    expect(w.f.p1.st).not.toBe('special');
    w.f.p1.power = POWER_MAX;
    run(w, 1, () => ({ p1: { special: true } }));
    expect(w.f.p1.st).toBe('special');
    expect(w.f.p1.power).toBe(0);
    expect(w.flash?.side).toBe('p1');
  });

  for (const id of FIGHTERS.map((f) => f.id)) {
    it(`Spezialattacke von ${id} richtet viel Schaden an`, () => {
      const w = arena(id, id === 'kai' ? 'mila' : 'kai', 260);
      w.f.p1.power = POWER_MAX;
      run(w, 1, () => ({ p1: { special: true } }));
      run(w, 300);
      const lost = w.f.p2.maxHp - w.f.p2.hp;
      expect(lost).toBeGreaterThan(120);
      expect(w.fx.some((e) => e.k === 'super')).toBe(true);
    });
  }
});

describe('Herz-Fighter: Runden', () => {
  it('K.O. → nächste Runde → nach zwei Siegen ist Schluss', () => {
    const w = arena();
    w.f.p2.hp = 1;
    run(w, 30, (i) => ({ p1: { punch: i === 0 } }));
    expect(w.ph).toBe('ko');
    expect(w.wins.p1).toBe(1);
    run(w, Math.ceil(KO_T / DT) + 2);
    expect(w.ph).toBe('intro');
    expect(w.round).toBe(2);
    expect(w.f.p2.hp).toBe(w.f.p2.maxHp);
    run(w, Math.ceil(INTRO_T / DT) + 2);
    expect(w.ph).toBe('fight');

    w.f.p1.x = 500;
    w.f.p2.x = 575;
    w.f.p2.hp = 1;
    run(w, 30, (i) => ({ p1: { punch: i === 0 } }));
    expect(w.wins.p1).toBe(2);
    expect(w.winner).toBe('p1');
    run(w, Math.ceil(KO_T / DT) + 2);
    expect(w.ph).toBe('over');
  });

  it('Zeit um: Wer prozentual mehr Leben hat, gewinnt die Runde', () => {
    const w = arena('kai', 'mila', 400);
    w.f.p1.hp = w.f.p1.maxHp * 0.4;
    w.clock = 0.05;
    run(w, 10);
    expect(w.ph).toBe('ko');
    expect(w.timeUp).toBe(true);
    expect(w.wins.p2).toBe(1);
  });

  it('KI gegen KI: ein Kampf endet immer mit einem Sieger', () => {
    for (const [a, b, seed] of [
      ['kai', 'mila', 1],
      ['mila', 'kai', 2],
      ['kai', 'kai', 3],
    ] as const) {
      const w = newWorld(a, b);
      const rnd = seeded(seed);
      const k1 = newKi();
      const k2 = newKi();
      let t = 0;
      while (w.ph !== 'over' && t < 60 * 5) {
        stepWorld(w, { p1: kiInput(w, 'p1', k1, rnd, DT), p2: kiInput(w, 'p2', k2, rnd, DT) }, DT, BOTH);
        t += DT;
        for (const f of [w.f.p1, w.f.p2]) {
          expect(f.x).toBeGreaterThanOrEqual(0);
          expect(f.x).toBeLessThanOrEqual(STAGE_W);
          expect(Number.isFinite(f.y)).toBe(true);
        }
      }
      expect(w.ph).toBe('over');
      expect(w.winner).not.toBeNull();
      // Die KI kämpft wirklich (nicht nur Zeitablauf ohne Treffer)
      expect(w.f.p1.hp + w.f.p2.hp).toBeLessThan(w.f.p1.maxHp + w.f.p2.maxHp);
    }
  });

  it('die KI blockt manchmal und zündet ihre Spezialattacke', () => {
    const w = newWorld('kai', 'mila');
    const rnd = seeded(9);
    const k1 = newKi();
    const k2 = newKi();
    let blocks = 0;
    let supers = 0;
    for (let i = 0; i < 60 * 120 && w.ph !== 'over'; i++) {
      w.fx = [];
      stepWorld(w, { p1: kiInput(w, 'p1', k1, rnd, DT), p2: kiInput(w, 'p2', k2, rnd, DT) }, DT, BOTH);
      blocks += w.fx.filter((e) => e.k === 'block').length;
      supers += w.fx.filter((e) => e.k === 'super').length;
    }
    expect(blocks).toBeGreaterThan(0);
    expect(supers).toBeGreaterThan(0);
  });
});

describe('Herz-Fighter: online', () => {
  /** Zwei Handys: A rechnet p1 und den Rundenablauf, B rechnet p2. Pakete gehen sofort hin und her. */
  function pair() {
    const a = arena();
    const b = arena();
    const sent: Blow[] = [];
    let seen = 0;
    const step = (ia: Partial<Input> = {}, ib: Partial<Input> = {}) => {
      stepWorld(a, { p1: inp(ia) }, DT, { local: ['p1'], flow: true, send: (bl) => sent.push(bl) });
      stepWorld(b, { p2: inp(ib) }, DT, { local: ['p2'], flow: false });
      // A → B: eigener Kämpfer, Treffer, Rundenablauf
      const pa = packFighter(a, a.f.p1, sent.slice(-8));
      followNet(b, b.f.p1, pa, 0, DT);
      for (const bl of pa.bl) {
        if (bl.n <= seen) continue;
        seen = bl.n;
        applyBlow(b, b.f.p2, bl);
      }
      followFlow(b, packFlow(a));
      // B → A
      followNet(a, a.f.p2, packFighter(b, b.f.p2, []), 0, DT);
    };
    return { a, b, step, sent };
  }

  it('Treffer gehen übers Netz und landen beim Getroffenen', () => {
    const { a, b, step, sent } = pair();
    step({ punch: true });
    for (let i = 0; i < 30; i++) step();
    expect(sent.length).toBeGreaterThan(0);
    expect(b.f.p2.hp).toBeLessThan(b.f.p2.maxHp);
    // A sieht den Schaden über das Paket von B
    expect(a.f.p2.hp).toBe(b.f.p2.hp);
  });

  it('doppelt geschickte Treffer zählen nur einmal', () => {
    const { b, step } = pair();
    step({ punch: true });
    for (let i = 0; i < 30; i++) step();
    const hp = b.f.p2.hp;
    for (let i = 0; i < 30; i++) step();
    expect(b.f.p2.hp).toBe(hp);
  });

  it('wer online blockt, entscheidet das eigene Handy', () => {
    const { b, step } = pair();
    step({ kick: true }, { x: 1 });
    for (let i = 0; i < 40; i++) step({}, { x: 1 });
    expect(b.f.p2.maxHp - b.f.p2.hp).toBeLessThan(20);
  });

  it('Positionen und Rundenablauf bleiben gleich', () => {
    const { a, b, step } = pair();
    for (let i = 0; i < 40; i++) step({ x: -1 }, { x: 1 });
    // Der Gegner wird weich nachgeführt – sobald beide stehen, sind sie deckungsgleich.
    for (let i = 0; i < 20; i++) step();
    expect(Math.abs(a.f.p1.x - b.f.p1.x)).toBeLessThan(3);
    expect(Math.abs(a.f.p2.x - b.f.p2.x)).toBeLessThan(3);
    b.f.p2.hp = 1;
    a.f.p1.x = 500;
    b.f.p2.x = 575;
    for (let i = 0; i < 4; i++) step();
    step({ punch: true });
    for (let i = 0; i < 40; i++) step();
    expect(a.ph).toBe('ko');
    expect(b.ph).toBe('ko');
    expect(b.wins).toEqual(a.wins);
    for (let i = 0; i < Math.ceil(KO_T / DT) + 5; i++) step();
    expect(a.round).toBe(2);
    expect(b.round).toBe(2);
    expect(b.f.p2.hp).toBe(b.f.p2.maxHp);
  });

  it('das Geschoss des anderen fliegt auch auf dem eigenen Handy', () => {
    const { a, b, step } = pair();
    a.f.p1.x = 300;
    b.f.p2.x = 900;
    for (let i = 0; i < 3; i++) step();
    a.f.p1.power = POWER_MAX;
    step({ special: true });
    let seenOnB = false;
    for (let i = 0; i < 120; i++) {
      step();
      if (b.proj.some((p) => p.owner === 'p1')) seenOnB = true;
    }
    expect(seenOnB).toBe(true);
    expect(b.f.p2.hp).toBeLessThan(b.f.p2.maxHp);
  });
});
