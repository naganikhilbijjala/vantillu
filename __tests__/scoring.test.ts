import { describe, expect, it } from 'vitest';
import {
  buildSuggestions,
  checkEligibility,
  groupHeldBack,
  isEligible,
  JITTER_AMPLITUDE,
  jitter,
  MAX_REASON_CHIPS,
  rankCandidates,
  reasons,
  score,
  WEIGHTS,
} from '../src/core/scoring';
import { effortRank } from '../src/core/slots';
import { candidate, context } from './fixtures';

/**
 * `docs/SPEC.md` §4. Seven of these are named in `docs/IMPLEMENTATION.md` §5 as tests
 * that must exist; they keep their exact wording so the two documents stay greppable.
 */

describe('isEligible', () => {
  it('isEligible: ferment dish with no live batter → false', () => {
    const dosa = candidate({
      id: 'dosa',
      prepKind: 'batter',
      primaryIngredient: 'urad dal',
    });

    expect(isEligible(dosa, context({ livePrepDishIds: [] }))).toBe(false);
    expect(checkEligibility(dosa, context()).reason).toBe('prep_not_ready');

    // Suggesting dosa with no batter is worse than suggesting nothing — but with a live
    // batter it is an ordinary candidate again.
    expect(isEligible(dosa, context({ livePrepDishIds: ['dosa'] }))).toBe(true);
  });

  it('isEligible: non-veg on a veg-only day → false', () => {
    const eggCurry = candidate({ isVeg: false });

    expect(isEligible(eggCurry, context({ isVegOnlyDay: true }))).toBe(false);
    expect(checkEligibility(eggCurry, context({ isVegOnlyDay: true })).reason).toBe(
      'non_veg_day',
    );
    expect(isEligible(eggCurry, context({ isVegOnlyDay: false }))).toBe(true);
  });

  it('isEligible: project dish on a weekday breakfast → false', () => {
    const bobbatlu = candidate({ effort: 'project', slots: ['breakfast'] });
    const weekday = context({ slot: 'breakfast', isWeekend: false });

    expect(isEligible(bobbatlu, weekday)).toBe(false);
    expect(checkEligibility(bobbatlu, weekday).reason).toBe('over_effort_budget');

    // Sunday morning is the one time there is room for it.
    expect(isEligible(bobbatlu, context({ slot: 'breakfast', isWeekend: true }))).toBe(
      true,
    );
  });

  it('isEligible: always-available role excluded via the flag, not via a role string', () => {
    // The flag alone decides. A dish still literally named `podi` is eligible when the
    // flag is off, and a renamed role is excluded when the flag is on.
    const podiWithoutFlag = candidate({ role: 'podi', isAlwaysAvailable: false });
    expect(isEligible(podiWithoutFlag, context())).toBe(true);

    const renamed = candidate({ role: 'chutney_powder', isAlwaysAvailable: true });
    expect(isEligible(renamed, context())).toBe(false);
    expect(checkEligibility(renamed, context()).reason).toBe('always_available');
  });

  it('excludes archived dishes first of all', () => {
    const archived = candidate({ isArchived: true, isAlwaysAvailable: true });
    expect(checkEligibility(archived, context()).reason).toBe('archived');
  });

  it('excludes a dish that is not valid for this slot', () => {
    const breakfastOnly = candidate({ slots: ['breakfast'] });
    expect(checkEligibility(breakfastOnly, context({ slot: 'lunch' })).reason).toBe(
      'wrong_slot',
    );
  });

  it('keeps tiffin valid for breakfast and dinner both', () => {
    const idli = candidate({
      id: 'idli',
      role: 'tiffin',
      slots: ['breakfast', 'dinner'],
      prepKind: 'batter',
    });
    const withBatter = { livePrepDishIds: ['idli'] };

    expect(isEligible(idli, context({ slot: 'breakfast', ...withBatter }))).toBe(true);
    expect(isEligible(idli, context({ slot: 'dinner', ...withBatter }))).toBe(true);
    expect(isEligible(idli, context({ slot: 'lunch', ...withBatter }))).toBe(false);
  });

  it('reports the first failure, in the order SPEC §4.1 lists them', () => {
    // Fails every filter at once. Archived wins because it is checked first.
    const everything = candidate({
      isArchived: true,
      isAlwaysAvailable: true,
      slots: ['breakfast'],
      effort: 'project',
      prepKind: 'batter',
      isVeg: false,
    });
    expect(checkEligibility(everything, context({ isVegOnlyDay: true })).reason).toBe(
      'archived',
    );
  });
});

