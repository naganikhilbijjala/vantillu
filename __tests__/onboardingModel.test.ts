import { describe, expect, it } from 'vitest';
import {
  groupCatalogByRole,
  isSectionFull,
  selectedEntries,
  setSectionKeys,
  toggleKey,
} from '../src/db/onboardingModel';
import type { RoleConfigRow } from '../src/db/roles';
import type { SeedCatalogEntry } from '../src/db/seedCatalog';

/**
 * The onboarding starter list in isolation. The end-to-end pass over the real seed file
 * lives in `seedPipeline.test.ts`.
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

  it('toggles one key without touching the others, and does not mutate', () => {
    const before: ReadonlySet<string> = new Set(['a', 'b']);
    const after = toggleKey(before, 'b');

    expect(before.has('b')).toBe(true);
    expect(after.has('b')).toBe(false);
    expect(after.has('a')).toBe(true);
    expect(toggleKey(after, 'b').has('b')).toBe(true);
  });

  it('ticks and unticks a whole section', () => {
    const all = setSectionKeys(new Set(), catalog, true);
    expect(isSectionFull(all, catalog)).toBe(true);

    const none = setSectionKeys(all, catalog, false);
    expect(none.size).toBe(0);
    expect(isSectionFull(none, catalog)).toBe(false);
  });

  it('reports an empty section as not full, so its button reads All', () => {
    // `every` on an empty array is true, which would render "None" over nothing to clear.
    expect(isSectionFull(new Set(), [])).toBe(false);
  });

  it('returns the picked entries in catalogue order, not selection order', () => {
    expect(selectedEntries(catalog, new Set(['c', 'a'])).map((e) => e.key)).toEqual([
      'a',
      'c',
    ]);
  });

  it('picks nothing from an empty selection, which is where onboarding starts', () => {
    // The starter list is a shortcut, not a default repertoire (SPEC §18.1). Pre-ticking
    // it would make a stranger's list the answer to "what do you cook".
    expect(selectedEntries(catalog, new Set())).toEqual([]);
  });
});
