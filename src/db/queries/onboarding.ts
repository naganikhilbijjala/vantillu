import { count, isNull } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';
import { db } from '../client';
import type { NewCookEventRow } from '../cookModel';
import type { LastCookedBucket } from '../onboardingModel';
import { toEstimatedCookEventRow } from '../onboardingModel';
import type { NewDishRow, NewDishSlotRow } from '../rows';
import { cookEvent, dish, dishSlot, setting } from '../schema';
import { type SeedCatalogEntry, toDishRow, toDishSlotRows } from '../seedCatalog';
import { SETTING_KEYS } from '../settings';
import { toLocalIso } from '../time';

/**
 * The writes onboarding makes, and the read that decides whether it runs at all.
 *
 * All of it lands in **one transaction**. Onboarding is the only place in the app that
 * writes three tables at once, and a crash halfway through would leave a repertoire with
 * no slots or estimates pointing at dishes that were rolled back — a state nothing else
 * could diagnose, on the one screen the user cannot easily reach again.
 *
 * How the rows are *shaped* is in `seedCatalog.ts` and `onboardingModel.ts`, both of which
 * are pure and tested. This module is the part that needs a database.
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

export interface OnboardingChoice {
  /** The picked catalogue entries, in catalogue order. */
  entries: readonly SeedCatalogEntry[];
  /** Bucket per catalogue key. Absent means "didn't say", which writes nothing. */
  estimates: ReadonlyMap<string, LastCookedBucket>;
}

export interface OnboardingResult {
  dishesInserted: number;
  slotsInserted: number;
  estimatesInserted: number;
}

/**
 * Inserts the chosen dishes, their slots, and one estimated cook event per dish the user
 * put a bucket against — then marks onboarding done.
 *
 * **The marker is written even when nothing was picked.** "Picked nothing" and "has not
 * been asked" are indistinguishable in the `dish` table, and without the marker a user who
 * skipped would be asked again on every launch, which is the definition of nagging.
 */
export function finishOnboarding(
  choice: OnboardingChoice,
  now = new Date(),
): OnboardingResult {
  const timestamp = toLocalIso(now);

  return db.transaction((tx) => {
    const dishRows: NewDishRow[] = [];
    const slotRows: NewDishSlotRow[] = [];
    const eventRows: NewCookEventRow[] = [];

    for (const entry of choice.entries) {
      const id = randomUUID();
      dishRows.push(toDishRow(entry, id, timestamp));
      slotRows.push(...toDishSlotRows(entry, id, timestamp));

      const bucket = choice.estimates.get(entry.key);
      if (bucket !== undefined) {
        eventRows.push(
          toEstimatedCookEventRow(
            { dishId: id, slots: entry.slots, bucket },
            randomUUID(),
            now,
          ),
        );
      }
    }

    for (const part of chunk(dishRows, Math.floor(MAX_BOUND_PARAMETERS / 22))) {
      tx.insert(dish).values(part).run();
    }
    for (const part of chunk(slotRows, Math.floor(MAX_BOUND_PARAMETERS / 5))) {
      tx.insert(dishSlot).values(part).run();
    }
    for (const part of chunk(eventRows, Math.floor(MAX_BOUND_PARAMETERS / 13))) {
      tx.insert(cookEvent).values(part).run();
    }

    tx.insert(setting)
      .values(markerRow(timestamp))
      .onConflictDoUpdate(markerConflict(timestamp))
      .run();

    return {
      dishesInserted: dishRows.length,
      slotsInserted: slotRows.length,
      estimatesInserted: eventRows.length,
    };
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
