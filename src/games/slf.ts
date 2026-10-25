import { SLF_WORDS } from '../data/slf';
import { otherSide, type Side } from './logic';
import type { Rnd, TurnDef } from './turn';

export const SLF_CATS = [
  { id: 'stadt', label: 'Stadt', emoji: '🏙️' },
  { id: 'land', label: 'Land', emoji: '🗺️' },
  { id: 'fluss', label: 'Fluss', emoji: '🌊' },
  { id: 'tier', label: 'Tier', emoji: '🐾' },
  { id: 'name', label: 'Name', emoji: '🙋' },
  { id: 'beruf', label: 'Beruf', emoji: '👷' },
] as const;

/** Ohne die fiesen Buchstaben C, Q, X, Y … */
export const SLF_LETTERS = [...'ABDEFGHIKLMNOPRSTUW'];
export const SLF_ROUNDS = 3;
/** Schreibzeit pro Buchstabe */
export const SLF_TIME = 120_000;
/** Restzeit, sobald einer „Stopp!“ ruft */
export const SLF_STOP = 10_000;
const MAX_LEN = 40;

/** Vergleichsform: klein, ohne Umlaute/Akzente/Leerzeichen. */
export function fold(word: string): string {
  return word
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[^a-z0-9]/g, '');
}

/** Anfangsbuchstabe, Ä zählt als A usw. */
export function firstLetter(word: string): string {
  return (word.trim()[0] ?? '').normalize('NFD').replace(/[^A-Za-z]/g, '').toUpperCase();
}

let banks: Map<string, Set<string>> | null = null;
function bank(cat: string): Set<string> {
  banks ??= new Map(Object.entries(SLF_WORDS).map(([k, words]) => [k, new Set(words.map(fold))]));
  return banks.get(cat) ?? new Set();
}

