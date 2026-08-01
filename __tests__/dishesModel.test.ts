import { describe, expect, it } from 'vitest';
import {
  ALL_ROLES,
  buildDishList,
  type DishesInputs,
  type DishListItem,
  filterDishes,
  matchesSearch,
  patternSummary,
  sortByStaleness,
  usedRoles,
} from '../src/db/dishesModel';
import type { RoleConfigRow } from '../src/db/roles';
import type { CookEventRow, DishRow } from '../src/db/rows';
import { toLocalIso } from '../src/db/time';
import { day } from './fixtures';

/**
 * `src/db/dishesModel.ts` — the repertoire list and the detail screen's pattern line.
 * Same deal as `todayModel`: no `db`, no clock, so the sort order and the search are
 * assertions rather than something to squint at on a phone.
 */

const NOW = day(2026, 7, 27, 12);

function dishRow(overrides: Partial<DishRow> = {}): DishRow {
  return {
    id: 'dish-1',
    name: 'Muddha pappu',
    altName: null,
    role: 'dal',
    primaryIngredient: 'toor dal',
    effort: 'quick',
    minutes: 20,
    isVeg: true,
    prepKind: null,
    prepLabel: null,
    usesLeftoverRice: false,
    season: null,
    ingredientsText: null,
    methodText: null,
    isArchived: false,
    createdAt: '2026-01-01T00:00:00',
    ...overrides,
  };
}

const ROLES: RoleConfigRow[] = [
  { role: 'dal', label: 'Dal', isAlwaysAvailable: false, sortOrder: 0 },
  { role: 'tiffin', label: 'Tiffin', isAlwaysAvailable: false, sortOrder: 1 },
  { role: 'gravy', label: 'Gravy', isAlwaysAvailable: false, sortOrder: 2 },
  { role: 'podi', label: 'Podi', isAlwaysAvailable: true, sortOrder: 3 },
];

/** Cooks on the given calendar days before `NOW`, newest first. */
function cooksAgo(dishId: string, ...daysAgo: number[]): CookEventRow[] {
  return daysAgo.map((n) => ({
    dishId,
    cookedAt: toLocalIso(day(2026, 7, 27 - n, 12)),
    rating: null,
    isBatch: false,
    isEstimated: false,
  }));
}

function build(overrides: Partial<DishesInputs> = {}, now = NOW): DishListItem[] {
  return buildDishList(
    { dishes: [dishRow()], dishSlots: [], roles: ROLES, cookEvents: [], ...overrides },
    now,
  );
}

function one(overrides: Partial<DishRow> = {}, events: CookEventRow[] = []) {
  return build({ dishes: [dishRow(overrides)], cookEvents: events })[0];
}

// ---------------------------------------------------------------------------

describe('buildDishList', () => {
  it('drops archived dishes — they are invisible by design', () => {
    const items = build({
      dishes: [dishRow({ id: 'keep' }), dishRow({ id: 'gone', isArchived: true })],
    });
    expect(items.map((i) => i.id)).toEqual(['keep']);
  });

  it('keeps podis, which are dishes even though they are never suggested', () => {
    const item = one({ role: 'podi' });
    expect(item.isAlwaysAvailable).toBe(true);
    expect(item.roleLabel).toBe('Podi');
  });

  it('computes cookCount, daysSince and the median together', () => {
    // Cooked 2, 9 and 16 days ago: two 7-day intervals.
    const item = one({}, cooksAgo('dish-1', 2, 9, 16));
    expect(item.cookCount).toBe(3);
    expect(item.daysSince).toBe(2);
    expect(item.medianInterval).toBe(7);
    expect(item.ratio).toBeCloseTo(2 / 7);
    expect(item.stalenessState).toBe('recent');
  });

  it('reports no rhythm under three cooks rather than inventing one', () => {
    const item = one({}, cooksAgo('dish-1', 3, 10));
    expect(item.cookCount).toBe(2);
    expect(item.medianInterval).toBeNull();
    expect(item.stalenessState).toBe('new');
    // Neutral, so it cannot outrank a genuinely overdue dish.
    expect(item.ratio).toBe(1);
  });

  it('reads a median of 0 as unknown, not as infinitely overdue', () => {
    // Two cooks on one day, plus one more: a zero-day interval reaches the median.
    const item = one({}, [...cooksAgo('dish-1', 0, 0, 0)]);
    expect(item.medianInterval).toBe(0);
    expect(item.stalenessState).toBe('new');
    expect(Number.isFinite(item.ratio)).toBe(true);
  });

  it('carries the display-only fields the engine is not allowed to see', () => {
    const item = one({ minutes: 35, methodText: 'Fold into cold rice.' });
    expect(item.minutes).toBe(35);
    expect(item.hasRecipe).toBe(true);
  });
});

