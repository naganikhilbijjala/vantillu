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
import { seedRoleConfigIfEmpty } from '../src/db/seed';
import { useOnboardingGate } from '../src/hooks/useOnboarding';
import { usePrepNotifications } from '../src/hooks/usePrepNotifications';
import { Onboarding } from '../src/screens/Onboarding';
import { layout, radius, space, type Theme } from '../src/theme/tokens';
import { useTheme, useThemedStyles } from '../src/theme/useTheme';

/**
 * Root layout: migrations, then the role config, then fonts — and then either onboarding
 * or the app.
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
 *
 * **Onboarding is a gate, not a route** (Phase 8, SPEC §18.4). It renders *instead of* the
 * `Stack`, in the same position as the two boot states below, because there is no version of
 * this app in which you navigate to it: either there is a repertoire or there is not. Making
 * it a screen would mean either a redirect that flashes Today first, or a navigator guard
 * that has to keep every other route out of reach while it is up.
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
      // Roles only. The dishes are the user's to pick, in onboarding (SPEC §18.1).
      seedRoleConfigIfEmpty();
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
          title={error ? 'Could not migrate the database' : 'Could not set up the roles'}
          message={fatal.message}
        />
      ) : ready ? (
        <AppOrOnboarding />
      ) : (
        <BootProgress />
      )}
    </SafeAreaProvider>
  );
}

/**
 * The last gate, and the only one that reads the database rather than preparing it — which
 * is why it is a child component: `useLiveQuery` here would run against tables the
 * migration above has not created yet.
 */
function AppOrOnboarding() {
  const { needed, isReady, error } = useOnboardingGate();

  if (error) {
    return <BootFailure title="Could not read your setup" message={error.message} />;
  }
  if (!isReady) return <BootProgress />;
  if (needed) return <Onboarding />;

  return (
    <>
      {/* Renders nothing. It lives here rather than on a screen because a reminder about
          tomorrow's breakfast must not depend on which tab happened to be mounted when the
          app was last closed — and below the onboarding gate, because there is nothing to
          plan against until there is a repertoire (SPEC §20). */}
      <PrepNotifications />
      <AppStack />
    </>
  );
}

function PrepNotifications() {
  usePrepNotifications();
  return null;
}

function AppStack() {
  const theme = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.steel2 },
      }}
    >
      {/* Two screens need an entry. Everything else is a plain push. */}

      {/* `formSheet` is a native bottom sheet on both platforms in
          react-native-screens 4, which is what the mockup shows — and a partial-height
          sheet keeps the Today screen visible behind it, so logging never feels like
          leaving where you were. */}
      <Stack.Screen
        name="log"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: [0.75, 1],
          sheetCornerRadius: radius.sheet,
          sheetGrabberVisible: false,
          gestureEnabled: true,
        }}
      />

      {/* The recipe editor is the only screen holding text that exists nowhere else
          until it is saved. iOS's swipe-back would pop it with no chance to intervene,
          so the gesture is off and the screen's own Save and Cancel are the way out.
          Android's hardware back is intercepted in the screen instead, because it can
          be — the confirmation is the same either way. */}
      <Stack.Screen name="dish/edit/[id]" options={{ gestureEnabled: false }} />
    </Stack>
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