/** Berufe auch in der weiblichen Form („Ärztin“, „Kauffrau“) erkennen. */
function variants(cat: string, w: string): string[] {
  if (cat !== 'beruf') return [w];
  const out = [w];
  if (w.endsWith('in')) {
    const base = w.slice(0, -2);
    out.push(base, base.replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u'));
  }
  if (w.endsWith('frau')) out.push(`${w.slice(0, -4)}mann`);
  return out;
}

export type Verdict = 'ok' | 'unknown' | 'wrong' | 'empty';

export function judge(cat: string, letter: string, word: string | undefined): Verdict {
  const w = (word ?? '').trim();
  if (!w) return 'empty';
  if (firstLetter(w) !== letter) return 'wrong';
  const b = bank(cat);
  return variants(cat, fold(w)).some((v) => b.has(v)) ? 'ok' : 'unknown';
}

export function wordsFor(cat: string, letter: string): string[] {
  return (SLF_WORDS[cat] ?? []).filter((w) => firstLetter(w) === letter);
}

export interface SlfRound {
  letter: string;
  answers: Record<Side, string[]>;
  /** Weggetippte (nicht akzeptierte) Antworten je Seite und Kategorie */
  veto: Record<Side, boolean[]>;
}

export interface SlfState {
  letters: string[];
  round: number;
  phase: 'write' | 'review' | 'done';
  /** An einem Handy wird nacheinander geschrieben */
  sequential: boolean;
  first: Side;
  answers: Partial<Record<Side, string[]>>;
  stopAt: number | null;
  stopBy: Side | null;
  ki?: { answers: string[][]; start: number; at: number };
  rounds: SlfRound[];
  next: Partial<Record<Side, boolean>>;
}

export type SlfAction = { t: 'submit'; answers: string[] } | { t: 'timeout' } | { t: 'veto'; who: Side; cat: number } | { t: 'next' };

const KI_SKILL: Record<string, number> = { stadt: 0.85, land: 0.75, fluss: 0.55, tier: 0.85, name: 0.9, beruf: 0.75 };

function kiAnswers(letter: string, rnd: Rnd): string[] {
  return SLF_CATS.map((c) => {
    const words = wordsFor(c.id, letter);
    return words.length && rnd() < KI_SKILL[c.id] ? words[Math.floor(rnd() * words.length)] : '';
  });
}

const kiTime = (rnd: Rnd) => 40_000 + rnd() * 40_000;

function toReview(s: SlfState): SlfState {
  const empty = () => SLF_CATS.map(() => '');
  const answers = { p1: s.answers.p1 ?? empty(), p2: s.answers.p2 ?? empty() };
  const veto = { p1: SLF_CATS.map(() => false), p2: SLF_CATS.map(() => false) };
  return { ...s, phase: 'review', answers, stopAt: null, rounds: [...s.rounds, { letter: s.letters[s.round], answers, veto }], next: {} };
}

/** Gilt die Antwort (bekannt oder unbekannt, aber nicht weggetippt)? */
export function counts(r: SlfRound, side: Side, cat: number): boolean {
  const v = judge(SLF_CATS[cat].id, r.letter, r.answers[side][cat]);
  return (v === 'ok' || v === 'unknown') && !r.veto[side][cat];
}

/** Punkte pro Kategorie: allein 20, verschieden 10, gleich 5. */
export function catPoints(r: SlfRound, cat: number): Record<Side, number> {
  const a = counts(r, 'p1', cat);
  const b = counts(r, 'p2', cat);
  if (a && b) {
    const same = fold(r.answers.p1[cat]) === fold(r.answers.p2[cat]);
    return same ? { p1: 5, p2: 5 } : { p1: 10, p2: 10 };
  }
  return { p1: a ? 20 : 0, p2: b ? 20 : 0 };
}

export function roundPoints(r: SlfRound): Record<Side, number> {
  const out = { p1: 0, p2: 0 };
  SLF_CATS.forEach((_, cat) => {
    const p = catPoints(r, cat);
    out.p1 += p.p1;
    out.p2 += p.p2;
  });
  return out;
}

export function slfTotals(s: SlfState): Record<Side, number> {
  const out = { p1: 0, p2: 0 };
  for (const r of s.rounds) {
    const p = roundPoints(r);
    out.p1 += p.p1;
    out.p2 += p.p2;
  }
  return out;
}

/** Wer schreibt gerade (an einem Handy nacheinander)? */
export function slfWriter(s: SlfState): Side | null {
  if (s.phase !== 'write' || !s.sequential) return null;
  if (!s.answers[s.first]) return s.first;
  return s.answers[otherSide(s.first)] ? null : otherSide(s.first);
}

function pickLetters(rnd: Rnd): string[] {
  const pool = SLF_LETTERS.slice();
  const out: string[] = [];
  while (out.length < SLF_ROUNDS) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
  return out;
}

export const slfDef: TurnDef<SlfState, SlfAction> = {
  init({ mode, starter, rnd }) {
    const letters = pickLetters(rnd);
    const now = Date.now();
    return {
      letters,
      round: 0,
      phase: 'write',
      sequential: mode === 'duo',
      first: starter,
      answers: {},
      stopAt: null,
      stopBy: null,
      ki: mode === 'cpu' ? { answers: letters.map((l) => kiAnswers(l, rnd)), start: now, at: now + kiTime(rnd) } : undefined,
      rounds: [],
      next: {},
    };
  },
  turn(s) {
    if (s.phase === 'done') return null;
    if (s.phase === 'write' && s.sequential) return slfWriter(s);
    return 'both';
  },
  apply(s, a, by, rnd) {
    switch (a.t) {
      case 'submit': {
        if (s.phase !== 'write' || s.answers[by]) return null;
        if (s.sequential && slfWriter(s) !== by) return null;
        const answers = SLF_CATS.map((_, k) => String(a.answers[k] ?? '').trim().slice(0, MAX_LEN));
        const next: SlfState = { ...s, answers: { ...s.answers, [by]: answers } };
        if (next.answers.p1 && next.answers.p2) return toReview(next);
        if (s.sequential || s.stopAt !== null) return next;
        return { ...next, stopAt: Date.now() + SLF_STOP, stopBy: by };
      }
      case 'timeout':
        return s.phase === 'write' && !s.sequential && s.stopAt !== null ? toReview(s) : null;
      case 'veto': {
        if (s.phase !== 'review' || a.cat < 0 || a.cat >= SLF_CATS.length || (a.who !== 'p1' && a.who !== 'p2')) return null;
        const r = s.rounds[s.rounds.length - 1];
        const veto = { ...r.veto, [a.who]: r.veto[a.who].map((v, k) => (k === a.cat ? !v : v)) };
        return { ...s, rounds: [...s.rounds.slice(0, -1), { ...r, veto }] };
      }
      case 'next': {
        if (s.phase !== 'review') return null;
        const next = { ...s.next, [by]: true };
        // An einem Handy reicht ein Tipp, gegen die KI tippt sie selbst.
        if (!s.sequential && !(next.p1 && next.p2)) return { ...s, next };
        const round = s.round + 1;
        if (round >= SLF_ROUNDS) return { ...s, next, round, phase: 'done' };
        const now = Date.now();
        return {
          ...s,
          round,
          phase: 'write',
          answers: {},
          stopAt: null,
          stopBy: null,
          first: otherSide(s.first),
          next: {},
          ki: s.ki ? { ...s.ki, start: now, at: now + kiTime(rnd) } : undefined,
        };
      }
    }
  },
  outcome(s) {
    if (s.phase !== 'done') return null;
    const t = slfTotals(s);
    return t.p1 === t.p2 ? 'draw' : t.p1 > t.p2 ? 'p1' : 'p2';
  },
  cpu(s, side, rnd) {
    if (s.phase === 'review') return s.next[side] ? null : { t: 'next' };
    if (s.phase !== 'write' || s.answers[side] || !s.ki) return null;
    const all = s.ki.answers[s.round];
    // Hat der Mensch früher „Stopp“ gerufen, ist die KI noch nicht mit allem fertig.
    const now = Date.now();
    if (now >= s.ki.at) return { t: 'submit', answers: all };
    const progress = Math.max(0, (now - s.ki.start) / (s.ki.at - s.ki.start));
    return { t: 'submit', answers: all.map((w) => (rnd() < progress ? w : '')) };
  },
  cpuDelay(s) {
    if (s.phase === 'review') return 900;
    if (!s.ki) return 1000;
    const now = Date.now();
    const target = s.stopAt !== null ? Math.min(s.ki.at, s.stopAt - 1500) : s.ki.at;
    return Math.max(300, target - now);
  },
  auto(s) {
    if (s.phase !== 'write' || s.sequential || s.stopAt === null) return null;
    return { action: { t: 'timeout' }, by: 'p1', delay: Math.max(0, s.stopAt + 2500 - Date.now()) };
  },
  viewer: (s) => slfWriter(s),
  endDelay: 400,
};
