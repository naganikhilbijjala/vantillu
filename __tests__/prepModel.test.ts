import { describe, expect, it } from 'vitest';
import {
  MAX_PREP_NUDGES,
  PREP_NUDGE_COOLDOWN_DAYS,
  PREP_PRUNE_AFTER_DAYS,
} from '../src/core/prep';
import { QUIET_MOVED_TO_HOUR } from '../src/core/slots';
import {
  buildPrepPlan,
  dishPrepStatus,
  NUDGE_ID_PREFIX,
  prepPhaseAt,
  prepStatusLine,
  prepTimes,
  READY_ID_PREFIX,
  updateNudgedAt,
} from '../src/db/prepModel';
import type { CookEventRow, DishRow, DishSlotRow, PrepStateRow } from '../src/db/rows';
import { toLocalIso } from '../src/db/time';
import { day } from './fixtures';

/** `docs/SPEC.md` §5.2, §5.3, §20. */

const NOW = day(2026, 7, 28, 20); // Tuesday evening

function dishRow(overrides: Partial<DishRow> = {}): DishRow {
  return {
    id: 'dish-dosa',
    name: 'Dosa',
    altName: null,
    role: 'tiffin',
    primaryIngredient: 'urad dal',
    effort: 'medium',
    minutes: 30,
    isVeg: true,
    prepKind: 'batter',
    prepLeadHours: 12,
    prepLabel: 'grind and ferment',
    usesLeftoverRice: false,
    season: null,
    ingredientsText: null,
    methodText: null,
    notes: null,
    isArchived: false,
    createdAt: '2026-01-01T00:00:00',
    ...overrides,
  };
}

function prepRow(overrides: Partial<PrepStateRow> = {}): PrepStateRow {
  return {
    id: 'prep-1',
    kind: 'batter',
    ingredient: 'urad dal',
    label: 'batter',
    readyAt: toLocalIso(day(2026, 7, 28, 8)),
    expiresAt: toLocalIso(day(2026, 7, 31, 8)),
    ...overrides,
  };
}

function slots(dishId: string, ...values: string[]): DishSlotRow[] {
  return values.map((slot) => ({ dishId, slot }));
}

/** Cooks on the given days, newest first, so a dish has a real median. */
function cooks(dishId: string, ...days: Date[]): CookEventRow[] {
  return days.map((cookedAt) => ({
    dishId,
    cookedAt: toLocalIso(cookedAt),
    rating: null,
    isBatch: false,
    isEstimated: false,
  }));
}

/**
 * A dosa cooked every 7 days and last made 14 days ago — overdue, with a median honest
 * enough to say so.
 */
function overdueHistory(dishId = 'dish-dosa'): CookEventRow[] {
  return cooks(
    dishId,
    day(2026, 7, 14, 8),
    day(2026, 7, 7, 8),
    day(2026, 6, 30, 8),
    day(2026, 6, 23, 8),
  );
}

function inputs(overrides: Partial<Parameters<typeof buildPrepPlan>[0]> = {}) {
  return {
    dishes: [dishRow()],
    dishSlots: slots('dish-dosa', 'breakfast'),
    cookEvents: overdueHistory(),
    prepStates: [],
    nudgedAt: new Map<string, Date>(),
    ...overrides,
  };
}

describe('prepPhaseAt', () => {
  it('walks pending → live → expiring → expired', () => {
    const times = prepTimes(prepRow());
    expect(prepPhaseAt(times, day(2026, 7, 28, 6))).toBe('pending');
    expect(prepPhaseAt(times, day(2026, 7, 29, 8))).toBe('live');
    expect(prepPhaseAt(times, day(2026, 7, 30, 20))).toBe('expiring');
    expect(prepPhaseAt(times, day(2026, 7, 31, 9))).toBe('expired');
  });

  it('reads a missing readyAt as ready and a missing expiresAt as forever', () => {
    // Either reading leaves the user in control rather than binning their batter (§5.2).
    const times = prepTimes(prepRow({ readyAt: null, expiresAt: null }));
    expect(prepPhaseAt(times, NOW)).toBe('live');
  });
});

