import { describe, expect, it } from 'vitest';
import { liveSummary } from '../live';
import { agoText, isUnseen, itemsOf, lastChange, matchesMemo, MAX_MEMO_ITEMS, memoIsEmpty, memoLabel, sortedMemos } from '../memos';
import { actions, commitData, emptyData, getData, getDevice, onSent, type Sent } from '../store';
import { buildPayload, mergeData } from '../sync';
import { summarize } from '../syncFlow';
import type { AppData, Memo, MemoItem, PersonId } from '../types';

function memo(id: string, extra: Partial<Memo> = {}): Memo {
  return { id, title: 'Packliste', text: '', emoji: '🧳', color: 'himmel', createdBy: 'a', createdAt: 1000, editedBy: 'a', updatedAt: 1000, ...extra };
}

function item(id: string, memoId: string, extra: Partial<MemoItem> = {}): MemoItem {
  return { id, memoId, text: id, done: false, pos: 1, by: 'a', updatedAt: 1000, ...extra };
}

function withMemos(memos: Memo[], items: MemoItem[] = []): AppData {
  const d = emptyData();
  d.memos = Object.fromEntries(memos.map((m) => [m.id, m]));
  d.memoItems = Object.fromEntries(items.map((i) => [i.id, i]));
  return d;
}

describe('Notizen: Anzeige', () => {
  it('sortiert angepinnte nach oben, sonst nach der letzten Änderung – auch an Punkten', () => {
    const d = withMemos(
      [memo('alt', { updatedAt: 100 }), memo('neu', { updatedAt: 500 }), memo('pin', { updatedAt: 50, pinned: true }), memo('weg', { updatedAt: 900, deleted: true })],
      [item('x', 'alt', { updatedAt: 800 })],
    );
    expect(sortedMemos(d).map((m) => m.id)).toEqual(['pin', 'alt', 'neu']);
  });

  it('zeigt offene Punkte vor erledigten, jeweils in Reihenfolge', () => {
    const d = withMemos([memo('m')], [item('c', 'm', { pos: 3 }), item('a', 'm', { pos: 1, done: true }), item('b', 'm', { pos: 2 }), item('z', 'anders')]);
    expect(itemsOf(d, 'm').map((i) => i.id)).toEqual(['b', 'c', 'a']);
  });

  it('merkt sich, wer zuletzt etwas geändert hat – auch beim Löschen eines Punktes', () => {
    const d = withMemos([memo('m', { updatedAt: 100 })], [item('i', 'm', { updatedAt: 300, by: 'b', deleted: true })]);
    expect(lastChange(d, d.memos.m)).toEqual({ at: 300, by: 'b' });
  });

  it('markiert Änderungen vom Schatz als neu, bis du die Notiz geöffnet hast', () => {
    const d = withMemos([memo('m', { editedBy: 'b', updatedAt: 200 })]);
    expect(isUnseen(d, d.memos.m, 'a', undefined)).toBe(true);
    expect(isUnseen(d, d.memos.m, 'a', { m: 200 })).toBe(false);
    expect(isUnseen(d, d.memos.m, 'b', undefined)).toBe(false);
  });

  it('nimmt ohne Titel die erste Zeile oder den ersten Punkt', () => {
    const d = withMemos([memo('t', { title: '', text: 'Wein kaufen\nund Kerzen' }), memo('l', { title: ' ' })], [item('Sonnencreme', 'l')]);
    expect(memoLabel(d, d.memos.t)).toBe('Wein kaufen');
    expect(memoLabel(d, d.memos.l)).toBe('Sonnencreme');
    expect(memoIsEmpty(d, d.memos.l)).toBe(false);
    expect(memoIsEmpty(withMemos([memo('e', { title: '  ' })]), memo('e', { title: '  ' }))).toBe(true);
  });

  it('findet Notizen über Titel, Text und Punkte', () => {
    const d = withMemos([memo('m', { text: 'für Italien' })], [item('Ladekabel', 'm')]);
    expect(matchesMemo(d, d.memos.m, 'LADE')).toBe(true);
    expect(matchesMemo(d, d.memos.m, 'italien')).toBe(true);
    expect(matchesMemo(d, d.memos.m, 'Zelt')).toBe(false);
  });

  it('sagt, wie lange die Änderung her ist', () => {
    const now = 1_800_000_000_000;
    expect(agoText(now - 20_000, now)).toBe('gerade eben');
    expect(agoText(now - 5 * 60_000, now)).toBe('vor 5 Min.');
    expect(agoText(now - 2 * 3_600_000, now)).toBe('vor 2 Std.');
  });
});

