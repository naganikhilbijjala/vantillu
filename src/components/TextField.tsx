import { Text, TextInput, View } from 'react-native';
import { border, radius, type Theme } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/useTheme';

/**
 * A labelled multiline text input — the log sheet's note, and all three fields of the recipe
 * editor.
 *
 * Extracted when the recipe editor arrived and the count went from one input to four. The
 * placeholder colour is the reason it is worth a component rather than a copied style:
 * `TextInput` falls back to a platform default when `placeholderTextColor` is unset, which
 * is a light grey that vanishes on a dark surface, and that is exactly the kind of bug the
 * author cannot see from one device.
 *
 * There is deliberately **no dictation button** (`docs/SPEC.md` §12) — `expo-speech` is
 * text-to-*speech*, so it would mean a native module, and the OS keyboard's own mic is
 * already there and already muscle memory.
 */

export interface TextFieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  /** Quiet copy under the input, for something the label cannot say in two words. */
  hint?: string;
  /** Roughly how many lines it opens at. It grows with the content either way. */
  lines?: number;
  /** Defaults to `label`, which is right unless the label is only meaningful in context. */
  accessibilityLabel?: string;
}

/** `text.body` has a 22px line height, plus the input's own 10px of padding either side. */
const LINE_HEIGHT = 22;
const VERTICAL_PADDING = 20;

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  hint,
  lines = 2,
  accessibilityLabel,
}: TextFieldProps) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.ink3}
        style={[styles.input, { minHeight: lines * LINE_HEIGHT + VERTICAL_PADDING }]}
        multiline
        // Android centres multiline text vertically without this, so a tall empty field
        // opens with its placeholder floating in the middle of the box.
        textAlignVertical="top"
        accessibilityLabel={accessibilityLabel ?? label}
      />
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
  input: {
    ...text.body,
    paddingHorizontal: 11,
    paddingVertical: 10,
    borderWidth: border.thin,
    borderColor: colors.lineSoft,
    borderRadius: radius.control,
    backgroundColor: colors.steel1,
    color: colors.ink,
  },
  hint: {
    ...text.bodySmall,
    fontSize: 11.5,
    color: colors.ink3,
  },
});
