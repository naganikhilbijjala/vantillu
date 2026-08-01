import { describe, expect, it } from 'vitest';
import {
  clampOutOfQuietHours,
  EFFORT_RANK,
  effortRank,
  isQuietHour,
  isWeekendDate,
  localDateKey,
  maxEffortRankForSlot,
  nextSlotBoundary,
  nextSlotCookTime,
  prepNudgeTime,
  QUIET_MOVED_TO_HOUR,
  SLOT_BOUNDARY_HOURS,
  SLOT_COOK_HOUR,
  seasonForDate,
  seasonForMonth,
  slotForDate,
  slotForHour,
} from '../src/core/slots';
import { day } from './fixtures';

/** `docs/SPEC.md` §1.2, §2.2, §2.3, §4.2, §20.2. */

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

describe('nextSlotBoundary', () => {
  it('returns the next moment slotForDate would change', () => {
    expect(nextSlotBoundary(day(2026, 7, 27, 8))).toEqual(day(2026, 7, 27, 11));
    expect(nextSlotBoundary(day(2026, 7, 27, 13))).toEqual(day(2026, 7, 27, 17));
  });

  it('rolls dinner over midnight to the next breakfast', () => {
    // Dinner owns 17:00–03:59, so the boundary after an evening override is tomorrow 04:00.
    expect(nextSlotBoundary(day(2026, 7, 27, 19))).toEqual(day(2026, 7, 28, 4));
    expect(nextSlotBoundary(day(2026, 7, 27, 23))).toEqual(day(2026, 7, 28, 4));
  });

  it('keeps the small hours on the same day, since dinner started yesterday', () => {
    expect(nextSlotBoundary(day(2026, 7, 27, 2))).toEqual(day(2026, 7, 27, 4));
  });

  it('looks strictly forward when the clock is exactly on a boundary', () => {
    expect(nextSlotBoundary(day(2026, 7, 27, 4))).toEqual(day(2026, 7, 27, 11));
    expect(nextSlotBoundary(day(2026, 7, 27, 17))).toEqual(day(2026, 7, 28, 4));
  });

  it('discards minutes and seconds', () => {
    const boundary = nextSlotBoundary(new Date(2026, 6, 27, 8, 37, 42, 500));
    expect([boundary.getMinutes(), boundary.getSeconds(), boundary.getMilliseconds()]) //
      .toEqual([0, 0, 0]);
  });

  it('lands on an hour that actually starts a slot', () => {
    for (let hour = 0; hour < 24; hour++) {
      const boundary = nextSlotBoundary(day(2026, 7, 27, hour));
      expect(SLOT_BOUNDARY_HOURS).toContain(boundary.getHours());
      expect(boundary.getTime()).toBeGreaterThan(day(2026, 7, 27, hour).getTime());
    }
  });
});

describe('nextSlotCookTime', () => {
  it('is a different table from the detection boundaries', () => {
    // §2.2's hours answer "which meal is it now"; these answer "when would I cook it".
    // Breakfast is detected from 04:00 and nobody starts cooking then.
    expect(SLOT_COOK_HOUR.breakfast).toBeGreaterThan(SLOT_BOUNDARY_HOURS[0]);
  });

  it('returns the next occurrence, strictly forward', () => {
    expect(nextSlotCookTime('dinner', day(2026, 7, 28, 12))) //
      .toEqual(day(2026, 7, 28, SLOT_COOK_HOUR.dinner));
    expect(nextSlotCookTime('breakfast', day(2026, 7, 28, 12))) //
      .toEqual(day(2026, 7, 29, SLOT_COOK_HOUR.breakfast));
  });

  it('rolls to tomorrow when the clock stands exactly on the cook hour', () => {
    const noon = day(2026, 7, 28, SLOT_COOK_HOUR.lunch);
    expect(nextSlotCookTime('lunch', noon)).toEqual(
      day(2026, 7, 29, SLOT_COOK_HOUR.lunch),
    );
  });

  it('discards minutes and seconds', () => {
    const at = nextSlotCookTime('dinner', new Date(2026, 6, 28, 8, 37, 42, 500));
    expect([at.getMinutes(), at.getSeconds(), at.getMilliseconds()]).toEqual([0, 0, 0]);
  });
});

