import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../client';
import { type DishRecipeInput, toDishRecipeUpdate } from '../dishModel';
import { dish } from '../schema';

/**
 * Saving a recipe and the dish's notes — the app's second write.
 *
 * An UPDATE of three columns rather than a new row: unlike a cook, a recipe is not an event.
 * The chronological record of how the dish changes over time is the sequence of `tweakNote`s
 * on `cook_event` (`CLAUDE.md`), so versioning the recipe body as well would store the same
 * history twice and immediately raise the question of which copy is the real one.
 *
 * The `deletedAt IS NULL` guard is not defensive noise. Soft deletes mean a tombstoned row
 * is still physically there (`docs/SPEC.md` §11.3), and writing to one would resurrect a
 * dish the user deleted the moment the next export shipped its tombstone.
 *
 * Nothing is invalidated afterwards. `useLiveQuery` re-runs on any write to `dish`, so the
 * detail screen behind the editor has the new text before the screen finishes popping.
 */
export function saveDishRecipe(
  dishId: string,
  input: DishRecipeInput,
  now = new Date(),
): void {
  db.update(dish)
    .set(toDishRecipeUpdate(input, now))
    .where(and(eq(dish.id, dishId), isNull(dish.deletedAt)))
    .run();
}
