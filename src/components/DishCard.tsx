import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Reason } from '../core/scoring';
import { border, colors, radius, space, text } from '../theme/tokens';
import { IntervalGauge } from './IntervalGauge';
import { ReasonChips } from './ReasonChip';

/**
 * A suggestion on the Today screen: name, what it is, how long it takes, the interval
 * gauge, and the reasons it is being suggested.
 *
 * Props are flat rather than a `Candidate` on purpose. `Candidate` deliberately has no
 * `minutes` — it is display-only and must never reach the score (SPEC §1.2) — and no role
 * *label*, since the engine only ever compares raw role strings. Both are the query
 * layer's job to supply, and taking them separately keeps that boundary visible.
 */

export interface DishCardProps {
  name: string;
  /** From `role_config`, not the raw role string: "Dry curry", not `dry_curry`. */
  roleLabel: string;
  primaryIngredient: string | null;
  /** Display only. Null when the dish has no time recorded. */
  minutes: number | null;
  hasRecipe?: boolean;
  daysSince: number | null;
  medianInterval: number | null;
  /** From `reasons()` in `src/core/scoring.ts`, already capped at three. */
  reasons: readonly Reason[];
  onPress?: () => void;
}

export function DishCard({
  name,
  roleLabel,
  primaryIngredient,
  minutes,
  hasRecipe = false,
  daysSince,
  medianInterval,
  reasons,
  onPress,
}: DishCardProps) {
  // A dish with no recipe is a normal dish, so this line only ever adds information —
  // it never says "no recipe".
  const meta = [roleLabel, primaryIngredient, hasRecipe ? 'has recipe' : null]
    .filter((part): part is string => part !== null && part !== '')
    .join(' · ');

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <View style={styles.top}>
        <View style={styles.identity}>
          <Text style={styles.name}>{name}</Text>
          <Text style={styles.meta}>{meta}</Text>
        </View>
        {minutes === null ? null : <Text style={styles.minutes}>{minutes} min</Text>}
      </View>

      <View style={styles.gauge}>
        <IntervalGauge daysSince={daysSince} medianInterval={medianInterval} />
      </View>

      <ReasonChips reasons={reasons} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.steel1,
    borderWidth: border.thin,
    borderColor: colors.lineSoft,
    borderRadius: radius.card,
    paddingTop: space.lg,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  cardPressed: {
    backgroundColor: colors.steel2,
    borderColor: colors.line,
  },
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    // Not 'baseline': the left column is a View, and RN does not resolve a container's
    // baseline reliably across platforms. The minutes are nudged down instead.
    alignItems: 'flex-start',
    gap: 12,
  },
  identity: {
    flex: 1,
  },
  name: {
    ...text.cardTitle,
  },
  meta: {
    ...text.meta,
    marginTop: 3,
  },
  minutes: {
    ...text.figure,
    marginTop: 3,
  },
  gauge: {
    marginTop: 11,
  },
});
