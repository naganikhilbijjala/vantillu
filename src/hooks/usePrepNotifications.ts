import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useEffect, useMemo, useRef } from 'react';
import {
  buildPrepPlan,
  NUDGE_ID_PREFIX,
  type PrepPlan,
  plannedNotifications,
  READY_ID_PREFIX,
  updateNudgedAt,
} from '../db/prepModel';
import { prunePrepStates } from '../db/queries/prep';
import { setPrepNudgedAt, settingsQuery } from '../db/queries/settings';
import {
  cookEventsQuery,
  dishesQuery,
  dishSlotsQuery,
  prepStatesQuery,
} from '../db/queries/tables';
import { parsePrepNudgedAt, SETTING_KEYS, toSettingMap } from '../db/settings';
import {
  permissionSnapshot,
  refreshPermission,
  syncScheduled,
} from '../notifications/client';
import { useNotificationPermission } from './useNotificationPermission';
import { useNow } from './useNow';

/**
 * Keeps the notifications the OS is holding in step with the database (`docs/SPEC.md` §20).
 *
 * The same shape as every other screen model in this app — whole-table live reads, a
 * ticking `now`, and one pure function turning both into what should be true — except that
 * what should be true lives outside the app rather than on a screen. So this adds the one
 * thing a render does not need: a **diff**, keyed on the plan's identifiers, so opening the
 * app does not cancel and re-add a reminder that was about to fire.
 *
 * It runs from the root layout rather than from a screen. A reminder about tomorrow's
 * breakfast must not depend on which tab happened to be mounted when the app was closed.
 */

/** Only identifiers the planner minted may ever be cancelled by the sync. */
const OWNED_PREFIXES = [NUDGE_ID_PREFIX, READY_ID_PREFIX] as const;

export interface PrepNotificationsModel {
  plan: PrepPlan;
  /** Null until the permission has been looked at. */
  granted: boolean | null;
}

interface PrepPlanModel extends PrepNotificationsModel {
  /** Every dish still in the repertoire, so dead cooldown markers can be dropped. */
  dishIds: Set<string>;
  /** The markers the plan was built against, so the write extends them rather than a reread. */
  nudgedAt: ReadonlyMap<string, Date>;
}

/**
 * The plan alone, with no side effects.
 *
 * Split out so dev tools can *read* what is scheduled without becoming a second scheduler:
 * two mounted copies of the effects below would both sync and both write the marker, and
 * whichever lost the race would be working from a plan the other had already changed.
 */
export function usePrepPlan(): PrepPlanModel {
  const now = useNow();
  const granted = useNotificationPermission();

  const dishes = useLiveQuery(dishesQuery());
  const dishSlots = useLiveQuery(dishSlotsQuery());
  const cookEvents = useLiveQuery(cookEventsQuery());
  const prepStates = useLiveQuery(prepStatesQuery());
  const settings = useLiveQuery(settingsQuery());

  const nudgedAt = useMemo(
    () =>
      parsePrepNudgedAt(toSettingMap(settings.data ?? []).get(SETTING_KEYS.prepNudgedAt)),
    [settings.data],
  );
  const dishIds = useMemo(
    () => new Set((dishes.data ?? []).map((d) => d.id)),
    [dishes.data],
  );

  const plan = useMemo(
    () =>
      buildPrepPlan(
        {
          dishes: dishes.data ?? [],
          dishSlots: dishSlots.data ?? [],
          cookEvents: cookEvents.data ?? [],
          prepStates: prepStates.data ?? [],
          nudgedAt,
        },
        now,
      ),
    [dishes.data, dishSlots.data, cookEvents.data, prepStates.data, nudgedAt, now],
  );

  // Read once on mount rather than prompting: the request itself belongs to a tap (§20.5).
  useEffect(() => {
    if (permissionSnapshot() === null) void refreshPermission();
  }, []);

  return { plan, granted, dishIds, nudgedAt };
}

/**
 * The plan, kept true of the OS.
 *
 * Mounted exactly once, from the root layout. Everything below is a side effect of the
 * plan changing, which is why it is separate from building it.
 */
export function usePrepNotifications(): PrepNotificationsModel {
  const { plan, granted, dishIds, nudgedAt } = usePrepPlan();

  /**
   * Expired rows, once they are a month old (§5.3). Once per app run, not once per tick —
   * the set only grows with the passage of days, and a delete on every clock tick would
   * write to a table five live queries are subscribed to.
   */
  const pruned = useRef(false);
  useEffect(() => {
    if (pruned.current || plan.prunablePrepIds.length === 0) return;
    pruned.current = true;
    prunePrepStates(plan.prunablePrepIds);
  }, [plan.prunablePrepIds]);

  /**
   * The sync itself, guarded by a signature.
   *
   * `plan` is a fresh object every minute because `now` ticks, and the notification set it
   * describes changes far more rarely — so the identifiers, which already encode both what
   * fires and when, are what decides whether there is anything to do.
   */
  const syncedSignature = useRef<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the signature is the trigger
  useEffect(() => {
    if (granted !== true) return;

    const wanted = plannedNotifications(plan);
    const signature = wanted
      .map((item) => item.id)
      .sort()
      .join('|');
    if (signature === syncedSignature.current) return;
    syncedSignature.current = signature;

    void (async () => {
      await syncScheduled(wanted, OWNED_PREFIXES, new Date());
      if (plan.nudges.length === 0) return;
      // Written only after the reminders exist, so a failed schedule cannot silence a dish
      // for three days on the strength of a notification that was never posted.
      setPrepNudgedAt(updateNudgedAt(nudgedAt, plan.nudges, dishIds, new Date()));
    })();
  }, [plan, granted]);

  return { plan, granted };
}
