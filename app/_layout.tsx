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
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import migrations from '../drizzle/migrations';
import { db } from '../src/db/client';
import { seedDatabaseIfEmpty } from '../src/db/seed';
import { colors, layout, space, text } from '../src/theme/tokens';

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
 * There is no theme provider. The palette is a single static light theme (SPEC §12), so
 * screens import `src/theme/tokens.ts` directly and a context would only add indirection.
 */
export default function RootLayout() {
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
      <StatusBar style="dark" />
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
            contentStyle: { backgroundColor: colors.steel2 },
          }}
        />
      ) : (
        <BootProgress />
      )}
    </SafeAreaProvider>
  );
}

function BootProgress() {
  return (
    <View style={styles.gate}>
      <ActivityIndicator color={colors.ink3} />
    </View>
  );
}

function BootFailure({ title, message }: { title: string; message: string }) {
  return (
    <View style={styles.gate}>
      <Text style={styles.failureTitle}>{title}</Text>
      <Text style={styles.failureMessage}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  gate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.steel2,
    paddingHorizontal: layout.screenPaddingH,
    gap: space.lg,
  },
  // No `fontFamily` on either of these: both can render before the fonts have loaded, and
  // the one screen that has to stay readable in any face is the one reporting a failure.
  failureTitle: {
    fontSize: 16,
    color: colors.ink,
    textAlign: 'center',
  },
  failureMessage: {
    ...text.bodySmall,
    fontFamily: undefined,
    textAlign: 'center',
  },
});
