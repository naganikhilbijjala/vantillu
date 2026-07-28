/**
 * The eleven seeded roles (`docs/SPEC.md` §1.1), written into `role_config` on first run
 * and editable from there afterwards.
 *
 * `isAlwaysAvailable` is the *only* way the engine learns that podi and accompaniment are
 * never suggested and never stale. Nothing downstream may test for those role strings —
 * the user can rename a role and the behaviour has to follow the flag, not the name.
 *
 * `staple` and `one_pot` are deliberately distinct: the leftover-rice boost fires from a
 * `staple` cook and lands on `one_pot` dishes (§4.3).
 */
export interface RoleDefault {
  role: string;
  label: string;
  isAlwaysAvailable: boolean;
}

export const DEFAULT_ROLES: readonly RoleDefault[] = [
  { role: 'staple', label: 'Staple', isAlwaysAvailable: false },
  { role: 'tiffin', label: 'Tiffin', isAlwaysAvailable: false },
  { role: 'dal', label: 'Dal', isAlwaysAvailable: false },
  { role: 'dry_curry', label: 'Dry curry', isAlwaysAvailable: false },
  { role: 'gravy', label: 'Gravy', isAlwaysAvailable: false },
  { role: 'one_pot', label: 'One-pot', isAlwaysAvailable: false },
  { role: 'pachadi', label: 'Pachadi', isAlwaysAvailable: false },
  { role: 'podi', label: 'Podi', isAlwaysAvailable: true },
  { role: 'accompaniment', label: 'Accompaniment', isAlwaysAvailable: true },
  { role: 'snack', label: 'Snack', isAlwaysAvailable: false },
  { role: 'sweet', label: 'Sweet', isAlwaysAvailable: false },
];
