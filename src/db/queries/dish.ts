import { and, eq, isNull } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';
import type { Slot } from '../../core/types';
import { db } from '../client';
import { type DishFormInput, toDishUpdate, toNewDishRow } from '../dishModel';
import { cookEvent, dish, dishSlot } from '../schema';
import { toLocalIso } from '../time';

/**
 * Creating and saving a dish — the app's second and third writes.
 *
 * An UPDATE rather than a new row, unlike a cook: a dish is not an event. The chronological
 * record of how it changes over time is the sequence of `tweakNote`s on `cook_event`
 * (`CLAUDE.md`), so versioning the identity or the recipe body as well would store the same
 * history twice and immediately raise the question of which copy is the real one.
 *
 * The `deletedAt IS NULL` guard is not defensive noise. Soft deletes mean a tombstoned row
 * is still physically there (`docs/SPEC.md` §11.3), and writing to one would resurrect a
 * dish the user deleted the moment the next export shipped its tombstone.
 *
 * Nothing is invalidated afterwards. `useLiveQuery` re-runs on any write to `dish`, so the
 * detail screen behind the editor has the new text before the screen finishes popping.
 */

/**
 * Which slots a dish is valid for, made to match `slots` exactly.
 *
 * Soft-delete everything, then upsert what was chosen — two statements and no diffing,
 * which is both shorter and harder to get wrong than working out the difference. The upsert
 * has to *revive* rather than insert, because the composite primary key means a slot that
 * was turned off and on again is still physically there with a `deletedAt` on it.
 */
function replaceSlots(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  dishId: string,
  slots: readonly Slot[],
  at: string,
): void {
  tx.update(dishSlot)
    .set({ deletedAt: at, updatedAt: at })
    .where(and(eq(dishSlot.dishId, dishId), isNull(dishSlot.deletedAt)))
    .run();

  for (const slot of slots) {
    tx.insert(dishSlot)
      .values({ dishId, slot, createdAt: at, updatedAt: at, deletedAt: null })
      .onConflictDoUpdate({
        target: [dishSlot.dishId, dishSlot.slot],
        set: { deletedAt: null, updatedAt: at },
      })
      .run();
  }
}

/**
 * A dish the user typed in themselves. Returns its new id, so the caller can go and look at
 * what it just made.
 *
 * One transaction, because a dish with no `dish_slot` rows is not a half-saved dish — it is
 * a dish that silently never gets suggested (SPEC §4.1, filter 3).
 */
export function createDish(input: DishFormInput, now = new Date()): string {
  const id = randomUUID();
  const at = toLocalIso(now);

  db.transaction((tx) => {
    tx.insert(dish)
      .values(toNewDishRow(input, id, now))
      .run();
    replaceSlots(tx, id, input.slots, at);
  });

  return id;
}

/** Identity, recipe and slots together — everything the one editor owns. */
export function saveDish(dishId: string, input: DishFormInput, now = new Date()): void {
  const at = toLocalIso(now);

  db.transaction((tx) => {
    tx.update(dish)
      .set(toDishUpdate(input, now))
      .where(and(eq(dish.id, dishId), isNull(dish.deletedAt)))
      .run();
    replaceSlots(tx, dishId, input.slots, at);
  });
}

/**
 * Remove a dish, its slots, and its cook history.
 *
 * **A soft delete**, like every delete in the app that is not a dev-tools reset: the rows
 * keep their tombstones so a future merge cannot resurrect something removed on purpose,
 * and so the Phase 10 export can ship them (`docs/SPEC.md` §11.3).
 *
 * **The cook events go too.** They are already invisible once the dish is gone — `groupEvents`
 * drops any event whose dish it does not know — but leaving them untombstoned would ship a
 * pile of rows pointing at a deleted dish in the first export, which is the exact shape of
 * data that makes a later merge resurrect things. If the dish is gone, so is the claim that
 * you cooked it.
 *
 * That is also why the confirmation says how many cooks are about to go with it. This is the
 * one action in the app that destroys history, and it must not be able to do so quietly.
 */
export function deleteDish(dishId: string, now = new Date()): void {
  const at = toLocalIso(now);
  const tombstone = { deletedAt: at, updatedAt: at };

  db.transaction((tx) => {
    tx.update(cookEvent)
      .set(tombstone)
      .where(and(eq(cookEvent.dishId, dishId), isNull(cookEvent.deletedAt)))
      .run();
    tx.update(dishSlot)
      .set(tombstone)
      .where(and(eq(dishSlot.dishId, dishId), isNull(dishSlot.deletedAt)))
      .run();
    tx.update(dish)
      .set(tombstone)
      .where(and(eq(dish.id, dishId), isNull(dish.deletedAt)))
      .run();
  });
}
