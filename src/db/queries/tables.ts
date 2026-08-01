import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '../client';
import { cookEvent, dish, dishSlot, prepState } from '../schema';

/**
 * The reads behind the Today screen. Each returns a query builder rather than rows, so the
 * caller can hand it to `useLiveQuery` and have it re-run on any write to its table.
 *
 * **Every one of them is time-independent, on purpose.** They read whole tables and never
 * mention `now`, so each is subscribed to exactly once. All of the clock-dependent work —
 * which prep is live, what counts as recent, how many days since — happens in
 * `buildTodayModel` (`src/db/todayModel.ts`) against a `now` the caller ticks. A query with
 * a timestamp baked into its WHERE clause would have to be rebuilt and resubscribed every
 * minute, and every screen holding it would remount its list.
 *
 * Six small reads rather than one join for the same reason: a join would have to carry the
 * median interval, and that maths belongs in `src/core/` where it is unit tested.
 */

export function dishesQuery() {
  return db
    .select({
      id: dish.id,
      name: dish.name,
      altName: dish.altName,
      role: dish.role,
      primaryIngredient: dish.primaryIngredient,
      effort: dish.effort,
      minutes: dish.minutes,
      isVeg: dish.isVeg,
      prepKind: dish.prepKind,
      prepLabel: dish.prepLabel,
      usesLeftoverRice: dish.usesLeftoverRice,
      season: dish.season,
      ingredientsText: dish.ingredientsText,
      methodText: dish.methodText,
      isArchived: dish.isArchived,
      createdAt: dish.createdAt,
    })
    .from(dish)
    .where(isNull(dish.deletedAt));
}

export function dishSlotsQuery() {
  return db
    .select({ dishId: dishSlot.dishId, slot: dishSlot.slot })
    .from(dishSlot)
    .where(isNull(dishSlot.deletedAt));
}

/**
 * The whole cook log, newest first.
 *
 * Bounding it is tempting and wrong in two directions: the median needs the six most
 * recent events *per dish*, which no single LIMIT expresses, and `daysSince` needs the
 * newest event however old it is. One user logging three meals a day for a decade reaches
 * roughly eleven thousand rows of five small columns, which SQLite reads in a few
 * milliseconds. Revisit if that ever stops being true.
 */
export function cookEventsQuery() {
  return db
    .select({
      dishId: cookEvent.dishId,
      cookedAt: cookEvent.cookedAt,
      rating: cookEvent.rating,
      isBatch: cookEvent.isBatch,
      isEstimated: cookEvent.isEstimated,
    })
    .from(cookEvent)
    .where(isNull(cookEvent.deletedAt))
    .orderBy(desc(cookEvent.cookedAt));
}

/**
 * One dish's cook log, with the notes, newest first — the detail screen's timeline.
 *
 * Scoped to a dish and selecting two more columns than `cookEventsQuery`, rather than
 * widening that one: `tweak_note` is free text of unbounded length, and Today and the
 * dishes list would then carry every note ever written just to compute a median.
 *
 * Pass `[dishId]` as the `useLiveQuery` deps so it resubscribes when the screen changes
 * dish — the default `[]` would pin it to whichever dish was open first.
 */
export function cookEventsForDishQuery(dishId: string) {
  return db
    .select({
      id: cookEvent.id,
      cookedAt: cookEvent.cookedAt,
      rating: cookEvent.rating,
      tweakNote: cookEvent.tweakNote,
      isBatch: cookEvent.isBatch,
      isEstimated: cookEvent.isEstimated,
    })
    .from(cookEvent)
    .where(and(eq(cookEvent.dishId, dishId), isNull(cookEvent.deletedAt)))
    .orderBy(desc(cookEvent.cookedAt));
}

/** Every prep row, including pending and expired ones — `now` decides which are live. */
export function prepStatesQuery() {
  return db
    .select({
      id: prepState.id,
      kind: prepState.kind,
      ingredient: prepState.ingredient,
      label: prepState.label,
      readyAt: prepState.readyAt,
      expiresAt: prepState.expiresAt,
    })
    .from(prepState)
    .where(isNull(prepState.deletedAt));
}
