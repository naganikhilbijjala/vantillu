import { and, eq, inArray, isNull } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';
import { PREP_SHELF_LIFE_HOURS } from '../../core/prep';
import type { PrepKind } from '../../core/types';
import { db } from '../client';
import { asPrepKind, type DishRow } from '../rows';
import { prepState } from '../schema';
import { localIsoPlusHours, nowLocalIso, toLocalIso } from '../time';

/**
 * Writes against `prep_state` — the fridge, as opposed to the repertoire.
 *
 * `readyAt = now + leadHours`, `expiresAt = readyAt + shelf life` (`docs/SPEC.md` §5.3).
 * Nothing here *marks* a row ready or expired: those are readings of the clock, made in
 * `prepModel.ts` on every render. A status column would be a stored derived value and
 * would need something to come along and update it, which on a phone that spends most of
 * its life asleep is exactly the thing that drifts (hard rule 2).
 *
 * Phase 4 shipped `startPrep` as a dev-tools fixture writer, because the Today banner was
 * otherwise unverifiable. Phase 9 gave it a caller in the product: the Prep section on the
 * dish detail screen (§20.4).
 */

export interface StartPrepInput {
  kind: PrepKind;
  /** Half of the match key — a batter row is only urad-dal batter (SPEC §5.2). */
  ingredient: string | null;
  label?: string | null;
  /** How long until it is usable. 0 puts it live immediately. */
  leadHours?: number;
  shelfLifeHours?: number;
}

export function startPrep(input: StartPrepInput, now = new Date()): string {
  const id = randomUUID();
  const created = toLocalIso(now);
  const leadHours = input.leadHours ?? 0;
  const shelfLifeHours = input.shelfLifeHours ?? PREP_SHELF_LIFE_HOURS[input.kind];

  db.insert(prepState)
    .values({
      id,
      kind: input.kind,
      ingredient: input.ingredient,
      label: input.label ?? null,
      readyAt: localIsoPlusHours(now, leadHours),
      expiresAt: localIsoPlusHours(now, leadHours + shelfLifeHours),
      createdAt: created,
      updatedAt: created,
      deletedAt: null,
    })
    .run();

  return id;
}

/**
 * Start what a dish needs, from the dish itself.
 *
 * The pair comes off the dish rather than being typed anywhere, which is what guarantees
 * the row it writes is one the matcher will find again: a soak started for pesarattu that
 * recorded the wrong ingredient would sit in the table unlocking nothing, and the dish
 * would stay hard-excluded with no visible reason (§5.2).
 */
export function startPrepForDish(
  dish: Pick<DishRow, 'prepKind' | 'primaryIngredient' | 'prepLabel' | 'prepLeadHours'>,
  now = new Date(),
): string | null {
  const kind = asPrepKind(dish.prepKind);
  if (kind === null) return null;
  return startPrep(
    {
      kind,
      ingredient: dish.primaryIngredient,
      label: dish.prepLabel,
      leadHours: dish.prepLeadHours ?? 0,
    },
    now,
  );
}

/**
 * "Used it up" — a soft delete, like every delete outside dev tools (SPEC §11.3).
 *
 * Logging a cook deliberately does *not* do this. One batch of batter makes dosa on
 * Tuesday and idli on Wednesday, so a cook is no evidence the batter is gone (§16.4);
 * only the person looking in the fridge knows that, so only they can say it.
 */
export function discardPrep(id: string, now = new Date()): void {
  const at = toLocalIso(now);
  db.update(prepState)
    .set({ deletedAt: at, updatedAt: at })
    .where(and(eq(prepState.id, id), isNull(prepState.deletedAt)))
    .run();
}

/**
 * Delete long-expired rows outright, on app start (SPEC §5.3).
 *
 * **A hard delete, unlike everything else.** A tombstone exists so a later merge cannot
 * resurrect something removed on purpose, and a prep row has nothing worth resurrecting:
 * it is ephemeral state about one fridge on one day, not history. Keeping a tombstone per
 * soak would grow a table forever to record that some lentils were once wet.
 */
export function prunePrepStates(ids: readonly string[]): number {
  if (ids.length === 0) return 0;
  const result = db
    .delete(prepState)
    .where(inArray(prepState.id, [...ids]))
    .run();
  return result.changes ?? 0;
}

/** Soft delete everything live. Dev tools only. */
export function clearAllPrep(): number {
  const now = nowLocalIso();
  const result = db
    .update(prepState)
    .set({ deletedAt: now, updatedAt: now })
    .where(isNull(prepState.deletedAt))
    .run();
  return result.changes ?? 0;
}
