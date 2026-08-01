import { format } from 'date-fns';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackLink } from '../src/components/BackLink';
import { ConfirmDialog } from '../src/components/ConfirmDialog';
import { resetOnboarding } from '../src/db/queries/onboarding';
import { clearAllPrep } from '../src/db/queries/prep';
import { roleConfigQuery } from '../src/db/queries/roles';
import { prepStatesQuery } from '../src/db/queries/tables';
import { useRequestNotificationPermission } from '../src/hooks/useNotificationPermission';
import { usePrepPlan } from '../src/hooks/usePrepNotifications';
import { listScheduled, scheduleTestNotification } from '../src/notifications/client';
import { border, layout, radius, space, type Theme } from '../src/theme/tokens';
import { useThemedStyles } from '../src/theme/useTheme';

/**
 * Dev tools. Not part of the product.
 *
 * Started life as the Phase 1 screen proving migrations ran and the seed loaded. Phase 5
 * took the dish listing out of it — the real Dishes tab does that now, with gauges — and
 * what is left is whatever the product has no other way to show.
 *
 * Phase 9 took the prep fixture buttons out for the reason their own comment promised:
 * every dish that needs prep now has a Prep section on its detail screen, so there is a
 * real writer and a fixture would be a second one that could disagree with it.
 *
 * **What replaced them is the notification plan.** Its whole output arrives hours later
 * and only if the OS agrees, so without somewhere to read "here is what is scheduled and
 * when", the only way to check a change is to wait until nine at night and find out
 * whether nothing happening was correct. The role list stays for the same shape of reason:
 * the always-available flag is invisible everywhere else, and it is the flag — never the
 * role name — that drives the behaviour (`docs/SPEC.md` §1.1).
 */

export default function Debug() {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { data: roles, error: roleError } = useLiveQuery(roleConfigQuery());
  const { data: prep, error: prepError } = useLiveQuery(prepStatesQuery());
  // The plan, not the scheduler — the root layout owns the one copy that has side effects.
  const { plan, granted } = usePrepPlan();
  const { request } = useRequestNotificationPermission();
  const [asking, setAsking] = useState(false);
  const [scheduled, setScheduled] = useState<string[] | null>(null);

  const error = roleError ?? prepError;
  const alwaysAvailable = (roles ?? []).filter((r) => r.isAlwaysAvailable);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <BackLink label="Dishes" onPress={() => router.back()} />

        <Text style={styles.eyebrow}>Not part of the app</Text>
        <Text style={styles.title}>Dev tools</Text>

        {error ? <Text style={styles.error}>{error.message}</Text> : null}

        <Text style={styles.heading}>Prep state</Text>
        <Text style={styles.body}>
          {prep?.length ?? 0} row{(prep?.length ?? 0) === 1 ? '' : 's'} in the table.
          Started and thrown out from a dish's own Prep section; this only clears them.
        </Text>
        <View style={styles.buttons}>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            onPress={() => clearAllPrep()}
          >
            <Text style={styles.buttonLabel}>Clear all prep</Text>
          </Pressable>
        </View>

        {/* The one part of the app whose output is invisible until hours later, and only
            then if the OS cooperates. Reading the plan is how a change to it gets checked
            at all (SPEC §20). */}
        <Text style={styles.heading}>Notifications</Text>
        <Text style={styles.body}>
          Permission:{' '}
          {granted === null ? 'not checked' : granted ? 'granted' : 'not granted'}.{' '}
          {plan.nudges.length} prep reminder
          {plan.nudges.length === 1 ? '' : 's'} planned
          {plan.droppedNudges > 0
            ? `, ${plan.droppedNudges} more dropped by the cap`
            : ''}
          , {plan.readyAlerts.length} ready alert
          {plan.readyAlerts.length === 1 ? '' : 's'}.
        </Text>

        {plan.nudges.map((nudge) => (
          <Text key={nudge.id} style={styles.entry}>
            {format(nudge.fireAt, 'EEE d MMM, HH:mm')} · {nudge.title}
          </Text>
        ))}
        {plan.readyAlerts.map((alert) => (
          <Text key={alert.id} style={styles.entry}>
            {format(alert.fireAt, 'EEE d MMM, HH:mm')} · {alert.title}
          </Text>
        ))}

        <View style={styles.buttons}>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            onPress={() => void request()}
          >
            <Text style={styles.buttonLabel}>Ask for permission</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            onPress={() => void scheduleTestNotification()}
          >
            <Text style={styles.buttonLabel}>Fire one in 10s</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            onPress={() =>
              void listScheduled().then((items) =>
                setScheduled(items.map((item) => item.title ?? item.id)),
              )
            }
          >
            <Text style={styles.buttonLabel}>What is actually scheduled?</Text>
          </Pressable>
        </View>

        {scheduled === null ? null : scheduled.length === 0 ? (
          <Text style={styles.entry}>The OS is holding nothing.</Text>
        ) : (
          scheduled.map((title) => (
            <Text key={title} style={styles.entry}>
              held · {title}
            </Text>
          ))
        )}

        <Text style={styles.heading}>Roles</Text>
        <Text style={styles.body}>
          {roles?.length ?? 0} configured. Always available:{' '}
          {alwaysAvailable.length === 0
            ? 'none'
            : alwaysAvailable.map((r) => r.label).join(', ')}
          . Those are excluded from scoring by the flag, never by their name.
        </Text>

        {/* Onboarding runs once and is a gate rather than a route, so without this there
            is no way to see it a second time short of uninstalling the app — and it is
            the one flow whose acceptance criterion is a stopwatch. */}
        <Text style={styles.heading}>Onboarding</Text>
        <Text style={styles.body}>
          Wipes every dish, cook and setting and shows the picker again. A hard delete, so
          it leaves the database exactly as a fresh install finds it. Roles survive — they
          are seeded at boot.
        </Text>
        <View style={styles.buttons}>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            onPress={() => setAsking(true)}
          >
            <Text style={styles.buttonLabel}>Reset onboarding</Text>
          </Pressable>
        </View>
      </ScrollView>

      <ConfirmDialog
        visible={asking}
        title="Start over?"
        message="Every dish, cook event and setting is deleted. There is no undo."
        confirmLabel="Delete everything"
        destructive
        onCancel={() => setAsking(false)}
        onConfirm={() => {
          setAsking(false);
          resetOnboarding();
        }}
      />
    </SafeAreaView>
  );
}

const makeStyles = ({ colors, text }: Theme) => ({
  safeArea: {
    flex: 1,
    backgroundColor: colors.steel2,
  },
  scroll: {
    paddingHorizontal: layout.screenPaddingH,
    paddingBottom: space.xxl,
  },
  eyebrow: {
    ...text.eyebrow,
    marginTop: space.xs,
  },
  title: {
    ...text.title,
    marginTop: 3,
  },
  heading: {
    ...text.sectionHeading,
    marginTop: space.xxl,
    marginBottom: space.md,
  },
  body: {
    ...text.bodySmall,
  },
  entry: {
    ...text.meta,
    marginTop: space.sm,
  },
  buttons: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: space.sm,
    marginTop: space.lg,
  },
  button: {
    paddingHorizontal: 11,
    paddingVertical: 8,
    borderWidth: border.thin,
    borderColor: colors.line,
    borderRadius: radius.control,
  },
  buttonPressed: {
    backgroundColor: colors.steel1,
  },
  buttonLabel: {
    ...text.control,
    fontSize: 12,
  },
  error: {
    ...text.bodySmall,
    color: colors.gongura,
    marginTop: space.lg,
  },
});
