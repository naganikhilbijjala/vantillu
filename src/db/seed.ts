import { count } from 'drizzle-orm';
import { db } from './client';
import { DEFAULT_ROLES } from './roles';
import { type NewRoleConfig, roleConfig } from './schema';
import { nowLocalIso } from './time';

/**
 * First-run configuration.
 *
 * Until Phase 8 this module also inserted all sixty-eight seed dishes on first launch.
 * It does not any more: **the dishes are chosen by the user in onboarding** and inserted
 * by `queries/onboarding.ts`, because a repertoire nobody picked is a list of other
 * people's cooking (`docs/SPEC.md` §18.1). The mapping itself moved to `seedCatalog.ts`,
 * which is pure and can therefore be shared with the picker and with the tests.
 *
 * What is left is `role_config`, which is configuration rather than content: every screen
 * needs role labels, the always-available flag is what keeps podi out of the suggestions
 * (§1.1), and the picker itself groups by role — so it has to exist before the user has
 * decided anything.
 */

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

/**
 * Idempotent: seeded only when the table is completely empty, so a user who has renamed or
 * removed a role does not get the defaults back on the next launch. The count includes
 * soft-deleted rows for exactly that reason.
 *
 * Synchronous throughout — the expo-sqlite driver is a sync driver, and one transaction
 * means a crash mid-write leaves no half-populated table.
 */
export function seedRoleConfigIfEmpty(): number {
  const now = nowLocalIso();

  return db.transaction((tx) => {
    const existing = tx.select({ n: count() }).from(roleConfig).get()?.n ?? 0;
    if (existing > 0) return 0;

    const rows = toRoleConfigRows(now);
    tx.insert(roleConfig).values(rows).run();
    return rows.length;
  });
}
