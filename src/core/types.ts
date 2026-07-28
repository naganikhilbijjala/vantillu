/**
 * The vocabulary the suggestion engine works in (`docs/SPEC.md` §1).
 *
 * `src/core/` is pure TypeScript — no React, no React Native, no database. These are
 * plain objects the query layer assembles and hands over; nothing here knows that
 * SQLite exists, which is what lets the whole engine be tested in Node in milliseconds.
 */

/** Ordinal. Ranked by the fixed table in `slots.ts`, never by position in an array. */
export type Effort = 'instant' | 'quick' | 'medium' | 'project';

export type Slot = 'breakfast' | 'lunch' | 'dinner' | 'snack';

/** Indian seasons derived from the local month, not the Western four (SPEC §2.3). */
export type Season = 'summer' | 'monsoon' | 'winter';

export type PrepKind = 'batter' | 'soaked' | 'marinated';

/** 3-point: 1 not again · 2 fine · 3 make again. Never 5 stars (SPEC §7). */
export type Rating = 1 | 2 | 3;

/**
 * A dish as the engine sees it: the `dish` row, plus three things the query layer has
 * to resolve first.
 *
 * - `isAlwaysAvailable` comes from `role_config`, **not** from testing `role` against
 *   `'podi'` or `'accompaniment'`. Roles are renameable and the behaviour must follow
 *   the flag (SPEC §1.1).
 * - `daysSince` and `medianInterval` are computed from cook history on every read and
 *   never stored — see `interval.ts` and hard rule 2.
 * - `lastRating` is the most recent rating, not an average.
 *
 * `dish.minutes` is deliberately absent. It is display-only and must never enter a
 * filter or the score (SPEC §1.2); leaving it out of this type is the cheapest way to
 * keep that true.
 */
export interface Candidate {
  id: string;
  name: string;
  /** Free text — the user can rename roles. Only compared against other role strings. */
  role: string;
  slots: readonly Slot[];
  effort: Effort;
  isVeg: boolean;
  isArchived: boolean;
  isAlwaysAvailable: boolean;
  primaryIngredient: string | null;
  prepKind: PrepKind | null;
  /** "soak overnight", "grind and ferment" — shown when the dish is held back. */
  prepLabel: string | null;
  usesLeftoverRice: boolean;
  /** null means "any season": never matches, never penalises. */
  season: Season | null;
  /** Calendar days since the most recent cook, estimated events included. */
  daysSince: number | null;
  /** Median of the recent real intervals, or null when there is too little history. */
  medianInterval: number | null;
  lastRating: Rating | null;
  /** Local ISO datetime. Used only as a stable tiebreak, since ids are UUIDs (SPEC §4.5). */
  createdAt: string;
}

/**
 * Everything about *now* that the engine needs. Assembled by the query layer, which is
 * the only place allowed to read the clock, the settings table, or `prep_state`.
 *
 * The dish-id lists are pre-resolved on purpose: live prep matches on the
 * `(kind, ingredient)` pair (SPEC §5.2), and that join belongs in SQL, not here.
 *
 * There is no `budget` array. The effort cap is derived from `slot` and `isWeekend`
 * through the fixed rank table — see the note on `indexOf` in SPEC §4.4.
 */
export interface Context {
  slot: Slot;
  isWeekend: boolean;
  season: Season;
  isVegOnlyDay: boolean;
  /** Dishes whose prep is ready now: `readyAt <= now < expiresAt`. */
  livePrepDishIds: readonly string[];
  /** Subset of the above whose prep expires within 24 h. */
  expiringPrepDishIds: readonly string[];
  /** A `role='staple'` ∧ `primaryIngredient='rice'` cook within the last 24 h. */
  hadRiceStapleInLast24h: boolean;
  /** Primary ingredients cooked within 2 calendar days, including today. */
  recentIngredients: readonly string[];
  /** Roles with a batch cook in the last 48 h. */
  rolesFilledByBatch: readonly string[];
}
