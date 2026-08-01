import { Pressable, Text } from 'react-native';
import { fonts, layout, radius, type Theme } from '../theme/tokens';
import { useThemedStyles } from '../theme/useTheme';

/** The one filled action on a screen. `ink` fill, `onInk` label, so it inverts correctly. */

export interface PrimaryButtonProps {
  label: string;
  onPress?: () => void;
}

export function PrimaryButton({ label, onPress }: PrimaryButtonProps) {
  const styles = useThemedStyles(makeStyles);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
    >
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = ({ colors }: Theme) => ({
  button: {
    minHeight: layout.minTouchTarget,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 13,
    borderRadius: radius.button,
    backgroundColor: colors.ink,
  },
  buttonPressed: {
    opacity: 0.88,
  },
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: 14.5,
    color: colors.onInk,
  },
});
