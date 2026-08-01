import { ChevronLeft } from 'lucide-react-native';
import { Pressable, Text } from 'react-native';
import { layout, space, type Theme } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/useTheme';

/**
 * The back affordance on a pushed screen.
 *
 * Explicit rather than a navigation header: every screen in the app sets
 * `headerShown: false` so the eyebrow-and-title block is the only heading, and a native
 * header above that would give the page two competing titles. Android's hardware back and
 * iOS's swipe still work — this is the visible one.
 */

export interface BackLinkProps {
  label: string;
  onPress: () => void;
}

export function BackLink({ label, onPress }: BackLinkProps) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Back to ${label}`}
      onPress={onPress}
      style={({ pressed }) => [styles.link, pressed && styles.linkPressed]}
    >
      <ChevronLeft size={15} strokeWidth={1.8} color={colors.ink2} />
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const makeStyles = ({ colors, text }: Theme) => ({
  link: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    alignSelf: 'flex-start' as const,
    gap: space.sm,
    minHeight: layout.minTouchTarget,
    paddingRight: space.md,
  },
  linkPressed: {
    opacity: 0.6,
  },
  label: {
    ...text.control,
    color: colors.ink2,
  },
});
