import { type StalenessState, staleness, stalenessState } from './interval';
import { effortRank, maxEffortRankForSlot } from './slots';
import type { Candidate, Context, PrepKind } from './types';

/**
 * The suggestion engine (`docs/SPEC.md` §4). Hard filters first, then a weighted score
 * over the survivors.
 *
 * `score()` is pure and deterministic (hard rule 4). Jitter is a separate, seeded
 * function applied during ranking, so the same day always produces the same order.
 */

// ---------------------------------------------------------------------------
// Constants — every number SPEC §4 names, exported so nothing is inline anywhere.
// ---------------------------------------------------------------------------

export const WEIGHTS = {
  /** Effort rank ≤ 1 — an instant or quick dish. */
  effortFit: 1.5,
  /** Uses leftover rice, and a rice staple was cooked in the last 24 h. */
  leftoverRice: 1.2,
  /** Live prep expires within 24 h. A bonus, not a filter: use the batter before it dies. */
  expiringPrep: 1.0,
  seasonMatch: 0.8,
  /**
   * Large on purpose. Repeating brinjal three days running is worse than eating
   * something less due, so this has to be able to sink an overdue dish outright.
   */
  recentIngredient: -4.0,
  roleFilledByBatch: -2.0,
  ratedNotAgain: -1.5,
} as const;

/** `instant` and `quick`. Compared against the fixed rank table, never an array index. */
export const QUICK_EFFORT_MAX_RANK = 1;

/** Only a 1 moves the score. A 3 is not a bonus — see SPEC §7. */
export const NOT_AGAIN_RATING = 1;

export const MAX_REASON_CHIPS = 3;

/** Suggestions shown before the "show three more" affordance. */
export const DEFAULT_SUGGESTION_COUNT = 3;

/** The held-back section states this many clauses, then aggregates (SPEC §4.6). */
export const HELD_BACK_MAX_CLAUSES = 3;

export const JITTER_AMPLITUDE = 0.15;

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export type ExclusionReason =
  | 'archived'
  | 'always_available'
  | 'wrong_slot'
  | 'over_effort_budget'
  | 'prep_not_ready'
  | 'non_veg_day';

/**
 * The three exclusions the user is told about. The other three are silent: surfacing
 * every archived, always-available and wrong-slot dish would list most of the
 * repertoire, while these three hide dishes the user actively expected to see — and a
 * silent omission there reads as a bug (SPEC §4.1).
 */
export type HeldBackReason = Extract<
  ExclusionReason,
  'over_effort_budget' | 'prep_not_ready' | 'non_veg_day'
>;

const HELD_BACK_REASONS: readonly HeldBackReason[] = [
  'over_effort_budget',
  'prep_not_ready',
  'non_veg_day',
];

export function isHeldBackReason(reason: ExclusionReason): reason is HeldBackReason {
  return (HELD_BACK_REASONS as readonly ExclusionReason[]).includes(reason);
}

export interface Eligibility {
  eligible: boolean;
  /** The *first* filter that failed, in SPEC §4.1 order. Null when eligible. */
  reason: ExclusionReason | null;
}

const ELIGIBLE: Eligibility = { eligible: true, reason: null };

/**
 * Evaluated in SPEC §4.1 order; first failure wins and is retained so the Today screen
 * can explain itself.
 *
 * Note filter 2: the check is `isAlwaysAvailable`, never `role === 'podi'`. Roles are
 * renameable and the behaviour has to follow the flag (SPEC §1.1).
 */
export function checkEligibility(candidate: Candidate, ctx: Context): Eligibility {
  if (candidate.isArchived) return { eligible: false, reason: 'archived' };
  if (candidate.isAlwaysAvailable) return { eligible: false, reason: 'always_available' };
  if (!candidate.slots.includes(ctx.slot))
    return { eligible: false, reason: 'wrong_slot' };

  if (effortRank(candidate.effort) > maxEffortRankForSlot(ctx.slot, ctx.isWeekend)) {
    return { eligible: false, reason: 'over_effort_budget' };
  }
  // Hard exclusion: suggesting dosa with no batter is worse than suggesting nothing.
  if (candidate.prepKind !== null && !ctx.livePrepDishIds.includes(candidate.id)) {
    return { eligible: false, reason: 'prep_not_ready' };
  }
  if (!candidate.isVeg && ctx.isVegOnlyDay)
    return { eligible: false, reason: 'non_veg_day' };

  return ELIGIBLE;
}

export function isEligible(candidate: Candidate, ctx: Context): boolean {
  return checkEligibility(candidate, ctx).eligible;
}

// ---------------------------------------------------------------------------
// Score
// ---------------------------------------------------------------------------

