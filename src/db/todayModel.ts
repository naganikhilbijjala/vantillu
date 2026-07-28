import { differenceInCalendarDays } from 'date-fns';
import type { CookHistoryEvent } from '../core/interval';
import { summariseHistory } from '../core/interval';
import { RICE_STAPLE_INGREDIENT, RICE_STAPLE_ROLE, WINDOWS } from '../core/scoring';
import { isWeekendDate, seasonForDate } from '../core/slots';
import type {
  Candidate,
  Context,
  Effort,
  PrepKind,
  Rating,
  Season,
  Slot,
} from '../core/types';
import type { RoleConfigRow } from './roles';
import { isVegOnlyDay, isVegOnlyToday, type SettingMap } from './settings';
import { parseLocalIso } from './time';

/**
 * Database rows in, `Candidate` and `Context` out.
 *
 * This is the boundary between SQLite and `src/core/`. It reads no clock — `now` is an
 * argument — and imports no `db`, so the whole Today pipeline can be run against plain
 * objects in Node. Everything time-dependent lives here rather than in the SQL, which is
 * what lets `queries/today.ts` subscribe to each table exactly once instead of rebuilding
 * a WHERE clause every minute.
 *
 * Assembling in JavaScript also keeps the interval maths in `src/core/`, where it is unit
 * tested, instead of pushing a median into SQL where it would not be.
 */

// ---------------------------------------------------------------------------
// Row shapes — structurally what `queries/today.ts` selects
// ---------------------------------------------------------------------------

export interface DishRow {
  id: string;
  name: string;
  role: string;
  primaryIngredient: string | null;
  effort: string;
  minutes: number | null;
  isVeg: boolean;
  prepKind: string | null;
  prepLabel: string | null;
  usesLeftoverRice: boolean;
  season: string | null;
  ingredientsText: string | null;
  methodText: string | null;
  isArchived: boolean;
  createdAt: string;
}

export interface DishSlotRow {
  dishId: string;
  slot: string;
}

export interface CookEventRow {
  dishId: string;
  cookedAt: string;
  rating: number | null;
  isBatch: boolean;
  isEstimated: boolean;
}

export interface PrepStateRow {
  id: string;
  kind: string;
  ingredient: string | null;
  label: string | null;
  readyAt: string | null;
  expiresAt: string | null;
}

export interface TodayInputs {
  dishes: readonly DishRow[];
  dishSlots: readonly DishSlotRow[];
  roles: readonly RoleConfigRow[];
  cookEvents: readonly CookEventRow[];
  prepStates: readonly PrepStateRow[];
  settings: SettingMap;
}

// ---------------------------------------------------------------------------
// Narrowing TEXT columns onto the core unions
// ---------------------------------------------------------------------------

