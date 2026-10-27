import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as RPointerEvent } from 'react';
import { cls } from '../lib/hooks';
import { buzz, sfx, tone } from './engine';
import {
  autoStep,
  bestTarget,
  canAutoFinish,
  isRed,
  pickUp,
  rankText,
  solDeal,
  solDraw,
  solMove,
  solWon,
  SUIT_CHAR,
  type SCard,
  type SolState,
  type Target,
  type Where,
} from './solitaire';
import type { GameProps } from './types';

const FACE: Record<number, string> = { 11: '🤵', 12: '👸', 13: '🤴' };

interface Spot {
  x: number;
  y: number;
  z: number;
}

interface Geo {
  w: number;
  h: number;
  cw: number;
  ch: number;
  gap: number;
  left: number;
  tabY: number;
}

function geometry(w: number, h: number): Geo {
  const gap = Math.max(3, Math.min(8, w * 0.016));
  const cw = Math.min((w - gap * 8) / 7, 84, ((h - gap * 4) / 4.6) / 1.42);
  const ch = cw * 1.42;
  const left = (w - (cw * 7 + gap * 6)) / 2;
  return { w, h, cw, ch, gap, left, tabY: gap + ch + gap * 2.4 };
}

const colX = (g: Geo, i: number) => g.left + i * (g.cw + g.gap);

/** Wo liegt welche Karte? */
function layout(s: SolState, g: Geo): Map<number, Spot> {
  const m = new Map<number, Spot>();
  s.stock.forEach((c, k) => m.set(c.id, { x: colX(g, 0), y: g.gap, z: k + 1 }));
  s.waste.forEach((c, k) => {
    const fan = Math.max(0, k - (s.waste.length - 3));
    m.set(c.id, { x: colX(g, 1) + fan * g.cw * 0.2, y: g.gap, z: k + 1 });
  });
  s.found.forEach((p, i) => p.forEach((c, k) => m.set(c.id, { x: colX(g, 3 + i), y: g.gap, z: k + 1 })));
  s.tab.forEach((p, i) => {
    const downs = p.filter((c) => !c.up).length;
    const ups = p.length - downs;
    let down = g.ch * 0.11;
    let up = g.ch * 0.28;
    const avail = g.h - g.tabY - g.gap - g.ch;
    const need = downs * down + Math.max(0, ups - 1) * up;
    if (need > avail && need > 0) {
      const k = avail / need;
      down *= Math.max(0.5, k);
      up = ups > 1 ? Math.max(g.ch * 0.12, (avail - downs * down) / (ups - 1)) : up;
    }
    let y = g.tabY;
    p.forEach((c, k) => {
      m.set(c.id, { x: colX(g, i), y, z: k + 1 });
      y += c.up ? up : down;
    });
  });
  return m;
}

function CardFace({ c }: { c: SCard }) {
  const suit = SUIT_CHAR[c.s];
  return (
    <div className={cls('sol-face', isRed(c) && 'red', FACE[c.r] && 'court')}>
      <span className="sol-corner">
        <b>{rankText(c.r)}</b>
        <i>{suit}</i>
      </span>
      <span className="sol-mid">{FACE[c.r] ?? (c.r === 1 && c.s === 'H' ? '💗' : suit)}</span>
      <span className="sol-corner br">
        <b>{rankText(c.r)}</b>
        <i>{suit}</i>
      </span>
    </div>
  );
}

interface Drag {
  pointer: number;
  from: Where;
  ids: number[];
  count: number;
  x0: number;
  y0: number;
  active: boolean;
  dx: number;
  dy: number;
}

