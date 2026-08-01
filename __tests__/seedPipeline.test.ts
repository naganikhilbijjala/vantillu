import { describe, expect, it } from 'vitest';
import { buildSuggestions } from '../src/core/scoring';
import { localDateKey } from '../src/core/slots';
import type { Slot } from '../src/core/types';
import { type LogCookInput, toCookEventRow } from '../src/db/cookModel';
import {
  ALL_ROLES,
  buildDishList,
  filterDishes,
  sortByStaleness,
  usedRoles,
} from '../src/db/dishesModel';
import { groupCatalogByRole, selectedEntries } from '../src/db/onboardingModel';
import { DEFAULT_ROLES } from '../src/db/roles';
import type { CookEventRow, DishRow, DishSlotRow, PrepStateRow } from '../src/db/rows';
import { SEED_CATALOG, toDishRow, toDishSlotRows } from '../src/db/seedCatalog';
import { toSettingMap } from '../src/db/settings';
import { toLocalIso } from '../src/db/time';
import { buildTodayModel } from '../src/db/todayModel';
import { day } from './fixtures';

/**
 * The whole Today pipeline, end to end, against the real `assets/seed_dishes.json`.
 *
 * The unit tests either side of this one check the seam and the engine in isolation with
 * hand-built rows. This one exists because the two can each be right while the *data* has
 * drifted — a seed role renamed, a prep pair that no longer matches — and the only symptom
 * would be a Today screen that quietly suggests the wrong things.
 *
 * It calls the **real** mapper. Until Phase 8 it could not: the mapping lived in
 * `src/db/seed.ts` next to a `db` import, so this file kept a hand-copied duplicate of it —
 * which is to say the one test whose job is to catch drift was itself a second copy that
 * could drift. `seedCatalog.ts` is pure precisely so that is no longer true.
 */

const SEED = SEED_CATALOG;
const SEEDED_AT = '2026-07-27T09:00:00';

const dishes: DishRow[] = SEED.map((entry, index) =>
  toDishRow(entry, `seed-${index}`, SEEDED_AT),
);
const dishSlots: DishSlotRow[] = SEED.flatMap((entry, index) =>
  toDishSlotRows(entry, `seed-${index}`, SEEDED_AT),
);

const roles = DEFAULT_ROLES.map((role, sortOrder) => ({ ...role, sortOrder }));

/** Monday 27 July 2026 — weekday, monsoon. */
const MONDAY = day(2026, 7, 27, 12);

function today(slot: Slot, now = MONDAY, prepStates: PrepStateRow[] = []) {
  return todayWith([], slot, now, prepStates);
}

function todayWith(
  cookEvents: readonly CookEventRow[],
  slot: Slot,
  now = MONDAY,
  prepStates: PrepStateRow[] = [],
) {
  const model = buildTodayModel(
    { dishes, dishSlots, roles, cookEvents, prepStates, settings: toSettingMap([]) },
    now,
    slot,
  );
  const { suggestions, heldBack } = buildSuggestions(
    model.candidates,
    model.ctx,
    localDateKey(now),
  );
  return { model, suggestions, heldBack };
}

const ALWAYS_AVAILABLE_ROLES = DEFAULT_ROLES.filter((r) => r.isAlwaysAvailable).map(
  (r) => r.role,
);

// ---------------------------------------------------------------------------

