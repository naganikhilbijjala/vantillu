import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Vantillu schema.
 *
 * Two conventions apply to every table, both from `docs/SPEC.md` §11 — they cost
 * nothing now and are lossy or impossible to retrofit:
 *
 * - **UUID text primary keys** (§11.2). Autoincrement would have two devices both mint
 *   `dish.id = 7`. Ids are generated at the call site with `expo-crypto`'s `randomUUID()`,
 *   never as a column default — `drizzle-kit generate` runs this file in Node, where
 *   importing a native module would fail.
 * - **`updated_at` + `deleted_at`** (§11.3). Deletes are soft; every query filters
 *   `deleted_at IS NULL`. Timestamps are local ISO strings, never UTC (§2.1).
 *
 * Derived values (`daysSince`, `medianInterval`, `cookCount`) are never stored.
 */

/** The three columns every table carries. A function, so each table gets fresh builders. */
function timestamps() {
  return {
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
    deletedAt: text('deleted_at'),
  };
}

export const dish = sqliteTable(
  'dish',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    /** "also called" — regional names. Seeded from the seed file's `local_name`. */
    altName: text('alt_name'),
    /** Free text, seeded from `role_config`. No CHECK constraint — roles are renameable. */
    role: text('role').notNull(),
    primaryIngredient: text('primary_ingredient'),
    /** instant | quick | medium | project. Ranked by the fixed table in SPEC §1.2. */
    effort: text('effort').notNull(),
    /** Display only. Never enters a filter or the score. */
    minutes: integer('minutes'),
    isVeg: integer('is_veg', { mode: 'boolean' }).notNull().default(true),
    /** batter | soaked | marinated. Half of the live-prep match key (SPEC §5.2). */
    prepKind: text('prep_kind'),
    prepLeadHours: integer('prep_lead_hours'),
    prepLabel: text('prep_label'),
    usesLeftoverRice: integer('uses_leftover_rice', { mode: 'boolean' })
      .notNull()
      .default(false),
    isFestive: integer('is_festive', { mode: 'boolean' }).notNull().default(false),
    /** null means "any season" — never matches, never penalises. */
    season: text('season'),
    ingredientsText: text('ingredients_text'),
    methodText: text('method_text'),
    /** Stable notes about the dish. Per-cook observations go in `cook_event.tweak_note`. */
    notes: text('notes'),
    source: text('source'),
    isArchived: integer('is_archived', { mode: 'boolean' }).notNull().default(false),
    ...timestamps(),
  },
  (t) => [
    index('dish_role_idx').on(t.role),
    index('dish_deleted_at_idx').on(t.deletedAt),
  ],
);

/**
 * Many-to-many on purpose: tiffin is valid for breakfast *and* dinner. Never collapse
 * this into a single column on `dish`.
 *
 * Keeps its natural composite primary key rather than gaining a surrogate UUID. The
 * pair is already globally unique because `dish_id` is a UUID, and a surrogate key
 * would let the same (dish, slot) pair be inserted twice.
 */
export const dishSlot = sqliteTable(
  'dish_slot',
  {
    dishId: text('dish_id')
      .notNull()
      .references(() => dish.id, { onDelete: 'cascade' }),
    /** breakfast | lunch | dinner | snack */
    slot: text('slot').notNull(),
    ...timestamps(),
  },
  (t) => [
    primaryKey({ columns: [t.dishId, t.slot] }),
    index('dish_slot_slot_idx').on(t.slot),
  ],
);

export const cookEvent = sqliteTable(
  'cook_event',
  {
    id: text('id').primaryKey(),
    dishId: text('dish_id')
      .notNull()
      .references(() => dish.id, { onDelete: 'cascade' }),
    /** Full **local** ISO datetime (`2026-07-26T08:14:00`), not a date (SPEC §2.1). */
    cookedAt: text('cooked_at').notNull(),
    slot: text('slot').notNull(),
    /** Shared across dishes cooked as one meal. */
    mealId: text('meal_id'),
    /** 3-point: 1 not again | 2 fine | 3 make again. Never 5 stars. */
    rating: integer('rating'),
    /** Per-cook observation. The sequence of these becomes the real recipe. */
    tweakNote: text('tweak_note'),
    /** A reference into the device gallery — never copied into app storage (SPEC §10.4). */
    photoUri: text('photo_uri'),
    isBatch: integer('is_batch', { mode: 'boolean' }).notNull().default(false),
    /** Onboarding guesses: count toward daysSince, excluded from interval math (SPEC §3). */
    isEstimated: integer('is_estimated', { mode: 'boolean' }).notNull().default(false),
    ...timestamps(),
  },
  (t) => [
    index('cook_event_dish_id_idx').on(t.dishId),
    index('cook_event_cooked_at_idx').on(t.cookedAt),
    index('cook_event_meal_id_idx').on(t.mealId),
  ],
);

/**
 * Live prep. Matched to a dish on the `(kind, ingredient)` pair, which is what lets one
 * batter row cover idli/dosa/uttapam/punugulu while leaving out pesarattu (SPEC §5.2).
 */
export const prepState = sqliteTable(
  'prep_state',
  {
    id: text('id').primaryKey(),
    /** batter | soaked | marinated */
    kind: text('kind').notNull(),
    /** Matches `dish.primary_ingredient`. Nullable. */
    ingredient: text('ingredient'),
    label: text('label'),
    readyAt: text('ready_at'),
    expiresAt: text('expires_at'),
    ...timestamps(),
  },
  (t) => [index('prep_state_kind_ingredient_idx').on(t.kind, t.ingredient)],
);

/**
 * Always-available roles are configuration, not code. The engine reads
 * `is_always_available`; it must never test for the strings 'podi' or 'accompaniment',
 * because roles are renameable (SPEC §1.1).
 */
export const roleConfig = sqliteTable('role_config', {
  role: text('role').primaryKey(),
  label: text('label').notNull(),
  isAlwaysAvailable: integer('is_always_available', { mode: 'boolean' })
    .notNull()
    .default(false),
  sortOrder: integer('sort_order').notNull(),
  ...timestamps(),
});

export const setting = sqliteTable('setting', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  ...timestamps(),
});

export type Dish = typeof dish.$inferSelect;
export type NewDish = typeof dish.$inferInsert;
export type DishSlot = typeof dishSlot.$inferSelect;
export type NewDishSlot = typeof dishSlot.$inferInsert;
export type CookEvent = typeof cookEvent.$inferSelect;
export type NewCookEvent = typeof cookEvent.$inferInsert;
export type PrepState = typeof prepState.$inferSelect;
export type NewPrepState = typeof prepState.$inferInsert;
export type RoleConfig = typeof roleConfig.$inferSelect;
export type NewRoleConfig = typeof roleConfig.$inferInsert;
export type Setting = typeof setting.$inferSelect;
export type NewSetting = typeof setting.$inferInsert;
