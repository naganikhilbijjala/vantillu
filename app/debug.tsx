import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Link } from 'expo-router';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { dishListQuery } from '../src/db/queries/debug';
import { clearAllPrep, startPrep } from '../src/db/queries/prep';
import { roleConfigQuery } from '../src/db/queries/roles';
import { prepStatesQuery } from '../src/db/queries/today';
import { border, layout, radius, space, type Theme } from '../src/theme/tokens';
import { useThemedStyles } from '../src/theme/useTheme';

/**
 * Phase 1 verification screen: proves migrations ran, the seed loaded, and the data
 * survives a restart. Throwaway — it will be replaced by the real Dishes list in Phase 5.
 *
 * Phase 4 added the prep controls. `prep_state` has no writer until Phase 9, which would
 * leave the Today screen's prep banner, its "batter is ready" chip, and the hard exclusion
 * of a dish with no live prep all unverifiable on device. These three buttons are a
 * developer affordance and go the same way as the rest of this screen.
 */

/** Matches the seeded `(prep_kind, primary_ingredient)` pairs — see `docs/SPEC.md` §5.2. */
const PREP_FIXTURES = [
  { label: 'Urad dal batter (72 h)', kind: 'batter', ingredient: 'urad dal' },
  { label: 'Soaked kidney beans (24 h)', kind: 'soaked', ingredient: 'kidney beans' },
] as const;

export default function Debug() {
  const styles = useThemedStyles(makeStyles);
  const { data: dishes, error: dishError } = useLiveQuery(dishListQuery());
  const { data: roles, error: roleError } = useLiveQuery(roleConfigQuery());
  const { data: prep, error: prepError } = useLiveQuery(prepStatesQuery());

  const error = dishError ?? roleError ?? prepError;
  const alwaysAvailable =
    roles?.filter((r) => r.isAlwaysAvailable).map((r) => r.label) ?? [];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Link href="/" style={styles.back}>
          ← vantillu
        </Link>
        <Text style={styles.count}>{dishes?.length ?? 0} dishes</Text>
        <Text style={styles.subCount}>
          {roles?.length ?? 0} roles
          {alwaysAvailable.length > 0 &&
            ` · always available: ${alwaysAvailable.join(', ')}`}
        </Text>

        <Text style={styles.subCount}>{prep?.length ?? 0} live prep rows</Text>
        <View style={styles.buttons}>
          {PREP_FIXTURES.map((fixture) => (
            <Pressable
              key={fixture.kind}
              accessibilityRole="button"
              style={styles.button}
              onPress={() =>
                startPrep({
                  kind: fixture.kind,
                  ingredient: fixture.ingredient,
                  label: fixture.label,
                })
              }
            >
              <Text style={styles.buttonLabel}>+ {fixture.label}</Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            style={styles.button}
            onPress={() => clearAllPrep()}
          >
            <Text style={styles.buttonLabel}>Clear prep</Text>
          </Pressable>
        </View>
      </View>

      {error ? (
        <Text style={styles.error}>{error.message}</Text>
      ) : (
        <FlatList
          data={dishes ?? []}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.name}>
                {item.name}
                {item.altName && item.altName !== item.name ? (
                  <Text style={styles.altName}> · {item.altName}</Text>
                ) : null}
              </Text>
              <Text style={styles.meta}>
                {item.role} · {item.effort}
                {item.prepLabel ? ` · ${item.prepLabel}` : ''}
              </Text>
            </View>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const makeStyles = ({ colors, text }: Theme) => ({
  safeArea: {
    flex: 1,
    backgroundColor: colors.steel2,
  },
  header: {
    paddingHorizontal: layout.screenPaddingH,
    paddingTop: 8,
    paddingBottom: 16,
    gap: space.xs,
  },
  back: {
    ...text.control,
    marginBottom: 8,
  },
  count: {
    ...text.title,
  },
  subCount: {
    ...text.bodySmall,
  },
  buttons: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: space.sm,
    marginTop: space.md,
  },
  button: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: border.thin,
    borderColor: colors.line,
    borderRadius: radius.control,
  },
  buttonLabel: {
    ...text.control,
    fontSize: 12,
  },
  list: {
    paddingHorizontal: layout.screenPaddingH,
    paddingBottom: 32,
  },
  row: {
    paddingVertical: 10,
    borderTopWidth: border.hairline,
    borderTopColor: colors.lineSoft,
  },
  name: {
    ...text.rowTitle,
  },
  altName: {
    ...text.meta,
  },
  meta: {
    ...text.meta,
    marginTop: space.xs,
  },
  error: {
    ...text.bodySmall,
    color: colors.gongura,
    paddingHorizontal: layout.screenPaddingH,
  },
});
