import { describe, expect, it } from 'vitest';
import { confirmationFor, type LogCookInput, toCookEventRow } from '../src/db/cookModel';
import { LOCAL_ISO_FORMAT, parseLocalIso } from '../src/db/time';

/** `docs/SPEC.md` §2.1, §7, §3 — the three decisions baked into every cook event. */

/** Monday 27 July 2026, 20:14 local. An evening cook, deliberately not midnight. */
const NOW = new Date(2026, 6, 27, 20, 14, 30);

function input(overrides: Partial<LogCookInput> = {}): LogCookInput {
  return {
    dishId: 'dish-1',
    slot: 'dinner',
    rating: null,
    tweakNote: null,
    isBatch: false,
    mealId: null,
    ...overrides,
  };
}

describe('toCookEventRow', () => {
  it('stores a full local ISO datetime, not a date and not UTC', () => {
    const row = toCookEventRow(input(), 'event-1', NOW);

    expect(row.cookedAt).toBe('2026-07-27T20:14:30');
    // Round-trips through the same reader the models use, back to the same instant.
    expect(parseLocalIso(row.cookedAt).getTime()).toBe(NOW.getTime());
    // A `Z` or an offset would mean the clock had been converted somewhere.
    expect(row.cookedAt).not.toMatch(/[Z+]/);
    expect(LOCAL_ISO_FORMAT).toBe("yyyy-MM-dd'T'HH:mm:ss");
  });

  it('leaves an unrated cook null rather than defaulting to "fine"', () => {
    // The mockup pre-selects Fine. Recording an opinion nobody gave is worse than
    // recording nothing, and `lastRating` depends on null being expressible (SPEC §4.3).
    expect(toCookEventRow(input(), 'e', NOW).rating).toBeNull();
    expect(toCookEventRow(input({ rating: 1 }), 'e', NOW).rating).toBe(1);
    expect(toCookEventRow(input({ rating: 3 }), 'e', NOW).rating).toBe(3);
  });

  it('never marks a real log as estimated', () => {
    // Only onboarding writes true, and those are excluded from interval maths (SPEC §3).
    expect(toCookEventRow(input(), 'e', NOW).isEstimated).toBe(false);
  });

  it('trims the tweak note and stores whitespace as nothing', () => {
    expect(
      toCookEventRow(input({ tweakNote: '  4 whistles  ' }), 'e', NOW).tweakNote,
    ).toBe('4 whistles');
    expect(toCookEventRow(input({ tweakNote: '   ' }), 'e', NOW).tweakNote).toBeNull();
    expect(toCookEventRow(input({ tweakNote: '' }), 'e', NOW).tweakNote).toBeNull();
  });

  it('carries the slot and the batch flag through untouched', () => {
    const row = toCookEventRow(input({ slot: 'breakfast', isBatch: true }), 'e', NOW);
    expect(row.slot).toBe('breakfast');
    expect(row.isBatch).toBe(true);
  });

  it('leaves mealId null for a standalone cook and shares it across a meal', () => {
    expect(toCookEventRow(input(), 'e', NOW).mealId).toBeNull();

    const meal = 'meal-abc';
    const rice = toCookEventRow(input({ dishId: 'rice', mealId: meal }), 'e1', NOW);
    const dal = toCookEventRow(input({ dishId: 'dal', mealId: meal }), 'e2', NOW);
    expect(rice.mealId).toBe(dal.mealId);
    expect(rice.id).not.toBe(dal.id);
  });

  it('stamps createdAt and updatedAt with the same local time as the cook', () => {
    const row = toCookEventRow(input(), 'e', NOW);
    expect(row.createdAt).toBe(row.cookedAt);
    expect(row.updatedAt).toBe(row.cookedAt);
    expect(row.deletedAt).toBeNull();
  });

  it('leaves the photo column empty — Phase 6 captures no image', () => {
    expect(toCookEventRow(input(), 'e', NOW).photoUri).toBeNull();
  });
});

describe('confirmationFor', () => {
  it('quotes the rhythm when there is one', () => {
    expect(confirmationFor('Sambar', 8)).toBe(
      'Sambar logged. Usually about 8 days between these.',
    );
    expect(confirmationFor('Sambar', 1)).toBe(
      'Sambar logged. Usually about 1 day between these.',
    );
  });

  it('promises no interval it does not have, including a median of 0', () => {
    for (const median of [null, 0]) {
      expect(confirmationFor('Upma', median)).toBe(
        'Upma logged. A few more and the app will know your rhythm for it.',
      );
    }
  });
});
