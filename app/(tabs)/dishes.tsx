import { Link, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DishListRow } from '../../src/components/DishListRow';
import { FAB_SIZE, Fab } from '../../src/components/Fab';
import { RoleFilterRow } from '../../src/components/RoleFilterRow';
import { SearchField } from '../../src/components/SearchField';
import { SmallButton } from '../../src/components/SmallButton';
import { ALL_ROLES, filterDishes } from '../../src/db/dishesModel';
import { useDishes } from '../../src/hooks/useDishes';
import { border, layout, radius, space, type Theme } from '../../src/theme/tokens';
import { useThemedStyles } from '../../src/theme/useTheme';

/**
 * The repertoire — everything you cook, most overdue first.
 *
 * Today answers "what should I cook now" and drops everything ineligible. This screen is
 * the other half: a podi appears here because it is a dish you own, it just carries no
 * gauge because it is never overdue (`docs/SPEC.md` §1.1).
 *
 * The filter and the search live in this component's state rather than in `useDishes`,
 * which is what makes them survive a trip to the detail screen and back — the tab screen
 * stays mounted underneath the pushed route.
 */
export default function Dishes() {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { dishes, roles, recipeCount, isReady, error } = useDishes();

  const [role, setRole] = useState<string | null>(ALL_ROLES);
  const [search, setSearch] = useState('');

  const visible = useMemo(
    () => filterDishes(dishes, { role, search }),
    [dishes, role, search],
  );

  const isFiltered = role !== ALL_ROLES || search.trim() !== '';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>
          {dishes.length} {dishes.length === 1 ? 'dish' : 'dishes'} · {recipeCount} with
          {recipeCount === 1 ? ' a recipe' : ' recipes'}
        </Text>
        <Text style={styles.title}>Your repertoire</Text>
      </View>

      <View style={styles.gutter}>
        <SearchField value={search} onChangeText={setSearch} />
      </View>

      <RoleFilterRow roles={roles} selected={role} onSelect={setRole} />

      {error ? (
        <View style={styles.gutter}>
          <Text style={styles.error}>{error.message}</Text>
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <DishListRow dish={item} onPress={() => router.push(`/dish/${item.id}`)} />
          )}
          ListEmptyComponent={
            // Nothing at all until the first read lands; an empty state would flash.
            isReady ? (
              <EmptyState
                isFiltered={isFiltered}
                onAdd={() => router.push('/dish/edit/new')}
              />
            ) : null
          }
          ListFooterComponent={
            // Throwaway, like the screen it points at. Goes when Phase 9 builds real prep
            // controls and there is nothing left in there worth reaching.
            <Link href="/debug" style={styles.devLink}>
              dev tools
            </Link>
          }
        />
      )}

      {/* Adding a dish is what this tab is for now that the starter list is optional
          (SPEC §19.4), so it gets the same treatment Today gives logging: floating, thumb
          height, and never scrolled off by a long list. */}
      <Fab label="Add a dish" onPress={() => router.push('/dish/edit/new')} />
    </SafeAreaView>
  );
}

function EmptyState({ isFiltered, onAdd }: { isFiltered: boolean; onAdd: () => void }) {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>
        {isFiltered
          ? 'Nothing matches that. Try a different role, or search by an ingredient.'
          : 'No dishes yet. Add the things you already cook and the rest follows.'}
      </Text>
      {/* Inviting, never nagging: an empty repertoire offers the next move rather than
          pointing out that it is empty. Not while filtered — the move there is to clear
          the filter, which is already on screen. */}
      {isFiltered ? null : (
        <View style={styles.emptyAction}>
          <SmallButton label="Add a dish" onPress={onAdd} />
        </View>
      )}
    </View>
  );
}

const makeStyles = ({ colors, text }: Theme) => ({
  safeArea: {
    flex: 1,
    backgroundColor: colors.steel2,
  },
  header: {
    paddingHorizontal: layout.screenPaddingH,
    paddingTop: space.md,
    paddingBottom: space.lg,
  },
  gutter: {
    paddingHorizontal: layout.screenPaddingH,
    paddingBottom: space.lg,
  },
  eyebrow: {
    ...text.eyebrow,
  },
  title: {
    ...text.title,
    marginTop: 3,
  },
  list: {
    paddingHorizontal: layout.screenPaddingH,
    paddingTop: space.lg,
    // Clears the FAB, so the last row and the dev link stay reachable.
    paddingBottom: FAB_SIZE + space.xxl,
  },
  empty: {
    borderWidth: border.thin,
    borderStyle: 'dashed' as const,
    borderColor: colors.line,
    borderRadius: radius.tile,
    padding: 14,
  },
  emptyText: {
    ...text.bodySmall,
    textAlign: 'center' as const,
  },
  emptyAction: {
    alignItems: 'center' as const,
    marginTop: space.lg,
  },
  error: {
    ...text.bodySmall,
    color: colors.gongura,
  },
  devLink: {
    ...text.meta,
    paddingTop: space.xxl,
  },
});