describe('clampOutOfQuietHours', () => {
  it('leaves a civilised hour alone', () => {
    for (const hour of [7, 12, 19, 21]) {
      expect(isQuietHour(hour)).toBe(false);
      expect(clampOutOfQuietHours(day(2026, 7, 28, hour))).toEqual(
        day(2026, 7, 28, hour),
      );
    }
  });

  it('moves a late-night nudge back to the same evening, never forward', () => {
    // Earlier is the only safe direction: a reminder that arrives after the prep needed
    // to start is worse than useless.
    expect(clampOutOfQuietHours(day(2026, 7, 28, 23))) //
      .toEqual(day(2026, 7, 28, QUIET_MOVED_TO_HOUR));
    expect(clampOutOfQuietHours(day(2026, 7, 28, 22))) //
      .toEqual(day(2026, 7, 28, QUIET_MOVED_TO_HOUR));
  });

  it('moves a small-hours nudge back to the previous evening', () => {
    expect(clampOutOfQuietHours(day(2026, 7, 29, 4))) //
      .toEqual(day(2026, 7, 28, QUIET_MOVED_TO_HOUR));
    expect(clampOutOfQuietHours(day(2026, 7, 29, 0))) //
      .toEqual(day(2026, 7, 28, QUIET_MOVED_TO_HOUR));
  });

  it('never returns an hour that is itself quiet', () => {
    for (let hour = 0; hour < 24; hour++) {
      expect(isQuietHour(clampOutOfQuietHours(day(2026, 7, 28, hour)).getHours())) //
        .toBe(false);
    }
  });
});

describe('prepNudgeTime', () => {
  it('turns an overnight soak for breakfast into a 9pm reminder', () => {
    // The Phase 9 acceptance criterion. Breakfast cooks at 07:00 and a soak wants 8 h, so
    // the arithmetic lands at 23:00 — inside quiet hours, so it moves back to 21:00.
    expect(prepNudgeTime(['breakfast'], 8, day(2026, 7, 28, 20))) //
      .toEqual(day(2026, 7, 28, QUIET_MOVED_TO_HOUR));
  });

  it('leaves a longer lead where the arithmetic puts it', () => {
    // A 12 h ferment for tomorrow's breakfast is a 19:00 job, which is a fine hour.
    expect(prepNudgeTime(['breakfast'], 12, day(2026, 7, 28, 12))) //
      .toEqual(day(2026, 7, 28, 19));
  });

  it('takes the soonest slot the dish is valid for', () => {
    // Tiffin is breakfast *and* dinner (§1.3). At noon, dinner is the nearer chance.
    const at = prepNudgeTime(['breakfast', 'dinner'], 4, day(2026, 7, 28, 12));
    expect(at).toEqual(day(2026, 7, 28, SLOT_COOK_HOUR.dinner - 4));
  });

  it('skips to the next day rather than returning a moment that has passed', () => {
    // 21:30 is past tonight's clamped 21:00, so the answer is tomorrow evening.
    expect(prepNudgeTime(['breakfast'], 8, new Date(2026, 6, 28, 21, 30))) //
      .toEqual(day(2026, 7, 29, QUIET_MOVED_TO_HOUR));
  });

  it('is always strictly in the future', () => {
    for (let hour = 0; hour < 24; hour++) {
      const from = day(2026, 7, 28, hour);
      for (const lead of [2, 8, 12, 24]) {
        const at = prepNudgeTime(['breakfast', 'lunch', 'dinner'], lead, from);
        expect(at).not.toBeNull();
        expect((at as Date).getTime()).toBeGreaterThan(from.getTime());
      }
    }
  });

  it('has nothing to say without a slot or a lead time', () => {
    const from = day(2026, 7, 28, 12);
    expect(prepNudgeTime([], 8, from)).toBeNull();
    expect(prepNudgeTime(['breakfast'], null, from)).toBeNull();
    // A dish whose prep takes no time needs no warning — start it when you cook.
    expect(prepNudgeTime(['breakfast'], 0, from)).toBeNull();
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
