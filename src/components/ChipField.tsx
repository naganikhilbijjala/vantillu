import { Text, View } from 'react-native';
import { space, type Theme } from '../theme/tokens';
import { useThemedStyles } from '../theme/useTheme';
import { PillToggle } from './PillToggle';

/**
 * A labelled set of choices that wraps.
 *
 * The third of three selection controls, and each earns its place by shape rather than by
 * taste. `SegmentedField` divides a row into equal parts, which works for four short
 * options and falls apart at eleven. `PillToggle` is one switch. This is the case in
 * between: a set too long to sit on one line, or one where more than one answer is right.
 *
 * The dish editor needs both variants — role is eleven options and exactly one, meal slots
 * are four and *at least* one, because tiffin is valid at breakfast and dinner
 * (`docs/SPEC.md` §1.3).
 */

export interface ChipOption<T> {
  value: T;
  label: string;
}

export interface ChipFieldProps<T> {
  label: string;
  options: readonly ChipOption<T>[];
  /** Every lit chip. A single-select caller passes at most one. */
  selected: readonly T[];
  onToggle: (value: T) => void;
  /** Quiet copy under the row, for something the label cannot say in two words. */
  hint?: string;
  /** Only changes what a screen reader announces; the caller enforces the arity. */
  multiple?: boolean;
}

export function ChipField<T extends string>({
  label,
  options,
  selected,
  onToggle,
  hint,
  multiple = false,
}: ChipFieldProps<T>) {
  const styles = useThemedStyles(makeStyles);
  const lit = new Set(selected);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={styles.row}
        accessibilityRole={multiple ? undefined : 'radiogroup'}
        accessibilityLabel={label}
      >
        {options.map((option) => (
          <PillToggle
            key={option.value}
            label={option.label}
            selected={lit.has(option.value)}
            onPress={() => onToggle(option.value)}
          />
        ))}
      </View>
      {hint === undefined ? null : <Text style={styles.hint}>{hint}</Text>}
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
    flexWrap: 'wrap' as const,
    gap: space.sm,
  },
  hint: {
    ...text.bodySmall,
    fontSize: 11.5,
    color: colors.ink3,
  },
});
