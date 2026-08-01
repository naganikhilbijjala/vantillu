import {
  type StalenessState,
  staleness,
  stalenessState,
  summariseHistory,
} from '../core/interval';
import type { Effort, PrepKind, Rating, Slot } from '../core/types';
import type { RoleConfigRow } from './roles';
import {
  asEffort,
  asPrepKind,
  type CookEventRow,
  type DishRow,
  type DishSlotRow,
  groupEvents,
  groupSlots,
  hasRecipe,
  NO_EVENTS,
  trimToNull,
} from './rows';

/**
 * The repertoire, for the Dishes list and the detail screen (Phase 5).
 *
 * Same shape of module as `todayModel.ts` and for the same reason: rows plus a `now` in,
 * plain objects out, no `db` and no clock, so the sort order and the search are unit
 * tested in Node rather than squinted at on a phone.
 *
 * The two models differ in what they are *for*, which is why this is not a slice of the
 * other. Today answers "what should I cook now" and therefore drops everything ineligible.
 * This answers "what do I cook", so a podi is a normal dish here — it is simply never
 * *suggested* (`docs/SPEC.md` §1.1). An always-available dish has no rhythm to be overdue
 * against, so it carries no gauge and sorts outside the staleness order entirely.
 */

export interface DishListItem {
  id: string;
  name: string;
  altName: string | null;
  role: string;
  /** From `role_config`. Falls back to the raw role for a role the user invented. */
  roleLabel: string;
  primaryIngredient: string | null;
  effort: Effort;
  /** Display only, as everywhere else (SPEC §1.2). */
  minutes: number | null;
  /**
   * The recipe, trimmed; null when the user has not written one. A dish with no recipe is a
   * normal dish, so nothing downstream may treat this as incomplete.
   */
  ingredientsText: string | null;
  methodText: string | null;
  /**
   * The dish's own stable notes — the third kind of note, distinct from the recipe body
   * above and from a cook event's `tweakNote` (`CLAUDE.md`).
   */
  notes: string | null;
  /** True when there is an ingredients list or a method. Notes alone are not a recipe. */
  hasRecipe: boolean;
  prepKind: PrepKind | null;
  /** What a reminder is measured back from, and what the editor offers (§20.2, §19.2). */
  prepLeadHours: number | null;
  prepLabel: string | null;
  slots: Slot[];
  isVeg: boolean;
  /** Never suggested, never stale, no gauge. */
  isAlwaysAvailable: boolean;
  cookCount: number;
  daysSince: number | null;
  medianInterval: number | null;
  lastRating: Rating | null;
  /** `'new'` whenever there is no honest median — including a median of 0. */
  stalenessState: StalenessState;
  /** How overdue, as a ratio of the dish's own rhythm. 1.0 is exactly due. */
  ratio: number;
  createdAt: string;
}

export interface DishesInputs {
  dishes: readonly DishRow[];
  dishSlots: readonly DishSlotRow[];
  roles: readonly RoleConfigRow[];
  cookEvents: readonly CookEventRow[];
}

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

/**
 * Every dish the user still has, newest rhythm resolved.
 *
 * Archived dishes are dropped: SPEC §4.1 calls them "invisible by design", and there is no
 * archive UI to reach them from until a later phase. Soft-deleted rows never arrive here —
 * the query filters those.
 */
