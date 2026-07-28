import { useMigrations } from 'drizzle-orm/expo-sqlite/migrator';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import migrations from '../drizzle/migrations';
import { db } from '../src/db/client';
import { seedDatabaseIfEmpty } from '../src/db/seed';

/**
 * Root layout. Migrations run here, before any screen mounts, then the first-run seed.
 * Phase 3 adds font loading and the theme provider.
 */
export default function RootLayout() {
  const { success, error } = useMigrations(db, migrations);
  const [seeded, setSeeded] = useState(false);
  const [seedError, setSeedError] = useState<Error | null>(null);

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

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {fatal ? (
        <BootFailure
          title={
            error ? 'Could not migrate the database' : 'Could not load the seed dishes'
          }
          message={fatal.message}
        />
      ) : success && seeded ? (
        <Stack screenOptions={{ headerShown: false }} />
      ) : (
        <BootProgress />
      )}
    </SafeAreaProvider>
  );
}

function BootProgress() {
  return (
    <View style={styles.gate}>
      <ActivityIndicator color="#8A9199" />
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

// Placeholder colours until Phase 3 introduces src/theme/tokens.ts.
const styles = StyleSheet.create({
  gate: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16181A',
    paddingHorizontal: 32,
    gap: 12,
  },
  failureTitle: {
    color: '#D9DEE3',
    fontSize: 16,
    textAlign: 'center',
  },
  failureMessage: {
    color: '#8A9199',
    fontSize: 13,
    textAlign: 'center',
  },
});
