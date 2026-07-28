import { describe, expect, it } from 'vitest';
import {
  EFFORT_RANK,
  effortRank,
  isWeekendDate,
  localDateKey,
  maxEffortRankForSlot,
  seasonForDate,
  seasonForMonth,
  slotForDate,
  slotForHour,
} from '../src/core/slots';
import { day } from './fixtures';

/** `docs/SPEC.md` §1.2, §2.2, §2.3, §4.2. */

describe('effortRank', () => {
  it('uses the fixed table, not a position in some array', () => {
    expect(EFFORT_RANK).toEqual({ instant: 0, quick: 1, medium: 2, project: 3 });
    expect(effortRank('instant')).toBe(0);
    expect(effortRank('project')).toBe(3);
  });

  it('fails safe on an unrecognised effort', () => {
    // `dish.effort` is TEXT. An unknown value must read as the most expensive effort,
    // so it is filtered out of a tight budget rather than collecting the quick bonus.
    expect(effortRank('leisurely')).toBe(EFFORT_RANK.project);
  });
});

describe('slotForHour', () => {
  it('maps the three windows from SPEC §2.2', () => {
    expect(slotForHour(4)).toBe('breakfast');
    expect(slotForHour(10)).toBe('breakfast');
    expect(slotForHour(11)).toBe('lunch');
    expect(slotForHour(16)).toBe('lunch');
    expect(slotForHour(17)).toBe('dinner');
    expect(slotForHour(23)).toBe('dinner');
  });

  it('keeps the small hours on dinner rather than rolling to breakfast', () => {
    expect(slotForHour(0)).toBe('dinner');
    expect(slotForHour(3)).toBe('dinner');
  });

  it('never auto-detects snack', () => {
    const detected = new Set(Array.from({ length: 24 }, (_, hour) => slotForHour(hour)));
    expect(detected.has('snack')).toBe(false);
  });

  it('rejects an hour outside a day', () => {
    expect(() => slotForHour(24)).toThrow(RangeError);
    expect(() => slotForHour(-1)).toThrow(RangeError);
  });

  it('reads the local hour off a date', () => {
    expect(slotForDate(day(2026, 7, 27, 8))).toBe('breakfast');
    expect(slotForDate(day(2026, 7, 27, 19))).toBe('dinner');
  });
});

describe('maxEffortRankForSlot', () => {
  it('caps weekday breakfast at medium and opens the weekend to project', () => {
    expect(maxEffortRankForSlot('breakfast', false)).toBe(EFFORT_RANK.medium);
    expect(maxEffortRankForSlot('breakfast', true)).toBe(EFFORT_RANK.project);
  });

  it('leaves lunch and dinner unrestricted on any day', () => {
    for (const weekend of [false, true]) {
      expect(maxEffortRankForSlot('lunch', weekend)).toBe(EFFORT_RANK.project);
      expect(maxEffortRankForSlot('dinner', weekend)).toBe(EFFORT_RANK.project);
    }
  });

  it('caps snack at medium even on a weekend', () => {
    expect(maxEffortRankForSlot('snack', false)).toBe(EFFORT_RANK.medium);
    expect(maxEffortRankForSlot('snack', true)).toBe(EFFORT_RANK.medium);
  });
});

describe('seasonForMonth', () => {
  it('uses Indian seasons, not the Western four', () => {
    expect([3, 4, 5, 6].map(seasonForMonth)).toEqual([
      'summer',
      'summer',
      'summer',
      'summer',
    ]);
    expect([7, 8, 9].map(seasonForMonth)).toEqual(['monsoon', 'monsoon', 'monsoon']);
    expect([10, 11, 12, 1, 2].map(seasonForMonth)).toEqual([
      'winter',
      'winter',
      'winter',
      'winter',
      'winter',
    ]);
  });

  it('rejects a month outside the year', () => {
    expect(() => seasonForMonth(0)).toThrow(RangeError);
    expect(() => seasonForMonth(13)).toThrow(RangeError);
  });

  it('reads the local month off a date', () => {
    expect(seasonForDate(day(2026, 7, 27))).toBe('monsoon');
    expect(seasonForDate(day(2026, 1, 3))).toBe('winter');
  });
});

describe('isWeekendDate', () => {
  it('counts Saturday and Sunday', () => {
    expect(isWeekendDate(day(2026, 7, 25))).toBe(true); // Saturday
    expect(isWeekendDate(day(2026, 7, 26))).toBe(true); // Sunday
    expect(isWeekendDate(day(2026, 7, 27))).toBe(false); // Monday
    expect(isWeekendDate(day(2026, 7, 31))).toBe(false); // Friday
  });
});

describe('localDateKey', () => {
  it('is the local calendar day, never shifted into UTC', () => {
    // 23:30 local on the 27th stays the 27th, whatever the offset to UTC is.
    expect(localDateKey(day(2026, 7, 27, 23))).toBe('2026-07-27');
    expect(localDateKey(day(2026, 7, 27, 0))).toBe('2026-07-27');
  });
});
