import { Pressable, Text } from 'react-native';
import { border, radius, type Theme } from '../theme/tokens';
import { useThemedStyles } from '../theme/useTheme';

/**
 * A compact inline action — the mockup's `.smallbtn`. `GhostButton` is the full-width
 * secondary action; this one sits under a block of content and refers to it.
 *
 * It is 31px tall rather than the 44px in `layout.minTouchTarget`, because the mockup sizes
 * it to the text it sits beside and a full-height button there reads as the page's main
 * action. `hitSlop` makes up the difference, the same way `PillToggle` does: the tap target
 * clears 44 even though the ink does not.
 */

export interface SmallButtonProps {
  label: string;
  onPress: () => void;
}

export function SmallButton({ label, onPress }: SmallButtonProps) {
  const styles = useThemedStyles(makeStyles);

  return (
    <Pressable
      accessibilityRole="button"
      hitSlop={{ top: 7, bottom: 7, left: 8, right: 8 }}
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = ({ colors, text }: Theme) => ({
  button: {
    alignSelf: 'flex-start' as const,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderWidth: border.thin,
    borderColor: colors.line,
    borderRadius: radius.control,
    backgroundColor: colors.steel1,
  },
  buttonPressed: {
    // The one token that means "a step brighter than a card" in both schemes.
    backgroundColor: colors.steelPressed,
  },
  label: {
    ...text.control,
    color: colors.ink,
  },
});