describe('dishPrepStatus', () => {
  it('is null for a dish that needs no prep, so the section can be absent', () => {
    expect(dishPrepStatus(dishRow({ prepKind: null }), [prepRow()], NOW)).toBeNull();
  });

  it('matches on the pair, never on the kind alone', () => {
    // Pesarattu is soaked moong; a urad-dal batter says nothing about it (§5.2).
    const pesarattu = dishRow({
      id: 'dish-pesarattu',
      name: 'Pesarattu',
      prepKind: 'soaked',
      primaryIngredient: 'moong dal',
    });
    expect(dishPrepStatus(pesarattu, [prepRow()], NOW)?.phase).toBe('none');
    expect(dishPrepStatus(dishRow(), [prepRow()], NOW)?.phase).toBe('live');
  });

  it('prefers a live row over a pending one and a pending one over an expired one', () => {
    const expired = prepRow({
      id: 'old',
      readyAt: toLocalIso(day(2026, 7, 1, 8)),
      expiresAt: toLocalIso(day(2026, 7, 4, 8)),
    });
    const pending = prepRow({ id: 'new', readyAt: toLocalIso(day(2026, 7, 29, 8)) });

    expect(dishPrepStatus(dishRow(), [expired, pending], NOW)?.prepId).toBe('new');
    expect(dishPrepStatus(dishRow(), [expired, pending, prepRow()], NOW)?.prepId) //
      .toBe('prep-1');
  });
});

describe('prepStatusLine', () => {
  const line = (states: PrepStateRow[], now = NOW) => {
    const status = dishPrepStatus(dishRow(), states, now);
    if (status === null) throw new Error('the fixture dish needs prep');
    return prepStatusLine(status, now);
  };

  it('says nothing is going without complaining about it', () => {
    expect(line([])).toBe('No batter going right now.');
  });

  it('reads an expired row exactly like no row at all', () => {
    // From the cook's point of view it is the same fact: nothing in the fridge.
    expect(line([prepRow()], day(2026, 8, 2, 9))).toBe('No batter going right now.');
  });

  it('names when a pending row lands', () => {
    expect(line([prepRow({ readyAt: toLocalIso(day(2026, 7, 29, 7)) })])) //
      .toBe('Started — ready tomorrow at 7 am.');
  });

  it('counts down only once the row is close to going off', () => {
    expect(line([prepRow()], day(2026, 7, 29, 8))) //
      .toBe('Ready now, and good through Friday.');
    expect(line([prepRow()], day(2026, 7, 30, 20))) //
      .toBe('Ready now — about 12 hours left.');
  });
});

