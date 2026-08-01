import { differenceInCalendarDays, format } from 'date-fns';
import { staleness, stalenessState, summariseHistory } from '../core/interval';
import {
  MAX_PREP_NUDGES,
  PREP_KIND_ACTION,
  PREP_KIND_IDLE,
  PREP_KIND_NOUN,
  PREP_NUDGE_COOLDOWN_DAYS,
  PREP_PRUNE_AFTER_DAYS,
} from '../core/prep';
import { WINDOWS } from '../core/scoring';
import { prepNudgeTime } from '../core/slots';
import type { PrepKind } from '../core/types';
import {
  asPrepKind,
  type CookEventRow,
  type DishRow,
  type DishSlotRow,
  groupEvents,
  groupSlots,
  NO_EVENTS,
  type PrepStateRow,
} from './rows';
import { parseLocalIso, toLocalIso } from './time';

/**
 * The prep-ahead lifecycle: which rows are alive, which dish deserves a reminder, and what
 * each of those says (`docs/SPEC.md` §5.2, §5.3, §20).
 *
 * A sibling of `todayModel.ts` and `dishesModel.ts` — rows plus a `now` in, plain objects
 * out, no `db` and no clock of its own. That is what lets "an overnight soak for breakfast
 * is a 9 p.m. reminder" be an assertion in Node rather than an evening spent watching a
 * phone, which for a feature whose whole output arrives hours later is the difference
 * between testable and not.
 *
 * The phase rules live here rather than in `todayModel.ts`, which used to carry its own
 * copy for the Today banner. Two definitions of "expired" is exactly the divergence
 * `rows.ts` exists to prevent, so the banner reads them from here now.
 */

// ---------------------------------------------------------------------------
// A single prep row against the clock
// ---------------------------------------------------------------------------

/**
 * SPEC §5.3's states. `expiring` is a sub-state of live rather than a fourth thing that
 * happens to a row: it is still usable, it is just worth using now.
 */
export type PrepPhase = 'none' | 'pending' | 'live' | 'expiring' | 'expired';

const MS_PER_HOUR = 3_600_000;

export interface PrepTimes {
  readyAt: Date | null;
  expiresAt: Date | null;
}

/**
 * Both timestamps are nullable in the schema, and Phase 4 fixed what a null means: **no
 * `readyAt` is ready** — there was no lead time to wait out — and **no `expiresAt` never
 * expires**. Either reading leaves the user in control rather than quietly binning their
 * batter (SPEC §5.2).
 */
export function prepTimes(row: PrepStateRow): PrepTimes {
  return {
    readyAt: row.readyAt === null ? null : parseLocalIso(row.readyAt),
    expiresAt: row.expiresAt === null ? null : parseLocalIso(row.expiresAt),
  };
}

export function prepPhaseAt(times: PrepTimes, now: Date): PrepPhase {
  if (times.readyAt !== null && times.readyAt > now) return 'pending';
  if (times.expiresAt !== null && times.expiresAt <= now) return 'expired';
  if (
    times.expiresAt !== null &&
    times.expiresAt.getTime() - now.getTime() <= WINDOWS.expiringPrepHours * MS_PER_HOUR
  ) {
    return 'expiring';
  }
  return 'live';
}

/** A phase in which the dish is cookable right now. */
export function isUsablePhase(phase: PrepPhase): boolean {
  return phase === 'live' || phase === 'expiring';
}

/**
 * The five fields prep reasoning needs from a dish.
 *
 * Declared rather than taking a whole `DishRow`, so the detail screen can pass the
 * `DishListItem` it already has instead of re-reading the row it was built from. Both
 * satisfy this structurally.
 */
export interface PrepDish {
  id: string;
  prepKind: string | null;
  primaryIngredient: string | null;
  prepLabel: string | null;
  prepLeadHours: number | null;
}

/**
 * The match key: the **pair**, never the kind alone (SPEC §5.2). One batter row covers
 * idli, dosa, uttapam and punugulu — all `batter` + `urad dal` — while correctly leaving
 * out pesarattu, which is soaked moong.
 *
 * `===` rather than SQL's NULL semantics: a prep row and a dish that both leave the
 * ingredient unset describe the same thing.
 */