describe('the seeded repertoire', () => {
  it('gives every dish a unique key for the onboarding picker to tick', () => {
    // The picker's selection is a set of these. Two dishes sharing one would tick and
    // untick together, and the collision would be invisible until someone noticed a dish
    // they never picked in their repertoire.
    expect(new Set(SEED.map((entry) => entry.key)).size).toBe(SEED.length);
  });

  it('maps cleanly — every seed row lands as a candidate with at least one slot', () => {
    const { model } = today('lunch');
    expect(model.candidates).toHaveLength(SEED.length);
    expect(model.candidates.every((c) => c.slots.length > 0)).toBe(true);
    // Every seeded role has a `role_config` row, or the always-available flag is dead.
    const known = new Set(roles.map((r) => r.role));
    expect(model.candidates.filter((c) => !known.has(c.role))).toEqual([]);
  });

  it('never suggests a podi or an accompaniment, in any slot', () => {
    const always = new Set(ALWAYS_AVAILABLE_ROLES);
    expect(always.size).toBe(2);
    // The seed has to actually contain some, or this test proves nothing.
    expect(dishes.filter((d) => always.has(d.role)).length).toBeGreaterThan(0);

    for (const slot of ['breakfast', 'lunch', 'dinner', 'snack'] as const) {
      const { suggestions, heldBack } = today(slot);
      expect(suggestions.filter((s) => always.has(s.candidate.role))).toEqual([]);
      // Silently, too: never suggested *and* never explained away (SPEC §4.1), because
      // listing every podi under "held back" every day would be pure noise.
      expect(heldBack.filter((h) => always.has(h.candidate.role))).toEqual([]);
    }
  });

  it('answers a different question at breakfast, lunch and dinner', () => {
    // The acceptance criterion for this phase: moving the clock moves the suggestions.
    const names = (slot: Slot) =>
      new Set(today(slot).suggestions.map((s) => s.candidate.name));

    const breakfast = names('breakfast');
    const lunch = names('lunch');
    const dinner = names('dinner');

    expect(breakfast.size).toBeGreaterThan(0);
    expect(breakfast).not.toEqual(lunch);
    expect(lunch).not.toEqual(dinner);
    // Tiffin is valid at both ends of the day, so the two must overlap rather than be
    // disjoint — that overlap is the reason `dish_slot` is many-to-many.
    expect([...breakfast].some((name) => dinner.has(name))).toBe(true);
  });

  it('caps a snack at medium effort and says which dishes that held back', () => {
    const { suggestions, heldBack } = today('snack');
    expect(suggestions.every((s) => s.candidate.effort !== 'project')).toBe(true);
    expect(heldBack.some((h) => h.reason === 'over_effort_budget')).toBe(true);
  });

  it('hard-excludes every prep dish while nothing is soaking or fermenting', () => {
    const { suggestions, heldBack } = today('breakfast');
    expect(suggestions.every((s) => s.candidate.prepKind === null)).toBe(true);
    expect(heldBack.some((h) => h.reason === 'prep_not_ready')).toBe(true);
    // The prose needs a label to name the prep with.
    const prep = heldBack.filter((h) => h.reason === 'prep_not_ready');
    expect(prep.every((h) => h.candidate.prepLabel !== null)).toBe(true);
  });
});