describe('sortByStaleness', () => {
  function named(name: string, overrides: Partial<DishRow> = {}, daysAgo: number[] = []) {
    const id = name;
    return {
      dish: dishRow({ ...overrides, id, name }),
      events: cooksAgo(id, ...daysAgo),
    };
  }

  it('puts dishes with a rhythm first, most overdue at the top', () => {
    const specs = [
      named('Fresh', {}, [1, 8, 15]), // ratio 1/7
      named('Overdue', {}, [21, 28, 35]), // ratio 3
      named('Due', {}, [7, 14, 21]), // ratio 1
    ];
    const items = build({
      dishes: specs.map((s) => s.dish),
      cookEvents: specs.flatMap((s) => s.events),
    });

    expect(sortByStaleness(items).map((i) => i.name)).toEqual([
      'Overdue',
      'Due',
      'Fresh',
    ]);
  });

  it('sinks dishes with no rhythm below every dish that has one', () => {
    const specs = [
      named('Unknown', {}, [4]),
      named('Barely fresh', {}, [1, 8, 15]), // a real ratio, but a tiny one
    ];
    const items = build({
      dishes: specs.map((s) => s.dish),
      cookEvents: specs.flatMap((s) => s.events),
    });

    // "Unknown" scores a neutral 1.0, which would beat 1/7 if bands did not exist.
    expect(sortByStaleness(items).map((i) => i.name)).toEqual([
      'Barely fresh',
      'Unknown',
    ]);
  });

  it('sinks always-available dishes below everything — a podi is never overdue', () => {
    const specs = [
      named('Kandi podi', { role: 'podi' }, [40, 80, 120]),
      named('Never cooked'),
    ];
    const items = build({
      dishes: specs.map((s) => s.dish),
      cookEvents: specs.flatMap((s) => s.events),
    });

    expect(sortByStaleness(items).map((i) => i.name)).toEqual([
      'Never cooked',
      'Kandi podi',
    ]);
  });

  it('breaks ties by name, which is the whole order before any history exists', () => {
    const items = build({
      dishes: [
        dishRow({ id: 'c', name: 'Upma' }),
        dishRow({ id: 'a', name: 'Dosa' }),
        dishRow({ id: 'b', name: 'Poha' }),
      ],
    });
    expect(sortByStaleness(items).map((i) => i.name)).toEqual(['Dosa', 'Poha', 'Upma']);
  });

  it('does not mutate its input', () => {
    const items = build({
      dishes: [dishRow({ id: 'b', name: 'Upma' }), dishRow({ id: 'a', name: 'Dosa' })],
    });
    const before = items.map((i) => i.name);
    sortByStaleness(items);
    expect(items.map((i) => i.name)).toEqual(before);
  });
});

