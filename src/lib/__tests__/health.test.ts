import { describe, expect, it } from 'vitest';
import { toKey } from '../date';
import { applyHealthNode, clearHealth, parseHealthNode, parseStepText, withHealth } from '../health';
import { addMySteps, setMySteps } from '../pedometer';
import { stepsOn } from '../steps';
import { actions, getData, getDevice } from '../store';

describe('Apple Health', () => {
  it('liest die Schrittzahl aus dem, was der Kurzbefehl einsetzt', () => {
    expect(parseStepText('8432')).toBe(8432);
    expect(parseStepText('8.432')).toBe(8432);
    expect(parseStepText('8,432')).toBe(8432);
    expect(parseStepText('8432,0')).toBe(8432);
    expect(parseStepText('8432.6')).toBe(8433);
    expect(parseStepText('8 432 Schritte')).toBe(8432);
    expect(parseStepText('8 432')).toBe(8432);
    expect(parseStepText('12.345 count')).toBe(12345);
    expect(parseStepText('1.234,5')).toBe(1235);
    expect(parseStepText('950')).toBe(950);
    expect(parseStepText('SCHRITTE')).toBeUndefined();
    expect(parseStepText('')).toBeUndefined();
  });

  it('zählt mehrere Messungen zusammen, wenn eine Liste ankommt', () => {
    // „Fehlende ausfüllen“ an oder nicht nach Tag gruppiert: eine Zahl pro Zeile
    expect(parseStepText('5123\n0')).toBe(5123);
    expect(parseStepText('1.200\n830\r\n2.010 Schritte')).toBe(4040);
    expect(parseStepText('5123\n')).toBe(5123);
    expect(parseStepText('26.10.2026\n4321')).toBe(4321);
    expect(parseStepText('150000\n90000')).toBeUndefined();
  });

  it('versteht den Eintrag, den der Kurzbefehl schickt', () => {
    // So baut „Haupttext anfordern: JSON“ die Nachricht (Zahl v, Wörterbuch at, Text iv/ct) …
    const sent = { v: 1, at: { '.sv': 'timestamp' }, iv: 'health', ct: '8.432' };
    // … und so liegt sie danach in der Datenbank (Serverzeit statt .sv).
    const at = new Date(2026, 9, 26, 14, 32).getTime();
    expect(parseHealthNode({ ...sent, at })).toEqual({ date: '2026-10-26', count: 8432, at });
    expect(parseHealthNode({ ...sent, at: { '.sv': 'timestamp' } })).toBeUndefined();
    expect(parseHealthNode(null)).toBeUndefined();
  });

  it('übernimmt die eigenen Health-Schritte und zeigt die des Partners an', () => {
    const me = getDevice().me;
    const partner = me === 'a' ? 'b' : 'a';
    const now = Date.now();
    const today = toKey(new Date(now));
    applyHealthNode(`health-${me}`, { v: 1, at: now, iv: 'health', ct: '7.120' });
    expect(stepsOn(getData(), today, me).count).toBe(7120);

    applyHealthNode(`health-${partner}`, { v: 1, at: now, iv: 'health', ct: '9100' });
    // Partnerdaten schreibt nur sein eigenes Handy – hier nur angezeigt
    expect(stepsOn(getData(), today, partner).count).toBe(0);
    expect(withHealth(stepsOn(getData(), today, partner), partner).count).toBe(9100);
    expect(withHealth(stepsOn(getData(), '2020-01-01', partner), partner).count).toBe(0);
    clearHealth();
    expect(withHealth(stepsOn(getData(), today, partner), partner).count).toBe(0);
  });
});

describe('Apple Health ist die Wahrheit', () => {
  const me = () => getDevice().me;
  const node = (at: number, ct: string) => ({ v: 1, at, iv: 'health', ct });
  const day = (d: number, h = 12) => new Date(2026, 5, d, h).getTime();
  const count = (d: number) => stepsOn(getData(), toKey(new Date(day(d))), me()).count;

  it('ersetzt zu viel Gezähltes – auch nach unten (Health 8.367, Arta zeigte 15.497)', () => {
    const date = toKey(new Date(day(1)));
    applyHealthNode(`health-${me()}`, node(day(1, 10), '5000'));
    // Mitzählen in Arta: Diese Schritte zählt das iPhone für Health ebenfalls.
    actions.addSteps(date, 10_497);
    expect(count(1)).toBe(15_497);
    applyHealthNode(`health-${me()}`, node(day(1, 18), '8.367'));
    expect(count(1)).toBe(8367);
  });

  it('korrigiert auch Tage, die noch nach dem alten Maximum gespeichert sind', () => {
    const date = toKey(new Date(day(2)));
    setMySteps(date, 15_497); // ohne healthAt, wie vor dem Update
    applyHealthNode(`health-${me()}`, node(day(2, 20), '8367'));
    expect(count(2)).toBe(8367);
  });

  it('behält, was seit dem letzten Stand gezählt wurde, wenn derselbe Stand nochmal ankommt', () => {
    const date = toKey(new Date(day(3)));
    applyHealthNode(`health-${me()}`, node(day(3, 9), '4000'));
    actions.addSteps(date, 300);
    // Beim Neuverbinden schickt der Live-Raum den alten Stand noch einmal.
    applyHealthNode(`health-${me()}`, node(day(3, 9), '4000'));
    expect(count(3)).toBe(4300);
    expect(withHealth(stepsOn(getData(), date, me()), me()).count).toBe(4300);
  });

  it('lässt von Hand Dazugezähltes obendrauf, eine eingetippte Gesamtzahl ersetzt es', () => {
    const date = toKey(new Date(day(4)));
    applyHealthNode(`health-${me()}`, node(day(4, 9), '4000'));
    addMySteps(date, 1000); // Spaziergang ohne Handy – kennt Health nicht
    applyHealthNode(`health-${me()}`, node(day(4, 15), '6000'));
    expect(count(4)).toBe(7000);
    setMySteps(date, 6500);
    expect(stepsOn(getData(), date, me()).extra).toBeUndefined();
    applyHealthNode(`health-${me()}`, node(day(4, 21), '6800'));
    expect(count(4)).toBe(6800);
  });

  it('zeigt beim Partner den neuen Stand plus seine Handschritte', () => {
    const partner = me() === 'a' ? 'b' : 'a';
    const date = toKey(new Date(day(5)));
    applyHealthNode(`health-${partner}`, node(day(5, 9), '3000'));
    expect(withHealth({ date, count: 9999, goal: 8000, healthAt: day(5, 9) }, partner).count).toBe(9999);
    expect(withHealth({ date, count: 2000, goal: 8000, healthAt: day(5, 8), extra: 500 }, partner).count).toBe(3500);
    clearHealth();
  });
});

describe('Apple Health – falsch gebauter Kurzbefehl', () => {
  it('merkt sich, dass keine Zahl mitkam, und behält die letzte gute', () => {
    const me = getDevice().me;
    const now = Date.now();
    applyHealthNode(`health-${me}`, { v: 1, at: now, iv: 'health', ct: 'SCHRITTE' });
    expect(withHealth(stepsOn(getData(), '2020-01-01', me), me).count).toBe(0);
    applyHealthNode(`health-${me}`, { v: 1, at: now + 1, iv: 'health', ct: '7.500' });
    applyHealthNode(`health-${me}`, { v: 1, at: now + 2, iv: 'health', ct: '' });
    const today = toKey(new Date(now));
    expect(withHealth(stepsOn(getData(), today, me), me).count).toBeGreaterThanOrEqual(7500);
    applyHealthNode(`health-${me}`, null);
    clearHealth();
  });
});
