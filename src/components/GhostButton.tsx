import { Pressable, Text } from 'react-native';
import { border, layout, radius, type Theme } from '../theme/tokens';
import { useThemedStyles } from '../theme/useTheme';

/** A full-width secondary action: an outline, no fill until pressed. */

export interface GhostButtonProps {
  label: string;
  onPress: () => void;
}

export function GhostButton({ label, onPress }: GhostButtonProps) {
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

const makeStyles = ({ colors, text }: Theme) => ({
  button: {
    minHeight: layout.minTouchTarget,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 10,
    borderWidth: border.thin,
    borderColor: colors.lineSoft,
    borderRadius: radius.button,
  },
  buttonPressed: {
    borderColor: colors.line,
    backgroundColor: colors.steel1,
  },
  label: {
    ...text.control,
    fontSize: 13,
  },
});