describe('search', () => {
  const dosa = one({ name: 'Pesarattu', altName: 'Moong dal dosa' });
  const gutti = one({ name: 'Gutti vankaya', primaryIngredient: 'brinjal' });

  it('matches the name, case-insensitively', () => {
    expect(matchesSearch(dosa, 'pesar')).toBe(true);
    expect(matchesSearch(dosa, 'PESAR')).toBe(true);
    expect(matchesSearch(dosa, 'upma')).toBe(false);
  });

  it('matches the regional name, which is often what you actually call it', () => {
    expect(matchesSearch(dosa, 'moong')).toBe(true);
  });

  it('matches the primary ingredient — "brinjal" is how you shop-first', () => {
    expect(matchesSearch(gutti, 'brinjal')).toBe(true);
  });

  it('treats an empty or whitespace query as no filter at all', () => {
    expect(matchesSearch(dosa, '')).toBe(true);
    expect(matchesSearch(dosa, '   ')).toBe(true);
  });

  it('ignores surrounding whitespace in a real query', () => {
    expect(matchesSearch(dosa, '  moong ')).toBe(true);
  });
});

describe('filterDishes', () => {
  const items = build({
    dishes: [
      dishRow({ id: 'a', name: 'Sambar', role: 'dal', primaryIngredient: 'toor dal' }),
      dishRow({ id: 'b', name: 'Dosa', role: 'tiffin', primaryIngredient: 'urad dal' }),
      dishRow({
        id: 'c',
        name: 'Rajma',
        role: 'gravy',
        primaryIngredient: 'kidney beans',
      }),
    ],
  });

  it('passes everything through when the role filter is off', () => {
    expect(filterDishes(items, { role: ALL_ROLES, search: '' })).toHaveLength(3);
  });

  it('narrows to one role', () => {
    const filtered = filterDishes(items, { role: 'tiffin', search: '' });
    expect(filtered.map((i) => i.name)).toEqual(['Dosa']);
  });

  it('applies the role and the search together', () => {
    // "dal" is in two ingredients, so the role is what disambiguates.
    expect(
      filterDishes(items, { role: 'dal', search: 'dal' }).map((i) => i.name),
    ).toEqual(['Sambar']);
    expect(filterDishes(items, { role: 'gravy', search: 'dal' })).toEqual([]);
  });
});

describe('usedRoles', () => {
  it('offers only roles some surviving dish uses, in role_config order', () => {
    const items = build({
      dishes: [
        dishRow({ id: 'a', role: 'gravy' }),
        dishRow({ id: 'b', role: 'dal' }),
        dishRow({ id: 'c', role: 'gravy' }),
      ],
    });

    // `tiffin` and `podi` are configured but unused, so they are not offered — a filter
    // that returns nothing is a dead end.
    expect(usedRoles(items, ROLES).map((r) => r.role)).toEqual(['dal', 'gravy']);
  });

  it('offers nothing when there are no dishes', () => {
    expect(usedRoles([], ROLES)).toEqual([]);
  });
});

describe('patternSummary', () => {
  it('says how overdue, in whole days', () => {
    // Median 7, last cooked 10 days ago.
    expect(patternSummary(one({}, cooksAgo('dish-1', 10, 17, 24)))).toBe(
      'Overdue by 3 days',
    );
  });

  it('says how long until due', () => {
    expect(patternSummary(one({}, cooksAgo('dish-1', 5, 12, 19)))).toBe('Due in 2 days');
  });

  it('says due today when the gap is exactly the median', () => {
    expect(patternSummary(one({}, cooksAgo('dish-1', 7, 14, 21)))).toBe('Due today');
  });

  it('singularises one day', () => {
    expect(patternSummary(one({}, cooksAgo('dish-1', 8, 15, 22)))).toBe(
      'Overdue by 1 day',
    );
    expect(patternSummary(one({}, cooksAgo('dish-1', 6, 13, 20)))).toBe('Due in 1 day');
  });

  it('refuses to invent a pattern it does not have', () => {
    expect(patternSummary(one())).toBe('Never cooked yet');
    expect(patternSummary(one({}, cooksAgo('dish-1', 3, 10)))).toBe('No pattern yet');
  });

  it('says a podi is simply always available', () => {
    expect(patternSummary(one({ role: 'podi' }, cooksAgo('dish-1', 40, 80, 120)))).toBe(
      'Always available',
    );
  });
});