describe('score', () => {
  // Baseline: 7 days since, median 7 → staleness exactly 1.0, and nothing else applies.
  const baseline = 1;

  it('starts from the staleness ratio', () => {
    expect(score(candidate(), context())).toBe(baseline);
  });

  it('adds the effort-fit bonus for instant and quick only', () => {
    expect(score(candidate({ effort: 'instant' }), context())).toBe(
      baseline + WEIGHTS.effortFit,
    );
    expect(score(candidate({ effort: 'quick' }), context())).toBe(
      baseline + WEIGHTS.effortFit,
    );
    expect(score(candidate({ effort: 'medium' }), context())).toBe(baseline);
    expect(score(candidate({ effort: 'project' }), context())).toBe(baseline);
  });

  it('adds the leftover-rice bonus only when a rice staple was cooked in the last 24h', () => {
    const pulihora = candidate({ role: 'one_pot', usesLeftoverRice: true });
    expect(score(pulihora, context({ hadRiceStapleInLast24h: true }))).toBe(
      baseline + WEIGHTS.leftoverRice,
    );
    expect(score(pulihora, context({ hadRiceStapleInLast24h: false }))).toBe(baseline);
    expect(score(candidate(), context({ hadRiceStapleInLast24h: true }))).toBe(baseline);
  });

  it('adds the expiring-prep bonus — use the batter before it dies', () => {
    const dosa = candidate({ id: 'dosa', prepKind: 'batter' });
    expect(
      score(dosa, context({ livePrepDishIds: ['dosa'], expiringPrepDishIds: ['dosa'] })),
    ).toBe(baseline + WEIGHTS.expiringPrep);
    expect(score(dosa, context({ livePrepDishIds: ['dosa'] }))).toBe(baseline);
  });

  it('adds the season bonus, and treats a null season as "any"', () => {
    expect(score(candidate({ season: 'monsoon' }), context({ season: 'monsoon' }))).toBe(
      baseline + WEIGHTS.seasonMatch,
    );
    expect(score(candidate({ season: 'summer' }), context({ season: 'monsoon' }))).toBe(
      baseline,
    );
    // Null never matches and never penalises.
    expect(score(candidate({ season: null }), context({ season: 'monsoon' }))).toBe(
      baseline,
    );
  });

  it('subtracts for a primary ingredient cooked in the last two days', () => {
    expect(score(candidate(), context({ recentIngredients: ['toor dal'] }))).toBe(
      baseline + WEIGHTS.recentIngredient,
    );
  });

  it('never matches a null primary ingredient against the recent list', () => {
    const noIngredient = candidate({ primaryIngredient: null });
    expect(score(noIngredient, context({ recentIngredients: ['toor dal'] }))).toBe(
      baseline,
    );
  });

  it('subtracts when the role was already filled by a batch cook', () => {
    expect(
      score(candidate({ role: 'dal' }), context({ rolesFilledByBatch: ['dal'] })),
    ).toBe(baseline + WEIGHTS.roleFilledByBatch);
  });

  it('subtracts for a last rating of 1, and treats 2 and 3 as neutral', () => {
    expect(score(candidate({ lastRating: 1 }), context())).toBe(
      baseline + WEIGHTS.ratedNotAgain,
    );
    // A 3 is not a bonus — boosting favourites would collapse the repertoire.
    expect(score(candidate({ lastRating: 2 }), context())).toBe(baseline);
    expect(score(candidate({ lastRating: 3 }), context())).toBe(baseline);
  });

  it('score: primary ingredient cooked yesterday ranks below a stale dish', () => {
    // Aloo fry is due today, but potato was on the table yesterday.
    const alooFry = candidate({
      id: 'aloo-fry',
      primaryIngredient: 'potato',
      daysSince: 6,
      medianInterval: 6,
    });
    // Beerakaya is twice as overdue and its ingredient has not come up.
    const beerakaya = candidate({
      id: 'beerakaya',
      primaryIngredient: 'ridge gourd',
      daysSince: 12,
      medianInterval: 6,
    });
    const ctx = context({ recentIngredients: ['potato'] });

    expect(score(alooFry, ctx)).toBeLessThan(score(beerakaya, ctx));

    // The penalty is deliberately large enough to sink an otherwise-due dish below
    // neutral, so it does not merely slip a place or two.
    expect(score(alooFry, ctx)).toBeLessThan(0);

    const ranked = rankCandidates([alooFry, beerakaya], ctx, null);
    expect(ranked.map((r) => r.candidate.id)).toEqual(['beerakaya', 'aloo-fry']);
  });

  it('score: identical inputs → identical output (deterministic)', () => {
    // Two structurally identical candidates, and the same candidate scored repeatedly.
    // Any jitter inside score() would break both halves of this.
    const ctx = context({ recentIngredients: ['okra'], hadRiceStapleInLast24h: true });
    const first = candidate({
      effort: 'quick',
      season: 'monsoon',
      usesLeftoverRice: true,
    });
    const second = candidate({
      effort: 'quick',
      season: 'monsoon',
      usesLeftoverRice: true,
    });

    expect(score(first, ctx)).toBe(score(second, ctx));

    const repeated = Array.from({ length: 5 }, () => score(first, ctx));
    expect(new Set(repeated).size).toBe(1);
  });

  it('score: called on a candidate that fails isEligible → no effort-fit bonus', () => {
    // The regression the `indexOf` sketch would fail: `project` is absent from a weekday
    // breakfast budget, `indexOf` returns -1, and -1 < 2 reads as "very quick".
    const bobbatlu = candidate({ effort: 'project', slots: ['breakfast'] });
    const weekdayBreakfast = context({ slot: 'breakfast', isWeekend: false });

    expect(isEligible(bobbatlu, weekdayBreakfast)).toBe(false);
    expect(effortRank('project')).toBe(3);
    expect(score(bobbatlu, weekdayBreakfast)).toBe(baseline);
  });

  it('scores a never-cooked dish neutrally rather than infinitely stale', () => {
    const brandNew = candidate({ daysSince: null, medianInterval: null });
    expect(score(brandNew, context())).toBe(baseline);
  });
});

