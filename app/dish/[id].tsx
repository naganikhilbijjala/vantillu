import { useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackLink } from '../../src/components/BackLink';
import { CookTimeline } from '../../src/components/CookTimeline';
import { IntervalGauge } from '../../src/components/IntervalGauge';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { StatGrid, StatTile } from '../../src/components/StatTile';
import type { CookTimelineEntry } from '../../src/db/cookModel';
import { type DishListItem, patternSummary } from '../../src/db/dishesModel';
import { useDish } from '../../src/hooks/useDishes';
import { layout, space, type Theme } from '../../src/theme/tokens';
import { useThemedStyles } from '../../src/theme/useTheme';

/**
 * One dish: what it is, how its rhythm actually looks, and how to log a cook.
 *
 * Pushed over the tab bar rather than living inside it, so the list underneath keeps its
 * scroll position, its role filter and its search — which is this phase's acceptance
 * criterion.
 *
 * **The recipe and the cook-note timeline are Phase 7.** They are deliberately absent
 * rather than stubbed: an empty "Recipe" heading with nothing under it reads as a broken
 * screen, and a dish with no recipe is supposed to look like a normal dish.
 */
export default function DishDetail() {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { dish, timeline, isReady, error } = useDish(id);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.gutter}>
          <BackLink label="Dishes" onPress={() => router.back()} />
        </View>

        {error ? (
          <View style={styles.gutter}>
            <Text style={styles.error}>{error.message}</Text>
          </View>
        ) : dish === undefined ? (
          // Only a real miss once the read has landed — before that it is just loading.
          isReady ? (
            <View style={styles.gutter}>
              <Text style={styles.missing}>
                That dish is no longer in your repertoire.
              </Text>
            </View>
          ) : null
        ) : (
          <Body dish={dish} timeline={timeline} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Body({
  dish,
  timeline,
}: {
  dish: DishListItem;
  timeline: readonly CookTimelineEntry[];
}) {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();

  // Role, effort, and the prep it needs — the three things that decide when it is cookable.
  const eyebrow = [dish.roleLabel, dish.effort, dish.prepLabel]
    .filter((part): part is string => part !== null && part !== '')
    .join(' · ');

  const slots =
    dish.slots.length === 0 ? 'No meal slots set' : `Good for ${dish.slots.join(', ')}`;

  return (
    <View style={styles.gutter}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.title}>{dish.name}</Text>
      {dish.altName !== null && dish.altName !== dish.name ? (
        <Text style={styles.altName}>also called {dish.altName}</Text>
      ) : null}

      <View style={styles.gaugeBlock}>
        {dish.isAlwaysAvailable ? null : (
          <IntervalGauge
            daysSince={dish.daysSince}
            medianInterval={dish.medianInterval}
            label={patternSummary(dish)}
          />
        )}
        <Text style={styles.pattern}>{patternSummary(dish)}</Text>
      </View>

      <Text style={styles.heading}>Pattern</Text>
      <StatGrid>
        <StatTile
          label="Cooked"
          value={`${dish.cookCount}`}
          unit={dish.cookCount === 1 ? 'time' : 'times'}
        />
        <StatTile
          label="Last made"
          value={dish.daysSince === null ? '—' : `${dish.daysSince}`}
          unit={dish.daysSince === null ? undefined : 'd ago'}
        />
        <StatTile
          label="Usually every"
          // An unknown median is an em dash, never a zero — "no data" and "every 0 days"
          // are different claims (SPEC §3).
          value={dish.medianInterval ? `${dish.medianInterval}` : '—'}
          unit={dish.medianInterval ? 'd' : undefined}
        />
        <StatTile
          label="Takes"
          value={dish.minutes === null ? '—' : `${dish.minutes}`}
          unit={dish.minutes === null ? undefined : 'min'}
        />
      </StatGrid>

      <Text style={styles.slots}>{slots}</Text>

      {/* Pulled forward from Phase 7: Phase 6 captures a note per cook, and text that
          vanishes on save reads as a bug however the roadmap is written. The recipe view
          and the dish's own notes are still Phase 7. */}
      <Text style={styles.heading}>From past cooks</Text>
      <CookTimeline entries={timeline} />

      {/* Also the one-tap path: the dish is known, so the sheet skips the picker. */}
      <View style={styles.action}>
        <PrimaryButton
          label="Log a cook"
          onPress={() => router.push({ pathname: '/log', params: { dishId: dish.id } })}
        />
      </View>
    </View>
  );
}

const makeStyles = ({ colors, text }: Theme) => ({
  safeArea: {
    flex: 1,
    backgroundColor: colors.steel2,
  },
  scroll: {
    paddingBottom: space.xxl,
  },
  gutter: {
    paddingHorizontal: layout.screenPaddingH,
  },
  eyebrow: {
    ...text.eyebrow,
    marginTop: space.xs,
  },
  title: {
    ...text.title,
    marginTop: 3,
  },
  altName: {
    ...text.meta,
    fontSize: 11,
    marginTop: 5,
  },
  gaugeBlock: {
    marginTop: space.xl,
    gap: 7,
  },
  pattern: {
    ...text.meta,
    fontSize: 11,
  },
  heading: {
    ...text.sectionHeading,
    marginTop: space.xxl,
    marginBottom: space.md,
  },
  slots: {
    ...text.bodySmall,
    marginTop: space.lg,
  },
  action: {
    marginTop: space.xxl,
  },
  error: {
    ...text.bodySmall,
    color: colors.gongura,
  },
  missing: {
    ...text.bodySmall,
    marginTop: space.lg,
  },
});
