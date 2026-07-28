import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Link } from 'expo-router';
import { FlatList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { dishListQuery, roleConfigQuery } from '../src/db/queries/debug';
import { border, layout, space, type Theme } from '../src/theme/tokens';
import { useThemedStyles } from '../src/theme/useTheme';

/**
 * Phase 1 verification screen: proves migrations ran, the seed loaded, and the data
 * survives a restart. Throwaway — it will be replaced by the real Dishes list in Phase 5.
 */
export default function Debug() {
  const styles = useThemedStyles(makeStyles);
  const { data: dishes, error: dishError } = useLiveQuery(dishListQuery());
  const { data: roles, error: roleError } = useLiveQuery(roleConfigQuery());

  const error = dishError ?? roleError;
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