describe('Notizen bearbeiten', () => {
  it('legt eine Notiz erst beim Speichern an und schreibt mit, wer geändert hat', () => {
    commitData(emptyData());
    const me = getDevice().me;
    expect(actions.saveMemo('n1', { title: 'Geschenkideen', emoji: '🎁', color: 'rosa' })).toBe(true);
    const created = getData().memos.n1;
    expect(created).toMatchObject({ title: 'Geschenkideen', text: '', createdBy: me, editedBy: me });
    // Unverändert speichern ändert nichts am Zeitstempel.
    actions.saveMemo('n1', { title: 'Geschenkideen' });
    expect(getData().memos.n1.updatedAt).toBe(created.updatedAt);
    // Leerzeichen am Ende bleiben stehen – sonst verschluckt das automatische Speichern sie beim Tippen.
    actions.saveMemo('n1', { text: 'Kochkurs ' });
    expect(getData().memos.n1.text).toBe('Kochkurs ');
    commitData(emptyData());
  });

  it('legt beim ersten Punkt die Notiz mit an und hakt Punkte ab', () => {
    commitData(emptyData());
    expect(actions.addMemoItem('n2', '  Zahnbürste ', { title: 'Packliste', emoji: '🧳' })).toBe(true);
    expect(actions.addMemoItem('n2', '   ')).toBe(false);
    actions.addMemoItem('n2', 'Ladekabel');
    expect(getData().memos.n2.title).toBe('Packliste');
    const [a, b] = itemsOf(getData(), 'n2');
    expect([a.text, b.text]).toEqual(['Zahnbürste', 'Ladekabel']);
    expect(b.pos).toBeGreaterThan(a.pos);
    actions.setMemoItemDone(a.id, true);
    expect(itemsOf(getData(), 'n2').map((i) => i.text)).toEqual(['Ladekabel', 'Zahnbürste']);
    actions.renameMemoItem(b.id, 'USB-C-Kabel');
    expect(getData().memoItems[b.id].text).toBe('USB-C-Kabel');
    // Leer umbenannt = gelöscht
    actions.renameMemoItem(b.id, '  ');
    expect(getData().memoItems[b.id].deleted).toBe(true);
    actions.clearDoneMemoItems('n2');
    expect(itemsOf(getData(), 'n2')).toEqual([]);
    commitData(emptyData());
  });

  it('nimmt höchstens MAX_MEMO_ITEMS Punkte an', () => {
    commitData(emptyData());
    for (let i = 0; i < MAX_MEMO_ITEMS; i++) actions.addMemoItem('voll', `Punkt ${i}`);
    expect(actions.addMemoItem('voll', 'einer zu viel')).toBe(false);
    expect(itemsOf(getData(), 'voll')).toHaveLength(MAX_MEMO_ITEMS);
    commitData(emptyData());
  });

  it('löscht die Notiz samt Punkten und kann sie mit ihnen zurückholen', () => {
    commitData(emptyData());
    actions.addMemoItem('n3', 'Erst gelöscht');
    actions.addMemoItem('n3', 'Bleibt');
    const [first] = itemsOf(getData(), 'n3');
    actions.removeMemoItem(first.id);
    actions.removeMemo('n3');
    expect(getData().memos.n3.deleted).toBe(true);
    expect(itemsOf(getData(), 'n3')).toEqual([]);
    // Eine gelöschte Notiz wird durch Speichern nicht still wiederbelebt …
    expect(actions.saveMemo('n3', { text: 'hallo' })).toBe(false);
    // … aber „Wiederherstellen“ holt sie zurück – ohne den Punkt, der schon vorher gelöscht war.
    actions.restoreMemo('n3', { title: 'Zurück', text: '', emoji: '📝', color: 'gelb' });
    expect(getData().memos.n3.deleted).toBeUndefined();
    expect(itemsOf(getData(), 'n3').map((i) => i.text)).toEqual(['Bleibt']);
    commitData(emptyData());
  });

  it('meldet eine neue Notiz erst, wenn sie fertig ist – und nur eigene', () => {
    commitData(emptyData());
    const sent: Sent[] = [];
    const off = onSent((s) => sent.push(s));
    actions.saveMemo('n4', { title: 'Filme' });
    expect(sent).toEqual([]);
    actions.announceMemo('n4');
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ type: 'memo', memo: { id: 'n4', title: 'Filme' } });
    const other: PersonId = getDevice().me === 'a' ? 'b' : 'a';
    commitData({ ...getData(), memos: { ...getData().memos, fremd: memo('fremd', { createdBy: other }) } });
    actions.announceMemo('fremd');
    expect(sent).toHaveLength(1);
    off();
    commitData(emptyData());
  });

  it('merkt sich auf dem Gerät, bis wohin du eine Notiz gesehen hast', () => {
    commitData(withMemos([memo('s1')]));
    actions.markMemoSeen('s1', 500);
    actions.markMemoSeen('s1', 300);
    expect(getDevice().memosSeen?.s1).toBe(500);
    commitData(emptyData());
  });
});

