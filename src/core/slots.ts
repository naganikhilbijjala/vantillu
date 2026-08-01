import { addDays, format, setHours, startOfHour, subHours } from 'date-fns';
import type { Effort, Season, Slot } from './types';

/**
 * Time-of-day, season, and effort ordinals (`docs/SPEC.md` §1.2, §2.2, §2.3, §4.2).
 *
 * Every function here takes the date it should reason about. Nothing reads the clock —
 * that keeps the module pure and makes "what would this app suggest at 7pm in January"
 * a one-line test instead of a mocked timer.
 */

/**
 * The fixed effort rank. Scoring compares these numbers and must never depend on where
 * an effort happens to sit in a budget array (SPEC §4.4).
 */
export const EFFORT_RANK: Record<Effort, number> = {
  instant: 0,
  quick: 1,
  medium: 2,
  project: 3,
};

/**
 * `dish.effort` is TEXT, so a value outside the union can reach here. An unknown effort
 * is ranked as the most expensive one: it then fails a tight budget rather than slipping
 * through, and it never collects the effort-fit bonus. Failing safe beats failing quiet.
 */
export function effortRank(effort: string): number {
  return EFFORT_RANK[effort as Effort] ?? EFFORT_RANK.project;
}

/**
 * The maximum effort allowed per slot. Expressed as effort names rather than raw
 * numbers so this table can never drift out of step with `EFFORT_RANK`.
 *
 * Weekend breakfast opens up to `project` so a Sunday bobbatlu isn't filtered out on the
 * one morning there is time for it.
 */
export const SLOT_EFFORT_BUDGET: Record<Slot, { weekday: Effort; weekend: Effort }> = {
  breakfast: { weekday: 'medium', weekend: 'project' },
  lunch: { weekday: 'project', weekend: 'project' },
  dinner: { weekday: 'project', weekend: 'project' },
  snack: { weekday: 'medium', weekend: 'medium' },
};

export function maxEffortRankForSlot(slot: Slot, isWeekend: boolean): number {
  const budget = SLOT_EFFORT_BUDGET[slot];
  return EFFORT_RANK[isWeekend ? budget.weekend : budget.weekday];
}

/** First local hour of each auto-detected slot (SPEC §2.2). */
export const BREAKFAST_START_HOUR = 4;
export const LUNCH_START_HOUR = 11;
export const DINNER_START_HOUR = 17;

/**
 * Local hour → slot. Dinner owns the wrap-around from 17:00 through 03:59, so a
 * midnight snack-hunt still reads as dinner rather than tomorrow's breakfast.
 *
 * `snack` is never returned. It is a real slot, reachable by manual override and from
 * the log sheet, but Today never opens on it (SPEC §2.2).
 */
export function slotForHour(hour: number): Slot {
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
    throw new RangeError(`Hour must be an integer 0–23, got ${hour}`);
  }
  if (hour >= DINNER_START_HOUR) return 'dinner';
  if (hour >= LUNCH_START_HOUR) return 'lunch';
  if (hour >= BREAKFAST_START_HOUR) return 'breakfast';
  return 'dinner';
}

export function slotForDate(date: Date): Slot {
  return slotForHour(date.getHours());
}

/** Ascending, and the only hours `nextSlotBoundary` can return. */
export const SLOT_BOUNDARY_HOURS: readonly number[] = [
  BREAKFAST_START_HOUR,
  LUNCH_START_HOUR,
  DINNER_START_HOUR,
];

/**
 * The next local moment at which `slotForDate` returns something different.
 *
 * A manual slot override on the Today screen lasts until this instant and no longer
 * (SPEC §2.2). Strictly forward: standing exactly on 11:00 gives 17:00, not 11:00, so an
 * override taken on the boundary still gets its full window.
 *
 * Evening rolls to tomorrow's 04:00 because dinner owns 17:00 through 03:59 — an override
 * taken at 21:00 is still in force at 01:00, which is the honest reading of "until the
 * next boundary".
 */
export function nextSlotBoundary(date: Date): Date {
  const hour = date.getHours();
  const laterToday = SLOT_BOUNDARY_HOURS.find((boundary) => boundary > hour);
  const base = laterToday === undefined ? addDays(date, 1) : date;
  return startOfHour(setHours(base, laterToday ?? SLOT_BOUNDARY_HOURS[0]));
}

