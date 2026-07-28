import { differenceInCalendarDays } from 'date-fns';

/**
 * Interval math (`docs/SPEC.md` §3).
 *
 * Two rules run through all of it. **Median, not mean** — one six-week travel gap must
 * not convince the app you make tamarind rice twice a year. And **calendar days, not
 * elapsed milliseconds** — a 23-hour gap across midnight and a 25-hour gap are both
 * "1 day", so every subtraction truncates to the local day first (SPEC §2.1).
 */

/** Only the most recent intervals count; older rhythms are no longer the current one. */
export const MEDIAN_INTERVAL_WINDOW = 5;

/** Two intervals means three cooks. Below that there is no honest number to report. */
export const MIN_INTERVALS_FOR_MEDIAN = 2;

/** An unknown rhythm scores neither stale nor fresh. */
export const NEUTRAL_STALENESS = 1;

/** Day-gaps between consecutive cook events, newest first. */
export function intervals(sortedDatesDesc: readonly Date[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < sortedDatesDesc.length - 1; i++) {
    out.push(differenceInCalendarDays(sortedDatesDesc[i], sortedDatesDesc[i + 1]));
  }
  return out;
}

/**
 * Median of the most recent intervals, or null when there is not enough history to be
 * honest — the UI renders "new dish" rather than an invented number.
 *
 * A median of **0** is a real return value here (two cooks on the same day produce it).
 * `staleness` deliberately routes it to the neutral branch; see the note there.
 */
export function medianInterval(sortedDatesDesc: readonly Date[]): number | null {
  const recent = intervals(sortedDatesDesc).slice(0, MEDIAN_INTERVAL_WINDOW);
  if (recent.length < MIN_INTERVALS_FOR_MEDIAN) return null;

  const sorted = [...recent].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * How overdue a dish is, as a ratio of its own rhythm. 1.0 is exactly due.
 *
 * The falsy check on `median` covers both null (too little history) **and** 0 (two
 * cooks in one day). Treating 0 as unknown is intended, not incidental: dividing by it
 * would hand the engine an Infinity that outranks everything forever.
 */
export function staleness(daysSince: number | null, median: number | null): number {
  if (daysSince === null || !median) return NEUTRAL_STALENESS;
  return daysSince / median;
}

/** Where a dish sits against its own rhythm. Drives both the chip and the gauge colour. */
export type StalenessState = 'new' | 'recent' | 'due' | 'overdue';

export const DUE_RATIO = 1;
export const LONG_OVERDUE_RATIO = 1.6;

export function stalenessState(median: number | null, ratio: number): StalenessState {
  if (!median) return 'new';
  if (ratio >= LONG_OVERDUE_RATIO) return 'overdue';
  if (ratio >= DUE_RATIO) return 'due';
  return 'recent';
}

/** One cook event, reduced to the two things interval math cares about. */
export interface CookHistoryEvent {
  cookedAt: Date;
  /**
   * Written during onboarding from a bucketed guess ("about a month ago"). Counts
   * toward `daysSince` and `cookCount`, excluded from interval math — a guess would
   * poison the median (SPEC §3).
   */
  isEstimated: boolean;
}

export interface CookHistory {
  cookCount: number;
  daysSince: number | null;
  medianInterval: number | null;
}

/**
 * The three derived values, computed together so the estimated-event rule lives in
 * exactly one place. None of them are ever stored (hard rule 2).
 *
 * Sorts its own input rather than trusting the caller's ORDER BY.
 */
export function summariseHistory(
  events: readonly CookHistoryEvent[],
  today: Date,
): CookHistory {
  const newestFirst = [...events].sort(
    (a, b) => b.cookedAt.getTime() - a.cookedAt.getTime(),
  );
  const mostRecent = newestFirst[0];

  return {
    cookCount: newestFirst.length,
    daysSince: mostRecent ? differenceInCalendarDays(today, mostRecent.cookedAt) : null,
    medianInterval: medianInterval(
      newestFirst.filter((e) => !e.isEstimated).map((e) => e.cookedAt),
    ),
  };
}

/**
 * Gauge geometry (SPEC §8). The bar fills toward the median and clamps rather than
 * overflowing, so a dish 400 % overdue still reads as a full bar instead of breaking
 * the layout. The hairline that marks "due" sits at `GAUGE_DUE_FRACTION`.
 *
 * A null median has no fill at all — the component renders a hollow dashed bar, because
 * "no data" and "just cooked" must not look alike.
 */
export const GAUGE_MAX_RATIO = 1.4;
export const GAUGE_DUE_FRACTION = DUE_RATIO / GAUGE_MAX_RATIO;

export function gaugeFillFraction(ratio: number): number {
  const clamped = Math.min(Math.max(ratio, 0), GAUGE_MAX_RATIO);
  return clamped / GAUGE_MAX_RATIO;
}