describe('buildPrepPlan — nudges', () => {
  it('turns an overdue overnight soak into a 9pm reminder', () => {
    // The Phase 9 acceptance criterion, end to end from rows.
    const rajma = dishRow({
      id: 'dish-rajma',
      name: 'Rajma',
      prepKind: 'soaked',
      prepLeadHours: 8,
      prepLabel: 'soak overnight',
      primaryIngredient: 'kidney beans',
    });
    const plan = buildPrepPlan(
      inputs({
        dishes: [rajma],
        dishSlots: slots('dish-rajma', 'breakfast'),
        cookEvents: overdueHistory('dish-rajma'),
      }),
      NOW,
    );

    expect(plan.nudges).toHaveLength(1);
    expect(plan.nudges[0].fireAt).toEqual(day(2026, 7, 28, QUIET_MOVED_TO_HOUR));
    expect(plan.nudges[0].title).toBe('Start the soak for Rajma');
    expect(plan.nudges[0].body).toBe('Last cooked 14 days ago. Soak overnight.');
    expect(plan.nudges[0].id.startsWith(`${NUDGE_ID_PREFIX}:dish-rajma:`)).toBe(true);
  });

  it('says nothing about a dish with no rhythm to be missing from', () => {
    // Under three cooks there is no median, so there is no claim that it is overdue —
    // and nagging about a dish you have never cooked is the opposite of this app.
    expect(buildPrepPlan(inputs({ cookEvents: [] }), NOW).nudges).toEqual([]);
    expect(
      buildPrepPlan(inputs({ cookEvents: cooks('dish-dosa', day(2026, 7, 20, 8)) }), NOW)
        .nudges,
    ).toEqual([]);
  });

  it('stays quiet while the dish is not yet due', () => {
    const plan = buildPrepPlan(
      inputs({
        cookEvents: cooks(
          'dish-dosa',
          day(2026, 7, 27, 8),
          day(2026, 7, 20, 8),
          day(2026, 7, 13, 8),
        ),
      }),
      NOW,
    );
    expect(plan.nudges).toEqual([]);
  });

  it('stays quiet while something is already going', () => {
    for (const readyAt of [
      toLocalIso(day(2026, 7, 29, 8)),
      toLocalIso(day(2026, 7, 28, 8)),
    ]) {
      // Pending and live alike: the answer to "should I start the batter" is already no.
      expect(buildPrepPlan(inputs({ prepStates: [prepRow({ readyAt })] }), NOW).nudges) //
        .toEqual([]);
    }
  });

  it('nudges again once an expired row leaves nothing in the fridge', () => {
    const stale = prepRow({
      readyAt: toLocalIso(day(2026, 7, 20, 8)),
      expiresAt: toLocalIso(day(2026, 7, 23, 8)),
    });
    expect(buildPrepPlan(inputs({ prepStates: [stale] }), NOW).nudges).toHaveLength(1);
  });

  it('needs a slot and a lead time before it has anything to schedule', () => {
    expect(buildPrepPlan(inputs({ dishSlots: [] }), NOW).nudges).toEqual([]);
    expect(
      buildPrepPlan(inputs({ dishes: [dishRow({ prepLeadHours: null })] }), NOW).nudges,
    ).toEqual([]);
  });

  it('goes quiet for a few days after it has said something', () => {
    const withMarker = (last: Date) =>
      buildPrepPlan(inputs({ nudgedAt: new Map([['dish-dosa', last]]) }), NOW).nudges;

    expect(withMarker(day(2026, 7, 28, 19))).toEqual([]);
    // Far enough back that the reminder is a reminder again rather than an alarm.
    expect(withMarker(day(2026, 7, 28 - PREP_NUDGE_COOLDOWN_DAYS, 19))).toHaveLength(1);
  });

  it('keeps a reminder it has already scheduled for exactly that moment', () => {
    // Scheduling one records when it fires, and that marker arrives back as input. If the
    // cooldown swallowed it the plan would drop the reminder it had just made, and the
    // next sync would cancel a notification nobody had seen.
    const fireAt = day(2026, 7, 28, QUIET_MOVED_TO_HOUR);
    const plan = buildPrepPlan(
      inputs({
        dishes: [dishRow({ prepLeadHours: 8 })],
        nudgedAt: new Map([['dish-dosa', fireAt]]),
      }),
      NOW,
    );

    expect(plan.nudges).toHaveLength(1);
    expect(plan.nudges[0].fireAt).toEqual(fireAt);
  });

  it('caps the list at the most overdue and says how many it dropped', () => {
    const many = Array.from({ length: MAX_PREP_NUDGES + 2 }, (_, i) =>
      dishRow({ id: `dish-${i}`, name: `Dish ${i}` }),
    );
    const plan = buildPrepPlan(
      inputs({
        dishes: many,
        dishSlots: many.flatMap((d) => slots(d.id, 'breakfast')),
        cookEvents: many.flatMap((d) => overdueHistory(d.id)),
      }),
      NOW,
    );

    expect(plan.nudges).toHaveLength(MAX_PREP_NUDGES);
    expect(plan.droppedNudges).toBe(2);
  });

  it('leaves an archived dish out of it entirely', () => {
    expect(
      buildPrepPlan(inputs({ dishes: [dishRow({ isArchived: true })] }), NOW).nudges,
    ).toEqual([]);
  });
});

