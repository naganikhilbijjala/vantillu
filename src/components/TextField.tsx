import { type KeyboardTypeOptions, Text, TextInput, View } from 'react-native';
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
  /**
   * Off for a dish's name, its regional name, and its minutes — one-line answers where a
   * growing box invites a paragraph nobody wants to write. Everything the app was built
   * around first (notes, recipes) is multiline, so that stays the default.
   */
  multiline?: boolean;
  keyboardType?: KeyboardTypeOptions;
  /** Dish and ingredient names are not sentences; the phone should stop capitalising them. */
  autoCapitalize?: 'none' | 'sentences' | 'words';
  /** Defaults to `label`, which is right unless the label is only meaningful in context. */
  accessibilityLabel?: string;
  /**
   * For lifting the field clear of the keyboard. The screen owns that, not this component:
   * only the screen knows what it is scrolling and where this field sits inside it.
   */
  onFocus?: () => void;
  onBlur?: () => void;
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
  multiline = true,
  keyboardType,
  autoCapitalize,
  accessibilityLabel,
  onFocus,
  onBlur,
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
        onFocus={onFocus}
        onBlur={onBlur}
        style={[
          styles.input,
          { minHeight: (multiline ? lines : 1) * LINE_HEIGHT + VERTICAL_PADDING },
        ]}
        multiline={multiline}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
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
