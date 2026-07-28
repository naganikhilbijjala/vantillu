import { Pressable, Text } from 'react-native';
import { border, radius, type Theme } from '../theme/tokens';
import { useThemedStyles } from '../theme/useTheme';

/**
 * A small on/off pill. The Today screen uses it for the veg-only override
 * (`docs/SPEC.md` §6); the Phase 5 role filters want the same control.
 *
 * `locked` covers the case where the state is true but not this control's to change — a
 * veg-only day coming from the weekday set rather than from today's override. It reads as
 * on, says why on press-through being disabled, and never lies by looking tappable.
 */

export interface PillToggleProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  locked?: boolean;
}

export function PillToggle({
  label,
  selected,
  onPress,
  locked = false,
}: PillToggleProps) {
  const styles = useThemedStyles(makeStyles);

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: selected, disabled: locked }}
      accessibilityHint={locked ? 'Set in settings, not from this screen' : undefined}
      disabled={locked}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        selected && styles.pillSelected,
        locked && styles.pillLocked,
        pressed && !selected && styles.pillPressed,
      ]}
    >
      <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = ({ colors, text }: Theme) => ({
  pill: {
    alignSelf: 'flex-start' as const,
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderWidth: border.thin,
    borderColor: colors.lineSoft,
    borderRadius: radius.pill,
  },
  pillPressed: {
    borderColor: colors.line,
    backgroundColor: colors.steel1,
  },
  pillSelected: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  pillLocked: {
    opacity: 0.7,
  },
  label: {
    ...text.control,
    fontSize: 12,
  },
  labelSelected: {
    color: colors.onInk,
  },
});