// ---------------------------------------------------------------------------
// Planning against the clock, rather than reading it (SPEC §20.2)
// ---------------------------------------------------------------------------

/**
 * The hour you would actually start cooking each meal.
 *
 * A second table rather than a reuse of `SLOT_BOUNDARY_HOURS`, because the two answer
 * different questions. Those hours decide *which meal it is now* and so have to cover the
 * whole day — breakfast is detected from 04:00, and nobody grinds batter at four in the
 * morning. These decide *when a meal gets made*, which is what a prep reminder has to be
 * measured back from.
 */
export const SLOT_COOK_HOUR: Record<Slot, number> = {
  breakfast: 7,
  lunch: 12,
  dinner: 19,
  snack: 16,
};

/** Nothing the app schedules may fire between these hours. */
export const QUIET_START_HOUR = 22;
export const QUIET_END_HOUR = 7;
/** Where a nudge inside the quiet window is moved back to. */
export const QUIET_MOVED_TO_HOUR = 21;

export function isQuietHour(hour: number): boolean {
  return hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR;
}

/** The next local moment `slot` would be cooked, strictly after `from`. */
export function nextSlotCookTime(slot: Slot, from: Date): Date {
  const today = startOfHour(setHours(from, SLOT_COOK_HOUR[slot]));
  return today > from ? today : addDays(today, 1);
}

/**
 * A fire time inside quiet hours, moved to 21:00 of the evening that window began.
 *
 * **Always earlier, never later.** A soak that should have started at 23:00 is still worth
 * starting at 21:00; the same reminder pushed forward to 07:00 arrives after the moment it
 * was about, which is worse than not sending it. Moving a ferment a couple of hours early
 * costs a slightly longer ferment and nothing else.
 */
export function clampOutOfQuietHours(at: Date): Date {
  const hour = at.getHours();
  if (!isQuietHour(hour)) return at;
  const evening = hour < QUIET_END_HOUR ? addDays(at, -1) : at;
  return startOfHour(setHours(evening, QUIET_MOVED_TO_HOUR));
}

/** How many occurrences of a slot to try before giving up on finding a future one. */
const NUDGE_SEARCH_DAYS = 2;

/**
 * When to say "start the prep" for a dish valid at `slots` whose prep needs `leadHours`.
 *
 * The soonest chance the dish has, across every slot it is valid for: a tiffin is
 * breakfast *and* dinner, and the useful reminder is the one for whichever comes first.
 * Null when there is nothing to schedule — no slot, or no lead time to warn ahead of.
 *
 * Strictly in the future. The quiet-hour clamp can pull a time back past `from`, so each
 * slot falls through to its next occurrence rather than returning a moment already gone.
 */
export function prepNudgeTime(
  slots: readonly Slot[],
  leadHours: number | null,
  from: Date,
): Date | null {
  if (leadHours === null || leadHours <= 0) return null;

  let best: Date | null = null;
  for (const slot of slots) {
    const first = nextSlotCookTime(slot, from);
    for (let dayOffset = 0; dayOffset < NUDGE_SEARCH_DAYS; dayOffset++) {
      const fireAt = clampOutOfQuietHours(subHours(addDays(first, dayOffset), leadHours));
      if (fireAt <= from) continue;
      if (best === null || fireAt < best) best = fireAt;
      break;
    }
  }
  return best;
}

/** Month is 1-based here — `getMonth()` is not. */
export function seasonForMonth(month: number): Season {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`Month must be an integer 1–12, got ${month}`);
  }
  if (month >= 3 && month <= 6) return 'summer';
  if (month >= 7 && month <= 9) return 'monsoon';
  return 'winter';
}

export function seasonForDate(date: Date): Season {
  return seasonForMonth(date.getMonth() + 1);
}

export function isWeekendDate(date: Date): boolean {
  const weekday = date.getDay();
  return weekday === 0 || weekday === 6;
}

/**
 * The local calendar day as `yyyy-MM-dd`. Seeds the suggestion jitter, so the Today list
 * is stable within a day and only reshuffles tomorrow (SPEC §4.5).
 *
 * Local, never UTC — `toISOString()` would flip the key an evening early or late
 * depending on the offset.
 */
export function localDateKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}