export function matchesPrep(dish: PrepDish, row: PrepStateRow): boolean {
  return dish.prepKind === row.kind && dish.primaryIngredient === row.ingredient;
}

// ---------------------------------------------------------------------------
// One dish's prep, for the detail screen
// ---------------------------------------------------------------------------

export interface DishPrepStatus {
  dishId: string;
  kind: PrepKind;
  /** The dish's own wording — "soak overnight". Null falls back to the kind. */
  label: string | null;
  leadHours: number | null;
  phase: PrepPhase;
  /** The row this describes, so it can be thrown out. Null when nothing is going. */
  prepId: string | null;
  readyAt: Date | null;
  expiresAt: Date | null;
}

/** Live beats pending beats expired: the row that decides whether the dish is cookable. */
const PHASE_PRIORITY: Record<PrepPhase, number> = {
  live: 0,
  expiring: 0,
  pending: 1,
  expired: 2,
  none: 3,
};

/**
 * What is going for one dish, if anything.
 *
 * Null for a dish that needs no prep — most of the repertoire — so the detail screen can
 * omit the section entirely rather than render "no prep needed" under every dal.
 */
export function dishPrepStatus(
  dish: PrepDish,
  prepStates: readonly PrepStateRow[],
  now: Date,
): DishPrepStatus | null {
  const kind = asPrepKind(dish.prepKind);
  if (kind === null) return null;

  const base: DishPrepStatus = {
    dishId: dish.id,
    kind,
    label: dish.prepLabel,
    leadHours: dish.prepLeadHours,
    phase: 'none',
    prepId: null,
    readyAt: null,
    expiresAt: null,
  };

  let best: DishPrepStatus = base;
  for (const row of prepStates) {
    if (!matchesPrep(dish, row)) continue;
    const times = prepTimes(row);
    const phase = prepPhaseAt(times, now);
    const candidate: DishPrepStatus = { ...base, phase, prepId: row.id, ...times };

    if (PHASE_PRIORITY[phase] < PHASE_PRIORITY[best.phase]) best = candidate;
  }

  return best;
}

// ---------------------------------------------------------------------------
// Wording
// ---------------------------------------------------------------------------

function plural(count: number, noun: string): string {
  return count === 1 ? `1 ${noun}` : `${count} ${noun}s`;
}

