import { useSyncExternalStore } from 'react';
import { CHANNEL_PREFIX, channelValue, channelsVersion, getLiveStatus, sendChannel, subscribeChannels } from '../lib/live';
import { getDevice } from '../lib/store';
import { other, type PersonId } from '../lib/types';
import type { Side } from './logic';
import { GAME_BY_ID, type GameId } from './registry';
import type { NetSnap } from './types';

/**
 * Online-Partien laufen über den Live-Sync-Raum: Jede Person schreibt nur in ihren eigenen,
 * verschlüsselten Kanal (`arcade-a` / `arcade-b`) und liest den des Schatzes. Wer einlädt, ist
 * Gastgeber (p1). Gespielt wird reihum – wer zieht, veröffentlicht den neuen Stand mit einer
 * höheren Nummer; es gilt immer der Stand mit der höchsten Nummer.
 */

export interface MatchDoc {
  id: string;
  game: GameId;
  host: PersonId;
  stake: number | null;
  since: number;
  /** Der Gast hat angenommen. */
  joined?: boolean;
  declined?: boolean;
  left?: boolean;
  /** Diese Runde möchte ich (als nächstes) spielen – für „Nochmal“. */
  ready: number;
  /** Ergebnis dieser Runde ist schon gezählt (nur Gastgeber). */
  rec?: number;
  /** Gemeinsamer Stand: Runde, Nummer, Daten, übernommene Gast-Züge */
  r?: number;
  seq?: number;
  st?: unknown;
  ack?: number;
  acts?: { n: number; r: number; a: unknown }[];
}

export interface ArcadeDoc {
  v: 1;
  by: PersonId;
  at: number;
  m?: MatchDoc;
}

/** Einladungen verfallen nach einer Weile. */
export const INVITE_TTL = 15 * 60_000;

const chan = (p: PersonId) => `${CHANNEL_PREFIX}${p}`;

export function readDoc(p: PersonId): ArcadeDoc | undefined {
  const d = channelValue(chan(p)) as ArcadeDoc | undefined;
  return d && typeof d === 'object' && d.v === 1 && d.by === p && (!d.m || GAME_BY_ID[d.m.game]) ? d : undefined;
}

function writeMine(fn: (m: MatchDoc | undefined) => MatchDoc | undefined): boolean {
  const me = getDevice().me;
  const m = fn(readDoc(me)?.m);
  const doc: ArcadeDoc = { v: 1, by: me, at: Date.now(), ...(m ? { m } : {}) };
  return sendChannel(chan(me), doc);
}

const randomId = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(36).padStart(2, '0')).join('');

// ───── Ansicht einer Partie ─────

export interface MatchView {
  id: string;
  game: GameId;
  host: PersonId;
  stake: number | null;
  /** Meine Seite: Gastgeber p1, Gast p2 */
  me: Side;
  mine: MatchDoc;
  theirs?: MatchDoc;
  /** Beide sind da. */
  together: boolean;
  declined: boolean;
  /** Der Schatz ist gegangen (oder spielt längst etwas anderes). */
  left: boolean;
  /** Höchste Runde, für die es einen Stand gibt. */
  round: number;
  shared(r: number): NetSnap | null;
  acts(r: number): { n: number; a: unknown }[];
  /** Die Runde, die beide als nächstes spielen wollen. */
  readyMine: number;
  readyTheirs: number;
  recorded: number;
}

