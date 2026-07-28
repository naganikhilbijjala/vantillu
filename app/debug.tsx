import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Link } from 'expo-router';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { dishListQuery, roleConfigQuery } from '../src/db/queries/debug';

/**
 * Phase 1 verification screen: proves migrations ran, the seed loaded, and the data
 * survives a restart. Throwaway — it has no design tokens and will be replaced by the
 * real Dishes list in Phase 5.
 */
export default function Debug() {
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

// Placeholder colours until Phase 3 introduces src/theme/tokens.ts.
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#16181A',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 4,
  },
  back: {
    color: '#8A9199',
    fontSize: 13,
    letterSpacing: 1,
    marginBottom: 8,
  },
  count: {
    color: '#D9DEE3',
    fontSize: 22,
  },
  subCount: {
    color: '#8A9199',
    fontSize: 13,
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  row: {
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#2A2E33',
  },
  name: {
    color: '#D9DEE3',
    fontSize: 15,
  },
  altName: {
    color: '#8A9199',
    fontSize: 13,
  },
  meta: {
    color: '#6E757C',
    fontSize: 12,
    marginTop: 2,
  },
  error: {
    color: '#C8553D',
    fontSize: 13,
    paddingHorizontal: 20,
  },
});