describe('a live batter, against the real seed', () => {
  const batter: PrepStateRow = {
    id: 'prep-1',
    kind: 'batter',
    ingredient: 'urad dal',
    label: 'Urad dal batter',
    readyAt: toLocalIso(day(2026, 7, 26, 20)),
    expiresAt: toLocalIso(day(2026, 7, 29, 20)),
  };

  it('unlocks exactly the urad-dal batter dishes and leaves pesarattu out', () => {
    // SPEC §5.2's worked example, checked against the data rather than against a fixture.
    const { model } = today('breakfast', MONDAY, [batter]);
    expect(model.livePrep).toHaveLength(1);
    expect([...model.livePrep[0].dishNames].sort()).toEqual([
      'Dosa',
      'Idli',
      'Punugulu',
      'Uttapam',
    ]);
    expect(model.livePrep[0].dishNames).not.toContain('Pesarattu');
  });

  it('puts those dishes back in the running with a reason chip that says why', () => {
    const before = today('breakfast').suggestions.length;
    const { suggestions } = today('breakfast', MONDAY, [batter]);

    expect(suggestions.length).toBeGreaterThan(before);
    const idli = suggestions.find((s) => s.candidate.name === 'Idli');
    expect(idli).toBeDefined();
    expect(idli?.reasons.map((r) => r.kind)).toContain('prep_ready');
    // Every suggestion states a reason, or it gets ignored (SPEC §4.6).
    expect(suggestions.every((s) => s.reasons.length > 0)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The other half of the same data: the repertoire list (Phase 5)
// ---------------------------------------------------------------------------

function repertoire(cookEvents: never[] = []) {
  return sortByStaleness(buildDishList({ dishes, dishSlots, roles, cookEvents }, MONDAY));
}

describe('the repertoire list, against the real seed', () => {
  it('shows every seeded dish, including the ones Today will never suggest', () => {
    const items = repertoire();
    expect(items).toHaveLength(SEED.length);

    // A podi is a dish you own. It is excluded from *suggestions*, not from the list.
    const always = new Set(ALWAYS_AVAILABLE_ROLES);
    expect(items.filter((i) => always.has(i.role)).length).toBeGreaterThan(0);
  });

  it('sinks the always-available dishes to the bottom, in one block', () => {
    const items = repertoire();
    const always = new Set(ALWAYS_AVAILABLE_ROLES);
    const firstAlways = items.findIndex((i) => always.has(i.role));
    const lastNormal = items.findLastIndex((i) => !always.has(i.role));

    expect(firstAlways).toBeGreaterThan(-1);
    expect(firstAlways).toBeGreaterThan(lastNormal);
  });

  it('carries a role label for every dish, taken from role_config', () => {
    const byRole = new Map(roles.map((r) => [r.role, r.label]));
    for (const item of repertoire()) {
      expect(item.roleLabel).toBe(byRole.get(item.role));
      // Never the raw role string, which is what a missing config row would leave behind.
      expect(item.roleLabel).not.toBe(item.role);
    }
  });

  it('offers a role filter for every role, and each one returns something', () => {
    const items = repertoire();
    const offered = usedRoles(items, roles);

    // The seed uses all eleven, so a missing one means the seed or the defaults moved.
    expect(offered).toHaveLength(DEFAULT_ROLES.length);
    for (const role of offered) {
      const filtered = filterDishes(items, { role: role.role, search: '' });
      expect(filtered.length).toBeGreaterThan(0);
      expect(filtered.every((i) => i.role === role.role)).toBe(true);
    }
  });

  it('finds a dish by its regional name and by its ingredient', () => {
    const items = repertoire();
    const find = (search: string) =>
      filterDishes(items, { role: ALL_ROLES, search }).map((i) => i.name);

    // Pesarattu is seeded with `local_name: "Pesarattu"` and the name "Pesarattu"; the
    // interesting case is a dish whose alt name differs from its name.
    expect(find('bangaladumpa')).toContain('Aloo fry');
    expect(find('brinjal').length).toBeGreaterThan(1);
    expect(find('zzzz')).toEqual([]);
  });

  it('reads as all-new before any history exists, in name order', () => {
    // The state onboarding leaves behind when nobody fills in an estimate: nothing cooked,
    // so nothing has a rhythm and the name tiebreak is the entire order.
    const items = repertoire();
    const normal = items.filter((i) => !i.isAlwaysAvailable);

    expect(normal.every((i) => i.stalenessState === 'new')).toBe(true);
    expect(normal.every((i) => i.cookCount === 0 && i.daysSince === null)).toBe(true);

    const names = normal.map((i) => i.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});

// ---------------------------------------------------------------------------
// The write/read round trip (Phase 6)
// ---------------------------------------------------------------------------

/**
 * `toCookEventRow` writes and the two screen models read. Nothing type-checks that pairing
 * end to end — `NewCookEventRow` is a structural superset of `CookEventRow`, so a wrong
 * `cookedAt` format would compile and simply never parse. These run a real log through both
 * readers, which is the closest thing to the phase's acceptance criterion that does not
 * need a device: `useLiveQuery` supplies the *liveness*, this supplies the correctness.
 */
describe('logging a cook, read back', () => {
  const EVENING = new Date(2026, 6, 27, 20, 14, 30);

  /** Sambar — seeded, valid at every slot, so it survives any filter below. */
  const sambar = dishes.find((d) => d.name === 'Sambar');

  function logged(overrides: Partial<LogCookInput> = {}, at = EVENING) {
    if (sambar === undefined) throw new Error('Sambar is missing from the seed');
    return toCookEventRow(
      {
        dishId: sambar.id,
        slot: 'dinner',
        rating: null,
        tweakNote: null,
        isBatch: false,
        mealId: null,
        ...overrides,
      },
      'event-1',
      at,
    );
  }

  it('moves the dish to zero days since, cooked once', () => {
    const event = logged();
    const items = buildDishList(
      { dishes, dishSlots, roles, cookEvents: [event] },
      EVENING,
    );
    const item = items.find((i) => i.id === sambar?.id);

    expect(item?.cookCount).toBe(1);
    expect(item?.daysSince).toBe(0);
    // One cook is not a rhythm, so the gauge stays hollow rather than inventing one.
    expect(item?.medianInterval).toBeNull();
    expect(item?.stalenessState).toBe('new');
  });

  it('is still today tomorrow morning — one calendar day, not 24 hours', () => {
    // Logged at 20:14, read at 07:00 the next day: 10.75 elapsed hours, but a day boundary
    // was crossed, so it reads as 1 (SPEC §2.1).
    const items = buildDishList(
      { dishes, dishSlots, roles, cookEvents: [logged()] },
      new Date(2026, 6, 28, 7, 0),
    );
    expect(items.find((i) => i.id === sambar?.id)?.daysSince).toBe(1);
  });

  it('reaches the suggestion engine as a recent ingredient', () => {
    // Sambar is toor dal. Logging it should sink every other toor dal dish by −4.0, which
    // is the loop closing: a write changes what Today suggests.
    const { model } = todayWith([logged()], 'lunch');
    expect(model.ctx.recentIngredients).toContain('toor dal');
  });

  it('makes a batch cook fill its role', () => {
    const plain = todayWith([logged()], 'lunch');
    expect(plain.model.ctx.rolesFilledByBatch).toEqual([]);

    const batched = todayWith([logged({ isBatch: true })], 'lunch');
    expect(batched.model.ctx.rolesFilledByBatch).toContain(sambar?.role);
  });

  it('keeps a rating out of the history when none was given', () => {
    const items = buildDishList(
      { dishes, dishSlots, roles, cookEvents: [logged()] },
      EVENING,
    );
    expect(items.find((i) => i.id === sambar?.id)?.lastRating).toBeNull();

    const rated = buildDishList(
      { dishes, dishSlots, roles, cookEvents: [logged({ rating: 1 })] },
      EVENING,
    );
    expect(rated.find((i) => i.id === sambar?.id)?.lastRating).toBe(1);
  });

  it('groups a meal under one id without disturbing either dish', () => {
    const meal = 'meal-1';
    const rice = dishes.find((d) => d.name === 'Plain rice');
    if (rice === undefined) throw new Error('Plain rice is missing from the seed');

    const events = [
      logged({ mealId: meal }),
      toCookEventRow(
        {
          dishId: rice.id,
          slot: 'dinner',
          rating: null,
          tweakNote: null,
          isBatch: false,
          mealId: meal,
        },
        'event-2',
        EVENING,
      ),
    ];

    expect(new Set(events.map((e) => e.mealId))).toEqual(new Set([meal]));

    const items = buildDishList(
      { dishes, dishSlots, roles, cookEvents: events },
      EVENING,
    );
    expect(items.find((i) => i.id === sambar?.id)?.cookCount).toBe(1);
    expect(items.find((i) => i.id === rice.id)?.cookCount).toBe(1);

    // And the rice staple boost fires, which is the whole reason `staple` is its own role.
    const { model } = todayWith(events, 'dinner');
    expect(model.ctx.hadRiceStapleInLast24h).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Onboarding (Phase 8)
// ---------------------------------------------------------------------------

/**
 * Onboarding explains the app and then offers the seed as an optional shortcut. What a test
 * can hold of that is the shortcut: whatever comes out of the picker has to arrive at the
 * same two screen models as everything else, and nothing outside it may.
 */
function onboarded(keys: readonly string[], now = MONDAY) {
  const entries = selectedEntries(SEED_CATALOG, new Set(keys));
  const at = toLocalIso(now);

  const pickedDishes: DishRow[] = [];
  const pickedSlots: DishSlotRow[] = [];

  entries.forEach((entry, index) => {
    const id = `picked-${index}`;
    pickedDishes.push(toDishRow(entry, id, at));
    pickedSlots.push(...toDishSlotRows(entry, id, at));
  });

  return { entries, dishes: pickedDishes, dishSlots: pickedSlots };
}

describe('onboarding, from an empty database', () => {
  it('groups the whole catalogue under role_config labels, in role_config order', () => {
    const sections = groupCatalogByRole(SEED_CATALOG, roles);

    expect(sections.flatMap((s) => s.entries)).toHaveLength(SEED.length);
    expect(sections.map((s) => s.label)).toEqual(roles.map((r) => r.label));
    // Never the raw role string: a renamed role has to show its new name here too.
    expect(sections.every((s) => s.label !== s.role)).toBe(true);
  });

  it('takes nothing from the starter list unless it was ticked', () => {
    // The seed is a suggestion list, not the repertoire (SPEC §18.1). Skipping the step
    // has to leave a genuinely empty app, or the app has decided what you cook for you.
    expect(onboarded([]).dishes).toEqual([]);

    const one = onboarded(['Bobbatlu']);
    expect(one.dishes.map((d) => d.name)).toEqual(['Bobbatlu']);
    expect(one.dishSlots.length).toBeGreaterThan(0);
  });

  it('builds a repertoire of exactly what was picked, and suggests only from it', () => {
    const picked = ['Plain rice', 'Tomato pappu', 'Sambar', 'Gongura pachadi'];
    const { dishes: mine, dishSlots: mySlots } = onboarded(picked);

    const items = buildDishList(
      { dishes: mine, dishSlots: mySlots, roles, cookEvents: [] },
      MONDAY,
    );
    expect(items.map((i) => i.name).sort()).toEqual([...picked].sort());

    const model = buildTodayModel(
      {
        dishes: mine,
        dishSlots: mySlots,
        roles,
        cookEvents: [],
        prepStates: [],
        settings: toSettingMap([]),
      },
      MONDAY,
      'lunch',
    );
    const { suggestions } = buildSuggestions(
      model.candidates,
      model.ctx,
      localDateKey(MONDAY),
    );

    expect(suggestions.length).toBeGreaterThan(0);
    // The point of the picker: nothing the user did not tick can ever be offered.
    expect(suggestions.every((s) => picked.includes(s.candidate.name))).toBe(true);
    // Still every suggestion states a reason, on day one with no history (SPEC §4.6).
    expect(suggestions.every((s) => s.reasons.length > 0)).toBe(true);
  });

  it('writes no history at all, so every dish reads as never cooked', () => {
    // Onboarding used to collect a last-cooked bucket per dish and write `isEstimated`
    // events from it. It does not any more (SPEC §18.3) — the app starts out knowing
    // nothing about your cooking and says so, which is the truth.
    const { dishes: mine, dishSlots: mySlots } = onboarded(['Sambar', 'Plain rice']);
    const items = buildDishList(
      { dishes: mine, dishSlots: mySlots, roles, cookEvents: [] },
      MONDAY,
    );

    expect(items.every((i) => i.cookCount === 0)).toBe(true);
    expect(items.every((i) => i.daysSince === null)).toBe(true);
    expect(items.every((i) => i.medianInterval === null)).toBe(true);
    expect(items.every((i) => i.stalenessState === 'new')).toBe(true);
  });

  it('still excludes an estimated event from the median if one ever arrives', () => {
    // Nothing writes these now, but the column and the rule stay: a Phase 10 import can
    // carry them, and the exclusion is what stops a guess setting a dish's rhythm (SPEC §3).
    const { dishes: mine, dishSlots: mySlots } = onboarded(['Sambar']);
    const id = mine[0].id;

    const estimated: CookEventRow[] = [60, 21, 3].map((daysAgo) => ({
      dishId: id,
      cookedAt: toLocalIso(day(2026, 7, 27 - daysAgo, 20)),
      rating: null,
      isBatch: false,
      isEstimated: true,
    }));
    const real = estimated.map((event) => ({ ...event, isEstimated: false }));

    const median = (cookEvents: CookEventRow[]) =>
      buildDishList({ dishes: mine, dishSlots: mySlots, roles, cookEvents }, MONDAY)[0]
        .medianInterval;

    expect(median(estimated)).toBeNull();
    expect(median(real)).not.toBeNull();
  });
});
