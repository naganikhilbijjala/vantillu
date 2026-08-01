import { randomUUID } from 'expo-crypto';
import { db } from '../client';
import { type LogCookInput, toCookEventRow } from '../cookModel';
import { cookEvent } from '../schema';

/**
 * Writing a cook event — the only write on the app's critical path.
 *
 * Nothing else happens as a side effect, and two omissions are deliberate:
 *
 * **No `prep_state` is consumed.** One batch of batter makes dosa on Tuesday and idli on
 * Wednesday, so a cook is not evidence the prep is gone. Prep expires on its shelf life
 * (`docs/SPEC.md` §5.3) and Phase 9 owns that lifecycle.
 *
 * **Nothing is recomputed or cached.** `daysSince`, `medianInterval` and `cookCount` are
 * derived on every read and never stored (hard rule 2). The screens update because
 * `useLiveQuery` re-runs on any write to `cook_event` — which is exactly what makes this
 * phase's acceptance criterion true without a line of invalidation code.
 */

export interface LogCookResult {
  eventId: string;
  /** The meal this cook belongs to, minted here on the first dish of a group. */
  mealId: string | null;
}

export function logCook(input: LogCookInput, now = new Date()): LogCookResult {
  const row = toCookEventRow(input, randomUUID(), now);
  db.insert(cookEvent).values(row).run();
  return { eventId: row.id, mealId: row.mealId };
}

/**
 * A fresh meal id, for the first dish of a meal the user intends to keep adding to.
 *
 * Minted by the caller rather than inside `logCook` so that a standalone cook stays
 * `NULL`: a group of one is not a group, and a table full of single-member meal ids would
 * make "what did I eat with this" unanswerable later.
 */
export function newMealId(): string {
  return randomUUID();
}
