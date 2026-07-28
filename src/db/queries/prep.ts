import { isNull } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';
import { PREP_SHELF_LIFE_HOURS } from '../../core/prep';
import type { PrepKind } from '../../core/types';
import { db } from '../client';
import { prepState } from '../schema';
import { localIsoPlusHours, nowLocalIso, toLocalIso } from '../time';

/**
 * Writes against `prep_state`.
 *
 * **Phase 9 owns the real lifecycle** — scheduling the nudge `prepLeadHours` ahead of a
 * dish's usual slot, and pruning expired rows. What is here is the minimum needed for the
 * Phase 4 prep banner to be verifiable on device: without a way to put a live row in the
 * table, the banner and the "batter is ready" chip are untestable code.
 *
 * `readyAt = now + leadHours`, `expiresAt = readyAt + shelf life` (`docs/SPEC.md` §5.3).
 */

export interface StartPrepInput {
  kind: PrepKind;
  /** Half of the match key — a batter row is only urad-dal batter (SPEC §5.2). */
  ingredient: string;
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

/** Soft delete, like every other delete in the app (SPEC §11.3). */
export function clearAllPrep(): number {
  const now = nowLocalIso();
  const result = db
    .update(prepState)
    .set({ deletedAt: now, updatedAt: now })
    .where(isNull(prepState.deletedAt))
    .run();
  return result.changes ?? 0;
}