describe('Notizen im Paar-Sync', () => {
  it('kommen vollständig mit – auch alte – und zählen als neu', () => {
    const remote = withMemos([memo('m', { createdBy: 'b', editedBy: 'b', updatedAt: 1 })], [item('i', 'm', { updatedAt: 1 })]);
    const payload = buildPayload(remote, 'b', 'dev', '2026-10-27');
    expect(Object.keys(payload.data.memos)).toEqual(['m']);
    expect(Object.keys(payload.data.memoItems)).toEqual(['i']);
    const { data, stats } = mergeData(emptyData(), payload.data, 'a');
    expect(data.memos.m.title).toBe('Packliste');
    expect(stats.newMemos).toBe(1);
    expect(liveSummary(stats)).toContain('1 neue Notiz 📝');
    expect(summarize(stats)).toContain('1 neue Notiz 📝');
    // Die eigene Notiz zurückzubekommen ist nichts Neues.
    expect(mergeData(emptyData(), payload.data, 'b').stats.newMemos).toBe(0);
  });

  it('verliert keine Punkte, wenn beide gleichzeitig etwas hinzufügen oder abhaken', () => {
    const base = withMemos([memo('m')], [item('i1', 'm')]);
    const mine = withMemos([memo('m')], [item('i1', 'm', { done: true, updatedAt: 2000 }), item('a2', 'm', { by: 'a', updatedAt: 2001 })]);
    const theirs = withMemos([memo('m')], [item('i1', 'm'), item('b2', 'm', { by: 'b', updatedAt: 2002 })]);
    const step1 = mergeData(base, mine, 'b').data;
    const merged = mergeData(step1, theirs, 'b').data;
    expect(itemsOf(merged, 'm').map((i) => [i.id, i.done])).toEqual([
      ['a2', false],
      ['b2', false],
      ['i1', true],
    ]);
  });

  it('übersteht Stände von Handys ohne Notizen', () => {
    const old = emptyData() as unknown as Record<string, unknown>;
    delete old.memos;
    delete old.memoItems;
    const { data } = mergeData(withMemos([memo('m')]), old as unknown as AppData, 'a');
    expect(data.memos.m).toBeDefined();
    expect(data.memoItems).toEqual({});
  });
});
