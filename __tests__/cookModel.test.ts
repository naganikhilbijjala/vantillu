import { describe, expect, it } from 'vitest';
import {
  buildCookTimeline,
  type CookEventDetailRow,
  confirmationFor,
  type LogCookInput,
  toCookEventRow,
} from '../src/db/cookModel';
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

  it('leaves an unrated cook null, which is now every cook', () => {
    // The log sheet no longer asks how it turned out (SPEC §7.1), so the caller always
    // passes null. The column and the -1.5 weight stay, dormant, in case it returns.
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

describe('buildCookTimeline', () => {
  function row(overrides: Partial<CookEventDetailRow> = {}): CookEventDetailRow {
    return {
      id: 'e1',
      cookedAt: '2026-07-27T20:14:30',
      rating: null,
      tweakNote: null,
      isBatch: false,
      isEstimated: false,
      ...overrides,
    };
  }

  it('shows every cook, not only the ones with a note', () => {
    // Showing only annotated cooks would make the gaps look like months of not cooking it.
    const entries = buildCookTimeline(
      [row({ id: 'a', tweakNote: 'Less tamarind' }), row({ id: 'b' })],
      NOW,
    );
    expect(entries).toHaveLength(2);
    expect(entries.map((e) => e.tweakNote)).toContain(null);
  });

  it('sorts newest first regardless of the order rows arrive in', () => {
    const entries = buildCookTimeline(
      [
        row({ id: 'old', cookedAt: '2026-07-11T12:00:00' }),
        row({ id: 'new', cookedAt: '2026-07-25T12:00:00' }),
        row({ id: 'mid', cookedAt: '2026-07-18T12:00:00' }),
      ],
      NOW,
    );
    expect(entries.map((e) => e.id)).toEqual(['new', 'mid', 'old']);
  });

  it('drops the year while it is obvious and shows it once it is not', () => {
    const entries = buildCookTimeline(
      [
        row({ id: 'this-year', cookedAt: '2026-07-03T12:00:00' }),
        row({ id: 'last-year', cookedAt: '2025-07-03T12:00:00' }),
      ],
      NOW,
    );
    expect(entries.find((e) => e.id === 'this-year')?.dateLabel).toBe('3 Jul');
    expect(entries.find((e) => e.id === 'last-year')?.dateLabel).toBe('3 Jul 2025');
  });

  it('labels a rating with SPEC §7 wording, and leaves an unrated cook unlabelled', () => {
    expect(buildCookTimeline([row({ rating: 1 })], NOW)[0].ratingLabel).toBe('not again');
    expect(buildCookTimeline([row({ rating: 2 })], NOW)[0].ratingLabel).toBe('fine');
    expect(buildCookTimeline([row({ rating: 3 })], NOW)[0].ratingLabel).toBe(
      'make again',
    );
    expect(buildCookTimeline([row()], NOW)[0].ratingLabel).toBeNull();
    // A junk value reads as unrated rather than crashing the screen.
    expect(buildCookTimeline([row({ rating: 9 })], NOW)[0].ratingLabel).toBeNull();
  });

  it('trims a note and treats whitespace as no note', () => {
    expect(
      buildCookTimeline([row({ tweakNote: '  4 whistles ' })], NOW)[0].tweakNote,
    ).toBe('4 whistles');
    expect(buildCookTimeline([row({ tweakNote: '  ' })], NOW)[0].tweakNote).toBeNull();
  });

  it('carries the batch and estimated flags through for the label', () => {
    const entry = buildCookTimeline([row({ isBatch: true, isEstimated: true })], NOW)[0];
    expect(entry.isBatch).toBe(true);
    expect(entry.isEstimated).toBe(true);
  });

  it('round-trips what toCookEventRow just wrote', () => {
    // The two halves of Phase 6 meeting: a note typed into the sheet has to come back out.
    const written = toCookEventRow(input({ tweakNote: 'Cold rice only' }), 'e1', NOW);
    const entry = buildCookTimeline([written], NOW)[0];

    expect(entry.tweakNote).toBe('Cold rice only');
    expect(entry.cookedAt.getTime()).toBe(NOW.getTime());
  });

  it('is empty for a dish never cooked', () => {
    expect(buildCookTimeline([], NOW)).toEqual([]);
  });
});
