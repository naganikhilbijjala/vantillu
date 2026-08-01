import { describe, expect, it } from 'vitest';
import {
  BUCKET_DAYS_AGO,
  defaultSelection,
  ESTIMATE_HOUR,
  estimatedCookedAt,
  estimatedSlot,
  groupCatalogByRole,
  isSectionFull,
  LAST_COOKED_OPTIONS,
  type LastCookedBucket,
  pruneEstimates,
  selectedEntries,
  setBucket,
  setSectionKeys,
  toEstimatedCookEventRow,
  toggleKey,
} from '../src/db/onboardingModel';
import type { RoleConfigRow } from '../src/db/roles';
import type { SeedCatalogEntry } from '../src/db/seedCatalog';
import { toLocalIso } from '../src/db/time';
import { day } from './fixtures';

/**
 * The onboarding model in isolation (Phase 8). The end-to-end pass over the real seed file
 * lives in `seedPipeline.test.ts`; this file is the arithmetic and the edge cases.
 */

function entry(overrides: Partial<SeedCatalogEntry> = {}): SeedCatalogEntry {
  return {
    key: 'Sambar',
    name: 'Sambar',
    altName: 'Sambar',
    role: 'gravy',
    primaryIngredient: 'toor dal',
    effort: 'medium',
    minutes: 35,
    isVeg: true,
    prepKind: null,
    prepLeadHours: null,
    prepLabel: null,
    usesLeftoverRice: false,
    isFestive: false,
    season: null,
    slots: ['lunch', 'dinner'],
    ...overrides,
  };
}

function role(
  name: string,
  sortOrder: number,
  label = name.toUpperCase(),
): RoleConfigRow {
  return { role: name, label, isAlwaysAvailable: false, sortOrder };
}

/** Monday 27 July 2026, midday. */
const MONDAY = day(2026, 7, 27);

// ---------------------------------------------------------------------------

describe('grouping the catalogue', () => {
  const catalog = [
    entry({ key: 'a', name: 'a', role: 'dal' }),
    entry({ key: 'b', name: 'b', role: 'staple' }),
    entry({ key: 'c', name: 'c', role: 'dal' }),
  ];

  it('follows role_config order, not the order dishes happen to appear in', () => {
    const sections = groupCatalogByRole(catalog, [role('dal', 2), role('staple', 1)]);
    expect(sections.map((s) => s.role)).toEqual(['staple', 'dal']);
    expect(sections[1].entries.map((e) => e.key)).toEqual(['a', 'c']);
  });

  it('drops a role nothing uses rather than drawing an empty heading', () => {
    const sections = groupCatalogByRole(catalog, [
      role('dal', 1),
      role('sweet', 2),
      role('staple', 3),
    ]);
    expect(sections.map((s) => s.role)).toEqual(['dal', 'staple']);
  });

  it('still shows a dish whose role has no config row, labelled with the raw role', () => {
    // Losing a dish because the seed and the defaults disagreed would be far worse than
    // an ugly heading — the user would simply never be offered it.
    const sections = groupCatalogByRole(catalog, [role('staple', 1)]);
    expect(sections.map((s) => s.role)).toEqual(['staple', 'dal']);
    expect(sections[1].label).toBe('dal');
    expect(sections.flatMap((s) => s.entries)).toHaveLength(3);
  });
});

describe('the selection', () => {
  const catalog = [entry({ key: 'a' }), entry({ key: 'b' }), entry({ key: 'c' })];

  it('starts with everything ticked', () => {
    expect([...defaultSelection(catalog)].sort()).toEqual(['a', 'b', 'c']);
  });

  it('toggles one key without touching the others, and does not mutate', () => {
    const before = defaultSelection(catalog);
    const after = toggleKey(before, 'b');

    expect(before.has('b')).toBe(true);
    expect(after.has('b')).toBe(false);
    expect(after.has('a')).toBe(true);
    expect(toggleKey(after, 'b').has('b')).toBe(true);
  });

  it('ticks and unticks a whole section', () => {
    const none = setSectionKeys(defaultSelection(catalog), catalog, false);
    expect(none.size).toBe(0);
    expect(isSectionFull(none, catalog)).toBe(false);

    const all = setSectionKeys(none, catalog, true);
    expect(isSectionFull(all, catalog)).toBe(true);
  });

  it('reports an empty section as not full, so its button reads All', () => {
    // `every` on an empty array is true, which would render "None" over nothing to clear.
    expect(isSectionFull(new Set(), [])).toBe(false);
  });

  it('returns the picked entries in catalogue order, not selection order', () => {
    const selected = new Set(['c', 'a']);
    expect(selectedEntries(catalog, selected).map((e) => e.key)).toEqual(['a', 'c']);
  });
});