export function matchView(mineDoc: ArcadeDoc | undefined, theirsDoc: ArcadeDoc | undefined, meId: PersonId): MatchView | null {
  const mine = mineDoc?.m;
  if (!mine || mine.left || mine.declined) return null;
  const t = theirsDoc?.m;
  const theirs = t && t.id === mine.id ? t : undefined;
  const iHost = mine.host === meId;
  const docs = [mine, theirs].filter((d): d is MatchDoc => !!d);
  const round = Math.max(0, ...docs.map((d) => d.r ?? 0));
  const hostDoc = iHost ? mine : theirs;
  const guestDoc = iHost ? theirs : mine;
  return {
    id: mine.id,
    game: mine.game,
    host: mine.host,
    stake: mine.stake,
    me: iHost ? 'p1' : 'p2',
    mine,
    theirs,
    together: !!theirs && !theirs.left && !theirs.declined && (iHost ? !!theirs.joined : true),
    declined: !!theirs?.declined,
    // Als Gast: Der Gastgeber hat die Partie beendet oder eine neue angefangen.
    left: !!theirs?.left || (!iHost && !theirs),
    round,
    shared(r) {
      let best: MatchDoc | undefined;
      for (const d of docs) {
        if (d.r !== r || d.seq === undefined || d.st === undefined) continue;
        if (!best || d.seq > best.seq! || (d.seq === best.seq && d === hostDoc)) best = d;
      }
      return best ? { seq: best.seq!, st: best.st, ack: best.ack ?? 0 } : null;
    },
    acts(r) {
      return (guestDoc?.acts ?? []).filter((x) => x.r === r).map(({ n, a }) => ({ n, a }));
    },
    readyMine: mine.ready,
    readyTheirs: theirs?.ready ?? -1,
    recorded: (hostDoc?.rec ?? -1),
  };
}

export interface Arcade {
  mine?: ArcadeDoc;
  theirs?: ArcadeDoc;
  /** Laufende (oder angebotene) eigene Partie */
  match: MatchView | null;
  /** Offene Einladung vom Schatz */
  invite?: MatchDoc;
}

let cached: { version: number; me: PersonId; value: Arcade } | null = null;

export function getArcade(): Arcade {
  const version = channelsVersion();
  const me = getDevice().me;
  if (cached && cached.version === version && cached.me === me) return cached.value;
  const mine = readDoc(me);
  const theirs = readDoc(other(me));
  const t = theirs?.m;
  const invite =
    t && t.host === other(me) && !t.left && Date.now() - t.since < INVITE_TTL && mine?.m?.id !== t.id ? t : undefined;
  const value: Arcade = { mine, theirs, match: matchView(mine, theirs, me), invite };
  cached = { version, me, value };
  return value;
}

export function useArcade(): Arcade {
  useSyncExternalStore(subscribeChannels, channelsVersion, channelsVersion);
  return getArcade();
}

/** Ist der Live-Raum gerade verbunden? (Sonst kommen Züge erst später an.) */
export const arcadeOnline = () => getLiveStatus().state === 'online';

// ───── Aktionen ─────

export function hostMatch(game: GameId, stake: number | null): string | null {
  const id = randomId();
  const me = getDevice().me;
  return writeMine(() => ({ id, game, host: me, stake, since: Date.now(), ready: 0 })) ? id : null;
}

export function joinMatch(m: MatchDoc): boolean {
  return writeMine(() => ({ id: m.id, game: m.game, host: m.host, stake: m.stake, since: m.since, joined: true, ready: 0 }));
}

export function declineMatch(m: MatchDoc) {
  writeMine(() => ({ id: m.id, game: m.game, host: m.host, stake: m.stake, since: m.since, declined: true, ready: 0 }));
}

export function leaveMatch(id: string) {
  writeMine((m) => (m && m.id === id && !m.left ? { ...m, left: true, st: undefined, acts: undefined } : m));
}

export function publishShared(id: string, r: number, snap: NetSnap) {
  writeMine((m) => (m && m.id === id ? { ...m, r, seq: snap.seq, st: snap.st, ack: snap.ack } : m));
}

/** `keep`: so viele Züge bleiben im Kanal stehen – Echtzeitspiele brauchen nur den neuesten. */
export function pushAct(id: string, r: number, a: unknown, keep = 16) {
  writeMine((m) => {
    if (!m || m.id !== id) return m;
    const list = (m.acts ?? []).filter((x) => x.r === r);
    const n = (list.length ? list[list.length - 1].n : 0) + 1;
    return { ...m, acts: [...(keep > 1 ? list.slice(-(keep - 1)) : []), { n, r, a }] };
  });
}

export function setReady(id: string, round: number) {
  writeMine((m) => (m && m.id === id ? { ...m, ready: Math.max(m.ready, round) } : m));
}

export function markRecorded(id: string, round: number) {
  writeMine((m) => (m && m.id === id ? { ...m, rec: Math.max(m.rec ?? -1, round) } : m));
}
