import { Search, X } from 'lucide-react-native';
import { Pressable, TextInput, View } from 'react-native';
import { border, layout, radius, space, type Theme } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/useTheme';

/**
 * Search over the repertoire.
 *
 * Not in the mockup — it only shows role filters — so this is built from the tokens to
 * match the slot buttons it sits near: same border, same radius, same control type size.
 *
 * `autoCorrect` and `autoCapitalize` are off deliberately. Half the repertoire is
 * transliterated Telugu, and a keyboard that "fixes" *pesarattu* makes the field useless.
 */

export interface SearchFieldProps {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
}

export function SearchField({
  value,
  onChangeText,
  placeholder = 'Search dishes or an ingredient',
}: SearchFieldProps) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();

  return (
    <View style={styles.field}>
      <Search size={15} strokeWidth={1.7} color={colors.ink3} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.ink3}
        style={styles.input}
        autoCorrect={false}
        autoCapitalize="none"
        // "search" gives the keyboard a Search key instead of a newline; the filtering is
        // live, so the key only dismisses.
        returnKeyType="search"
        clearButtonMode="never"
        accessibilityLabel="Search dishes"
      />
      {value === '' ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          hitSlop={10}
          onPress={() => onChangeText('')}
        >
          <X size={15} strokeWidth={1.7} color={colors.ink3} />
        </Pressable>
      )}
    </View>
  );
}

const makeStyles = ({ colors, text }: Theme) => ({
  field: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.md,
    minHeight: layout.minTouchTarget,
    paddingHorizontal: 11,
    borderWidth: border.thin,
    borderColor: colors.lineSoft,
    borderRadius: radius.control,
    backgroundColor: colors.steel1,
  },
  input: {
    ...text.control,
    flex: 1,
    color: colors.ink,
    // Android adds its own vertical padding to a TextInput; zeroing it keeps the field the
    // height the container asked for on both platforms.
    paddingVertical: 0,
  },
});
