import { count, isNull } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';
import { db } from '../client';
import type { NewDishRow, NewDishSlotRow } from '../rows';
import { cookEvent, dish, dishSlot, setting } from '../schema';
import { type SeedCatalogEntry, toDishRow, toDishSlotRows } from '../seedCatalog';
import { SETTING_KEYS } from '../settings';
import { toLocalIso } from '../time';

/**
 * The writes onboarding makes, and the read that decides whether it runs at all.
 *
 * All of it lands in **one transaction**. A crash halfway would leave dishes with no slots
 * — which is not a half-saved dish but an invisible one, since a dish with no slot fails a
 * silent eligibility filter forever (`docs/SPEC.md` §4.1).
 *
 * How the rows are *shaped* is in `seedCatalog.ts`, which is pure and tested. This module
 * is the part that needs a database.
 */

/**
 * SQLite binds one host parameter per column per row, so a multi-row insert is chunked to
 * stay under the variable limit however large the seed file grows.
 */
const MAX_BOUND_PARAMETERS = 900;

function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

/**
 * How many dishes the user has. A query builder rather than a number, so the gate can hand
 * it to `useLiveQuery` and settle the moment onboarding writes.
 */
export function dishCountQuery() {
  return db.select({ n: count() }).from(dish).where(isNull(dish.deletedAt));
}

/** The marker row, so the two writers below cannot disagree about its shape. */
function markerRow(at: string) {
  return {
    key: SETTING_KEYS.onboardedAt,
    value: at,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  };
}

const markerConflict = (at: string) =>
  ({
    target: setting.key,
    set: { value: at, updatedAt: at, deletedAt: null },
  }) as const;

/** Writes the marker on its own — the backfill path for an install predating Phase 8. */
export function markOnboarded(now = new Date()): void {
  const at = toLocalIso(now);
  db.insert(setting).values(markerRow(at)).onConflictDoUpdate(markerConflict(at)).run();
}

// ---------------------------------------------------------------------------
// Finishing
// ---------------------------------------------------------------------------

export interface OnboardingResult {
  dishesInserted: number;
  slotsInserted: number;
}

/**
 * Inserts whatever was taken from the starter list, then marks onboarding done.
 *
 * **The marker is written even when nothing was picked**, which is the common case now
 * that the list is a shortcut rather than the repertoire. "Picked nothing" and "has not
 * been asked" are indistinguishable in the `dish` table, and without the marker anyone who
 * intends to type their own dishes in would be shown the intro again on every launch.
 *
 * No cook events. Onboarding writes no history at all — the app starts out knowing nothing
 * about what you cook, and says so, which is the truth (SPEC §18.3).
 */
export function finishOnboarding(
  entries: readonly SeedCatalogEntry[],
  now = new Date(),
): OnboardingResult {
  const timestamp = toLocalIso(now);

  return db.transaction((tx) => {
    const dishRows: NewDishRow[] = [];
    const slotRows: NewDishSlotRow[] = [];

    for (const entry of entries) {
      const id = randomUUID();
      dishRows.push(toDishRow(entry, id, timestamp));
      slotRows.push(...toDishSlotRows(entry, id, timestamp));
    }

    for (const part of chunk(dishRows, Math.floor(MAX_BOUND_PARAMETERS / 22))) {
      tx.insert(dish).values(part).run();
    }
    for (const part of chunk(slotRows, Math.floor(MAX_BOUND_PARAMETERS / 5))) {
      tx.insert(dishSlot).values(part).run();
    }

    tx.insert(setting)
      .values(markerRow(timestamp))
      .onConflictDoUpdate(markerConflict(timestamp))
      .run();

    return { dishesInserted: dishRows.length, slotsInserted: slotRows.length };
  });
}

// ---------------------------------------------------------------------------
// Dev only
// ---------------------------------------------------------------------------

/**
 * Puts the app back to the state a fresh install is in, so onboarding can be run again.
 *
 * **A hard delete, unlike every other delete in the app.** Soft deletes exist so a future
 * sync cannot resurrect something the user removed on purpose (SPEC §11.3); tombstoning
 * sixty-eight dishes here would ship that noise in the export and would mean "reset" left
 * the database bigger than a fresh install. This is a dev-tools button on a screen that
 * dies with Phase 9 — it is not a product feature, and nothing in the product may call it.
 */
export function resetOnboarding(): void {
  db.transaction((tx) => {
    tx.delete(cookEvent).run();
    tx.delete(dishSlot).run();
    tx.delete(dish).run();
    tx.delete(setting).run();
  });
}
