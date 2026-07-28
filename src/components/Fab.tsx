import { Plus } from 'lucide-react-native';
import { Pressable } from 'react-native';
import { radius, type Theme } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/useTheme';

/**
 * Log a cook. One tap from the Today screen, and nothing may ever be added to that path
 * (hard rule 6) — which is why it floats over the list rather than living at the bottom of
 * it, where a long repertoire would push it off screen.
 *
 * `elevation.float` sets both the Android and the iOS half of the shadow. A bare
 * `elevation` or a bare `shadowOffset` would silently give one platform nothing.
 */

export interface FabProps {
  onPress?: () => void;
  label?: string;
}

export const FAB_SIZE = 52;

export function Fab({ onPress, label = 'Log a dish' }: FabProps) {
  const styles = useThemedStyles(makeStyles);
  const { colors, elevation } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.fab, elevation.float, pressed && styles.fabPressed]}
    >
      <Plus size={23} strokeWidth={1.8} color={colors.onInk} />
    </Pressable>
  );
}

const makeStyles = ({ colors }: Theme) => ({
  fab: {
    position: 'absolute' as const,
    right: 18,
    bottom: 18,
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: radius.pill,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.ink,
  },
  fabPressed: {
    opacity: 0.88,
  },
});
