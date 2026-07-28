import { asc, isNull } from 'drizzle-orm';
import { db } from '../client';
import { roleConfig } from '../schema';

export type { RoleConfigRow } from '../roles';

/**
 * `role_config`, which is where the always-available flag lives (`docs/SPEC.md` §1.1) and
 * where a role's display label comes from. Shared, because both the Today screen and the
 * Phase 1 debug screen need it and neither may test for the strings 'podi' or
 * 'accompaniment'.
 *
 * Returns the query builder rather than rows so callers can hand it to `useLiveQuery`.
 */
export function roleConfigQuery() {
  return db
    .select({
      role: roleConfig.role,
      label: roleConfig.label,
      isAlwaysAvailable: roleConfig.isAlwaysAvailable,
      sortOrder: roleConfig.sortOrder,
    })
    .from(roleConfig)
    .where(isNull(roleConfig.deletedAt))
    .orderBy(asc(roleConfig.sortOrder));
}