/**
 * Staleness ratio, adjusted by the weights above. Deterministic: the same inputs always
 * give the same number, which is what makes the whole engine testable.
 *
 * Safe to call on an ineligible candidate — the effort-fit bonus is decided by the fixed
 * rank table, so a `project` dish gets no bonus regardless of the slot's budget. The
 * `ctx.budget.indexOf(effort) < 2` sketch this replaces got that backwards: `indexOf`
 * returns -1 for an effort outside the budget, which is also `< 2` (SPEC §4.4).
 */
export function score(candidate: Candidate, ctx: Context): number {
  let total = staleness(candidate.daysSince, candidate.medianInterval);

  if (effortRank(candidate.effort) <= QUICK_EFFORT_MAX_RANK) total += WEIGHTS.effortFit;
  if (candidate.usesLeftoverRice && ctx.hadRiceStapleInLast24h)
    total += WEIGHTS.leftoverRice;
  if (candidate.prepKind !== null && ctx.expiringPrepDishIds.includes(candidate.id)) {
    total += WEIGHTS.expiringPrep;
  }
  if (candidate.season !== null && candidate.season === ctx.season) {
    total += WEIGHTS.seasonMatch;
  }
  if (
    candidate.primaryIngredient !== null &&
    ctx.recentIngredients.includes(candidate.primaryIngredient)
  ) {
    total += WEIGHTS.recentIngredient;
  }
  if (ctx.rolesFilledByBatch.includes(candidate.role)) total += WEIGHTS.roleFilledByBatch;
  if (candidate.lastRating === NOT_AGAIN_RATING) total += WEIGHTS.ratedNotAgain;

  return total;
}

// ---------------------------------------------------------------------------
// Reasons
// ---------------------------------------------------------------------------

export type ReasonKind = 'staleness' | 'prep_ready' | 'leftover_rice' | 'quick';

export interface Reason {
  kind: ReasonKind;
  /** Ready to render. The staleness wording is fixed by SPEC §4.6. */
  label: string;
  /** Set on the staleness chip only — the UI colours `overdue` differently. */
  state?: StalenessState;
  /** Set on the prep chip only. */
  expiringSoon?: boolean;
}

const PREP_READY_LABEL: Record<PrepKind, string> = {
  batter: 'batter is ready',
  soaked: 'soaked and ready',
  marinated: 'marinated and ready',
};

function days(count: number): string {
  return count === 1 ? '1 day' : `${count} days`;
}

function stalenessReason(candidate: Candidate): Reason {
  const ratio = staleness(candidate.daysSince, candidate.medianInterval);
  const state = stalenessState(candidate.medianInterval, ratio);
  const since = candidate.daysSince ?? 0;

  switch (state) {
    case 'new':
      return { kind: 'staleness', label: 'new dish', state };
    case 'recent':
      return { kind: 'staleness', label: `${days(since)} ago`, state };
    case 'due':
      return { kind: 'staleness', label: `due, ${days(since)}`, state };
    case 'overdue':
      return { kind: 'staleness', label: `${days(since)} — long overdue`, state };
  }
}

/**
 * The chips shown on a suggestion. Every suggestion gets at least one — a suggestion
 * without a stated reason gets ignored (SPEC §4.6).
 *
 * Precedence: staleness → prep ready → leftover rice → quick, capped at three. The
 * staleness chip always leads, so the cap only ever drops the quick chip.
 */
export function reasons(candidate: Candidate, ctx: Context): Reason[] {
  const out: Reason[] = [stalenessReason(candidate)];

  if (candidate.prepKind !== null && ctx.livePrepDishIds.includes(candidate.id)) {
    out.push({
      kind: 'prep_ready',
      label: PREP_READY_LABEL[candidate.prepKind],
      expiringSoon: ctx.expiringPrepDishIds.includes(candidate.id),
    });
  }
  if (candidate.usesLeftoverRice && ctx.hadRiceStapleInLast24h) {
    out.push({ kind: 'leftover_rice', label: 'leftover rice' });
  }
  if (effortRank(candidate.effort) <= QUICK_EFFORT_MAX_RANK) {
    out.push({ kind: 'quick', label: 'quick' });
  }

  return out.slice(0, MAX_REASON_CHIPS);
}

// ---------------------------------------------------------------------------
// Ordering
// ---------------------------------------------------------------------------

