import type { Candidate, Context } from '../src/core/types';

/**
 * Builders for the two plain objects the engine consumes. Every field has a boring
 * default so each test overrides only the one thing it is about — a test that says
 * `candidate({ effort: 'project' })` reads as its own assertion.
 */

export function candidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: 'dish-1',
    name: 'Muddha pappu',
    role: 'dal',
    slots: ['lunch', 'dinner'],
    effort: 'medium',
    isVeg: true,
    isArchived: false,
    isAlwaysAvailable: false,
    primaryIngredient: 'toor dal',
    prepKind: null,
    prepLabel: null,
    usesLeftoverRice: false,
    season: null,
    daysSince: 7,
    medianInterval: 7,
    lastRating: null,
    createdAt: '2026-01-01T00:00:00',
    ...overrides,
  };
}

export function context(overrides: Partial<Context> = {}): Context {
  return {
    slot: 'lunch',
    isWeekend: false,
    season: 'monsoon',
    isVegOnlyDay: false,
    livePrepDishIds: [],
    expiringPrepDishIds: [],
    hadRiceStapleInLast24h: false,
    recentIngredients: [],
    rolesFilledByBatch: [],
    ...overrides,
  };
}

/** Local-time date. Month is 1-based here, unlike `new Date()`. */
export function day(year: number, month: number, date: number, hour = 12): Date {
  return new Date(year, month - 1, date, hour, 0, 0, 0);
}
