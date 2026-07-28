import { describe, expect, it } from 'vitest';
import type { RoleConfigRow } from '../src/db/roles';
import { SETTING_KEYS, toSettingMap } from '../src/db/settings';
import { toLocalIso } from '../src/db/time';
import {
  buildTodayModel,
  type CookEventRow,
  type DishRow,
  type DishSlotRow,
  type PrepStateRow,
  type TodayInputs,
} from '../src/db/todayModel';
import { day } from './fixtures';

/**
 * `src/db/todayModel.ts` is the seam between SQLite and the engine, and it is where every
 * window in `docs/SPEC.md` §4.3 and every prep rule in §5.2 is actually applied. It takes
 * plain rows and a `now`, so unlike the rest of `src/db/` it needs neither a device nor a
 * database — which is the reason it is a separate module from the queries.
 */

/** Monday 27 July 2026, noon. Weekday, monsoon season. */
const NOW = day(2026, 7, 27, 12);

function dishRow(overrides: Partial<DishRow> = {}): DishRow {
  return {
    id: 'dish-1',
    name: 'Muddha pappu',
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

function eventRow(overrides: Partial<CookEventRow> = {}): CookEventRow {
  return {
    dishId: 'dish-1',
    cookedAt: toLocalIso(day(2026, 7, 20, 12)),
    rating: null,
    isBatch: false,
    isEstimated: false,
    ...overrides,
  };
}

const ROLES: RoleConfigRow[] = [
  { role: 'dal', label: 'Dal', isAlwaysAvailable: false, sortOrder: 0 },
  { role: 'tiffin', label: 'Tiffin', isAlwaysAvailable: false, sortOrder: 1 },
  { role: 'staple', label: 'Staple', isAlwaysAvailable: false, sortOrder: 2 },
  { role: 'one_pot', label: 'One-pot', isAlwaysAvailable: false, sortOrder: 3 },
  { role: 'podi', label: 'Podi', isAlwaysAvailable: true, sortOrder: 4 },
];

function inputs(overrides: Partial<TodayInputs> = {}): TodayInputs {
  return {
    dishes: [dishRow()],
    dishSlots: [{ dishId: 'dish-1', slot: 'lunch' }],
    roles: ROLES,
    cookEvents: [],
    prepStates: [],
    settings: toSettingMap([]),
    ...overrides,
  };
}

function build(overrides: Partial<TodayInputs> = {}, now = NOW) {
  return buildTodayModel(inputs(overrides), now, 'lunch');
}

// ---------------------------------------------------------------------------

describe('candidate mapping', () => {
  it('resolves isAlwaysAvailable from role_config, never from the role string', () => {
    // The flag, not the name: the same role renamed must keep the behaviour (SPEC §1.1).
    const model = build({
      dishes: [
        dishRow({ id: 'karivepaku', role: 'podi' }),
        dishRow({ id: 'renamed', role: 'chutney powder' }),
      ],
      roles: [
        { role: 'podi', label: 'Podi', isAlwaysAvailable: true, sortOrder: 0 },
        {
          role: 'chutney powder',
          label: 'Chutney powder',
          isAlwaysAvailable: true,
          sortOrder: 1,
        },
      ],
    });

    expect(model.candidates.map((c) => c.isAlwaysAvailable)).toEqual([true, true]);
  });

  it('treats a role with no config row as an ordinary role', () => {
    const model = build({ dishes: [dishRow({ role: 'invented' })] });
    expect(model.candidates[0].isAlwaysAvailable).toBe(false);
    expect(model.display.get('dish-1')?.roleLabel).toBe('invented');
  });

  it('collects every slot for a dish — tiffin is breakfast and dinner', () => {
    const model = build({
      dishes: [dishRow({ id: 'dosa', role: 'tiffin' })],
      dishSlots: [
        { dishId: 'dosa', slot: 'breakfast' },
        { dishId: 'dosa', slot: 'dinner' },
        { dishId: 'dosa', slot: 'brunch' }, // not a slot; dropped rather than crashing
      ],
    });

    expect(model.candidates[0].slots).toEqual(['breakfast', 'dinner']);
  });

  it('fails safe on an unrecognised effort and shrugs off an unrecognised season', () => {
    const model = build({
      dishes: [dishRow({ effort: 'leisurely', season: 'autumn' })],
    });
    expect(model.candidates[0].effort).toBe('project');
    expect(model.candidates[0].season).toBeNull();
  });

  it('keeps minutes and the role label out of the Candidate', () => {
    // `minutes` is display-only and may never reach a filter or the score (SPEC §1.2).
    const model = build({ dishes: [dishRow({ minutes: 20 })] });
    expect(model.candidates[0]).not.toHaveProperty('minutes');
    expect(model.display.get('dish-1')).toEqual({
      roleLabel: 'Dal',
      minutes: 20,
      hasRecipe: false,
      prepLabel: null,
    });
  });

  it('counts a dish as having a recipe on either free-text field', () => {
    expect(
      build({ dishes: [dishRow({ methodText: 'Fold into cold rice.' })] }).display.get(
        'dish-1',
      )?.hasRecipe,
    ).toBe(true);
    // Whitespace is not a recipe, and an empty one is a normal dish either way.
    expect(
      build({ dishes: [dishRow({ ingredientsText: '   ' })] }).display.get('dish-1')
        ?.hasRecipe,
    ).toBe(false);
  });
});

describe('cook history', () => {
  it('computes daysSince and the median without storing either', () => {
    const model = build({
      cookEvents: [
        eventRow({ cookedAt: toLocalIso(day(2026, 7, 25, 12)) }),
        eventRow({ cookedAt: toLocalIso(day(2026, 7, 18, 12)) }),
        eventRow({ cookedAt: toLocalIso(day(2026, 7, 11, 12)) }),
      ],
    });

    expect(model.candidates[0].daysSince).toBe(2);
    expect(model.candidates[0].medianInterval).toBe(7);
  });

  it('keeps estimated events out of the median but inside daysSince', () => {
    const model = build({
      cookEvents: [
        eventRow({ cookedAt: toLocalIso(day(2026, 7, 26, 12)), isEstimated: true }),
        eventRow({ cookedAt: toLocalIso(day(2026, 7, 25, 12)) }),
        eventRow({ cookedAt: toLocalIso(day(2026, 7, 18, 12)) }),
        eventRow({ cookedAt: toLocalIso(day(2026, 7, 11, 12)) }),
      ],
    });

    expect(model.candidates[0].daysSince).toBe(1);
    expect(model.candidates[0].medianInterval).toBe(7);
  });

  it('takes the most recent rating that was actually given', () => {
    // A later unrated cook does not erase "not again" — SPEC says *last rated*, and a
    // cook logged in a hurry with no rating is not an opinion.
    const model = build({
      cookEvents: [
        eventRow({ cookedAt: toLocalIso(day(2026, 7, 25, 12)), rating: null }),
        eventRow({ cookedAt: toLocalIso(day(2026, 7, 18, 12)), rating: 1 }),
        eventRow({ cookedAt: toLocalIso(day(2026, 7, 11, 12)), rating: 3 }),
      ],
    });

    expect(model.candidates[0].lastRating).toBe(1);
  });

  it('picks the latest rating by date, not by the order rows arrive in', () => {
    const model = build({
      cookEvents: [
        eventRow({ cookedAt: toLocalIso(day(2026, 7, 11, 12)), rating: 3 }),
        eventRow({ cookedAt: toLocalIso(day(2026, 7, 25, 12)), rating: 1 }),
        eventRow({ cookedAt: toLocalIso(day(2026, 7, 18, 12)), rating: 2 }),
      ],
    });

    expect(model.candidates[0].lastRating).toBe(1);
  });

  it('ignores events belonging to a dish that is gone', () => {
    const model = build({ cookEvents: [eventRow({ dishId: 'deleted-dish' })] });
    expect(model.candidates[0].daysSince).toBeNull();
    expect(model.ctx.recentIngredients).toEqual([]);
  });
});

describe('live prep', () => {
  const batter: PrepStateRow = {
    id: 'prep-1',
    kind: 'batter',
    ingredient: 'urad dal',
    label: 'Urad dal batter',
    readyAt: toLocalIso(day(2026, 7, 26, 12)),
    expiresAt: toLocalIso(day(2026, 7, 29, 12)),
  };

  const tiffins: DishRow[] = [
    dishRow({
      id: 'dosa',
      name: 'Dosa',
      role: 'tiffin',
      prepKind: 'batter',
      primaryIngredient: 'urad dal',
    }),
    dishRow({
      id: 'idli',
      name: 'Idli',
      role: 'tiffin',
      prepKind: 'batter',
      primaryIngredient: 'urad dal',
    }),
    dishRow({
      id: 'pesarattu',
      name: 'Pesarattu',
      role: 'tiffin',
      prepKind: 'soaked',
      primaryIngredient: 'moong dal',
    }),
  ];

  it('matches on the (kind, ingredient) pair, so one batter covers idli and dosa only', () => {
    const model = build({ dishes: tiffins, prepStates: [batter] });

    expect([...model.ctx.livePrepDishIds].sort()).toEqual(['dosa', 'idli']);
    expect(model.ctx.livePrepDishIds).not.toContain('pesarattu');
    expect(model.livePrep[0].dishNames).toEqual(['Dosa', 'Idli']);
  });

  it('ignores prep that has not become ready yet', () => {
    const model = build({
      dishes: tiffins,
      prepStates: [{ ...batter, readyAt: toLocalIso(day(2026, 7, 28, 12)) }],
    });
    expect(model.ctx.livePrepDishIds).toEqual([]);
    expect(model.livePrep).toEqual([]);
  });

  it('ignores prep that has expired', () => {
    const model = build({
      dishes: tiffins,
      prepStates: [{ ...batter, expiresAt: toLocalIso(day(2026, 7, 26, 12)) }],
    });
    expect(model.ctx.livePrepDishIds).toEqual([]);
  });

  it('flags prep expiring within 24 h, which is a bonus rather than a filter', () => {
    const model = build({
      dishes: tiffins,
      prepStates: [{ ...batter, expiresAt: toLocalIso(day(2026, 7, 28, 6)) }],
    });

    expect([...model.ctx.expiringPrepDishIds].sort()).toEqual(['dosa', 'idli']);
    expect(model.livePrep[0].expiringSoon).toBe(true);
  });

  it('treats a row with no timestamps as live and never-expiring', () => {
    const model = build({
      dishes: tiffins,
      prepStates: [{ ...batter, readyAt: null, expiresAt: null }],
    });
    expect([...model.ctx.livePrepDishIds].sort()).toEqual(['dosa', 'idli']);
    expect(model.livePrep[0].expiringSoon).toBe(false);
  });

  it('raises no banner for prep that unlocks nothing', () => {
    const model = build({
      dishes: tiffins,
      prepStates: [{ ...batter, ingredient: 'chickpeas' }],
    });
    expect(model.livePrep).toEqual([]);
  });

  it('leaves an archived dish out of the banner', () => {
    const model = build({
      dishes: [tiffins[0], { ...tiffins[1], isArchived: true }],
      prepStates: [batter],
    });
    expect(model.livePrep[0].dishNames).toEqual(['Dosa']);
    expect(model.ctx.livePrepDishIds).toEqual(['dosa']);
  });
});

describe('context windows', () => {
  const plainRice = dishRow({
    id: 'rice',
    name: 'Plain rice',
    role: 'staple',
    primaryIngredient: 'rice',
  });

  it('fires the rice-staple flag only for role staple and ingredient rice', () => {
    const withinDay = toLocalIso(day(2026, 7, 27, 1));

    expect(
      build({
        dishes: [plainRice],
        cookEvents: [eventRow({ dishId: 'rice', cookedAt: withinDay })],
      }).ctx.hadRiceStapleInLast24h,
    ).toBe(true);

    // Pulihora is `one_pot`, not `staple`. Keeping the roles distinct is exactly what
    // stops the boost firing from the dish it is supposed to land on (SPEC §4.3).
    expect(
      build({
        dishes: [{ ...plainRice, id: 'rice', role: 'one_pot' }],
        cookEvents: [eventRow({ dishId: 'rice', cookedAt: withinDay })],
      }).ctx.hadRiceStapleInLast24h,
    ).toBe(false);
  });

  it('lets the rice-staple flag lapse after 24 hours', () => {
    expect(
      build({
        dishes: [plainRice],
        cookEvents: [
          eventRow({ dishId: 'rice', cookedAt: toLocalIso(day(2026, 7, 26, 6)) }),
        ],
      }).ctx.hadRiceStapleInLast24h,
    ).toBe(false);
  });

  it('counts recent ingredients over today and yesterday, by calendar day', () => {
    const model = build({
      dishes: [
        dishRow({ id: 'today', primaryIngredient: 'potato' }),
        dishRow({ id: 'yesterday', primaryIngredient: 'tomato' }),
        dishRow({ id: 'older', primaryIngredient: 'okra' }),
        dishRow({ id: 'nameless', primaryIngredient: null }),
      ],
      cookEvents: [
        eventRow({ dishId: 'today', cookedAt: toLocalIso(day(2026, 7, 27, 8)) }),
        // 23:30 yesterday is 12.5 elapsed hours but a different calendar day, and it
        // still counts. Raw hour arithmetic would get this wrong (SPEC §2.1).
        eventRow({ dishId: 'yesterday', cookedAt: toLocalIso(day(2026, 7, 26, 23)) }),
        eventRow({ dishId: 'older', cookedAt: toLocalIso(day(2026, 7, 25, 23)) }),
        eventRow({ dishId: 'nameless', cookedAt: toLocalIso(day(2026, 7, 27, 9)) }),
      ],
    });

    expect([...model.ctx.recentIngredients].sort()).toEqual(['potato', 'tomato']);
  });

  it('lets a batch cook fill its role for 48 hours and no longer', () => {
    const batch = (cookedAt: Date) =>
      build({
        cookEvents: [eventRow({ isBatch: true, cookedAt: toLocalIso(cookedAt) })],
      }).ctx.rolesFilledByBatch;

    expect(batch(day(2026, 7, 26, 12))).toEqual(['dal']);
    expect(batch(day(2026, 7, 24, 12))).toEqual([]);
    // A non-batch cook never fills the role, however recent.
    expect(build({ cookEvents: [eventRow()] }).ctx.rolesFilledByBatch).toEqual([]);
  });

  it('reads the season and the weekend off `now`, not off the clock', () => {
    expect(build().ctx.season).toBe('monsoon');
    expect(build().ctx.isWeekend).toBe(false);
    expect(build({}, day(2026, 7, 25, 12)).ctx.isWeekend).toBe(true);
    expect(build({}, day(2026, 1, 5, 12)).ctx.season).toBe('winter');
  });
});

describe('veg-only day', () => {
  it('is off by default — a fresh install must not hide anything', () => {
    const model = build();
    expect(model.ctx.isVegOnlyDay).toBe(false);
    expect(model.vegOnlyOverride).toBe(false);
  });

  it('honours the weekday set without treating it as today’s override', () => {
    // Monday is ISO 1.
    const model = build({
      settings: toSettingMap([{ key: SETTING_KEYS.vegOnlyWeekdays, value: '[1,4]' }]),
    });
    expect(model.ctx.isVegOnlyDay).toBe(true);
    // False, so the Today toggle renders as on-but-locked rather than as switchable.
    expect(model.vegOnlyOverride).toBe(false);
  });

  it('honours the one-day override and drops it the next day', () => {
    const settings = toSettingMap([
      { key: SETTING_KEYS.vegOnlyToday, value: '2026-07-27' },
    ]);
    expect(build({ settings }).ctx.isVegOnlyDay).toBe(true);
    expect(build({ settings }).vegOnlyOverride).toBe(true);
    expect(build({ settings }, day(2026, 7, 28, 12)).ctx.isVegOnlyDay).toBe(false);
  });

  it('survives a corrupt weekday setting rather than failing to render', () => {
    const model = build({
      settings: toSettingMap([{ key: SETTING_KEYS.vegOnlyWeekdays, value: 'not json' }]),
    });
    expect(model.ctx.isVegOnlyDay).toBe(false);
  });
});

describe('soft deletes and slots', () => {
  it('passes the requested slot straight through to the context', () => {
    const model = buildTodayModel(inputs(), NOW, 'dinner');
    expect(model.ctx.slot).toBe('dinner');
  });

  it('gives a dish with no slot rows an empty slot list rather than undefined', () => {
    const empty: DishSlotRow[] = [];
    expect(build({ dishSlots: empty }).candidates[0].slots).toEqual([]);
  });
});
