import { Pressable, Text } from 'react-native';
import { fonts, layout, radius, type Theme } from '../theme/tokens';
import { useThemedStyles } from '../theme/useTheme';

/** The one filled action on a screen. `ink` fill, `onInk` label, so it inverts correctly. */

export interface PrimaryButtonProps {
  label: string;
  onPress?: () => void;
  /**
   * For a form that genuinely cannot be saved yet. Use it only where something *else* on
   * the screen says what is missing — a button that refuses without explaining is worse
   * than one that lets you try and then tells you.
   */
  disabled?: boolean;
}

export function PrimaryButton({ label, onPress, disabled = false }: PrimaryButtonProps) {
  const styles = useThemedStyles(makeStyles);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
      ]}
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
  // Enough to read as unavailable, not so little that the label stops being legible.
  buttonDisabled: {
    opacity: 0.4,
  },
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: 14.5,
    color: colors.onInk,
  },
});
