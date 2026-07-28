import { asc, isNull } from 'drizzle-orm';
import { db } from '../client';
import { dish, roleConfig } from '../schema';

/**
 * Phase 1 debug screen only. Returns the query builder rather than the rows so the
 * caller can hand it to `useLiveQuery` and have it re-run on write.
 *
 * Soft-deleted rows are filtered here, as they must be in every query (`docs/SPEC.md`
 * §11.3).
 */
export function dishListQuery() {
  return db
    .select({
      id: dish.id,
      name: dish.name,
      altName: dish.altName,
      role: dish.role,
      effort: dish.effort,
      prepLabel: dish.prepLabel,
    })
    .from(dish)
    .where(isNull(dish.deletedAt))
    .orderBy(asc(dish.name));
}

export function roleConfigQuery() {
  return db
    .select({
      role: roleConfig.role,
      label: roleConfig.label,
      isAlwaysAvailable: roleConfig.isAlwaysAvailable,
    })
    .from(roleConfig)
    .where(isNull(roleConfig.deletedAt))
    .orderBy(asc(roleConfig.sortOrder));
}
