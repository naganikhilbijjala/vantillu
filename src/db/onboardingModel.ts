import { setHours, startOfDay, subDays } from 'date-fns';
import type { Slot } from '../core/types';
import type { NewCookEventRow } from './cookModel';
import type { RoleConfigRow } from './roles';
import { asSlot } from './rows';
import type { SeedCatalogEntry } from './seedCatalog';
import { toLocalIso } from './time';

/**
 * Onboarding (Phase 8): which seed dishes are yours, and roughly when you last made each.
 *
 * Same shape of module as `todayModel.ts` and `cookModel.ts`, for the same reason — rows
 * plus a `now` in, plain objects out, no `db` and no clock — so the bucket arithmetic and
 * the grouping are asserted in Node rather than squinted at during a one-time flow that is
 * deliberately hard to see twice.
 *
 * `docs/SPEC.md` §18 is authoritative for the product decisions below.
 */

// ---------------------------------------------------------------------------
// The picker
// ---------------------------------------------------------------------------

/** One role's worth of the catalogue, as the picker draws it. */
export interface CatalogSection {
  role: string;
  /** From `role_config`, never the raw role string — a renamed role shows its new name. */
  label: string;
  entries: SeedCatalogEntry[];
}

/**
 * The catalogue grouped by role, in `role_config` order.
 *
 * Roles with nothing in them are dropped, the same rule `usedRoles` follows on the dishes
 * list: an empty section is a heading over nothing. A dish whose role has no config row
 * still appears, in a trailing section labelled with the raw role — losing a dish because
 * the seed and the defaults disagreed would be far worse than an ugly heading, and the
 * seed test asserts that this case is currently empty.
 */
export function groupCatalogByRole(
  catalog: readonly SeedCatalogEntry[],
  roles: readonly RoleConfigRow[],
): CatalogSection[] {
  const byRole = new Map<string, SeedCatalogEntry[]>();
  for (const entry of catalog) {
    const existing = byRole.get(entry.role);
    if (existing) existing.push(entry);
    else byRole.set(entry.role, [entry]);
  }

  const sections: CatalogSection[] = [];
  const placed = new Set<string>();

  for (const role of [...roles].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const entries = byRole.get(role.role);
    if (entries === undefined) continue;
    sections.push({ role: role.role, label: role.label, entries });
    placed.add(role.role);
  }

  for (const [role, entries] of byRole) {
    if (placed.has(role)) continue;
    sections.push({ role, label: role, entries });
  }

  return sections;
}

/**
 * Everything ticked.
 *
 * The seed file's own note says "accept what you cook, delete the rest", and it is the
 * faster answer for the common case: a starter list you untick from reaches Today in one
 * tap, while sixty-eight empty boxes is a chore before the app has shown you anything
 * (SPEC §18.1).
 */
export function defaultSelection(catalog: readonly SeedCatalogEntry[]): Set<string> {
  return new Set(catalog.map((entry) => entry.key));
}

export function toggleKey(selected: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(selected);
  if (!next.delete(key)) next.add(key);
  return next;
}

/** Ticks or unticks a whole section, for the All / None control on its heading. */
export function setSectionKeys(
  selected: ReadonlySet<string>,
  entries: readonly SeedCatalogEntry[],
  on: boolean,
): Set<string> {
  const next = new Set(selected);
  for (const entry of entries) {
    if (on) next.add(entry.key);
    else next.delete(entry.key);
  }
  return next;
}

export function isSectionFull(
  selected: ReadonlySet<string>,
  entries: readonly SeedCatalogEntry[],
): boolean {
  return entries.length > 0 && entries.every((entry) => selected.has(entry.key));
}

/** The picked entries, in catalogue order — which is what actually gets inserted. */
export function selectedEntries(
  catalog: readonly SeedCatalogEntry[],
  selected: ReadonlySet<string>,
): SeedCatalogEntry[] {
  return catalog.filter((entry) => selected.has(entry.key));
}

// ---------------------------------------------------------------------------
// The last-cooked estimate
// ---------------------------------------------------------------------------

/**
 * How long ago, as coarsely as anyone actually remembers.
 *
 * Three buckets and an unset fourth state, rather than a date picker: the question is
 * "when did you last make dosa", and nobody knows the answer to the day. A picker would
 * ask for a precision the user does not have and then store the guess as though it were
 * observed.
 */
export type LastCookedBucket = 'days' | 'weeks' | 'months';

export interface LastCookedOption {
  value: LastCookedBucket;
  label: string;
  /** The midpoint of the bucket, in calendar days before today. */
  daysAgo: number;
}

