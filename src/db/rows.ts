import type { CookHistoryEvent } from '../core/interval';
import type { Effort, PrepKind, Rating, Season, Slot } from '../core/types';
import { parseLocalIso } from './time';

/**
 * What a database row looks like, and how one maps onto the core vocabulary.
 *
 * Every column that carries meaning is TEXT — `role` because roles are renameable, the
 * rest because SQLite has no enums — so something has to narrow those strings onto the
 * closed unions in `src/core/types.ts`. That narrowing is here, in one place, rather than
 * once per screen model, because each `as*` function encodes a *decision* about what a
 * bad value means and those decisions must not diverge.
 *
 * No `db` import and no clock: `now` is always an argument. This module and the screen
 * models built on it are the parts of `src/db/` that can be unit tested in Node.
 */

// ---------------------------------------------------------------------------
// Row shapes — structurally what the query builders in `queries/` select
// ---------------------------------------------------------------------------

export interface DishRow {
  id: string;
  name: string;
  /** Regional name. Used by the dishes list and its search; Today ignores it. */
  altName: string | null;
  role: string;
  primaryIngredient: string | null;
  effort: string;
  minutes: number | null;
  isVeg: boolean;
  prepKind: string | null;
  prepLabel: string | null;
  usesLeftoverRice: boolean;
  season: string | null;
  ingredientsText: string | null;
  methodText: string | null;
  /**
   * The dish's own stable notes. A third kind of note, separate from the recipe body above
   * and from a cook event's `tweakNote` — see the table in `CLAUDE.md`.
   */
  notes: string | null;
  isArchived: boolean;
  createdAt: string;
}

export interface DishSlotRow {
  dishId: string;
  slot: string;
}

export interface CookEventRow {
  dishId: string;
  cookedAt: string;
  rating: number | null;
  isBatch: boolean;
  isEstimated: boolean;
}

export interface PrepStateRow {
  id: string;
  kind: string;
  ingredient: string | null;
  label: string | null;
  readyAt: string | null;
  expiresAt: string | null;
}

// ---------------------------------------------------------------------------
// Narrowing TEXT columns onto the core unions
// ---------------------------------------------------------------------------

const EFFORTS: readonly Effort[] = ['instant', 'quick', 'medium', 'project'];
const SLOTS: readonly Slot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const SEASONS: readonly Season[] = ['summer', 'monsoon', 'winter'];
const PREP_KINDS: readonly PrepKind[] = ['batter', 'soaked', 'marinated'];

/** Unrecognised effort reads as the most expensive one, matching `effortRank`. */
export function asEffort(value: string): Effort {
  return EFFORTS.includes(value as Effort) ? (value as Effort) : 'project';
}

export function asSlot(value: string): Slot | null {
  return SLOTS.includes(value as Slot) ? (value as Slot) : null;
}

/** An unrecognised season is "any season": it never matches and never penalises. */
export function asSeason(value: string | null): Season | null {
  return value !== null && SEASONS.includes(value as Season) ? (value as Season) : null;
}

/**
 * Prep kinds are a closed set the app writes itself (`docs/SPEC.md` §1.4) — nothing
 * user-typed reaches this column — so an unrecognised value is a bug, and reading it as
 * "no prep" keeps the dish suggestible rather than hiding it forever with no way to find
 * out why.
 */
export function asPrepKind(value: string | null): PrepKind | null {
  return value !== null && PREP_KINDS.includes(value as PrepKind)
    ? (value as PrepKind)
    : null;
}

export function asRating(value: number | null): Rating | null {
  return value === 1 || value === 2 || value === 3 ? value : null;
}

/**
 * Free text, or nothing at all. Whitespace is not content, so a field the user blanked out
 * comes back as null rather than as a space.
 *
 * One definition, here, rather than one per module: the same rule decides whether a dish
 * has a recipe and whether a cook has a note, and the two must not disagree. A note of
 * `"  "` that counted as text in the writer and not in the reader would save as content
 * and render as an empty line.
 */
export function trimToNull(value: string | null): string | null {
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/** Whitespace is not content. A dish with no recipe is a normal dish either way. */
export function hasText(value: string | null): boolean {
  return trimToNull(value) !== null;
}

export function hasRecipe(dish: DishRow): boolean {
  return hasText(dish.ingredientsText) || hasText(dish.methodText);
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

export function groupSlots(rows: readonly DishSlotRow[]): Map<string, Slot[]> {
  const out = new Map<string, Slot[]>();
  for (const row of rows) {
    const slot = asSlot(row.slot);
    if (slot === null) continue;
    const existing = out.get(row.dishId);
    if (existing) existing.push(slot);
    else out.set(row.dishId, [slot]);
  }
  return out;
}

export interface DishEvents {
  history: CookHistoryEvent[];
  /**
   * The most recent rating that was actually given. A later unrated cook does not erase
   * it — "last rated 1" is about the last time the dish was rated (SPEC §4.3).
   */
  lastRating: Rating | null;
}

export const NO_EVENTS: DishEvents = { history: [], lastRating: null };

/**
 * Groups the cook log by dish. Does not trust the caller's ORDER BY — `summariseHistory`
 * sorts its own input for the same reason, and a `lastRating` that silently depended on
 * the query's sort would be wrong the first time anyone reordered it.
 *
 * `known` drops events whose dish is gone, which is possible while a soft delete is in
 * flight or an export has been imported partially.
 */
export function groupEvents(
  rows: readonly CookEventRow[],
  known: ReadonlySet<string>,
): Map<string, DishEvents> {
  const out = new Map<string, DishEvents>();
  const ratedAt = new Map<string, number>();

  for (const row of rows) {
    if (!known.has(row.dishId)) continue;
    let entry = out.get(row.dishId);
    if (!entry) {
      entry = { history: [], lastRating: null };
      out.set(row.dishId, entry);
    }

    const cookedAt = parseLocalIso(row.cookedAt);
    entry.history.push({ cookedAt, isEstimated: row.isEstimated });

    const rating = asRating(row.rating);
    // An unrated cook is not an opinion, so it does not overwrite an earlier rating.
    if (
      rating !== null &&
      cookedAt.getTime() >= (ratedAt.get(row.dishId) ?? Number.NEGATIVE_INFINITY)
    ) {
      entry.lastRating = rating;
      ratedAt.set(row.dishId, cookedAt.getTime());
    }
  }
  return out;
}
