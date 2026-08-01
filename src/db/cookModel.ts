import { format, isSameYear } from 'date-fns';
import type { Rating, Slot } from '../core/types';
import { asRating } from './rows';
import { parseLocalIso, toLocalIso } from './time';

/**
 * Turning a filled-in log sheet into a `cook_event` row.
 *
 * Small, but it is the only place a cook event is ever constructed, and three of the
 * decisions below are the kind that go wrong quietly and stay wrong forever in the data.
 * No `db` and no clock — `now` is an argument — so all three are asserted in Node.
 */

export interface LogCookInput {
  dishId: string;
  slot: Slot;
  /** Null when the user didn't say. Not a 2 — see the note on `rating` below. */
  rating: Rating | null;
  /** Free text. Whitespace-only is stored as null. */
  tweakNote: string | null;
  isBatch: boolean;
  /**
   * Shared by every dish cooked as one meal. Null for a standalone cook — a meal id that
   * groups exactly one dish is noise, and `NULL` is what "not part of a group" means.
   */
  mealId: string | null;
}

/** Exactly the columns `cook_event` declares. */
export interface NewCookEventRow {
  id: string;
  dishId: string;
  cookedAt: string;
  slot: string;
  mealId: string | null;
  rating: number | null;
  tweakNote: string | null;
  photoUri: string | null;
  isBatch: boolean;
  isEstimated: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

function trimToNull(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * Three things here are deliberate and easy to get wrong:
 *
 * **`cookedAt` is a full local ISO datetime**, not a date (`docs/SPEC.md` §2.1). The slot
 * already implies a time of day, but interval maths that crosses midnight or a timezone
 * needs the real one. Local, never UTC.
 *
 * **An unrated cook stores `NULL`, not 2.** The mockup pre-selects "Fine", which would
 * record an opinion nobody gave. `rating` is nullable precisely so "didn't say" is
 * expressible, and the scoring only reads a 1 anyway (§7) — so a default 2 would buy
 * nothing and cost the truth. It also makes the "a later unrated cook does not erase an
 * earlier *not again*" rule in §4.3 mean something.
 *
 * **`isEstimated` is always false here.** Only Phase 8's onboarding buckets write true, and
 * those are excluded from interval maths (§3). A real log is real history.
 */
export function toCookEventRow(
  input: LogCookInput,
  id: string,
  now: Date,
): NewCookEventRow {
  const timestamp = toLocalIso(now);

  return {
    id,
    dishId: input.dishId,
    cookedAt: timestamp,
    slot: input.slot,
    mealId: input.mealId,
    rating: input.rating,
    tweakNote: trimToNull(input.tweakNote),
    // Phase 6 does not capture a photo: `expo-image-picker` is a native module, so adding
    // it means rebuilding the dev client (SPEC §13). The column stays ready.
    photoUri: null,
    isBatch: input.isBatch,
    isEstimated: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
  };
}

/**
 * What to tell the user after a cook lands, given the rhythm the dish had *before* it.
 *
 * Says nothing it cannot back up: with no median there is no interval to promise, and the
 * honest version of that is to talk about the history accumulating instead.
 */
export function confirmationFor(dishName: string, medianInterval: number | null): string {
  if (!medianInterval) {
    return `${dishName} logged. A few more and the app will know your rhythm for it.`;
  }
  const days = medianInterval === 1 ? '1 day' : `${medianInterval} days`;
  return `${dishName} logged. Usually about ${days} between these.`;
}

// ---------------------------------------------------------------------------
// The cook-note timeline
// ---------------------------------------------------------------------------

/**
 * One past cook, as the detail screen shows it.
 *
 * Pulled forward from Phase 7 because Phase 6 started capturing `tweakNote` with nowhere to
 * read it back — text that vanishes on save reads as a bug whatever the roadmap says. The
 * recipe view and the dish notes are still Phase 7.
 */
export interface CookTimelineEntry {
  id: string;
  cookedAt: Date;
  /** "1 Jul", or "1 Jul 2025" once the year stops being obvious. */
  dateLabel: string;
  rating: Rating | null;
  /** SPEC §7's wording, or null when the cook was never rated. */
  ratingLabel: string | null;
  tweakNote: string | null;
  isBatch: boolean;
  /** An onboarding guess, so the date is approximate and says so (SPEC §3). */
  isEstimated: boolean;
}

export interface CookEventDetailRow {
  id: string;
  cookedAt: string;
  rating: number | null;
  tweakNote: string | null;
  isBatch: boolean;
  isEstimated: boolean;
}

/** 3-point, never 5 stars (SPEC §7). */
const RATING_LABEL: Record<Rating, string> = {
  1: 'not again',
  2: 'fine',
  3: 'make again',
};

/**
 * Newest first, and it sorts its own input rather than trusting the caller's ORDER BY —
 * the same rule `summariseHistory` and `groupEvents` follow.
 *
 * **Every cook appears, not only the ones with a note.** The timeline is the history; the
 * notes are the interesting part of it. Showing only annotated cooks would make the gaps
 * look like months of not cooking something.
 */
export function buildCookTimeline(
  rows: readonly CookEventDetailRow[],
  now: Date,
): CookTimelineEntry[] {
  return rows
    .map((row) => {
      const cookedAt = parseLocalIso(row.cookedAt);
      const rating = asRating(row.rating);
      return {
        id: row.id,
        cookedAt,
        // The year is noise until it is ambiguous, which is what makes a long history
        // readable — twelve "3 Jul" rows tell you nothing about which year.
        dateLabel: format(cookedAt, isSameYear(cookedAt, now) ? 'd MMM' : 'd MMM yyyy'),
        rating,
        ratingLabel: rating === null ? null : RATING_LABEL[rating],
        tweakNote: trimToNull(row.tweakNote),
        isBatch: row.isBatch,
        isEstimated: row.isEstimated,
      };
    })
    .sort((a, b) => b.cookedAt.getTime() - a.cookedAt.getTime());
}
