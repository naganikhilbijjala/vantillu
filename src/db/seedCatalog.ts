import seedFile from '../../assets/seed_dishes.json';

/**
 * The seed repertoire, normalised — and the mapping from it onto `dish` rows.
 *
 * `assets/seed_dishes.json` predates the current model: snake_case keys, `0|1` for
 * booleans, a `prep` enum, and `local_name` for what is now `dish.altName`. The mapper
 * below is deliberately an explicit per-field assignment rather than a spread — the two
 * shapes genuinely differ, and a spread would silently carry stale keys through
 * (`docs/SPEC.md` §5.4).
 *
 * **Pure: no `db`, no `expo-crypto`, no clock.** It was inside `seed.ts` until Phase 8,
 * which needed the same rows in two more places — the onboarding picker renders the
 * catalogue *before* any of it is in the database, and `__tests__/seedPipeline.test.ts`
 * had been keeping a hand-copied duplicate of this mapping precisely because it could not
 * import a module that pulls in a native one. Two copies of a mapping are two chances for
 * the seed and the engine to drift apart without a failing test.
 */

/** The seed file's own vocabulary, not the app's. */
export type SeedPrep = 'none' | 'soak_overnight' | 'ferment';

interface SeedDish {
  name: string;
  local_name: string | null;
  role: string;
  primary_ingredient: string | null;
  effort: string;
  minutes: number | null;
  is_veg: number;
  prep: SeedPrep;
  slots: string[];
  season?: string | null;
  uses_leftover_rice?: number;
  is_festive?: number;
}

interface SeedFile {
  version: number;
  dishes: SeedDish[];
}

/** Seed `prep` enum → the generalised prep model (`docs/SPEC.md` §5.4). */
interface PrepMapping {
  prepKind: string | null;
  prepLeadHours: number | null;
  prepLabel: string | null;
}

const PREP_BY_SEED_VALUE: Record<SeedPrep, PrepMapping> = {
  none: { prepKind: null, prepLeadHours: null, prepLabel: null },
  soak_overnight: { prepKind: 'soaked', prepLeadHours: 8, prepLabel: 'soak overnight' },
  ferment: { prepKind: 'batter', prepLeadHours: 12, prepLabel: 'grind and ferment' },
};

/**
 * One seed dish in the app's own vocabulary, before it has an id or a timestamp.
 *
 * This is what the onboarding picker lists, so it carries the fields a person needs in
 * order to recognise a dish — the regional name, the effort, the minutes — and not only
 * the ones the engine scores on.
 */
export interface SeedCatalogEntry {
  /**
   * Stable identity for a seed dish while it is only a checkbox. The name, which is
   * unique across the file and asserted to be in `__tests__/seedPipeline.test.ts`.
   *
   * Not the array index: the picker's selection outlives a scroll, and reordering the
   * seed file would silently re-point every tick to a different dish.
   */
  key: string;
  name: string;
  altName: string | null;
  role: string;
  primaryIngredient: string | null;
  effort: string;
  minutes: number | null;
  isVeg: boolean;
  prepKind: string | null;
  prepLeadHours: number | null;
  prepLabel: string | null;
  usesLeftoverRice: boolean;
  isFestive: boolean;
  season: string | null;
  slots: string[];
}

/** Exactly the columns `dish` declares, as `seedCatalog` supplies them. */
export interface NewDishRow {
  id: string;
  name: string;
  altName: string | null;
  role: string;
  primaryIngredient: string | null;
  effort: string;
  minutes: number | null;
  isVeg: boolean;
  prepKind: string | null;
  prepLeadHours: number | null;
  prepLabel: string | null;
  usesLeftoverRice: boolean;
  isFestive: boolean;
  season: string | null;
  ingredientsText: string | null;
  methodText: string | null;
  notes: string | null;
  source: string | null;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

/** Exactly the columns `dish_slot` declares. */
export interface NewDishSlotRow {
  dishId: string;
  slot: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

function toCatalogEntry(seed: SeedDish): SeedCatalogEntry {
  const prep = PREP_BY_SEED_VALUE[seed.prep];
  if (!prep) {
    throw new Error(`Seed dish "${seed.name}" has unknown prep value "${seed.prep}"`);
  }

  return {
    key: seed.name,
    name: seed.name,
    altName: seed.local_name ?? null,
    role: seed.role,
    primaryIngredient: seed.primary_ingredient ?? null,
    effort: seed.effort,
    minutes: seed.minutes ?? null,
    isVeg: seed.is_veg === 1,
    prepKind: prep.prepKind,
    prepLeadHours: prep.prepLeadHours,
    prepLabel: prep.prepLabel,
    usesLeftoverRice: seed.uses_leftover_rice === 1,
    isFestive: seed.is_festive === 1,
    season: seed.season ?? null,
    slots: seed.slots,
  };
}

/** The whole seed file, mapped once at import. Sixty-eight rows of plain objects. */
export const SEED_CATALOG: readonly SeedCatalogEntry[] = (
  seedFile as unknown as SeedFile
).dishes.map(toCatalogEntry);

export function toDishRow(entry: SeedCatalogEntry, id: string, now: string): NewDishRow {
  return {
    id,
    name: entry.name,
    altName: entry.altName,
    role: entry.role,
    primaryIngredient: entry.primaryIngredient,
    effort: entry.effort,
    minutes: entry.minutes,
    isVeg: entry.isVeg,
    prepKind: entry.prepKind,
    prepLeadHours: entry.prepLeadHours,
    prepLabel: entry.prepLabel,
    usesLeftoverRice: entry.usesLeftoverRice,
    isFestive: entry.isFestive,
    season: entry.season,
    // Recipes and notes are the user's to write; a dish without one is a normal dish.
    ingredientsText: null,
    methodText: null,
    notes: null,
    source: null,
    isArchived: false,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

export function toDishSlotRows(
  entry: SeedCatalogEntry,
  dishId: string,
  now: string,
): NewDishSlotRow[] {
  return entry.slots.map((slot) => ({
    dishId,
    slot,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }));
}
