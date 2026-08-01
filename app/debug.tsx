import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackLink } from '../src/components/BackLink';
import { clearAllPrep, startPrep } from '../src/db/queries/prep';
import { roleConfigQuery } from '../src/db/queries/roles';
import { prepStatesQuery } from '../src/db/queries/tables';
import { border, layout, radius, space, type Theme } from '../src/theme/tokens';
import { useThemedStyles } from '../src/theme/useTheme';

/**
 * Dev tools. Not part of the product.
 *
 * Started life as the Phase 1 screen proving migrations ran and the seed loaded. Phase 5
 * took the dish listing out of it — the real Dishes tab does that now, with gauges — and
 * what is left is the one thing there is still no other way to do.
 *
 * **`prep_state` has no product writer until Phase 9.** Without these buttons the Today
 * prep banner, the "batter is ready" chip, and the hard exclusion of a dish whose prep is
 * not ready are all unverifiable on device. The role list stays because the
 * always-available flag is invisible everywhere else, and it is the flag — never the role
 * name — that drives the behaviour (`docs/SPEC.md` §1.1).
 *
 * All of this goes when Phase 9 builds real prep controls.
 */

/** Matches the seeded `(prep_kind, primary_ingredient)` pairs — see SPEC §5.2. */
const PREP_FIXTURES = [
  { label: 'Urad dal batter', kind: 'batter', ingredient: 'urad dal', note: '72 h' },
  {
    label: 'Soaked kidney beans',
    kind: 'soaked',
    ingredient: 'kidney beans',
    note: '24 h',
  },
  { label: 'Soaked chickpeas', kind: 'soaked', ingredient: 'chickpeas', note: '24 h' },
] as const;

export default function Debug() {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { data: roles, error: roleError } = useLiveQuery(roleConfigQuery());
  const { data: prep, error: prepError } = useLiveQuery(prepStatesQuery());

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
          Adding one makes its dishes cookable on Today, with a banner and a reason chip.
        </Text>
        <View style={styles.buttons}>
          {PREP_FIXTURES.map((fixture) => (
            <Pressable
              key={`${fixture.kind}:${fixture.ingredient}`}
              accessibilityRole="button"
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
              onPress={() =>
                startPrep({
                  kind: fixture.kind,
                  ingredient: fixture.ingredient,
                  label: fixture.label,
                })
              }
            >
              <Text style={styles.buttonLabel}>
                + {fixture.label} · {fixture.note}
              </Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
            onPress={() => clearAllPrep()}
          >
            <Text style={styles.buttonLabel}>Clear all prep</Text>
          </Pressable>
        </View>

        <Text style={styles.heading}>Roles</Text>
        <Text style={styles.body}>
          {roles?.length ?? 0} configured. Always available:{' '}
          {alwaysAvailable.length === 0
            ? 'none'
            : alwaysAvailable.map((r) => r.label).join(', ')}
          . Those are excluded from scoring by the flag, never by their name.
        </Text>
      </ScrollView>
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