/** FNV-1a. Not cryptographic — it only needs to be stable and well spread. */
function hash32(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * A stable ±0.15 nudge, seeded from the dish and the local calendar day.
 *
 * Deterministic rather than random on purpose: re-rendering Today, or backgrounding and
 * reopening the app, must never reorder the suggestions. The list only reshuffles when
 * the date key changes (SPEC §4.5).
 */
export function jitter(dishId: string, dateKey: string): number {
  const unit = hash32(`${dishId}:${dateKey}`) / 0xffffffff;
  return (unit * 2 - 1) * JITTER_AMPLITUDE;
}

export interface RankedCandidate {
  candidate: Candidate;
  /** The deterministic score, unjittered. This is the number to debug against. */
  score: number;
  /** What the list is actually sorted by: `score` plus the day's jitter. */
  rankScore: number;
  reasons: Reason[];
}

/** A never-cooked dish is the stalest thing there is, so it wins the daysSince tiebreak. */
function daysSinceForSort(candidate: Candidate): number {
  return candidate.daysSince ?? Number.POSITIVE_INFINITY;
}

/**
 * Eligible candidates, ranked. Sort keys, in order (SPEC §4.5):
 *
 * 1. rank score descending
 * 2. `daysSince` descending
 * 3. `createdAt` ascending
 * 4. `id` ascending
 *
 * Keys 2–4 exist because ids are UUIDs and no longer carry insertion order. They are
 * live whenever `dateKey` is null and act as a deterministic backstop otherwise.
 *
 * Pass `dateKey` as null to rank without jitter — correct anywhere the ordering should
 * be strictly by score, such as the staleness-sorted dishes list.
 */
export function rankCandidates(
  candidates: readonly Candidate[],
  ctx: Context,
  dateKey: string | null,
): RankedCandidate[] {
  const ranked: RankedCandidate[] = [];

  for (const candidate of candidates) {
    if (!isEligible(candidate, ctx)) continue;
    const value = score(candidate, ctx);
    ranked.push({
      candidate,
      score: value,
      rankScore: dateKey === null ? value : value + jitter(candidate.id, dateKey),
      reasons: reasons(candidate, ctx),
    });
  }

  return ranked.sort((a, b) => {
    if (a.rankScore !== b.rankScore) return b.rankScore - a.rankScore;

    // Compared rather than subtracted: two never-cooked dishes are both Infinity here,
    // and `Infinity - Infinity` would hand the comparator a NaN.
    const aDays = daysSinceForSort(a.candidate);
    const bDays = daysSinceForSort(b.candidate);
    if (aDays !== bDays) return bDays - aDays;

    if (a.candidate.createdAt !== b.candidate.createdAt) {
      return a.candidate.createdAt < b.candidate.createdAt ? -1 : 1;
    }
    // Ids are UUID primary keys, so this last key never sees two equal values.
    return a.candidate.id < b.candidate.id ? -1 : 1;
  });
}

// ---------------------------------------------------------------------------
// Held back
// ---------------------------------------------------------------------------

export interface HeldBackCandidate {
  candidate: Candidate;
  reason: HeldBackReason;
}

export interface Suggestions {
  suggestions: RankedCandidate[];
  heldBack: HeldBackCandidate[];
}

/**
 * One pass over the repertoire: what to cook, and what the user will notice is missing.
 *
 * The caller slices `suggestions` to `DEFAULT_SUGGESTION_COUNT` and keeps the rest
 * behind "show three more".
 */
export function buildSuggestions(
  candidates: readonly Candidate[],
  ctx: Context,
  dateKey: string | null,
): Suggestions {
  const eligible: Candidate[] = [];
  const heldBack: HeldBackCandidate[] = [];

  for (const candidate of candidates) {
    const { eligible: ok, reason } = checkEligibility(candidate, ctx);
    if (ok) {
      eligible.push(candidate);
    } else if (reason !== null && isHeldBackReason(reason)) {
      heldBack.push({ candidate, reason });
    }
  }

  return { suggestions: rankCandidates(eligible, ctx, dateKey), heldBack };
}

export interface HeldBackGroup {
  reason: HeldBackReason;
  candidates: Candidate[];
}

/**
 * Held-back dishes grouped by why, in filter order. There are only three surfaced
 * reasons, so this can never exceed `HELD_BACK_MAX_CLAUSES` groups.
 *
 * Grouping stops here rather than returning a sentence: SPEC fixes the chip wording but
 * not the held-back prose, so the copy lives with the Today screen that renders it.
 */
export function groupHeldBack(items: readonly HeldBackCandidate[]): HeldBackGroup[] {
  const groups: HeldBackGroup[] = [];

  for (const reason of HELD_BACK_REASONS) {
    const matching = items.filter((item) => item.reason === reason);
    if (matching.length > 0) {
      groups.push({ reason, candidates: matching.map((item) => item.candidate) });
    }
  }

  return groups;
}
