import { describe, expect, it } from 'vitest';
import { BZ_COLS, BZ_ROWS, bzEmpty, bzRow, bzShift } from '../Ballz';
import { hopGenerate, type HopPlat } from '../Hopper';
import { DX, DY, MAZE, MH, MW, START, canGo, chooseDir, countDots, dotGrid, ghostTarget, isWall, modeAt, opposite, type Dir } from '../muncher';
import { autoStep, bestTarget, canAutoFinish, canTab, pickUp, solDeal, solDraw, solMove, solWon, type SCard, type SolState } from '../solitaire';
import { HALF, TURN_WINDOW, makeSeg, newRun, runScore, runStep, segEnd, type RunState } from '../runner';
import { GAME_BY_ID } from '../registry';

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

describe('neue Spiele im Verzeichnis', () => {
  it('sind alle eingetragen, mit KI-Namen „KI“ und deutschen Regeln', () => {
    for (const id of ['ballz', 'hopper', 'muncher', 'solitaire', 'amor', 'runner', 'strike'] as const) {
      const g = GAME_BY_ID[id];
      expect(g, id).toBeTruthy();
      expect(g.rules.length).toBeGreaterThan(80);
      expect(g.rules).not.toMatch(/Arta-KI|gegen Arta/);
    }
    expect(GAME_BY_ID.solitaire.lowerIsBetter).toBe(true);
    expect(GAME_BY_ID.strike.category).toBe('action');
    expect(GAME_BY_ID.runner.category).toBe('action');
  });
});

describe('Ball-Blitz', () => {
  it('jede neue Reihe hat genau einen +1-Ball und mindestens einen Block', () => {
    const rnd = seeded(1);
    for (let round = 1; round < 60; round++) {
      const row = bzRow(round, rnd);
      expect(row).toHaveLength(BZ_COLS);
      expect(row.filter((c) => c?.k === 'plus')).toHaveLength(1);
      const blocks = row.filter((c) => c?.k === 'block');
      expect(blocks.length).toBeGreaterThanOrEqual(1);
      for (const b of blocks) if (b?.k === 'block') expect([round, round * 2]).toContain(b.hp);
      if (round < 4) expect(row.some((c) => c?.k === 'laser')).toBe(false);
    }
  });

  it('alles rutscht tiefer, und unten angekommen ist Schluss', () => {
    const g = bzEmpty();
    g[0] = bzRow(1, seeded(2));
    expect(bzShift(g)).toBe(false);
    expect(g[0].every((c) => c === null)).toBe(true);
    expect(g[1].some((c) => c?.k === 'block')).toBe(true);
    for (let i = 0; i < BZ_ROWS - 2; i++) expect(bzShift(g)).toBe(false);
    expect(g[BZ_ROWS - 1].some((c) => c?.k === 'block')).toBe(true);
    expect(bzShift(g)).toBe(true);
  });
});

describe('Herz-Hüpfer', () => {
  it('die nächste feste Plattform ist immer mit einem Sprung erreichbar', () => {
    const maxJump = 720 ** 2 / (2 * 1500);
    for (const seed of [1, 2, 3]) {
      const plats: HopPlat[] = [{ x: 130, y: -20, kind: 'normal', vx: 0, squish: 0 }];
      const end = hopGenerate(plats, -20, -40000, seeded(seed));
      expect(end).toBeLessThanOrEqual(-40000);
      const solid = plats.filter((p) => p.kind !== 'break').sort((a, b) => b.y - a.y);
      for (let i = 1; i < solid.length; i++) expect(solid[i - 1].y - solid[i].y).toBeLessThan(maxJump);
      for (const p of plats) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x + 60).toBeLessThanOrEqual(320);
      }
      // Weiter oben wird es schwerer: bewegte Plattformen tauchen auf
      expect(plats.some((p) => p.kind === 'move' && p.y < -10000)).toBe(true);
    }
  });
});

