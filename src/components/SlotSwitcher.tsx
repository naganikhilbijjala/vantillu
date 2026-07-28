import { Pressable, Text, View } from 'react-native';
import type { Slot } from '../core/types';
import { border, layout, radius, space, type Theme } from '../theme/tokens';
import { useThemedStyles } from '../theme/useTheme';

/**
 * The four meal slots as a segmented row. Tapping one overrides the clock until the next
 * slot boundary (`docs/SPEC.md` §2.2).
 *
 * `snack` is here even though it is never auto-detected — manual override is precisely
 * how it is reached.
 */

const SLOT_ORDER: readonly Slot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

const SLOT_LABEL: Record<Slot, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

export interface SlotSwitcherProps {
  slot: Slot;
  onSelect: (slot: Slot) => void;
}

export function SlotSwitcher({ slot, onSelect }: SlotSwitcherProps) {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.row} accessibilityRole="tablist" accessibilityLabel="Meal slot">
      {SLOT_ORDER.map((option) => {
        const selected = option === slot;
        return (
          <Pressable
            key={option}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            // The button is 32px tall to match the mockup's proportions; the hit area is
            // padded back out to the 44px both platforms want for a comfortable tap.
            hitSlop={{ top: 7, bottom: 7 }}
            onPress={() => onSelect(option)}
            style={({ pressed }) => [
              styles.slot,
              selected && styles.slotSelected,
              pressed && !selected && styles.slotPressed,
            ]}
          >
            <Text
              style={[styles.label, selected && styles.labelSelected]}
              numberOfLines={1}
            >
              {SLOT_LABEL[option]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = ({ colors, text }: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    gap: space.sm,
    paddingHorizontal: layout.screenPaddingH,
  },
  slot: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingVertical: 7,
    borderWidth: border.thin,
    borderColor: colors.lineSoft,
    borderRadius: radius.control,
  },
  slotPressed: {
    borderColor: colors.line,
    backgroundColor: colors.steel1,
  },
  // `ink` as a fill and `onInk` as the text on it: the pair inverts correctly in both
  // schemes, where picking a light-looking token would not.
  slotSelected: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  label: {
    ...text.control,
    fontSize: 12,
  },
  labelSelected: {
    color: colors.onInk,
  },
});
