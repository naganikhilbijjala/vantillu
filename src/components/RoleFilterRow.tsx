import { ScrollView } from 'react-native';
import { ALL_ROLES } from '../db/dishesModel';
import type { RoleConfigRow } from '../db/roles';
import { layout, space, type Theme } from '../theme/tokens';
import { useThemedStyles } from '../theme/useTheme';
import { PillToggle } from './PillToggle';

/**
 * Role filters, in `role_config` order so they read in the order a meal is built —
 * staple, tiffin, dal, curry — rather than alphabetically.
 *
 * Labels come from `role_config`, never from the raw role string, so a renamed role shows
 * its new name here without anything else changing (`docs/SPEC.md` §1.1).
 *
 * Horizontally scrollable: eleven roles will not fit on a phone, and wrapping them to
 * three lines would push the list itself below the fold.
 */

export interface RoleFilterRowProps {
  roles: readonly RoleConfigRow[];
  /** A raw role string, or `ALL_ROLES` for no filter. */
  selected: string | null;
  onSelect: (role: string | null) => void;
}

export function RoleFilterRow({ roles, selected, onSelect }: RoleFilterRowProps) {
  const styles = useThemedStyles(makeStyles);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityRole="tablist"
      accessibilityLabel="Filter by role"
    >
      <PillToggle
        label="All"
        selected={selected === ALL_ROLES}
        onPress={() => onSelect(ALL_ROLES)}
      />
      {roles.map((role) => (
        <PillToggle
          key={role.role}
          label={role.label}
          selected={selected === role.role}
          // Tapping the active filter clears it, which is the gesture people try first.
          onPress={() => onSelect(selected === role.role ? ALL_ROLES : role.role)}
        />
      ))}
    </ScrollView>
  );
}

const makeStyles = (_theme: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.sm,
    paddingHorizontal: layout.screenPaddingH,
  },
});
