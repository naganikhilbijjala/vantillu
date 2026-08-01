import type { PrepKind } from './types';

/**
 * The prep-ahead constants (`docs/SPEC.md` §5.3, §20).
 *
 * Product decisions rather than mechanism: how long each kind of prep stays usable, what
 * each is called, and how often the app is allowed to bring one up. The lifecycle itself
 * — which rows are live, which have expired, which dish deserves a reminder — is
 * `src/db/prepModel.ts`, because it needs rows.
 *
 * Pure data, no clock. A caller adds these hours to `readyAt`.
 */

/** Default shelf life in hours, measured from `readyAt`. Editable per row. */
export const PREP_SHELF_LIFE_HOURS: Record<PrepKind, number> = {
  batter: 72,
  soaked: 24,
  marinated: 24,
};

/** Human wording for a prep kind, used where a row has no label of its own. */
export const PREP_KIND_NOUN: Record<PrepKind, string> = {
  batter: 'Batter',
  soaked: 'The soak',
  marinated: 'The marinade',
};

/** What starting each kind of prep is called, on a button and in a notification. */
export const PREP_KIND_ACTION: Record<PrepKind, string> = {
  batter: 'Grind the batter',
  soaked: 'Start the soak',
  marinated: 'Start marinating',
};

/**
 * How "nothing is going" reads for each kind. A statement about the fridge, not a
 * complaint: an empty state is inviting, never nagging.
 */
export const PREP_KIND_IDLE: Record<PrepKind, string> = {
  batter: 'No batter going right now.',
  soaked: 'Nothing soaking right now.',
  marinated: 'Nothing marinating right now.',
};

/** Default lead time in hours, offered by the dish editor for a kind with none set. */
export const PREP_DEFAULT_LEAD_HOURS: Record<PrepKind, number> = {
  batter: 12,
  soaked: 8,
  marinated: 2,
};

/**
 * How long a dish stays quiet after it has been nudged.
 *
 * Without it a dish that is overdue and needs an overnight soak would be reminded about
 * every single night until it was cooked, which is nagging — the one thing the empty
 * states, the held-back note and the ratings scale all go out of their way not to do. Once
 * every few days is a reminder; once a night is an alarm you turn off.
 */
export const PREP_NUDGE_COOLDOWN_DAYS = 3;

/**
 * How many prep reminders may be outstanding at once.
 *
 * iOS caps pending local notifications at 64, so this is nowhere near a technical limit —
 * it is the point past which an evening's worth of reminders stops being useful. The most
 * overdue win, and what was dropped is stated in dev tools rather than silently lost.
 */
export const MAX_PREP_NUDGES = 6;

/** Expired rows are pruned once they are this old (`docs/SPEC.md` §5.3). */
export const PREP_PRUNE_AFTER_DAYS = 30;
