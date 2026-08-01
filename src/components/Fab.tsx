import { Plus } from 'lucide-react-native';
import { Pressable } from 'react-native';
import { radius, type Theme } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/useTheme';

/**
 * Add the thing this tab is about: a cook on Today, a dish on Dishes.
 *
 * One glyph, two meanings, and they stay unambiguous because each tab has exactly one thing
 * worth adding. On Today that is hard rule 6 — logging is one tap and nothing may ever be
 * added to that path, which is why it floats over the list rather than sitting at the bottom
 * of it where a long repertoire would push it off screen. On Dishes the same reasoning
 * applies to a repertoire being typed in one dish at a time (`docs/SPEC.md` §19.4).
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