const EFFORTS: readonly Effort[] = ['instant', 'quick', 'medium', 'project'];
const SLOTS: readonly Slot[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const SEASONS: readonly Season[] = ['summer', 'monsoon', 'winter'];
const PREP_KINDS: readonly PrepKind[] = ['batter', 'soaked', 'marinated'];

/** Unrecognised effort reads as the most expensive one, matching `effortRank`. */
function asEffort(value: string): Effort {
  return EFFORTS.includes(value as Effort) ? (value as Effort) : 'project';
}

function asSlot(value: string): Slot | null {
  return SLOTS.includes(value as Slot) ? (value as Slot) : null;
}

/** An unrecognised season is "any season": it never matches and never penalises. */
function asSeason(value: string | null): Season | null {
  return value !== null && SEASONS.includes(value as Season) ? (value as Season) : null;
}

/**
 * Prep kinds are a closed set the app writes itself (SPEC §1.4) — nothing user-typed
 * reaches this column — so an unrecognised value is a bug, and reading it as "no prep"
 * keeps the dish suggestible rather than hiding it forever with no way to find out why.
 */
function asPrepKind(value: string | null): PrepKind | null {
  return value !== null && PREP_KINDS.includes(value as PrepKind)
    ? (value as PrepKind)
    : null;
}

function asRating(value: number | null): Rating | null {
  return value === 1 || value === 2 || value === 3 ? value : null;
}

function hasText(value: string | null): boolean {
  return value !== null && value.trim().length > 0;
}

// ---------------------------------------------------------------------------
// Display data — the fields `Candidate` deliberately leaves out
// ---------------------------------------------------------------------------

/**
 * What the card needs and the engine must not see. `minutes` is display-only and may never
 * enter a filter or the score (SPEC §1.2); `roleLabel` is the human name of a role, where
 * the engine only ever compares raw role strings.
 */
export interface DishDisplay {
  roleLabel: string;
  minutes: number | null;
  hasRecipe: boolean;
  prepLabel: string | null;
}

/** One live prep row, resolved to the dishes it actually unlocks. */
export interface LivePrep {
  id: string;
  kind: PrepKind | null;
  label: string | null;
  expiresAt: Date | null;
  expiringSoon: boolean;
  dishNames: string[];
}

export interface TodayModel {
  candidates: Candidate[];
  ctx: Context;
  display: ReadonlyMap<string, DishDisplay>;
  /** Only rows that are live *and* unlock at least one unarchived dish. */
  livePrep: LivePrep[];
  /**
   * True when today's one-day override is set. Distinct from `ctx.isVegOnlyDay`, which is
   * also true when the weekday set governs — the Today toggle can only move this one.
   */
  vegOnlyOverride: boolean;
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

const MS_PER_HOUR = 3_600_000;

/** Hours from `at` up to `now`. Negative for a future-dated row. */
function elapsedHours(now: Date, at: Date): number {
  return (now.getTime() - at.getTime()) / MS_PER_HOUR;
}

function hoursUntil(now: Date, at: Date): number {
  return elapsedHours(at, now);
}

function groupSlots(rows: readonly DishSlotRow[]): Map<string, Slot[]> {
  const out = new Map<string, Slot[]>();
  for (const row of rows) {
    const slot = asSlot(row.slot);
    if (slot === null) continue;
    const existing = out.get(row.dishId);
    if (existing) existing.push(slot);
    else out.set(row.dishId, [slot]);
  }
  return out;
}

interface DishEvents {
  history: CookHistoryEvent[];
  /** The most recent rating that was actually given. A later unrated cook does not
   *  erase it — "last rated 1" is about the last time the dish was rated (SPEC §4.3). */
  lastRating: Rating | null;
}

/**
 * Groups the cook log by dish. Does not trust the caller's ORDER BY — `summariseHistory`
 * sorts its own input for the same reason, and a `lastRating` that silently depended on
 * the query's sort would be wrong the first time anyone reordered it.
 */
function groupEvents(
  rows: readonly CookEventRow[],
  seen: ReadonlySet<string>,
): Map<string, DishEvents> {
  const out = new Map<string, DishEvents>();
  const ratedAt = new Map<string, number>();

  for (const row of rows) {
    if (!seen.has(row.dishId)) continue;
    let entry = out.get(row.dishId);
    if (!entry) {
      entry = { history: [], lastRating: null };
      out.set(row.dishId, entry);
    }

    const cookedAt = parseLocalIso(row.cookedAt);
    entry.history.push({ cookedAt, isEstimated: row.isEstimated });

    const rating = asRating(row.rating);
    // An unrated cook is not an opinion, so it does not overwrite an earlier rating.
    if (rating !== null && cookedAt.getTime() >= (ratedAt.get(row.dishId) ?? -Infinity)) {
      entry.lastRating = rating;
      ratedAt.set(row.dishId, cookedAt.getTime());
    }
  }
  return out;
}

const NO_EVENTS: DishEvents = { history: [], lastRating: null };

interface ResolvedPrep {
  livePrepDishIds: Set<string>;
  expiringPrepDishIds: Set<string>;
  livePrep: LivePrep[];
}

/**
 * Live prep, matched on the `(kind, ingredient)` pair (SPEC §5.2). Matching on the pair is
 * what lets one batter row cover idli, dosa and uttapam while correctly leaving out
 * pesarattu, which is soaked moong rather than fermented urad.
 *
 * Both timestamps are nullable in the schema. A row with no `readyAt` is treated as ready
 * — it had no lead time to wait out — and a row with no `expiresAt` never expires, which
 * is the reading that leaves the user in control rather than quietly binning their batter.
 */
function resolvePrep(
  rows: readonly PrepStateRow[],
  dishes: readonly DishRow[],
  now: Date,
): ResolvedPrep {
  const livePrepDishIds = new Set<string>();
  const expiringPrepDishIds = new Set<string>();
  const livePrep: LivePrep[] = [];

  for (const row of rows) {
    const readyAt = row.readyAt === null ? null : parseLocalIso(row.readyAt);
    const expiresAt = row.expiresAt === null ? null : parseLocalIso(row.expiresAt);

    if (readyAt !== null && readyAt > now) continue; // still pending
    if (expiresAt !== null && expiresAt <= now) continue; // expired

    const expiringSoon =
      expiresAt !== null && hoursUntil(now, expiresAt) <= WINDOWS.expiringPrepHours;

    // `===` rather than SQL's NULL semantics: a prep row and a dish that both leave the
    // ingredient unset describe the same thing, and in practice both sides are populated.
    const matched = dishes.filter(
      (d) =>
        !d.isArchived &&
        d.prepKind === row.kind &&
        d.primaryIngredient === row.ingredient,
    );
    if (matched.length === 0) continue; // live, but unlocks nothing worth a banner

    for (const d of matched) {
      livePrepDishIds.add(d.id);
      if (expiringSoon) expiringPrepDishIds.add(d.id);
    }

    livePrep.push({
      id: row.id,
      kind: asPrepKind(row.kind),
      label: row.label,
      expiresAt,
      expiringSoon,
      dishNames: matched.map((d) => d.name),
    });
  }

  // Soonest to die first, so the banner that needs acting on leads.
  livePrep.sort(
    (a, b) =>
      (a.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY) -
      (b.expiresAt?.getTime() ?? Number.POSITIVE_INFINITY),
  );

  return { livePrepDishIds, expiringPrepDishIds, livePrep };
}

/**
 * The three history-derived fields of `Context`, in one pass over the cook log
 * (SPEC §4.3).
 *
 * Recent ingredients count *calendar* days — today and yesterday — while the rice and
 * batch windows are elapsed hours, because that is how SPEC words each one. A rice staple
 * at 23:00 is still leftover rice at 09:00; a batch cook is a 48-hour fridge fact.
 */
function resolveHistoryContext(
  rows: readonly CookEventRow[],
  dishById: ReadonlyMap<string, DishRow>,
  now: Date,
) {
  let hadRiceStapleInLast24h = false;
  const recentIngredients = new Set<string>();
  const rolesFilledByBatch = new Set<string>();

  for (const row of rows) {
    const d = dishById.get(row.dishId);
    if (d === undefined) continue;
    const at = parseLocalIso(row.cookedAt);
    const hours = elapsedHours(now, at);

    if (
      hours <= WINDOWS.riceStapleHours &&
      d.role === RICE_STAPLE_ROLE &&
      d.primaryIngredient === RICE_STAPLE_INGREDIENT
    ) {
      hadRiceStapleInLast24h = true;
    }
    if (
      d.primaryIngredient !== null &&
      differenceInCalendarDays(now, at) < WINDOWS.recentIngredientCalendarDays
    ) {
      recentIngredients.add(d.primaryIngredient);
    }
    if (row.isBatch && hours <= WINDOWS.batchRoleHours) {
      rolesFilledByBatch.add(d.role);
    }
  }

  return {
    hadRiceStapleInLast24h,
    recentIngredients: [...recentIngredients],
    rolesFilledByBatch: [...rolesFilledByBatch],
  };
}

export function buildTodayModel(inputs: TodayInputs, now: Date, slot: Slot): TodayModel {
  const { dishes, dishSlots, roles, cookEvents, prepStates, settings } = inputs;

  const roleByName = new Map(roles.map((role) => [role.role, role]));
  const dishById = new Map(dishes.map((d) => [d.id, d]));
  const slotsByDish = groupSlots(dishSlots);
  const eventsByDish = groupEvents(cookEvents, new Set(dishById.keys()));
  const prep = resolvePrep(prepStates, dishes, now);

  const candidates: Candidate[] = [];
  const display = new Map<string, DishDisplay>();

  for (const d of dishes) {
    const role = roleByName.get(d.role);
    const events = eventsByDish.get(d.id) ?? NO_EVENTS;
    const history = summariseHistory(events.history, now);

    candidates.push({
      id: d.id,
      name: d.name,
      role: d.role,
      slots: slotsByDish.get(d.id) ?? [],
      effort: asEffort(d.effort),
      isVeg: d.isVeg,
      isArchived: d.isArchived,
      // A role with no `role_config` row — the user typed a new one — is a normal role.
      isAlwaysAvailable: role?.isAlwaysAvailable ?? false,
      primaryIngredient: d.primaryIngredient,
      prepKind: asPrepKind(d.prepKind),
      prepLabel: d.prepLabel,
      usesLeftoverRice: d.usesLeftoverRice,
      season: asSeason(d.season),
      daysSince: history.daysSince,
      medianInterval: history.medianInterval,
      lastRating: events.lastRating,
      createdAt: d.createdAt,
    });

    display.set(d.id, {
      roleLabel: role?.label ?? d.role,
      minutes: d.minutes,
      hasRecipe: hasText(d.ingredientsText) || hasText(d.methodText),
      prepLabel: d.prepLabel,
    });
  }

  const ctx: Context = {
    slot,
    isWeekend: isWeekendDate(now),
    season: seasonForDate(now),
    isVegOnlyDay: isVegOnlyDay(settings, now),
    livePrepDishIds: [...prep.livePrepDishIds],
    expiringPrepDishIds: [...prep.expiringPrepDishIds],
    ...resolveHistoryContext(cookEvents, dishById, now),
  };

  return {
    candidates,
    ctx,
    display,
    livePrep: prep.livePrep,
    vegOnlyOverride: isVegOnlyToday(settings, now),
  };
}
