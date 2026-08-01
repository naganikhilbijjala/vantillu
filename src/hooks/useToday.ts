import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useCallback, useMemo } from 'react';
import {
  buildSuggestions,
  groupHeldBack,
  type HeldBackGroup,
  type RankedCandidate,
} from '../core/scoring';
import { localDateKey } from '../core/slots';
import { roleConfigQuery } from '../db/queries/roles';
import { settingsQuery, setVegOnlyToday } from '../db/queries/settings';
import {
  cookEventsQuery,
  dishesQuery,
  dishSlotsQuery,
  prepStatesQuery,
} from '../db/queries/tables';
import { toSettingMap } from '../db/settings';
import { buildTodayModel, type DishDisplay, type LivePrep } from '../db/todayModel';
import { useNow } from './useNow';
import { type SlotSelection, useSlotSelection } from './useSlotSelection';

/**
 * Everything the Today screen renders, in one hook.
 *
 * Six live queries rather than one join. Each is subscribed once and re-runs on any write
 * to its table, and none of them mentions the clock — the time-dependent work happens in
 * `buildTodayModel`, keyed on the ticking `now`. Assembling in JavaScript also keeps the
 * interval maths in `src/core/`, where it is unit tested, instead of pushing a median into
 * SQL where it would not be.
 */

export interface TodayScreenModel extends SlotSelection {
  now: Date;
  /** Ranked and jittered, longest list first — the screen slices it. */
  suggestions: RankedCandidate[];
  heldBack: HeldBackGroup[];
  livePrep: LivePrep[];
  display: ReadonlyMap<string, DishDisplay>;
  isWeekend: boolean;
  /** True whether it comes from the weekday set or from today's override. */
  isVegOnlyDay: boolean;
  /** True only for today's override — the one thing the toggle can change. */
  vegOnlyOverride: boolean;
  toggleVegOnlyToday: () => void;
  /** The repertoire size, so an empty database reads as empty rather than as no matches. */
  dishCount: number;
  /**
   * False until the first read lands. `useLiveQuery` starts every query at `[]` and fills
   * it in asynchronously, so without this the screen renders "no dishes yet" for a frame
   * on every cold start.
   */
  isReady: boolean;
  error: Error | undefined;
}

export function useToday(): TodayScreenModel {
  const now = useNow();
  const selection = useSlotSelection(now);

  const dishes = useLiveQuery(dishesQuery());
  const dishSlots = useLiveQuery(dishSlotsQuery());
  const roles = useLiveQuery(roleConfigQuery());
  const cookEvents = useLiveQuery(cookEventsQuery());
  const prepStates = useLiveQuery(prepStatesQuery());
  const settings = useLiveQuery(settingsQuery());

  const model = useMemo(
    () =>
      buildTodayModel(
        {
          dishes: dishes.data ?? [],
          dishSlots: dishSlots.data ?? [],
          roles: roles.data ?? [],
          cookEvents: cookEvents.data ?? [],
          prepStates: prepStates.data ?? [],
          settings: toSettingMap(settings.data ?? []),
        },
        now,
        selection.slot,
      ),
    [
      dishes.data,
      dishSlots.data,
      roles.data,
      cookEvents.data,
      prepStates.data,
      settings.data,
      now,
      selection.slot,
    ],
  );

  // Jitter is seeded from the local day, so the order is stable across every re-render
  // and every backgrounding, and only reshuffles tomorrow (SPEC §4.5).
  const { suggestions, heldBack } = useMemo(
    () => buildSuggestions(model.candidates, model.ctx, localDateKey(now)),
    [model, now],
  );

  const heldBackGroups = useMemo(() => groupHeldBack(heldBack), [heldBack]);

  const toggleVegOnlyToday = useCallback(() => {
    setVegOnlyToday(!model.vegOnlyOverride, new Date());
  }, [model.vegOnlyOverride]);

  return {
    ...selection,
    now,
    suggestions,
    heldBack: heldBackGroups,
    livePrep: model.livePrep,
    display: model.display,
    isWeekend: model.ctx.isWeekend,
    isVegOnlyDay: model.ctx.isVegOnlyDay,
    vegOnlyOverride: model.vegOnlyOverride,
    toggleVegOnlyToday,
    dishCount: model.candidates.length,
    // The dish read is the slowest and the one every other table is joined against, so it
    // is the honest gate. The rest land in the same tick.
    isReady: dishes.updatedAt !== undefined,
    error:
      dishes.error ??
      dishSlots.error ??
      roles.error ??
      cookEvents.error ??
      prepStates.error ??
      settings.error,
  };
}
