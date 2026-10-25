import { useEffect, useReducer, useRef, useState } from 'react';
import type { Side } from './logic';
import type { GameMode } from './registry';
import type { GameProps, NetSnap } from './types';

export type Rnd = () => number;

export interface InitCtx {
  mode: GameMode;
  starter: Side;
  rnd: Rnd;
}

/**
 * Ein rundenbasiertes Spiel als reine Funktionen. Daraus macht `useTurnGame` automatisch
 * „Ein Handy“, „Gegen KI“ und „Online“ – die Spiele selbst kümmern sich nur um Regeln und Optik.
 */
export interface TurnDef<S, A> {
  init(ctx: InitCtx): S;
  /** Wer jetzt dran ist. 'both': beide gleichzeitig (z. B. Stadt Land Fluss schreiben). */
  turn(s: S): Side | 'both' | null;
  /** Neuer Stand oder `null`, wenn der Zug nicht erlaubt ist. */
  apply(s: S, a: A, by: Side, rnd: Rnd): S | null;
  outcome(s: S): Side | 'draw' | null;
  /** Zug der KI (spielt immer p2). */
  cpu?(s: S, side: Side, rnd: Rnd): A | null;
  cpuDelay?(s: S): number;
  /** Automatische Schritte, z. B. Memory-Karten wieder umdrehen. Online führt sie das Handy von `by` aus. */
  auto?(s: S): { action: A; by: Side; delay: number } | null;
  /**
   * Spiele mit verdeckten Karten: wessen Augen gerade aufs Display dürfen. An einem Handy
   * erscheint dann zwischen den Zügen ein Sichtschutz zum Weitergeben.
   */
  viewer?(s: S): Side | null;
  endDelay?: number;
}

interface Snap<S> {
  s: S;
  seq: number;
  ack: number;
}

export interface TurnGame<S, A> {
  s: S;
  /** Wer gerade dran ist */
  turn: Side | 'both' | null;
  outcome: Side | 'draw' | null;
  /** Aus wessen Sicht das Spiel gezeigt wird (eigene Karten unten). */
  view: Side;
  /** Darf dieses Handy für diese Seite spielen? */
  controls(side: Side): boolean;
  /** Zug für die Seite, die dran ist (bei 'both': für `by` bzw. die eigene Seite). */
  act(a: A, by?: Side): boolean;
  /** Dieses Handy ist am Zug. */
  myTurn: boolean;
  /** Die KI überlegt. */
  thinking: boolean;
  /** Online: Der Schatz ist am Zug. */
  waiting: boolean;
  /** Online: Eigene Eingaben sind beim Gastgeber noch nicht angekommen. */
  pending: boolean;
  /** Sichtschutz an einem Handy: Für wen? */
  curtain: Side | null;
  reveal(): void;
}