/** Gewonnen: Die Karten hüpfen über den Tisch – wie früher am PC. */
function bounceCards(canvas: HTMLCanvasElement, cards: SCard[], g: Geo, onDone: () => void): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    onDone();
    return () => {};
  }
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(g.w * dpr);
  canvas.height = Math.round(g.h * dpr);
  ctx.scale(dpr, dpr);
  const order = [...cards].sort((a, b) => b.r - a.r);
  let i = 0;
  let cur: { c: SCard; x: number; y: number; vx: number; vy: number } | null = null;
  let last = performance.now();
  let raf = 0;
  const start = performance.now();
  const draw = (c: SCard, x: number, y: number) => {
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = 'rgba(60,20,60,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x, y, g.cw, g.ch, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = isRed(c) ? '#e0245e' : '#251633';
    ctx.font = `800 ${g.cw * 0.3}px system-ui`;
    ctx.textBaseline = 'top';
    ctx.fillText(rankText(c.r), x + 4, y + 3);
    ctx.font = `${g.cw * 0.55}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(SUIT_CHAR[c.s], x + g.cw / 2, y + g.ch * 0.58);
    ctx.textAlign = 'left';
  };
  const tick = (t: number) => {
    const dt = Math.min(0.033, (t - last) / 1000);
    last = t;
    if (!cur && i < order.length) {
      const c = order[i++];
      const pile = ['H', 'D', 'S', 'C'].indexOf(c.s);
      cur = { c, x: colX(g, 3 + Math.max(0, pile)), y: g.gap, vx: (Math.random() < 0.5 ? -1 : 1) * (90 + Math.random() * 160), vy: -Math.random() * 200 };
    }
    if (cur) {
      cur.vy += 1400 * dt;
      cur.x += cur.vx * dt;
      cur.y += cur.vy * dt;
      if (cur.y + g.ch > g.h) {
        cur.y = g.h - g.ch;
        cur.vy *= -0.72;
      }
      draw(cur.c, cur.x, cur.y);
      if (cur.x < -g.cw || cur.x > g.w) cur = null;
    }
    if ((i >= order.length && !cur) || t - start > 9000) {
      onDone();
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}

export function Solitaire({ best, onEnd }: GameProps) {
  const [s, setS] = useState<SolState>(() => solDeal());
  const [hist, setHist] = useState<SolState[]>([]);
  const [moves, setMoves] = useState(0);
  const [startAt, setStartAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [geo, setGeo] = useState<Geo>(() => geometry(360, 560));
  const [auto, setAuto] = useState(false);
  const [won, setWon] = useState(false);
  const [giveUp, setGiveUp] = useState(false);
  const [shake, setShake] = useState<number | null>(null);
  const board = useRef<HTMLDivElement>(null);
  const bounce = useRef<HTMLCanvasElement>(null);
  const els = useRef(new Map<number, HTMLDivElement>());
  const drag = useRef<Drag | null>(null);
  const [dragIds, setDragIds] = useState<number[]>([]);
  const finalTime = useRef(0);

  useLayoutEffect(() => {
    const el = board.current;
    if (!el) return;
    const fit = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 50 && r.height > 50) setGeo(geometry(r.width, r.height));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!startAt || won) return;
    const t = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(t);
  }, [startAt, won]);

  const secs = startAt ? Math.floor(((won ? finalTime.current : now) - startAt) / 1000) : 0;

  const commit = (n: SolState, sound: 'flip' | 'place' | 'found' = 'place') => {
    setHist((h) => [...h.slice(-199), s]);
    setS(n);
    setMoves((m) => m + 1);
    if (!startAt) setStartAt(Date.now());
    if (sound === 'found') tone(660 + n.found.reduce((a, p) => a + p.length, 0) * 12, 70, 'triangle', 0.05, 990);
    else if (sound === 'flip') sfx.flip();
    else tone(420, 45, 'triangle', 0.05);
    if (solWon(n)) {
      finalTime.current = Date.now();
      setWon(true);
    }
  };

  // Gewonnen → Karten hüpfen, dann Ergebnis
  useEffect(() => {
    if (!won) return;
    sfx.win();
    buzz([30, 30, 60]);
    const time = Math.max(1, Math.round((finalTime.current - (startAt ?? finalTime.current)) / 1000));
    const cards = s.found.flat();
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      onEnd({ score: time });
    };
    const stop = bounce.current ? bounceCards(bounce.current, cards, geo, finish) : null;
    if (!stop) finish();
    const t = window.setTimeout(finish, 9500);
    return () => {
      stop?.();
      window.clearTimeout(t);
    };
  }, [won]);

  // Automatisch fertig ablegen
  useEffect(() => {
    if (!auto) return;
    const t = window.setTimeout(() => {
      const n = autoStep(s);
      if (!n) return setAuto(false);
      commit(n, 'found');
    }, 95);
    return () => window.clearTimeout(t);
  }, [auto, s]);

  const undo = () => {
    if (!hist.length || won || auto) return;
    setS(hist[hist.length - 1]);
    setHist((h) => h.slice(0, -1));
    setMoves((m) => m + 1);
    tone(360, 50, 'triangle', 0.04, 260);
  };

  const draw = () => {
    if (won || auto) return;
    const n = solDraw(s);
    if (n) commit(n, 'flip');
  };

  const tryMove = (from: Where, count: number, to: Target | null, ids: number[]) => {
    if (to) {
      const n = solMove(s, from, count, to);
      if (n) {
        commit(n, to.k === 'found' ? 'found' : 'place');
        return true;
      }
    }
    setShake(ids[0]);
    window.setTimeout(() => setShake(null), 380);
    tone(180, 90, 'square', 0.03);
    return false;
  };

  const spots = layout(s, geo);

  // Wo wurde losgelassen?
  const dropTarget = (clientX: number, clientY: number): Target | null => {
    const r = board.current!.getBoundingClientRect();
    const x = clientX - r.left;
    const y = clientY - r.top;
    const col = Math.max(0, Math.min(6, Math.floor((x - geo.left + geo.gap / 2) / (geo.cw + geo.gap))));
    if (y < geo.tabY - geo.gap) return col >= 3 ? { k: 'found', i: col - 3 } : null;
    return { k: 'tab', i: col };
  };

  const whereOf = (id: number): { from: Where; idx: number } | null => {
    if (s.waste.some((c) => c.id === id)) return { from: { k: 'waste' }, idx: s.waste.findIndex((c) => c.id === id) };
    for (let i = 0; i < 4; i++) {
      const k = s.found[i].findIndex((c) => c.id === id);
      if (k >= 0) return { from: { k: 'found', i }, idx: k };
    }
    for (let i = 0; i < 7; i++) {
      const k = s.tab[i].findIndex((c) => c.id === id);
      if (k >= 0) return { from: { k: 'tab', i }, idx: k };
    }
    return null;
  };

  const onDown = (e: RPointerEvent<HTMLDivElement>, c: SCard) => {
    if (won || auto || drag.current) return;
    if (s.stock.some((x) => x.id === c.id)) {
      e.preventDefault();
      draw();
      return;
    }
    const w = whereOf(c.id);
    if (!w) return;
    // Nur die oberste Karte von Ablage und Fundament
    if (w.from.k !== 'tab' && w.idx !== (w.from.k === 'waste' ? s.waste.length - 1 : s.found[w.from.i].length - 1)) return;
    const cards = pickUp(s, w.from, w.from.k === 'tab' ? w.idx : undefined);
    if (!cards) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { pointer: e.pointerId, from: w.from, ids: cards.map((x) => x.id), count: cards.length, x0: e.clientX, y0: e.clientY, active: false, dx: 0, dy: 0 };
  };

  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    d.dx = e.clientX - d.x0;
    d.dy = e.clientY - d.y0;
    if (!d.active && Math.hypot(d.dx, d.dy) > 7) {
      d.active = true;
      setDragIds(d.ids);
    }
    if (!d.active) return;
    d.ids.forEach((id, k) => {
      const el = els.current.get(id);
      const sp = spots.get(id);
      if (el && sp) el.style.transform = `translate3d(${sp.x + d.dx}px, ${sp.y + d.dy}px, 0) rotate(${Math.max(-6, Math.min(6, d.dx * 0.02))}deg)`;
      if (el) el.style.zIndex = String(200 + k);
    });
  };

  const onUp = (e: RPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    drag.current = null;
    setDragIds([]);
    // Inline-Stil zurücksetzen – React setzt die Lage neu
    d.ids.forEach((id) => {
      const el = els.current.get(id);
      const sp = spots.get(id);
      if (el && sp) {
        el.style.transform = `translate3d(${sp.x}px, ${sp.y}px, 0)`;
        el.style.zIndex = String(sp.z);
      }
    });
    if (!d.active) {
      tryMove(d.from, d.count, bestTarget(s, d.from, d.count), d.ids);
      return;
    }
    const to = dropTarget(e.clientX, e.clientY);
    // Zurück auf den eigenen Platz: einfach wieder hinlegen
    if (!to || (to.k === d.from.k && 'i' in d.from && to.i === d.from.i)) return;
    tryMove(d.from, d.count, to, d.ids);
  };

  const all: SCard[] = [...s.stock, ...s.waste, ...s.found.flat(), ...s.tab.flat()];
  const finishable = canAutoFinish(s) && !auto && !won;
  const mm = Math.floor(secs / 60);
  const ss = String(secs % 60).padStart(2, '0');

  return (
    <div className="g-col fill sol">
      <div className="score-strip">
        <span>
          ⏱ {mm}:{ss}
        </span>
        <span>🃏 {moves} Züge</span>
        <span>🏆 {best ? `${Math.floor(best / 60)}:${String(best % 60).padStart(2, '0')}` : '–'}</span>
      </div>
      <div className="sol-board" ref={board} style={{ '--cw': `${geo.cw}px`, '--ch': `${geo.ch}px` } as CSSProperties}>
        {/* Plätze */}
        <button className="sol-slot stock" style={{ left: colX(geo, 0), top: geo.gap }} onClick={draw} aria-label="Stapel">
          {!s.stock.length && (s.waste.length ? '↻' : '')}
        </button>
        <div className="sol-slot" style={{ left: colX(geo, 1), top: geo.gap }} />
        {[0, 1, 2, 3].map((i) => (
          <div key={`f${i}`} className="sol-slot found" style={{ left: colX(geo, 3 + i), top: geo.gap }}>
            ♥
          </div>
        ))}
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div key={`t${i}`} className="sol-slot tab" style={{ left: colX(geo, i), top: geo.tabY }}>
            K
          </div>
        ))}
        {all.map((c) => {
          const sp = spots.get(c.id)!;
          const dragging = dragIds.includes(c.id);
          return (
            <div
              key={c.id}
              ref={(el) => {
                if (el) els.current.set(c.id, el);
                else els.current.delete(c.id);
              }}
              className={cls('sol-card', c.up && 'up', dragging && 'drag', shake === c.id && 'shake')}
              style={{ transform: `translate3d(${sp.x}px, ${sp.y}px, 0)`, zIndex: dragging ? 200 : sp.z }}
              onPointerDown={(e) => onDown(e, c)}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={onUp}
            >
              <div className="sol-flip">
                <CardFace c={c} />
                <div className="sol-back" />
              </div>
            </div>
          );
        })}
        <canvas ref={bounce} className={cls('sol-bounce', won && 'on')} />
      </div>
      <div className="sol-actions">
        <button className="btn soft small" onClick={undo} disabled={!hist.length || won || auto}>
          ↶ Zurück
        </button>
        {finishable ? (
          <button className="btn primary small" onClick={() => setAuto(true)}>
            ✨ Automatisch fertig
          </button>
        ) : (
          <button
            className="btn soft small"
            disabled={won || auto}
            onClick={() => {
              if (!giveUp) {
                setGiveUp(true);
                window.setTimeout(() => setGiveUp(false), 3000);
                return;
              }
              onEnd({ score: secs, failed: true });
            }}
          >
            {giveUp ? 'Wirklich aufgeben?' : '🏳️ Neu geben'}
          </button>
        )}
      </div>
    </div>
  );
}
