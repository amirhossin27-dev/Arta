import { describe, expect, it } from 'vitest';
import { couponMessage, freshFrom, heartsMessage, inviteMessage, isPushDoc, noteMessage } from '../notify';
import { emptyData } from '../store';
import type { AppData, LoveNote } from '../types';

const NOW = Date.UTC(2026, 9, 26, 15);
const HOUR = 3_600_000;

function note(id: string, changes: Partial<LoveNote> = {}): LoveNote {
  return { id, from: 'b', to: 'a', text: 'Ich vermisse dich 💕', kind: 'note', surprise: false, createdAt: NOW - 1000, seen: false, updatedAt: NOW, ...changes };
}

function withNotes(d: AppData, ...notes: LoveNote[]): AppData {
  return { ...d, notes: { ...d.notes, ...Object.fromEntries(notes.map((n) => [n.id, n])) } };
}

describe('Mitteilungen: Texte', () => {
  it('Botschaft, Anfeuerung, Gutschein, Herzen und Einladung', () => {
    expect(noteMessage(note('n1'), 'Sara')).toEqual({ title: '💌 Botschaft von Sara', body: 'Ich vermisse dich 💕', tag: 'note-n1', tab: 'liebe' });
    expect(noteMessage(note('n2', { kind: 'cheer', text: 'Du schaffst das!' }), 'Sara')?.title).toBe('📣 Sara feuert dich an!');
    const coupon = { id: 'c1', from: 'b' as const, to: 'a' as const, title: 'Einmal Massage', emoji: '💆', createdAt: NOW, updatedAt: NOW };
    expect(couponMessage(coupon, 'Sara')).toMatchObject({ title: '🎟️ Gutschein von Sara', body: '💆 Einmal Massage' });
    expect(heartsMessage(1, 'Sara', '2026-10-26').title).toBe('❤️ Ein Herz von Sara');
    expect(heartsMessage(5, 'Sara', '2026-10-26')).toMatchObject({ title: '❤️ 5 Herzen von Sara', tag: 'hearts-2026-10-26' });
    expect(inviteMessage({ name: 'Uno', emoji: '🃏' }, 'Sara', 'm1')).toMatchObject({ title: '🃏 Sara lädt dich zu Uno ein!', tab: 'spiele' });
  });

  it('verrät Überraschungen nicht', () => {
    expect(noteMessage(note('s1', { surprise: true }), 'Sara')).toBeNull();
  });
});

describe('Mitteilungen: Was ist neu?', () => {
  it('meldet nur frische, ungelesene Botschaften vom Schatz', () => {
    const prev = withNotes(emptyData(), note('alt'));
    const next = withNotes(
      prev,
      note('neu'),
      note('gelesen', { seen: true }),
      note('geloescht', { deleted: true }),
      note('von-mir', { from: 'a', to: 'b' }),
      note('uralt', { createdAt: NOW - 30 * HOUR }),
    );
    const fresh = freshFrom(prev, next, 'b', '2026-10-26', 6 * HOUR, NOW);
    expect(fresh.notes.map((n) => n.id)).toEqual(['neu']);
    expect(fresh.coupons).toEqual([]);
    expect(fresh.hearts).toBe(0);
  });

  it('zählt neue Herzen und Gutscheine', () => {
    const prev = emptyData();
    prev.hearts['2026-10-26-b'] = { id: '2026-10-26-b', date: '2026-10-26', from: 'b', count: 2, updatedAt: NOW };
    const next: AppData = {
      ...prev,
      hearts: { '2026-10-26-b': { ...prev.hearts['2026-10-26-b'], count: 5 } },
      coupons: { c1: { id: 'c1', from: 'b', to: 'a', title: 'Frühstück ans Bett', emoji: '🥐', createdAt: NOW, updatedAt: NOW } },
    };
    const fresh = freshFrom(prev, next, 'b', '2026-10-26', 6 * HOUR, NOW);
    expect(fresh.hearts).toBe(3);
    expect(fresh.coupons.map((c) => c.id)).toEqual(['c1']);
  });
});

describe('Mitteilungen: Push-Abo im Raum', () => {
  const doc = { v: 1, person: 'b', endpoint: 'https://fcm.googleapis.com/fcm/send/x', p256dh: 'BAAA', auth: 'AAAA', vapid: { pub: 'BAAA', d: 'AAAA' }, at: NOW };

  it('erkennt gültige Abos und lehnt Kaputtes ab', () => {
    expect(isPushDoc(doc)).toBe(true);
    expect(isPushDoc({ ...doc, endpoint: 'http://fcm.googleapis.com/x' })).toBe(false);
    expect(isPushDoc({ ...doc, person: 'c' })).toBe(false);
    expect(isPushDoc({ ...doc, vapid: undefined })).toBe(false);
    expect(isPushDoc(null)).toBe(false);
  });
});