export function useTurnGame<S, A>(def: TurnDef<S, A>, props: GameProps): TurnGame<S, A> {
  const { mode, starter, onEnd, net } = props;
  const online = mode === 'online' && !!net;
  const me: Side = online ? net!.me : 'p1';
  const ref = useRef<Snap<S> | null>(null);
  if (!ref.current) {
    const sh = online ? net!.shared : null;
    ref.current = sh
      ? { s: sh.st as S, seq: sh.seq, ack: sh.ack }
      : { s: def.init({ mode, starter, rnd: Math.random }), seq: online ? -1 : 0, ack: 0 };
  }
  const [version, bump] = useReducer((x: number) => x + 1, 0);
  const [revealed, setRevealed] = useState<Side | null>(null);
  const netRef = useRef(net);
  netRef.current = net;

  const commit = (next: Snap<S>, publish: boolean) => {
    ref.current = next;
    bump();
    if (publish && online) netRef.current?.publish({ seq: next.seq, st: next.s, ack: next.ack } satisfies NetSnap);
  };

  const controls = (side: Side) => (online ? side === me : mode === 'cpu' ? side === 'p1' : true);

  // Online: Der Gastgeber legt die Runde an.
  useEffect(() => {
    if (online && me === 'p1' && !net!.shared && ref.current!.seq <= 0) commit({ ...ref.current!, seq: 0 }, true);
  }, []);

  // Online: neuere Stände vom Schatz übernehmen.
  const shared = online ? net!.shared : null;
  useEffect(() => {
    if (shared && shared.seq > ref.current!.seq) commit({ s: shared.st as S, seq: shared.seq, ack: shared.ack }, false);
  }, [shared]);

  // Online: Der Gastgeber übernimmt die gleichzeitigen Eingaben des Gasts.
  const acts = online ? net!.acts : null;
  useEffect(() => {
    if (!acts || me !== 'p1') return;
    let snap = ref.current!;
    let changed = false;
    for (const { n, a } of acts) {
      if (n <= snap.ack) continue;
      const t = def.turn(snap.s);
      const next = t === 'both' || t === 'p2' ? def.apply(snap.s, a as A, 'p2', Math.random) : null;
      snap = { s: next ?? snap.s, seq: snap.seq + 1, ack: n };
      changed = true;
    }
    if (changed) commit(snap, true);
  }, [acts, version]);

  const s = ref.current.s;
  const turn = def.turn(s);
  const outcome = def.outcome(s);

  // KI
  useEffect(() => {
    if (mode !== 'cpu' || !def.cpu || outcome || (turn !== 'p2' && turn !== 'both')) return;
    const at = ref.current!;
    const t = window.setTimeout(() => {
      if (ref.current !== at) return;
      const a = def.cpu!(at.s, 'p2', Math.random);
      const next = a === null ? null : def.apply(at.s, a, 'p2', Math.random);
      if (next) commit({ ...at, s: next, seq: at.seq + 1 }, false);
    }, def.cpuDelay?.(at.s) ?? 700);
    return () => window.clearTimeout(t);
  }, [version]);

  // Automatische Schritte
  useEffect(() => {
    const at = ref.current!;
    const au = def.auto?.(at.s);
    if (!au || (online && au.by !== me)) return;
    const t = window.setTimeout(() => {
      if (ref.current !== at) return;
      const next = def.apply(at.s, au.action, au.by, Math.random);
      if (next) commit({ ...at, s: next, seq: at.seq + 1 }, true);
    }, au.delay);
    return () => window.clearTimeout(t);
  }, [version]);

  // Runde vorbei
  const ended = useRef(false);
  useEffect(() => {
    if (!outcome || ended.current) return;
    const t = window.setTimeout(() => {
      ended.current = true;
      onEnd({ winner: outcome });
    }, def.endDelay ?? 1200);
    return () => window.clearTimeout(t);
  }, [outcome]);

  const act = (a: A, by?: Side) => {
    const at = ref.current!;
    const t = def.turn(at.s);
    const side = by ?? (t === 'both' ? me : t);
    if (!side || def.outcome(at.s) || !controls(side)) return false;
    if (t !== 'both' && t !== side) return false;
    if (online && t === 'both' && me === 'p2') {
      netRef.current?.pushAct(a);
      return true;
    }
    const next = def.apply(at.s, a, side, Math.random);
    if (!next) return false;
    commit({ ...at, s: next, seq: at.seq + 1 }, true);
    return true;
  };

  // Sichtschutz: kurz warten, damit man das Ergebnis des eigenen Zugs noch sieht.
  const viewer = mode === 'duo' && def.viewer ? def.viewer(s) : null;
  const handover = viewer && viewer !== revealed && !outcome ? viewer : null;
  const [shownFor, setShownFor] = useState<Side | null>(null);
  useEffect(() => {
    if (!handover) return;
    if (revealed === null) return setShownFor(handover);
    const t = window.setTimeout(() => setShownFor(handover), 1300);
    return () => window.clearTimeout(t);
  }, [handover, revealed]);
  const curtain = handover && shownFor === handover ? handover : null;
  const view: Side = online ? me : mode === 'duo' && def.viewer ? (revealed ?? viewer ?? 'p1') : 'p1';
  const pending = online && me === 'p2' && !!acts?.some((x) => x.n > ref.current!.ack);

  return {
    s,
    turn,
    outcome,
    view,
    controls,
    act,
    myTurn: !outcome && !handover && turn !== null && (turn === 'both' || controls(turn)),
    thinking: mode === 'cpu' && !outcome && turn === 'p2',
    waiting: online && !outcome && turn !== null && turn !== 'both' && turn !== me,
    pending,
    curtain,
    reveal: () => {
      setRevealed(viewer);
      setShownFor(null);
    },
  };
}
