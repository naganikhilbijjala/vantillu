import { differenceInCalendarDays } from 'date-fns';
import { summariseHistory } from '../core/interval';
import { RICE_STAPLE_INGREDIENT, RICE_STAPLE_ROLE, WINDOWS } from '../core/scoring';
import { isWeekendDate, seasonForDate } from '../core/slots';
import type { Candidate, Context, PrepKind, Slot } from '../core/types';
import type { RoleConfigRow } from './roles';
import {
  asEffort,
  asPrepKind,
  asSeason,
  type CookEventRow,
  type DishRow,
  type DishSlotRow,
  groupEvents,
  groupSlots,
  hasRecipe,
  NO_EVENTS,
  type PrepStateRow,
} from './rows';
import { isVegOnlyDay, isVegOnlyToday, type SettingMap } from './settings';
import { parseLocalIso } from './time';

/**
 * Database rows in, `Candidate` and `Context` out.
 *
 * This is the boundary between SQLite and `src/core/`. It reads no clock — `now` is an
 * argument — and imports no `db`, so the whole Today pipeline can be run against plain
 * objects in Node. Everything time-dependent lives here rather than in the SQL, which is
 * what lets `queries/tables.ts` subscribe to each table exactly once instead of rebuilding
 * a WHERE clause every minute.
 *
 * Assembling in JavaScript also keeps the interval maths in `src/core/`, where it is unit
 * tested, instead of pushing a median into SQL where it would not be.
 *
 * Row shapes and the TEXT-to-union narrowing live in `rows.ts`, shared with the dishes
 * list. What is left here is the part that is specifically about *now*: which prep is
 * live, what counts as recent, and which slot is being answered for.
 */

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface TodayInputs {
  dishes: readonly DishRow[];
  dishSlots: readonly DishSlotRow[];
  roles: readonly RoleConfigRow[];
  cookEvents: readonly CookEventRow[];
  prepStates: readonly PrepStateRow[];
  settings: SettingMap;
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
      hasRecipe: hasRecipe(d),
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
