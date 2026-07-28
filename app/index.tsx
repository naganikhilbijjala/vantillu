import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, space, text } from '../src/theme/tokens';

/** Placeholder home. Phase 4 replaces this with the Today screen. */
export default function Index() {
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

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.steel2,
  },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
