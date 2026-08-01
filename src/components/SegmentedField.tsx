import { Pressable, Text, View } from 'react-native';
import { border, layout, radius, space, type Theme } from '../theme/tokens';
import { useThemedStyles } from '../theme/useTheme';

/**
 * A labelled row of mutually exclusive choices — the log sheet's meal slot and its
 * 3-point rating.
 *
 * `value` may be null, and that is the point for the rating: an unrated cook is a real
 * state, so nothing is pre-selected and pressing the selected option again clears it
 * (`docs/SPEC.md` §7). A control that cannot express "didn't say" would force an opinion
 * into every row.
 */

export interface SegmentedOption<T> {
  value: T;
  label: string;
}

export interface SegmentedFieldProps<T> {
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T | null;
  onChange: (value: T | null) => void;
  /** When false, tapping the selected option does nothing instead of clearing it. */
  clearable?: boolean;
}

export function SegmentedField<T extends string | number>({
  label,
  options,
  value,
  onChange,
  clearable = false,
}: SegmentedFieldProps<T>) {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={String(option.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => onChange(selected && clearable ? null : option.value)}
              style={({ pressed }) => [
                styles.segment,
                selected && styles.segmentSelected,
                pressed && !selected && styles.segmentPressed,
              ]}
            >
              <Text
                style={[styles.segmentLabel, selected && styles.segmentLabelSelected]}
                numberOfLines={1}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const makeStyles = ({ colors, text }: Theme) => ({
  field: {
    gap: 7,
  },
  label: {
    ...text.eyebrow,
  },
  row: {
    flexDirection: 'row' as const,
    gap: space.sm,
  },
  segment: {
    flex: 1,
    minHeight: layout.minTouchTarget,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    paddingHorizontal: 4,
    borderWidth: border.thin,
    borderColor: colors.lineSoft,
    borderRadius: radius.control,
  },
  segmentPressed: {
    borderColor: colors.line,
    backgroundColor: colors.steel1,
  },
  segmentSelected: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  segmentLabel: {
    ...text.control,
  },
  segmentLabelSelected: {
    color: colors.onInk,
  },
});