describe('reasons', () => {
  it('states the staleness bucket in the wording SPEC §4.6 fixes', () => {
    const stale = (daysSince: number | null, medianInterval: number | null) =>
      reasons(candidate({ daysSince, medianInterval }), context())[0];

    expect(stale(4, null)).toMatchObject({ kind: 'staleness', label: 'new dish' });
    expect(stale(3, 6)).toMatchObject({ state: 'recent', label: '3 days ago' });
    expect(stale(7, 7)).toMatchObject({ state: 'due', label: 'due, 7 days' });
    expect(stale(14, 7)).toMatchObject({
      state: 'overdue',
      label: '14 days — long overdue',
    });
  });

  it('says "1 day" rather than "1 days"', () => {
    expect(
      reasons(candidate({ daysSince: 1, medianInterval: 6 }), context())[0].label,
    ).toBe('1 day ago');
  });

  it('always states at least one reason — a suggestion without one gets ignored', () => {
    expect(reasons(candidate(), context()).length).toBeGreaterThan(0);
  });

  it('orders chips by precedence and caps them at three', () => {
    const dosa = candidate({
      id: 'dosa',
      effort: 'quick',
      prepKind: 'batter',
      usesLeftoverRice: true,
      daysSince: 14,
      medianInterval: 7,
    });
    const ctx = context({ livePrepDishIds: ['dosa'], hadRiceStapleInLast24h: true });

    const chips = reasons(dosa, ctx);
    expect(chips).toHaveLength(MAX_REASON_CHIPS);
    // staleness → prep ready → leftover rice → quick, with quick falling off the end.
    expect(chips.map((c) => c.kind)).toEqual([
      'staleness',
      'prep_ready',
      'leftover_rice',
    ]);
    expect(chips[1].label).toBe('batter is ready');
    expect(chips[2].label).toBe('leftover rice');
  });

  it('shows the quick chip when nothing ahead of it applies', () => {
    const upma = candidate({ effort: 'quick' });
    expect(reasons(upma, context()).map((c) => c.kind)).toEqual(['staleness', 'quick']);
  });

  it('only claims prep is ready when it actually is', () => {
    const dosa = candidate({ id: 'dosa', prepKind: 'batter' });
    expect(reasons(dosa, context()).map((c) => c.kind)).not.toContain('prep_ready');
  });

  it('flags prep that is about to expire without changing the chip order', () => {
    const dosa = candidate({ id: 'dosa', prepKind: 'batter' });
    const ctx = context({ livePrepDishIds: ['dosa'], expiringPrepDishIds: ['dosa'] });
    expect(reasons(dosa, ctx)[1]).toMatchObject({
      kind: 'prep_ready',
      expiringSoon: true,
    });
  });
});