describe('the last-cooked buckets', () => {
  it('keeps the option list and the day table in step', () => {
    // Two exports of the same fact — the screen reads the options, the row builder reads
    // the table — so a bucket added to one and not the other fails here rather than
    // silently writing an undefined number of days.
    for (const option of LAST_COOKED_OPTIONS) {
      expect(BUCKET_DAYS_AGO[option.value]).toBe(option.daysAgo);
    }
    expect(LAST_COOKED_OPTIONS).toHaveLength(Object.keys(BUCKET_DAYS_AGO).length);
  });

  it('stays outside the two-day recent-ingredient window at its freshest', () => {
    // SPEC §4.3's penalty is −4.0 and covers two calendar days. A shrug must not fire it.
    expect(BUCKET_DAYS_AGO.days).toBeGreaterThan(2);
  });

  it('sets, clears on a second tap, and leaves other dishes alone', () => {
    const one = setBucket(new Map(), 'a', 'weeks');
    expect(one.get('a')).toBe('weeks');

    const changed = setBucket(one, 'a', 'months');
    expect(changed.get('a')).toBe('months');

    // The way back to "didn't say" after a mis-tap.
    expect(setBucket(changed, 'a', 'months').has('a')).toBe(false);
    expect(setBucket(one, 'b', 'days').get('a')).toBe('weeks');
  });

  it('drops estimates for dishes that were unticked on the way back', () => {
    const estimates = new Map<string, LastCookedBucket>([
      ['a', 'days'],
      ['b', 'weeks'],
    ]);
    expect([...pruneEstimates(estimates, new Set(['a']))]).toEqual([['a', 'days']]);
  });
});

describe('the estimated cook event', () => {
  it('files the dish under its first valid slot', () => {
    expect(estimatedSlot(['dinner', 'lunch'])).toBe('dinner');
    // A slot string nothing recognises is skipped rather than stored.
    expect(estimatedSlot(['brunch', 'lunch'])).toBe('lunch');
    // Not in the seed; a hand-edited row could reach here.
    expect(estimatedSlot([])).toBe('dinner');
    expect(estimatedSlot(['brunch'])).toBe('dinner');
  });

  it('backdates by the bucket midpoint, at the slot hour', () => {
    const at = estimatedCookedAt('weeks', 'breakfast', MONDAY);
    expect(toLocalIso(at)).toBe('2026-07-06T08:00:00');
    expect(at.getHours()).toBe(ESTIMATE_HOUR.breakfast);
  });

  it('crosses a month boundary by calendar days, not by arithmetic on the date', () => {
    expect(toLocalIso(estimatedCookedAt('months', 'lunch', day(2026, 1, 15)))).toBe(
      '2025-11-16T13:00:00',
    );
  });

  it('marks the row estimated and leaves every judgement off it', () => {
    const row = toEstimatedCookEventRow(
      { dishId: 'dish-1', slots: ['lunch'], bucket: 'days' },
      'event-1',
      MONDAY,
    );

    expect(row).toMatchObject({
      id: 'event-1',
      dishId: 'dish-1',
      slot: 'lunch',
      cookedAt: '2026-07-24T13:00:00',
      isEstimated: true,
      // Onboarding asks when, not how it went, and a guess is nobody's meal (SPEC §7.1).
      rating: null,
      tweakNote: null,
      isBatch: false,
      mealId: null,
      photoUri: null,
      deletedAt: null,
    });
  });

  it('records when the row was written, not when the cook is guessed to have been', () => {
    const row = toEstimatedCookEventRow(
      { dishId: 'dish-1', slots: ['lunch'], bucket: 'months' },
      'event-1',
      MONDAY,
    );
    expect(row.createdAt).toBe(toLocalIso(MONDAY));
    expect(row.updatedAt).toBe(row.createdAt);
    expect(row.cookedAt < row.createdAt).toBe(true);
  });
});
