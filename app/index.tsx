import { Link } from 'expo-router';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { space, type Theme } from '../src/theme/tokens';
import { useThemedStyles } from '../src/theme/useTheme';

/** Placeholder home. Phase 4 replaces this with the Today screen. */
export default function Index() {
  const styles = useThemedStyles(makeStyles);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.wordmark}>vantillu</Text>
        <Link href="/scratch" style={styles.link}>
          components
        </Link>
        <Link href="/debug" style={styles.link}>
          database
        </Link>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = ({ colors, text }: Theme) => ({
  safeArea: {
    flex: 1,
    backgroundColor: colors.steel2,
  },
  container: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: space.xl,
  },
  wordmark: {
    ...text.eyebrow,
    fontSize: 13,
    letterSpacing: 2,
  },
  link: {
    ...text.control,
  },
});
