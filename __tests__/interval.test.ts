import { describe, expect, it } from 'vitest';
import {
  GAUGE_DUE_FRACTION,
  GAUGE_MAX_RATIO,
  gaugeFillFraction,
  intervals,
  MEDIAN_INTERVAL_WINDOW,
  medianInterval,
  staleness,
  stalenessState,
  summariseHistory,
} from '../src/core/interval';
import { day } from './fixtures';

/**
 * `docs/SPEC.md` §3. Four of these are named in `docs/IMPLEMENTATION.md` §5 as tests
 * that must exist; they keep their exact wording so the two documents stay greppable.
 */

describe('intervals', () => {
  it('measures whole local calendar days, not 24-hour blocks', () => {
    // 23 hours apart, but either side of midnight — that is one day, not zero.
    const late = day(2026, 7, 20, 23);
    const earlyNextDay = day(2026, 7, 21, 22);
    expect(intervals([earlyNextDay, late])).toEqual([1]);

    // 25 hours apart, also one calendar day.
    const morning = day(2026, 7, 20, 8);
    const nextMorning = day(2026, 7, 21, 9);
    expect(intervals([nextMorning, morning])).toEqual([1]);
  });

  it('returns nothing for a single cook event', () => {
    expect(intervals([day(2026, 7, 20)])).toEqual([]);
    expect(intervals([])).toEqual([]);
  });
});

describe('medianInterval', () => {
  it('medianInterval: 2 cooks → null', () => {
    // One interval is not enough to be honest about a rhythm; the UI says "new dish".
    expect(medianInterval([day(2026, 7, 20), day(2026, 7, 13)])).toBeNull();
  });

  it('medianInterval: [30,3,3,3] day gaps → returns 3, not the mean', () => {
    // Newest first: gaps of 30, 3, 3, 3 days. The mean is 9.75 — one travel gap must
    // not convince the app this is a twice-a-month dish.
    const dates = [
      day(2026, 7, 27),
      day(2026, 6, 27), // 30
      day(2026, 6, 24), // 3
      day(2026, 6, 21), // 3
      day(2026, 6, 18), // 3
    ];
    expect(intervals(dates)).toEqual([30, 3, 3, 3]);
    expect(medianInterval(dates)).toBe(3);
  });

  it('medianInterval: median of 0 (two cooks same day) → treated as unknown, no divide-by-zero', () => {
    const sameDay = [day(2026, 7, 27, 20), day(2026, 7, 27, 13), day(2026, 7, 27, 8)];
    expect(medianInterval(sameDay)).toBe(0);

    // The `median ? … : 1` guard routes 0 to the neutral branch. This is intended
    // behaviour, not an accident — it must not be "fixed" into Infinity or NaN.
    const ratio = staleness(0, medianInterval(sameDay));
    expect(ratio).toBe(1);
    expect(Number.isFinite(ratio)).toBe(true);
  });

  it('medianInterval: isEstimated events excluded from interval math, counted in daysSince', () => {
    const today = day(2026, 7, 27);
    const history = [
      // Written during onboarding: "about five days ago". A bucketed guess.
      { cookedAt: day(2026, 7, 22), isEstimated: true },
      { cookedAt: day(2026, 7, 12), isEstimated: false },
      { cookedAt: day(2026, 7, 2), isEstimated: false },
    ];

    const summary = summariseHistory(history, today);

    // Counted: the guess is the most recent cook, so it drives daysSince and cookCount.
    expect(summary.daysSince).toBe(5);
    expect(summary.cookCount).toBe(3);

    // Excluded: only one real interval survives (10 days), which is under the minimum.
    // Had the guess been included the intervals would be [10, 10] and the median 10.
    expect(summary.medianInterval).toBeNull();
  });

  it('uses only the most recent 5 intervals', () => {
    // Six recent 2-day gaps, then an ancient 100-day gap that must fall out of the window.
    const dates = [
      day(2026, 7, 27),
      day(2026, 7, 25),
      day(2026, 7, 23),
      day(2026, 7, 21),
      day(2026, 7, 19),
      day(2026, 7, 17),
      day(2026, 4, 8),
    ];
    expect(intervals(dates)).toHaveLength(6);
    expect(intervals(dates).slice(0, MEDIAN_INTERVAL_WINDOW)).toEqual([2, 2, 2, 2, 2]);
    expect(medianInterval(dates)).toBe(2);
  });

  it('averages the two middle values on an even count, rounded', () => {
    // Gaps of 2 and 5 → mean of the middle pair is 3.5 → 4.
    const dates = [day(2026, 7, 27), day(2026, 7, 25), day(2026, 7, 20)];
    expect(intervals(dates)).toEqual([2, 5]);
    expect(medianInterval(dates)).toBe(4);
  });
});

describe('staleness', () => {
  it('is the ratio of days since to the median', () => {
    expect(staleness(14, 7)).toBe(2);
    expect(staleness(3, 6)).toBe(0.5);
  });

  it('scores neutral when the median is unknown', () => {
    expect(staleness(40, null)).toBe(1);
    expect(staleness(40, 0)).toBe(1);
  });

  it('scores neutral for a dish that has never been cooked', () => {
    expect(staleness(null, null)).toBe(1);
    expect(staleness(null, 7)).toBe(1);
  });
});

describe('stalenessState', () => {
  it('is new when the median is unknown, whatever the ratio', () => {
    expect(stalenessState(null, 4)).toBe('new');
    expect(stalenessState(0, 4)).toBe('new');
  });

  it('splits recent, due and overdue at 1 and 1.6', () => {
    expect(stalenessState(7, 0.99)).toBe('recent');
    expect(stalenessState(7, 1)).toBe('due');
    expect(stalenessState(7, 1.59)).toBe('due');
    expect(stalenessState(7, 1.6)).toBe('overdue');
  });
});

describe('summariseHistory', () => {
  it('reports an uncooked dish as having no history at all', () => {
    expect(summariseHistory([], day(2026, 7, 27))).toEqual({
      cookCount: 0,
      daysSince: null,
      medianInterval: null,
    });
  });

  it('sorts the events itself rather than trusting the caller', () => {
    const today = day(2026, 7, 27);
    const scrambled = [
      { cookedAt: day(2026, 7, 6), isEstimated: false },
      { cookedAt: day(2026, 7, 20), isEstimated: false },
      { cookedAt: day(2026, 7, 13), isEstimated: false },
    ];
    expect(summariseHistory(scrambled, today)).toEqual({
      cookCount: 3,
      daysSince: 7,
      medianInterval: 7,
    });
  });
});

describe('gaugeFillFraction', () => {
  it('fills proportionally up to the clamp', () => {
    expect(gaugeFillFraction(0)).toBe(0);
    expect(gaugeFillFraction(GAUGE_MAX_RATIO)).toBe(1);
    expect(gaugeFillFraction(0.7)).toBeCloseTo(0.5, 5);
  });

  it('clamps an overdue ratio instead of overflowing the bar', () => {
    expect(gaugeFillFraction(3)).toBe(1);
  });

  it('puts the "due" hairline where a ratio of exactly 1 lands', () => {
    expect(gaugeFillFraction(1)).toBeCloseTo(GAUGE_DUE_FRACTION, 10);
  });
});