describe('Herz-Mampfer', () => {
  it('Labyrinth: gleich breite Zeilen, alles erreichbar, keine Sackgassen', () => {
    for (const row of MAZE) expect(row.length).toBe(MW);
    const seen = new Set<string>([`${START.x},${START.y}`]);
    const queue = [START];
    while (queue.length) {
      const p = queue.shift()!;
      for (const d of [0, 1, 2, 3] as Dir[]) {
        if (!canGo(p.x, p.y, d)) continue;
        const n = { x: (((p.x + DX[d]) % MW) + MW) % MW, y: p.y + DY[d] };
        const k = `${n.x},${n.y}`;
        if (!seen.has(k)) {
          seen.add(k);
          queue.push(n);
        }
      }
    }
    const dots = dotGrid();
    for (let y = 0; y < MH; y++) {
      for (let x = 0; x < MW; x++) {
        if (dots[y][x] > 0) expect(seen.has(`${x},${y}`), `Herz bei ${x},${y}`).toBe(true);
        if (!seen.has(`${x},${y}`) || isWall(x, y)) continue;
        const ways = ([0, 1, 2, 3] as Dir[]).filter((d) => canGo(x, y, d)).length;
        expect(ways, `Sackgasse bei ${x},${y}`).toBeGreaterThanOrEqual(2);
      }
    }
    expect(countDots(dots)).toBeGreaterThan(120);
  });

  it('Geister drehen nie um und jagen nach ihrer Art', () => {
    const rnd = seeded(4);
    for (let i = 0; i < 300; i++) {
      const x = 1 + Math.floor(rnd() * (MW - 2));
      const y = 1 + Math.floor(rnd() * (MH - 2));
      if (isWall(x, y)) continue;
      const cur = Math.floor(rnd() * 4) as Dir;
      const d = chooseDir(x, y, cur, { x: 0, y: 0 });
      const open = ([0, 1, 2, 3] as Dir[]).filter((k) => k !== opposite(cur) && canGo(x, y, k));
      if (open.length) {
        expect(d).not.toBe(opposite(cur));
        expect(canGo(x, y, d)).toBe(true);
      }
    }
    const me = { x: 9, y: 15 };
    expect(ghostTarget(0, false, me, 0, me, me)).toEqual(me);
    expect(ghostTarget(1, false, me, 0, me, me)).toEqual({ x: 13, y: 15 });
    expect(ghostTarget(0, true, me, 0, me, me)).not.toEqual(me);
    expect(modeAt(1)).toBe('scatter');
    expect(modeAt(10)).toBe('chase');
    expect(modeAt(999)).toBe('chase');
  });
});