describe('jitter', () => {
  it('stays inside ±0.15', () => {
    for (let i = 0; i < 500; i++) {
      const value = jitter(`dish-${i}`, '2026-07-27');
      expect(Math.abs(value)).toBeLessThanOrEqual(JITTER_AMPLITUDE);
    }
  });

  it('is stable within a day and reshuffles tomorrow', () => {
    // Re-rendering Today, or backgrounding and reopening, must never reorder anything.
    expect(jitter('dish-1', '2026-07-27')).toBe(jitter('dish-1', '2026-07-27'));
    expect(jitter('dish-1', '2026-07-27')).not.toBe(jitter('dish-1', '2026-07-28'));
    expect(jitter('dish-1', '2026-07-27')).not.toBe(jitter('dish-2', '2026-07-27'));
  });
});

describe('rankCandidates', () => {
  it('sorts by score descending', () => {
    const overdue = candidate({ id: 'overdue', daysSince: 21, medianInterval: 7 });
    const due = candidate({ id: 'due', daysSince: 7, medianInterval: 7 });
    const fresh = candidate({ id: 'fresh', daysSince: 1, medianInterval: 7 });

    const ranked = rankCandidates([fresh, overdue, due], context(), null);
    expect(ranked.map((r) => r.candidate.id)).toEqual(['overdue', 'due', 'fresh']);
  });

  it('breaks ties on daysSince, then createdAt, then id', () => {
    // All three score exactly 1.0 — median unknown, so staleness is neutral.
    const tie = { medianInterval: null, effort: 'medium' as const };
    const a = candidate({
      ...tie,
      id: 'c',
      daysSince: 3,
      createdAt: '2026-01-01T00:00:00',
    });
    const b = candidate({
      ...tie,
      id: 'b',
      daysSince: 9,
      createdAt: '2026-03-01T00:00:00',
    });
    const c = candidate({
      ...tie,
      id: 'a',
      daysSince: 3,
      createdAt: '2026-01-01T00:00:00',
    });
    const d = candidate({
      ...tie,
      id: 'd',
      daysSince: 3,
      createdAt: '2025-06-01T00:00:00',
    });

    const ranked = rankCandidates([a, b, c, d], context(), null);
    expect(ranked.every((r) => r.score === 1)).toBe(true);
    // b is stalest; then d by the older createdAt; then a and c split by id.
    expect(ranked.map((r) => r.candidate.id)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('treats a never-cooked dish as staler than any cooked one when scores tie', () => {
    const tie = { medianInterval: null };
    const never = candidate({ ...tie, id: 'never', daysSince: null });
    const longAgo = candidate({ ...tie, id: 'long-ago', daysSince: 90 });

    const ranked = rankCandidates([longAgo, never], context(), null);
    expect(ranked.map((r) => r.candidate.id)).toEqual(['never', 'long-ago']);
  });

  it('falls through to createdAt when two never-cooked dishes tie', () => {
    // Both daysSince are effectively infinite; the comparator must not produce a NaN.
    const tie = { medianInterval: null, daysSince: null };
    const newer = candidate({ ...tie, id: 'a', createdAt: '2026-05-01T00:00:00' });
    const older = candidate({ ...tie, id: 'z', createdAt: '2026-02-01T00:00:00' });

    const ranked = rankCandidates([newer, older], context(), null);
    expect(ranked.map((r) => r.candidate.id)).toEqual(['z', 'a']);
  });

  it('drops ineligible candidates', () => {
    const eligible = candidate({ id: 'ok' });
    const archived = candidate({ id: 'archived', isArchived: true });
    const ranked = rankCandidates([eligible, archived], context(), null);
    expect(ranked.map((r) => r.candidate.id)).toEqual(['ok']);
  });

  it('applies jitter to the ranking score while leaving score untouched', () => {
    const dish = candidate({ id: 'dish-1' });
    const [ranked] = rankCandidates([dish], context(), '2026-07-27');
    expect(ranked.score).toBe(1);
    expect(ranked.rankScore).toBe(1 + jitter('dish-1', '2026-07-27'));
  });

  it('produces the same order every time for the same day', () => {
    const dishes = Array.from({ length: 8 }, (_, i) =>
      candidate({ id: `dish-${i}`, daysSince: 7 + (i % 3), medianInterval: 7 }),
    );
    const order = () =>
      rankCandidates(dishes, context(), '2026-07-27').map((r) => r.candidate.id);

    expect(order()).toEqual(order());
  });

  it('does not mutate the array it is given', () => {
    const dishes = [candidate({ id: 'b' }), candidate({ id: 'a' })];
    rankCandidates(dishes, context(), null);
    expect(dishes.map((d) => d.id)).toEqual(['b', 'a']);
  });
});

describe('buildSuggestions', () => {
  const alooFry = candidate({ id: 'aloo-fry', name: 'Aloo fry' });
  const bobbatlu = candidate({
    id: 'bobbatlu',
    name: 'Bobbatlu',
    effort: 'project',
    slots: ['breakfast'],
  });
  const rajma = candidate({
    id: 'rajma',
    name: 'Rajma',
    slots: ['breakfast'],
    prepKind: 'soaked',
    prepLabel: 'soak overnight',
  });
  const eggCurry = candidate({
    id: 'egg-curry',
    name: 'Egg curry',
    slots: ['breakfast'],
    isVeg: false,
  });
  const archived = candidate({ id: 'archived', name: 'Old thing', isArchived: true });
  const podi = candidate({
    id: 'podi',
    name: 'Karivepaku podi',
    isAlwaysAvailable: true,
  });
  const dinnerOnly = candidate({ id: 'dinner-only', name: 'Upma', slots: ['dinner'] });

  const all = [alooFry, bobbatlu, rajma, eggCurry, archived, podi, dinnerOnly];
  const ctx = context({ slot: 'breakfast', isWeekend: false, isVegOnlyDay: true });

  it('separates what to cook from what was held back', () => {
    const { suggestions, heldBack } = buildSuggestions(all, ctx, null);

    // alooFry is lunch/dinner only, so nothing survives a veg-only weekday breakfast here.
    expect(suggestions).toHaveLength(0);
    expect(heldBack.map((h) => h.candidate.id).sort()).toEqual([
      'bobbatlu',
      'egg-curry',
      'rajma',
    ]);
  });

  it('stays silent about archived, always-available and wrong-slot dishes', () => {
    // Surfacing these would list most of the repertoire; a held-back note is for
    // dishes the user actually expected to see.
    const { heldBack } = buildSuggestions(all, ctx, null);
    const ids = heldBack.map((h) => h.candidate.id);
    expect(ids).not.toContain('archived');
    expect(ids).not.toContain('podi');
    expect(ids).not.toContain('aloo-fry');
    expect(ids).not.toContain('dinner-only');
  });

  it('attaches reasons to every suggestion', () => {
    const { suggestions } = buildSuggestions(
      all,
      context({ slot: 'lunch', isWeekend: false }),
      null,
    );
    expect(suggestions.length).toBeGreaterThan(0);
    for (const suggestion of suggestions) {
      expect(suggestion.reasons.length).toBeGreaterThan(0);
      expect(suggestion.reasons.length).toBeLessThanOrEqual(MAX_REASON_CHIPS);
    }
  });
});

describe('groupHeldBack', () => {
  it('groups by reason in the order SPEC §4.1 lists the filters', () => {
    const { heldBack } = buildSuggestions(
      [
        candidate({ id: 'egg-curry', slots: ['breakfast'], isVeg: false }),
        candidate({ id: 'rajma', slots: ['breakfast'], prepKind: 'soaked' }),
        candidate({ id: 'bobbatlu', slots: ['breakfast'], effort: 'project' }),
        candidate({ id: 'gutti', slots: ['breakfast'], effort: 'project' }),
      ],
      context({ slot: 'breakfast', isVegOnlyDay: true }),
      null,
    );

    const groups = groupHeldBack(heldBack);
    expect(groups.map((g) => g.reason)).toEqual([
      'over_effort_budget',
      'prep_not_ready',
      'non_veg_day',
    ]);
    expect(groups[0].candidates.map((c) => c.id)).toEqual(['bobbatlu', 'gutti']);
  });

  it('returns nothing when nothing was held back', () => {
    expect(groupHeldBack([])).toEqual([]);
  });
});
