import type { RoleConfigRow } from './roles';
import type { SeedCatalogEntry } from './seedCatalog';

/**
 * Onboarding's one piece of logic: the optional starter list, grouped and selectable.
 *
 * Same shape of module as `todayModel.ts` and `cookModel.ts` — plain values in, plain
 * values out, no `db` and no clock — so the grouping is asserted in Node rather than
 * squinted at during a flow that is deliberately hard to see twice.
 *
 * **This module used to be much bigger.** It carried a set of last-cooked buckets that
 * wrote `isEstimated` cook events during onboarding. That step is gone (`docs/SPEC.md`
 * §18.3): onboarding explains the app, it does not interview you about your past.
 */

/** One role's worth of the catalogue, as the picker draws it. */
export interface CatalogSection {
  role: string;
  /** From `role_config`, never the raw role string — a renamed role shows its new name. */
  label: string;
  entries: SeedCatalogEntry[];
}

/**
 * The catalogue grouped by role, in `role_config` order.
 *
 * Roles with nothing in them are dropped, the same rule `usedRoles` follows on the dishes
 * list: an empty section is a heading over nothing. A dish whose role has no config row
 * still appears, in a trailing section labelled with the raw role — losing a dish because
 * the seed and the defaults disagreed would be far worse than an ugly heading, and the
 * seed test asserts that this case is currently empty.
 */
export function groupCatalogByRole(
  catalog: readonly SeedCatalogEntry[],
  roles: readonly RoleConfigRow[],
): CatalogSection[] {
  const byRole = new Map<string, SeedCatalogEntry[]>();
  for (const entry of catalog) {
    const existing = byRole.get(entry.role);
    if (existing) existing.push(entry);
    else byRole.set(entry.role, [entry]);
  }

  const sections: CatalogSection[] = [];
  const placed = new Set<string>();

  for (const role of [...roles].sort((a, b) => a.sortOrder - b.sortOrder)) {
    const entries = byRole.get(role.role);
    if (entries === undefined) continue;
    sections.push({ role: role.role, label: role.label, entries });
    placed.add(role.role);
  }

  for (const [role, entries] of byRole) {
    if (placed.has(role)) continue;
    sections.push({ role, label: role, entries });
  }

  return sections;
}

export function toggleKey(selected: ReadonlySet<string>, key: string): Set<string> {
  const next = new Set(selected);
  if (!next.delete(key)) next.add(key);
  return next;
}

/** Ticks or unticks a whole section, for the All / None control on its heading. */
export function setSectionKeys(
  selected: ReadonlySet<string>,
  entries: readonly SeedCatalogEntry[],
  on: boolean,
): Set<string> {
  const next = new Set(selected);
  for (const entry of entries) {
    if (on) next.add(entry.key);
    else next.delete(entry.key);
  }
  return next;
}

export function isSectionFull(
  selected: ReadonlySet<string>,
  entries: readonly SeedCatalogEntry[],
): boolean {
  return entries.length > 0 && entries.every((entry) => selected.has(entry.key));
}

/** The picked entries, in catalogue order — which is what actually gets inserted. */
export function selectedEntries(
  catalog: readonly SeedCatalogEntry[],
  selected: ReadonlySet<string>,
): SeedCatalogEntry[] {
  return catalog.filter((entry) => selected.has(entry.key));
}
