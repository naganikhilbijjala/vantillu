import { Pressable, Text, View } from 'react-native';
import type { DishListItem } from '../db/dishesModel';
import { border, gauge, space, type Theme } from '../theme/tokens';
import { useThemedStyles } from '../theme/useTheme';
import { IntervalGauge } from './IntervalGauge';

/**
 * One row of the repertoire list: name, rhythm, gauge, days since.
 *
 * Named `DishListRow` rather than `DishRow` because `DishRow` is already the database row
 * shape in `src/db/rows.ts`, and confusing the two would be easy and annoying.
 *
 * An always-available dish gets no gauge and no day count. It is never overdue — it is in
 * the cupboard — and drawing an empty bar next to it would imply a rhythm it does not have
 * (`docs/SPEC.md` §1.1).
 */

export interface DishListRowProps {
  dish: DishListItem;
  onPress: () => void;
}

function rhythm(dish: DishListItem): string {
  if (dish.isAlwaysAvailable) return 'always available';
  if (dish.medianInterval === null || dish.medianInterval === 0) {
    return dish.cookCount === 0 ? 'not cooked yet' : 'new';
  }
  return `every ~${dish.medianInterval}d`;
}

export function DishListRow({ dish, onPress }: DishListRowProps) {
  const styles = useThemedStyles(makeStyles);

  const meta = [rhythm(dish), dish.primaryIngredient]
    .filter((part): part is string => part !== null && part !== '')
    .join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${dish.name}, ${meta}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {dish.name}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {meta}
          {dish.hasRecipe ? <Text style={styles.recipe}> · recipe</Text> : null}
        </Text>
      </View>

      <View style={styles.gaugeSlot}>
        {dish.isAlwaysAvailable ? null : (
          <IntervalGauge
            daysSince={dish.daysSince}
            medianInterval={dish.medianInterval}
            width={gauge.compactWidth}
          />
        )}
      </View>

      <Text style={styles.days}>
        {dish.isAlwaysAvailable || dish.daysSince === null ? '—' : `${dish.daysSince}d`}
      </Text>
    </Pressable>
  );
}

const makeStyles = ({ colors, text }: Theme) => ({
  row: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.lg,
    paddingVertical: 12,
    // A hairline under each row rather than a card each: sixty cards is a wall, and the
    // list is for scanning rather than for reading one entry at a time.
    borderBottomWidth: border.hairline,
    borderBottomColor: colors.lineSoft,
  },
  rowPressed: {
    backgroundColor: colors.steel1,
  },
  body: {
    flex: 1,
    minWidth: 0,
  },
  name: {
    ...text.rowTitle,
  },
  meta: {
    ...text.meta,
    marginTop: space.xs,
  },
  recipe: {
    ...text.meta,
    color: colors.curry,
  },
  gaugeSlot: {
    width: gauge.compactWidth,
  },
  days: {
    ...text.figure,
    width: 34,
    textAlign: 'right' as const,
  },
});
