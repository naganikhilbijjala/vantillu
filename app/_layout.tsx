import { DMMono_400Regular } from '@expo-google-fonts/dm-mono/400Regular';
import { DMMono_500Medium } from '@expo-google-fonts/dm-mono/500Medium';
import { FamiljenGrotesk_400Regular } from '@expo-google-fonts/familjen-grotesk/400Regular';
import { FamiljenGrotesk_500Medium } from '@expo-google-fonts/familjen-grotesk/500Medium';
import { FamiljenGrotesk_600SemiBold } from '@expo-google-fonts/familjen-grotesk/600SemiBold';
import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import migrations from '../drizzle/migrations';
import { db } from '../src/db/client';
import { seedDatabaseIfEmpty } from '../src/db/seed';
import { layout, space, type Theme } from '../src/theme/tokens';
import { useTheme, useThemedStyles } from '../src/theme/useTheme';

/**
 * Root layout: migrations, then the first-run seed, then fonts.
 *
 * Faces are imported one subpath at a time rather than from the package root, which pulls
 * in every weight and italic of both families. Only the five the tokens name ship.
 *
 * The keys of the font map are the `fontFamily` strings the whole app uses, so they must
 * stay in step with `fonts` in `src/theme/tokens.ts`. A mismatch fails quietly — the text
 * falls back to the system face instead of throwing.
 *
 * The scheme follows the OS (SPEC §14). Nothing here selects it — `useTheme()` reads
 * `useColorScheme()`, so a change in the system setting re-renders the tree on its own.
 */
export default function RootLayout() {
  const theme = useTheme();
  const { success, error } = useMigrations(db, migrations);
  const [seeded, setSeeded] = useState(false);
  const [seedError, setSeedError] = useState<Error | null>(null);
  const [fontsLoaded, fontError] = useFonts({
    FamiljenGrotesk_400Regular,
    FamiljenGrotesk_500Medium,
    FamiljenGrotesk_600SemiBold,
    DMMono_400Regular,
    DMMono_500Medium,
  });

  useEffect(() => {
    if (!success || seeded || seedError) return;
    try {
      seedDatabaseIfEmpty();
      setSeeded(true);
    } catch (caught) {
      setSeedError(caught instanceof Error ? caught : new Error(String(caught)));
    }
  }, [success, seeded, seedError]);

  const fatal = error ?? seedError;

  // A font that fails to load is not fatal. The app renders in the system face and stays
  // completely usable, which beats refusing to boot over typography.
  const ready = success && seeded && (fontsLoaded || fontError !== null);

  return (
    <SafeAreaProvider>
      {/* "auto" resolves from the scheme, so the bar inverts with the OS setting. */}
      <StatusBar style="auto" />
      {fatal ? (
        <BootFailure
          title={
            error ? 'Could not migrate the database' : 'Could not load the seed dishes'
          }
          message={fatal.message}
        />
      ) : ready ? (
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: theme.colors.steel2 },
          }}
        />
      ) : (
        <BootProgress />
      )}
    </SafeAreaProvider>
  );
}

function BootProgress() {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  return (
    <View style={styles.gate}>
      <ActivityIndicator color={colors.ink3} />
    </View>
  );
}

function BootFailure({ title, message }: { title: string; message: string }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.gate}>
      <Text style={styles.failureTitle}>{title}</Text>
      <Text style={styles.failureMessage}>{message}</Text>
    </View>
  );
}

const makeStyles = ({ colors, text }: Theme) => ({
  gate: {
    flex: 1,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: colors.steel2,
    paddingHorizontal: layout.screenPaddingH,
    gap: space.lg,
  },
  // No `fontFamily` on either of these: both can render before the fonts have loaded, and
  // the one screen that has to stay readable in any face is the one reporting a failure.
  failureTitle: {
    fontSize: 16,
    color: colors.ink,
    textAlign: 'center' as const,
  },
  failureMessage: {
    ...text.bodySmall,
    fontFamily: undefined,
    textAlign: 'center' as const,
  },
});