/**
 * Midpoints, not edges. Each is the honest middle of the phrase above it, so the number
 * stored is the best single answer to a question that was asked vaguely on purpose.
 *
 * `days` lands on 3 and that is worth one note: the −4.0 recent-ingredient penalty covers
 * **2** calendar days (SPEC §4.3), so the midpoint of "days ago" sits just outside it and
 * an onboarding guess can never sink a dish on the strength of a vague memory. Moving this
 * to 1 or 2 would let a shrug about last Tuesday suppress every tomato dish on day one.
 */
export const LAST_COOKED_OPTIONS: readonly LastCookedOption[] = [
  { value: 'days', label: 'Days ago', daysAgo: 3 },
  { value: 'weeks', label: 'Weeks ago', daysAgo: 21 },
  { value: 'months', label: 'Months ago', daysAgo: 60 },
];

export const BUCKET_DAYS_AGO: Record<LastCookedBucket, number> = {
  days: 3,
  weeks: 21,
  months: 60,
};

/**
 * A plausible hour for a cook in each slot.
 *
 * `cook_event.cooked_at` is a full local datetime (SPEC §2.1) and an estimate still has to
 * fill one in. Midnight would be a lie in a way that shows: a breakfast recorded at 00:00
 * reads as a cook the night before to anything that ever groups by time of day.
 */
export const ESTIMATE_HOUR: Record<Slot, number> = {
  breakfast: 8,
  lunch: 13,
  dinner: 20,
  snack: 17,
};

/**
 * The slot to file an estimate under: the dish's first valid one.
 *
 * Nothing scores on `cook_event.slot` — eligibility reads the dish's slots, not the
 * event's — so this only has to be true rather than clever. Dinner is the fallback for a
 * dish with no slots at all, which the seed does not contain and a hand-edited row could.
 */
export function estimatedSlot(slots: readonly string[]): Slot {
  for (const raw of slots) {
    const slot = asSlot(raw);
    if (slot !== null) return slot;
  }
  return 'dinner';
}

/** Bucket midpoint back from today, at the slot's own hour. */
export function estimatedCookedAt(bucket: LastCookedBucket, slot: Slot, now: Date): Date {
  return setHours(startOfDay(subDays(now, BUCKET_DAYS_AGO[bucket])), ESTIMATE_HOUR[slot]);
}

/**
 * Sets a dish's bucket, or clears it when the same one is tapped again.
 *
 * "Didn't say" has to stay reachable after a mis-tap. Three pills with no way back would
 * mean an accidental "months ago" is permanent, and the row it writes is indistinguishable
 * from a real answer once it is in the table.
 */
export function setBucket(
  estimates: ReadonlyMap<string, LastCookedBucket>,
  key: string,
  bucket: LastCookedBucket,
): Map<string, LastCookedBucket> {
  const next = new Map(estimates);
  if (next.get(key) === bucket) next.delete(key);
  else next.set(key, bucket);
  return next;
}

/** Drops estimates for dishes that are no longer picked — going back a step unticks. */
export function pruneEstimates(
  estimates: ReadonlyMap<string, LastCookedBucket>,
  selected: ReadonlySet<string>,
): Map<string, LastCookedBucket> {
  return new Map([...estimates].filter(([key]) => selected.has(key)));
}

export interface EstimatedCookInput {
  dishId: string;
  /** The dish's valid slots, as stored. Used only to file the event somewhere honest. */
  slots: readonly string[];
  bucket: LastCookedBucket;
}

/**
 * One estimated cook event.
 *
 * **`isEstimated` is the whole point.** These count toward `daysSince` and `cookCount` and
 * are excluded from interval maths (SPEC §3), which is what stops a bucketed guess from
 * inventing a median — the rhythm has to come from cooks the user actually logged.
 *
 * `cookedAt` is backdated; `createdAt` and `updatedAt` are not. The row was written now and
 * says so, or the eventual export has no way to tell a guess apart from history.
 */
export function toEstimatedCookEventRow(
  input: EstimatedCookInput,
  id: string,
  now: Date,
): NewCookEventRow {
  const slot = estimatedSlot(input.slots);
  const written = toLocalIso(now);

  return {
    id,
    dishId: input.dishId,
    cookedAt: toLocalIso(estimatedCookedAt(input.bucket, slot, now)),
    slot,
    mealId: null,
    // Onboarding asks when, not how it turned out. Nothing writes a rating (SPEC §7.1).
    rating: null,
    tweakNote: null,
    photoUri: null,
    isBatch: false,
    isEstimated: true,
    createdAt: written,
    updatedAt: written,
    deletedAt: null,
  };
}
