import { describe, expect, it } from 'vitest';
import { toKey } from '../date';
import { applyHealthNode, clearHealth, HEALTH_BODY, parseHealthNode, parseStepText, withHealth } from '../health';
import { stepsOn } from '../steps';
import { getData, getDevice } from '../store';

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

  it('versteht den Eintrag, den der Kurzbefehl schickt', () => {
    // So landet die Vorlage nach dem Einsetzen in der Datenbank (Serverzeit statt .sv).
    const sent = JSON.parse(HEALTH_BODY.replace('SCHRITTE', '8.432'));
    expect(Object.keys(sent).sort()).toEqual(['at', 'ct', 'iv', 'v']);
    expect(sent.at).toEqual({ '.sv': 'timestamp' });
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
    // Weniger als schon gezählt → bleibt beim Maximum
    applyHealthNode(`health-${me}`, { v: 1, at: now + 1, iv: 'health', ct: '5000' });
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