describe('Solitär', () => {
  it('teilt 52 verschiedene Karten aus, 28 davon auf sieben Reihen', () => {
    const s = solDeal(seeded(5));
    const all = [...s.stock, ...s.tab.flat()];
    expect(new Set(all.map((c) => c.id)).size).toBe(52);
    expect(s.tab.map((p) => p.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    for (const p of s.tab) {
      expect(p[p.length - 1].up).toBe(true);
      expect(p.slice(0, -1).every((c) => !c.up)).toBe(true);
    }
    expect(s.stock).toHaveLength(24);
  });

  const card = (s: SCard['s'], r: number, up = true, id = r * 10 + 'HDSC'.indexOf(s)): SCard => ({ id, s, r, up });
  const empty = (): SolState => ({ stock: [], waste: [], found: [[], [], [], []], tab: [[], [], [], [], [], [], []] });

  it('nur abwechselnde Farben absteigend, auf leere Felder nur Könige', () => {
    expect(canTab(card('H', 6), [card('S', 7)])).toBe(true);
    expect(canTab(card('H', 6), [card('D', 7)])).toBe(false);
    expect(canTab(card('H', 6), [])).toBe(false);
    expect(canTab(card('C', 13), [])).toBe(true);
    const s = empty();
    s.tab[0] = [card('S', 9, false), card('H', 8), card('C', 7)];
    s.tab[1] = [card('D', 9)];
    expect(pickUp(s, { k: 'tab', i: 0 }, 0)).toBeNull();
    expect(pickUp(s, { k: 'tab', i: 0 }, 1)).toHaveLength(2);
    // Die 8 mit der 7 auf eine schwarze 9? Nein, die 9 ist rot – auf die rote 9 passt die rote 8 nicht.
    expect(solMove(s, { k: 'tab', i: 0 }, 2, { k: 'tab', i: 1 })).toBeNull();
    s.tab[1] = [card('C', 9)];
    const n = solMove(s, { k: 'tab', i: 0 }, 2, { k: 'tab', i: 1 })!;
    expect(n.tab[1].map((c) => c.r)).toEqual([9, 8, 7]);
    // die verdeckte Karte darunter wird umgedreht
    expect(n.tab[0][0].up).toBe(true);
    // der alte Stand bleibt unverändert (für Rückgängig)
    expect(s.tab[0]).toHaveLength(3);
  });

  it('Stapel ziehen und wieder umdrehen', () => {
    const s = empty();
    s.stock = [card('H', 1, false), card('S', 2, false)];
    const a = solDraw(s)!;
    const b = solDraw(a)!;
    expect(b.waste.map((c) => c.r)).toEqual([2, 1]);
    const c = solDraw(b)!;
    expect(c.waste).toHaveLength(0);
    expect(c.stock.map((x) => x.r)).toEqual([1, 2]);
    expect(c.stock.every((x) => !x.up)).toBe(true);
    expect(solDraw(empty())).toBeNull();
  });

  it('antippen legt Asse nach oben, und am Ende geht alles von selbst', () => {
    const s = empty();
    s.waste = [card('D', 1)];
    expect(bestTarget(s, { k: 'waste' }, 1)).toEqual({ k: 'found', i: 0 });
    // Fast gewonnen: alles aufgedeckt, je Farbe noch die oberen Karten in den Reihen
    const near = empty();
    'HDSC'.split('').forEach((su, i) => {
      near.found[i] = Array.from({ length: 10 }, (_, k) => card(su as SCard['s'], k + 1));
    });
    near.tab[0] = [card('H', 13), card('S', 12), card('D', 11)];
    near.tab[1] = [card('S', 13), card('H', 12), card('C', 11)];
    near.tab[2] = [card('D', 13), card('C', 12), card('H', 11)];
    near.tab[3] = [card('C', 13), card('D', 12), card('S', 11)];
    expect(canAutoFinish(near)).toBe(true);
    let cur: SolState | null = near;
    let steps = 0;
    while (cur && !solWon(cur) && steps < 20) {
      cur = autoStep(cur);
      steps++;
    }
    expect(cur && solWon(cur)).toBe(true);
    expect(steps).toBe(12);
  });
});

describe('Tempel-Lauf', () => {
  it('Streckenstücke schließen aneinander an, Hindernisse bleiben vor der Kreuzung', () => {
    const rnd = seeded(6);
    let prev = makeSeg(null, 0, rnd);
    expect(prev.obs[0].d).toBeGreaterThanOrEqual(38);
    for (let k = 1; k < 40; k++) {
      const s = makeSeg(prev, k, rnd);
      const [ex, ez] = segEnd(prev);
      expect(s.x).toBeCloseTo(ex, 6);
      expect(s.z).toBeCloseTo(ez, 6);
      expect(s.h).toBe((prev.h + prev.turn + 4) % 4);
      for (const o of s.obs) expect(o.d + o.len / 2).toBeLessThan(s.len - TURN_WINDOW);
      for (const o of s.obs) if (o.kind === 'block') expect(o.lanes.length).toBeLessThan(3);
      prev = s;
    }
  });

  /** Läuft mit einem einfachen Autopiloten (springt, rutscht, weicht aus, biegt ab). */
  function autopilot(st: RunState, t: number, rnd: () => number) {
    for (let i = 0; i < t * 60 && !st.dead; i++) {
      const seg = st.segs[st.si];
      let inp: { side?: -1 | 1; jump?: boolean; slide?: boolean } = {};
      if (st.d > seg.len - 4) inp = { side: seg.turn };
      else {
        // das nächste Hindernis zuerst; bei hohem Tempo früher reagieren
        const next = seg.obs.filter((o) => o.d + o.len / 2 > st.d).sort((a, b) => a.d - b.d);
        for (const o of next) {
          const ahead = o.d - o.len / 2 - st.d;
          if (ahead > Math.max(3, st.speed * 0.4)) break;
          if (o.kind === 'log' || o.kind === 'gap') {
            if (ahead < 1.6 && st.y <= 0) inp = { jump: true };
            break;
          }
          if (o.kind === 'arch') {
            if (ahead < 1.6 && st.slide <= 0) inp = { slide: true };
            break;
          }
          if (o.lanes.includes(st.lane)) {
            const free = [-1, 0, 1].filter((l) => !o.lanes.includes(l)).sort((a, b) => Math.abs(a - st.lane) - Math.abs(b - st.lane))[0];
            inp = { side: (free < st.lane ? -1 : 1) as -1 | 1 };
            break;
          }
        }
      }
      runStep(st, 1 / 60, inp, rnd);
    }
  }

  it('mit sauberem Laufen geht es Kurve um Kurve weiter', () => {
    // 150 s: bis zum Höchsttempo, mit vielen Kurven (früher gingen nach 7 Kurven die Stücke aus)
    for (const seed of [7, 11, 13]) {
      const rnd = seeded(seed);
      const st = newRun(rnd);
      autopilot(st, 150, rnd);
      expect(st.dead, `seed ${seed}`).toBeNull();
      expect(st.dist).toBeGreaterThan(1500);
      expect(st.segs.length).toBeLessThanOrEqual(6);
      expect(runScore(st)).toBe(Math.floor(st.dist) + st.hearts * 5);
    }
  });

  it('wer nicht abbiegt, stürzt; wer zweimal stolpert, wird geknuddelt', () => {
    const rnd = seeded(8);
    const a = newRun(rnd);
    a.segs[0].obs = [];
    for (let i = 0; i < 60 * 20 && !a.dead; i++) runStep(a, 1 / 60, {}, rnd);
    expect(a.dead).toBe('fall');
    expect(a.d).toBeGreaterThan(a.segs[0].len + HALF - 0.4);

    const b = newRun(rnd);
    b.segs[0].obs = [
      { kind: 'log', d: 20, len: 0.7, lanes: [] },
      { kind: 'arch', d: 28, len: 0.7, lanes: [] },
    ];
    for (let i = 0; i < 60 * 5 && !b.dead; i++) runStep(b, 1 / 60, {}, rnd);
    expect(b.dead).toBe('caught');
  });
});
