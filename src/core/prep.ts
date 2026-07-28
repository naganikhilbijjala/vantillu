import type { PrepKind } from './types';

/**
 * The prep-ahead constants (`docs/SPEC.md` §5.3).
 *
 * Phase 9 owns the full `prep_state` lifecycle — scheduling the nudge, marking a row
 * ready, pruning expired ones. What lives here is only the part that is a product
 * decision rather than a mechanism: how long each kind of prep stays usable.
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