export function buildDishList(inputs: DishesInputs, now: Date): DishListItem[] {
  const { dishes, dishSlots, roles, cookEvents } = inputs;

  const roleByName = new Map(roles.map((role) => [role.role, role]));
  const slotsByDish = groupSlots(dishSlots);
  const eventsByDish = groupEvents(cookEvents, new Set(dishes.map((d) => d.id)));

  const out: DishListItem[] = [];

  for (const d of dishes) {
    if (d.isArchived) continue;

    const role = roleByName.get(d.role);
    const events = eventsByDish.get(d.id) ?? NO_EVENTS;
    const history = summariseHistory(events.history, now);
    const ratio = staleness(history.daysSince, history.medianInterval);

    out.push({
      id: d.id,
      name: d.name,
      altName: d.altName,
      role: d.role,
      roleLabel: role?.label ?? d.role,
      primaryIngredient: d.primaryIngredient,
      effort: asEffort(d.effort),
      minutes: d.minutes,
      ingredientsText: trimToNull(d.ingredientsText),
      methodText: trimToNull(d.methodText),
      notes: trimToNull(d.notes),
      // Through `hasText`, so this cannot disagree with the trimming just above about what
      // counts as content.
      hasRecipe: hasRecipe(d),
      prepKind: asPrepKind(d.prepKind),
      prepLeadHours: d.prepLeadHours,
      prepLabel: d.prepLabel,
      slots: slotsByDish.get(d.id) ?? [],
      isVeg: d.isVeg,
      isAlwaysAvailable: role?.isAlwaysAvailable ?? false,
      cookCount: history.cookCount,
      daysSince: history.daysSince,
      medianInterval: history.medianInterval,
      lastRating: events.lastRating,
      // `stalenessState` owns the "median of 0 counts as unknown" rule, so the hollow
      // gauge and the "new dish" wording can never disagree about what counts as history.
      stalenessState: stalenessState(history.medianInterval, ratio),
      ratio,
      createdAt: d.createdAt,
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

/**
 * Most overdue first.
 *
 * Three bands, in this order, because they answer different questions:
 *
 * 1. **Dishes with a rhythm**, by how far past due they are. This is the useful part of
 *    the list and it goes at the top.
 * 2. **Dishes with no rhythm yet** — under three cooks. Their ratio is a neutral 1.0 and
 *    means nothing, so ranking them among band 1 would be inventing a number, which is
 *    the one thing the interval maths refuses to do everywhere else.
 * 3. **Always-available dishes.** A podi is never overdue; it is in the cupboard.
 *
 * Within a band, ties break by name so the list is browsable rather than arbitrary. That
 * matters more than it sounds: before onboarding writes any history, *every* dish is in
 * band 2 and the name order is the only order there is.
 */
export function stalenessBand(item: DishListItem): number {
  if (item.isAlwaysAvailable) return 2;
  return item.stalenessState === 'new' ? 1 : 0;
}

export function compareByStaleness(a: DishListItem, b: DishListItem): number {
  const bandA = stalenessBand(a);
  const bandB = stalenessBand(b);
  if (bandA !== bandB) return bandA - bandB;
  if (bandA === 0 && a.ratio !== b.ratio) return b.ratio - a.ratio;
  return a.name.localeCompare(b.name);
}

export function sortByStaleness(items: readonly DishListItem[]): DishListItem[] {
  return [...items].sort(compareByStaleness);
}

// ---------------------------------------------------------------------------
// Filtering and search
// ---------------------------------------------------------------------------

/** The sentinel for "no role filter". Not a role, so it can never collide with one. */
export const ALL_ROLES = null;

/**
 * Matches name, regional name, and primary ingredient.
 *
 * The ingredient is in there deliberately: "brinjal" is how you look for gutti vankaya
 * when you have brinjals to use up, and that is a question this app should answer. Folded
 * to lower case and trimmed; no fuzzy matching, because a repertoire is sixty dishes and
 * a substring is predictable.
 */
export function matchesSearch(item: DishListItem, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (needle === '') return true;

  // A list rather than a chain of ors, so the searched fields are the obvious thing to
  // change. Notably absent: `notes` and the recipe text. Those are long, and matching
  // inside them would surface dishes for reasons the row cannot show.
  const fields = [item.name, item.altName, item.primaryIngredient];
  return fields.some((field) => field?.toLowerCase().includes(needle) ?? false);
}

export interface DishFilter {
  /** A raw role string, or `ALL_ROLES`. */
  role: string | null;
  search: string;
}

export function filterDishes(
  items: readonly DishListItem[],
  filter: DishFilter,
): DishListItem[] {
  return items.filter(
    (item) =>
      (filter.role === ALL_ROLES || item.role === filter.role) &&
      matchesSearch(item, filter.search),
  );
}

/**
 * The roles worth offering as filters: those that some surviving dish actually uses, in
 * `role_config` order. A filter that returns nothing is a dead end, and the eleven seeded
 * roles will not all be in use.
 */
export function usedRoles(
  items: readonly DishListItem[],
  roles: readonly RoleConfigRow[],
): RoleConfigRow[] {
  const inUse = new Set(items.map((item) => item.role));
  return roles.filter((role) => inUse.has(role.role));
}

// ---------------------------------------------------------------------------
// Detail
// ---------------------------------------------------------------------------

/**
 * The one-line verdict under the gauge on the detail screen.
 *
 * Says nothing it cannot back up: with no median there is no "due in N days" to offer, and
 * claiming one would be the invented number again.
 */
export function patternSummary(item: DishListItem): string {
  if (item.isAlwaysAvailable) return 'Always available';
  if (item.stalenessState === 'new' || item.medianInterval === null) {
    return item.cookCount === 0 ? 'Never cooked yet' : 'No pattern yet';
  }

  const days = item.daysSince ?? 0;
  const diff = days - item.medianInterval;
  if (diff === 0) return 'Due today';
  return diff > 0
    ? `Overdue by ${plural(diff, 'day')}`
    : `Due in ${plural(-diff, 'day')}`;
}

function plural(count: number, noun: string): string {
  return count === 1 ? `1 ${noun}` : `${count} ${noun}s`;
}
