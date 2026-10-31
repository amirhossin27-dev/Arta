import { describe, expect, it } from 'vitest';
import { addDays, todayKey } from '../date';
import { getUI, nav } from '../ui';

describe('Tageswechsel', () => {
  it('Sport und Essen springen nach Mitternacht auf den neuen Tag, ein gewählter Tag bleibt', () => {
    const today = todayKey();
    const tomorrow = addDays(today, 1);
    const picked = addDays(today, -3);
    nav.setSportDate(today);
    nav.setFoodDate(picked);

    nav.followToday(tomorrow);
    expect(getUI().sportDate).toBe(tomorrow);
    expect(getUI().foodDate).toBe(picked);

    // Derselbe Tag nochmal ändert nichts mehr.
    nav.setSportDate(today);
    nav.followToday(tomorrow);
    expect(getUI().sportDate).toBe(today);

    nav.followToday(addDays(today, 2));
    expect(getUI().sportDate).toBe(today);
    expect(getUI().foodDate).toBe(picked);
  });
});
