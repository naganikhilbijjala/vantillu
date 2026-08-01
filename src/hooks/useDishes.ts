import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useMemo } from 'react';
import { buildCookTimeline, type CookTimelineEntry } from '../db/cookModel';
import {
  buildDishList,
  type DishListItem,
  sortByStaleness,
  usedRoles,
} from '../db/dishesModel';
import { roleConfigQuery } from '../db/queries/roles';
import {
  cookEventsForDishQuery,
  cookEventsQuery,
  dishesQuery,
  dishSlotsQuery,
} from '../db/queries/tables';
import type { RoleConfigRow } from '../db/roles';
import { useNow } from './useNow';

/**
 * The repertoire, staleness-sorted and live.
 *
 * Same four table reads the Today screen uses, from `queries/tables.ts` — the dishes list
 * is a different *question* about the same rows, not a different query. Filtering and
 * search are deliberately **not** in here: they are screen state, and keeping them in the
 * screen is what lets the list survive a round trip to the detail screen and back.
 */

export interface DishesScreenModel {
  now: Date;
  /** Most overdue first, then dishes with no rhythm, then always-available ones. */
  dishes: DishListItem[];
  /** Only roles some surviving dish actually uses, in `role_config` order. */
  roles: RoleConfigRow[];
  recipeCount: number;
  isReady: boolean;
  error: Error | undefined;
}

export function useDishes(): DishesScreenModel {
  const now = useNow();

  const dishRows = useLiveQuery(dishesQuery());
  const slotRows = useLiveQuery(dishSlotsQuery());
  const roleRows = useLiveQuery(roleConfigQuery());
  const eventRows = useLiveQuery(cookEventsQuery());

  const dishes = useMemo(
    () =>
      sortByStaleness(
        buildDishList(
          {
            dishes: dishRows.data ?? [],
            dishSlots: slotRows.data ?? [],
            roles: roleRows.data ?? [],
            cookEvents: eventRows.data ?? [],
          },
          now,
        ),
      ),
    [dishRows.data, slotRows.data, roleRows.data, eventRows.data, now],
  );

  return {
    now,
    dishes,
    roles: useMemo(() => usedRoles(dishes, roleRows.data ?? []), [dishes, roleRows.data]),
    recipeCount: useMemo(() => dishes.filter((d) => d.hasRecipe).length, [dishes]),
    isReady: dishRows.updatedAt !== undefined,
    error: dishRows.error ?? slotRows.error ?? roleRows.error ?? eventRows.error,
  };
}

export interface DishDetailModel {
  now: Date;
  dish: DishListItem | undefined;
  /** Newest cook first. Every cook, not only the annotated ones. */
  timeline: CookTimelineEntry[];
  isReady: boolean;
  error: Error | undefined;
}

/**
 * One dish, from the same live reads.
 *
 * Reading the whole repertoire to show one row of it looks wasteful and is not: sixty rows
 * is nothing, `useLiveQuery` subscribes per table rather than per row anyway, and it means
 * the detail screen's gauge and stats update the moment a cook is logged — which is what
 * Phase 6 has to be true.
 */
export function useDish(id: string | undefined): DishDetailModel {
  const { now, dishes, isReady, error } = useDishes();

  // Deps carry the id, or this stays pinned to whichever dish was opened first. The empty
  // string is never a real UUID, so the query is harmless while the param resolves.
  const events = useLiveQuery(cookEventsForDishQuery(id ?? ''), [id]);

  return {
    now,
    dish: useMemo(
      () => (id === undefined ? undefined : dishes.find((d) => d.id === id)),
      [dishes, id],
    ),
    timeline: useMemo(
      () => buildCookTimeline(events.data ?? [], now),
      [events.data, now],
    ),
    isReady,
    error: error ?? events.error,
  };
}