/** Capitalised because it opens a sentence, and labels are user-written free text. */
function sentenceCase(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

/** "Batter is ready" — the banner headline and the notification title, one definition. */
export function prepHeadline(kind: PrepKind | null, label: string | null): string {
  const noun = label ?? (kind === null ? 'Prep' : PREP_KIND_NOUN[kind]);
  return `${sentenceCase(noun)} is ready`;
}

/** Two names, then a count. A banner that lists eight dishes stops being a banner. */
export function dishPhrase(names: readonly string[]): string {
  if (names.length === 0) return 'Nothing is waiting on it.';
  if (names.length === 1) return `${names[0]} is back in rotation.`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are back in rotation.`;
  const rest = names.length - 2;
  return `${names[0]}, ${names[1]} and ${rest} ${
    rest === 1 ? 'other' : 'others'
  } are back in rotation.`;
}

function clockPhrase(at: Date, now: Date): string {
  const days = differenceInCalendarDays(at, now);
  const time = format(at, 'h aaa');
  if (days <= 0) return `at ${time}`;
  if (days === 1) return `tomorrow at ${time}`;
  return `${format(at, 'EEEE')} at ${time}`;
}

/**
 * One line under the Prep heading on the dish detail screen.
 *
 * Says only what it can back up. An expired row reads exactly like no row at all, because
 * from the cook's point of view it is the same fact — there is nothing in the fridge — and
 * a screen that distinguished them would be reporting on the database rather than on the
 * kitchen.
 */
export function prepStatusLine(status: DishPrepStatus, now: Date): string {
  switch (status.phase) {
    case 'pending':
      return status.readyAt === null
        ? 'Started, and ready whenever you are.'
        : `Started — ready ${clockPhrase(status.readyAt, now)}.`;

    case 'live':
      return status.expiresAt === null
        ? 'Ready now.'
        : `Ready now, and good through ${format(status.expiresAt, 'EEEE')}.`;

    case 'expiring': {
      const hours = Math.max(
        1,
        Math.round(((status.expiresAt?.getTime() ?? 0) - now.getTime()) / MS_PER_HOUR),
      );
      return `Ready now — about ${plural(hours, 'hour')} left.`;
    }

    default:
      return PREP_KIND_IDLE[status.kind];
  }
}

// ---------------------------------------------------------------------------
// The notification plan
// ---------------------------------------------------------------------------

/** Identifier prefixes. The scheduler owns everything that starts with one of these. */
export const NUDGE_ID_PREFIX = 'prep-nudge';
export const READY_ID_PREFIX = 'prep-ready';

export interface PlannedNotification {
  /**
   * Stable for the same plan and *different* when the moment changes, so syncing is a set
   * difference rather than a comparison of contents.
   */
  id: string;
  fireAt: Date;
  title: string;
  body: string;
}

export interface PrepNudge extends PlannedNotification {
  dishId: string;
  dishName: string;
  kind: PrepKind;
  /** How overdue, so the cap keeps the reminders worth having. */
  ratio: number;
}

export interface PrepReadyAlert extends PlannedNotification {
  prepId: string;
}

export interface PrepPlan {
  nudges: PrepNudge[];
  readyAlerts: PrepReadyAlert[];
  /** Expired long enough ago to delete outright (SPEC §5.3). */
  prunablePrepIds: string[];
  /** What the cap dropped. Stated in dev tools rather than silently swallowed. */
  droppedNudges: number;
}

export interface PrepInputs {
  dishes: readonly DishRow[];
  dishSlots: readonly DishSlotRow[];
  cookEvents: readonly CookEventRow[];
  prepStates: readonly PrepStateRow[];
  /** When each dish was last scheduled a reminder, from the `prepNudgedAt` setting. */
  nudgedAt: ReadonlyMap<string, Date>;
}

function nudgeBody(dish: DishRow, daysSince: number): string {
  const since = `Last cooked ${plural(daysSince, 'day')} ago`;
  if (dish.prepLabel !== null && dish.prepLabel.trim() !== '') {
    return `${since}. ${sentenceCase(dish.prepLabel.trim())}.`;
  }
  const lead = dish.prepLeadHours;
  return lead === null
    ? `${since}. It needs prep before you can cook it.`
    : `${since}. It needs about ${plural(lead, 'hour')} of prep first.`;
}

/**
 * Everything the notification scheduler and the app-start prune need, from rows and a
 * clock the caller supplies.
 *
 * **Nudges are for overdue dishes only.** A dish you have never cooked is not something to
 * be reminded about at nine at night — the whole app is built on the user's own rhythm,
 * and a dish with no rhythm has made no claim to be missing. `stalenessState` decides,
 * which means a median of 0 and a median of null both read as "no rhythm" here exactly as
 * they do everywhere else.
 *
 * **And only when nothing is already going.** A live or pending row means the answer to
 * "should I start the soak" is no, whether or not the dish is overdue.
 */
export function buildPrepPlan(inputs: PrepInputs, now: Date): PrepPlan {
  const { dishes, dishSlots, cookEvents, prepStates, nudgedAt } = inputs;

  const slotsByDish = groupSlots(dishSlots);
  const eventsByDish = groupEvents(cookEvents, new Set(dishes.map((d) => d.id)));
  const live = dishes.filter((d) => !d.isArchived);

  const readyAlerts: PrepReadyAlert[] = [];
  const prunablePrepIds: string[] = [];

  for (const row of prepStates) {
    const times = prepTimes(row);
    const phase = prepPhaseAt(times, now);

    if (
      phase === 'expired' &&
      times.expiresAt !== null &&
      differenceInCalendarDays(now, times.expiresAt) >= PREP_PRUNE_AFTER_DAYS
    ) {
      prunablePrepIds.push(row.id);
      continue;
    }

    // A row that unlocks nothing raises no alert, for the same reason it raises no banner:
    // "Batter is ready" over an empty list is worse than silence (SPEC §5.2).
    if (phase !== 'pending' || times.readyAt === null) continue;
    const unlocks = live.filter((d) => matchesPrep(d, row));
    if (unlocks.length === 0) continue;

    readyAlerts.push({
      id: `${READY_ID_PREFIX}:${row.id}:${toLocalIso(times.readyAt)}`,
      prepId: row.id,
      fireAt: times.readyAt,
      title: prepHeadline(asPrepKind(row.kind), row.label),
      body: dishPhrase(unlocks.map((d) => d.name)),
    });
  }

  const candidates: PrepNudge[] = [];

  for (const dish of live) {
    const kind = asPrepKind(dish.prepKind);
    if (kind === null) continue;

    const status = dishPrepStatus(dish, prepStates, now);
    if (status !== null && (isUsablePhase(status.phase) || status.phase === 'pending')) {
      continue;
    }

    const history = summariseHistory(
      (eventsByDish.get(dish.id) ?? NO_EVENTS).history,
      now,
    );
    const ratio = staleness(history.daysSince, history.medianInterval);
    const state = stalenessState(history.medianInterval, ratio);
    if (state !== 'due' && state !== 'overdue') continue;

    const fireAt = prepNudgeTime(slotsByDish.get(dish.id) ?? [], dish.prepLeadHours, now);
    if (fireAt === null) continue;

    // Quiet for a few days after the last reminder, or an overdue dish that needs an
    // overnight soak would be brought up every single night until it was cooked (§20.3).
    //
    // The equality check is what makes the marker safe to write: scheduling a reminder
    // records the moment it will fire, and that write comes straight back through the live
    // query as new input. Without it the plan would drop the reminder it had just made,
    // and the next sync would cancel a notification that had never been shown.
    const last = nudgedAt.get(dish.id);
    if (
      last !== undefined &&
      last.getTime() !== fireAt.getTime() &&
      differenceInCalendarDays(fireAt, last) < PREP_NUDGE_COOLDOWN_DAYS
    ) {
      continue;
    }

    candidates.push({
      id: `${NUDGE_ID_PREFIX}:${dish.id}:${toLocalIso(fireAt)}`,
      dishId: dish.id,
      dishName: dish.name,
      kind,
      ratio,
      fireAt,
      title: `${PREP_KIND_ACTION[kind]} for ${dish.name}`,
      body: nudgeBody(dish, history.daysSince ?? 0),
    });
  }

  // Most overdue first, then by name so the cap is deterministic rather than dependent on
  // whatever order the dish table came back in.
  candidates.sort((a, b) =>
    a.ratio === b.ratio ? a.dishName.localeCompare(b.dishName) : b.ratio - a.ratio,
  );

  return {
    nudges: candidates.slice(0, MAX_PREP_NUDGES),
    readyAlerts,
    prunablePrepIds,
    droppedNudges: Math.max(0, candidates.length - MAX_PREP_NUDGES),
  };
}

/** Every notification the plan wants outstanding, in the shape the scheduler syncs. */
export function plannedNotifications(plan: PrepPlan): PlannedNotification[] {
  return [...plan.nudges, ...plan.readyAlerts];
}

/**
 * The `prepNudgedAt` map after a round of scheduling.
 *
 * Entries for dishes that are no longer nudgeable are dropped rather than kept forever:
 * the marker exists to space out reminders, and one for a dish that has since been deleted
 * is a row that can never be cleaned up by anything else.
 */
export function updateNudgedAt(
  previous: ReadonlyMap<string, Date>,
  /** Only the two fields this reads. The rest of a `PrepNudge` is the scheduler's. */
  nudges: readonly Pick<PrepNudge, 'dishId' | 'fireAt'>[],
  knownDishIds: ReadonlySet<string>,
  now: Date,
): Map<string, Date> {
  const next = new Map<string, Date>();

  for (const [dishId, at] of previous) {
    if (!knownDishIds.has(dishId)) continue;
    if (differenceInCalendarDays(now, at) > PREP_NUDGE_COOLDOWN_DAYS) continue;
    next.set(dishId, at);
  }
  for (const nudge of nudges) next.set(nudge.dishId, nudge.fireAt);

  return next;
}
