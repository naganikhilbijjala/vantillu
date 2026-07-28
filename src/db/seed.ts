import { count } from 'drizzle-orm';
import { randomUUID } from 'expo-crypto';
import seedFile from '../../assets/seed_dishes.json';
import { db } from './client';
import { DEFAULT_ROLES } from './roles';
import {
  dish,
  dishSlot,
  type NewDish,
  type NewDishSlot,
  type NewRoleConfig,
  roleConfig,
} from './schema';
import { nowLocalIso } from './time';

/**
 * First-run seed loader.
 *
 * `assets/seed_dishes.json` predates the current model: it uses snake_case, `0|1` for
 * booleans, a `prep` enum, and `local_name` for what is now `dish.altName`. The mapper
 * below is deliberately an explicit per-field assignment rather than a spread — the two
 * shapes genuinely differ, and a spread would silently carry stale keys through
 * (`docs/SPEC.md` §5.4).
 */

/** The seed file's own vocabulary, not the app's. */
type SeedPrep = 'none' | 'soak_overnight' | 'ferment';

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
 * SQLite binds one host parameter per column per row. Chunking keeps a multi-row insert
 * well under the variable limit regardless of how large the seed file grows.
 */
const MAX_BOUND_PARAMETERS = 900;

function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

function toDishRow(seed: SeedDish, id: string, now: string): NewDish {
  const prep = PREP_BY_SEED_VALUE[seed.prep];
  if (!prep) {
    throw new Error(`Seed dish "${seed.name}" has unknown prep value "${seed.prep}"`);
  }

  return {
    id,
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

function toDishSlotRows(seed: SeedDish, dishId: string, now: string): NewDishSlot[] {
  return seed.slots.map((slot) => ({
    dishId,
    slot,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }));
}

function toRoleConfigRows(now: string): NewRoleConfig[] {
  return DEFAULT_ROLES.map((role, sortOrder) => ({
    role: role.role,
    label: role.label,
    isAlwaysAvailable: role.isAlwaysAvailable,
    sortOrder,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  }));
}

export interface SeedResult {
  rolesInserted: number;
  dishesInserted: number;
  slotsInserted: number;
}

/**
 * Idempotent: each table is seeded only when it is completely empty, so a user who has
 * archived or deleted every seeded dish does not get them back on the next launch.
 * Counts include soft-deleted rows for exactly that reason.
 *
 * Synchronous throughout — the expo-sqlite driver is a sync driver, and running this
 * inside one transaction means a crash mid-seed leaves no half-populated database.
 */
export function seedDatabaseIfEmpty(): SeedResult {
  const { dishes } = seedFile as unknown as SeedFile;
  const now = nowLocalIso();

  return db.transaction((tx) => {
    const result: SeedResult = { rolesInserted: 0, dishesInserted: 0, slotsInserted: 0 };

    const existingRoles = tx.select({ n: count() }).from(roleConfig).get()?.n ?? 0;
    if (existingRoles === 0) {
      const rows = toRoleConfigRows(now);
      for (const part of chunk(rows, Math.floor(MAX_BOUND_PARAMETERS / 7))) {
        tx.insert(roleConfig).values(part).run();
      }
      result.rolesInserted = rows.length;
    }

    const existingDishes = tx.select({ n: count() }).from(dish).get()?.n ?? 0;
    if (existingDishes === 0) {
      const dishRows: NewDish[] = [];
      const slotRows: NewDishSlot[] = [];
      for (const seed of dishes) {
        const id = randomUUID();
        dishRows.push(toDishRow(seed, id, now));
        slotRows.push(...toDishSlotRows(seed, id, now));
      }

      for (const part of chunk(dishRows, Math.floor(MAX_BOUND_PARAMETERS / 22))) {
        tx.insert(dish).values(part).run();
      }
      for (const part of chunk(slotRows, Math.floor(MAX_BOUND_PARAMETERS / 5))) {
        tx.insert(dishSlot).values(part).run();
      }

      result.dishesInserted = dishRows.length;
      result.slotsInserted = slotRows.length;
    }

    return result;
  });
}