describe('buildPrepPlan — ready alerts and pruning', () => {
  it('announces a pending row at the moment it becomes usable', () => {
    const pending = prepRow({ readyAt: toLocalIso(day(2026, 7, 29, 8)) });
    const plan = buildPrepPlan(inputs({ prepStates: [pending] }), NOW);

    expect(plan.readyAlerts).toHaveLength(1);
    expect(plan.readyAlerts[0].fireAt).toEqual(day(2026, 7, 29, 8));
    expect(plan.readyAlerts[0].title).toBe('Batter is ready');
    expect(plan.readyAlerts[0].body).toBe('Dosa is back in rotation.');
    expect(plan.readyAlerts[0].id.startsWith(`${READY_ID_PREFIX}:prep-1:`)).toBe(true);
  });

  it('names two dishes and then counts the rest', () => {
    const tiffins = ['Dosa', 'Idli', 'Uttapam'].map((name, i) =>
      dishRow({ id: `dish-${i}`, name }),
    );
    const plan = buildPrepPlan(
      inputs({
        dishes: tiffins,
        prepStates: [prepRow({ readyAt: toLocalIso(day(2026, 7, 29, 8)) })],
      }),
      NOW,
    );
    expect(plan.readyAlerts[0].body).toBe('Dosa, Idli and 1 other are back in rotation.');
  });

  it('says nothing about a row that unlocks nothing', () => {
    // "Batter is ready" over an empty list is worse than silence (§5.2).
    const plan = buildPrepPlan(
      inputs({
        dishes: [dishRow({ isArchived: true })],
        prepStates: [prepRow({ readyAt: toLocalIso(day(2026, 7, 29, 8)) })],
      }),
      NOW,
    );
    expect(plan.readyAlerts).toEqual([]);
  });

  it('prunes only rows that expired a long time ago', () => {
    const recentlyExpired = prepRow({
      id: 'recent',
      readyAt: toLocalIso(day(2026, 7, 20, 8)),
      expiresAt: toLocalIso(day(2026, 7, 23, 8)),
    });
    const ancient = prepRow({
      id: 'ancient',
      readyAt: toLocalIso(day(2026, 5, 1, 8)),
      expiresAt: toLocalIso(day(2026, 5, 4, 8)),
    });
    const plan = buildPrepPlan(inputs({ prepStates: [recentlyExpired, ancient] }), NOW);

    expect(plan.prunablePrepIds).toEqual(['ancient']);
    expect(day(2026, 7, 28).getTime() - day(2026, 5, 4).getTime()) //
      .toBeGreaterThan(PREP_PRUNE_AFTER_DAYS * 86_400_000);
  });
});

describe('updateNudgedAt', () => {
  it('records what was just scheduled and forgets what no longer matters', () => {
    const previous = new Map([
      ['dish-gone', day(2026, 7, 27, 21)],
      ['dish-stale', day(2026, 7, 1, 21)],
      ['dish-recent', day(2026, 7, 27, 21)],
    ]);
    const next = updateNudgedAt(
      previous,
      [{ dishId: 'dish-dosa', fireAt: day(2026, 7, 28, 21) }],
      new Set(['dish-stale', 'dish-recent', 'dish-dosa']),
      NOW,
    );

    // Deleted dish and expired marker both go; a marker still inside the cooldown stays.
    expect([...next.keys()].sort()).toEqual(['dish-dosa', 'dish-recent']);
    expect(next.get('dish-dosa')).toEqual(day(2026, 7, 28, 21));
  });
});
