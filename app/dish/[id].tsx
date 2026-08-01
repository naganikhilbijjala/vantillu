import { useLocalSearchParams, useRouter } from 'expo-router';
import { PencilLine } from 'lucide-react-native';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackLink } from '../../src/components/BackLink';
import { CookTimeline } from '../../src/components/CookTimeline';
import { IntervalGauge } from '../../src/components/IntervalGauge';
import { PrepSection } from '../../src/components/PrepSection';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { Recipe } from '../../src/components/Recipe';
import { StatGrid, StatTile } from '../../src/components/StatTile';
import type { CookTimelineEntry } from '../../src/db/cookModel';
import { type DishListItem, patternSummary } from '../../src/db/dishesModel';
import type { DishPrepStatus } from '../../src/db/prepModel';
import { discardPrep, startPrepForDish } from '../../src/db/queries/prep';
import { useDish } from '../../src/hooks/useDishes';
import { useRequestNotificationPermission } from '../../src/hooks/useNotificationPermission';
import { border, layout, radius, space, type Theme } from '../../src/theme/tokens';
import { useTheme, useThemedStyles } from '../../src/theme/useTheme';

/**
 * One dish: what it is, how its rhythm actually looks, and how to log a cook.
 *
 * Pushed over the tab bar rather than living inside it, so the list underneath keeps its
 * scroll position, its role filter and its search.
 *
 * Sections run in the mockup's order: what it is, how its rhythm looks, the recipe, the
 * dish's own notes, then what happened the last few times. Three of those are different
 * kinds of writing about the same dish and they are never merged (`CLAUDE.md`).
 *
 * **A dish with no recipe looks intentional, not broken.** The Recipe section is the one
 * place that has to hold that line, so the empty state is an invitation with an "Add recipe"
 * button rather than a bare heading over nothing, and the Notes section is simply absent
 * until there are notes — reachable in one tap through the same editor either way.
 */
export default function DishDetail() {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { dish, timeline, prep, now, isReady, error } = useDish(id);

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
          <Body dish={dish} timeline={timeline} prep={prep} now={now} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Body({
  dish,
  timeline,
  prep,
  now,
}: {
  dish: DishListItem;
  timeline: readonly CookTimelineEntry[];
  prep: DishPrepStatus | null;
  now: Date;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const router = useRouter();
  const { request: requestNotifications } = useRequestNotificationPermission();

  // Role, effort, and the prep it needs — the three things that decide when it is cookable.
  const eyebrow = [dish.roleLabel, dish.effort, dish.prepLabel]
    .filter((part): part is string => part !== null && part !== '')
    .join(' · ');

  const slots =
    dish.slots.length === 0 ? 'No meal slots set' : `Good for ${dish.slots.join(', ')}`;

  return (
    <View style={styles.gutter}>
      <View style={styles.titleRow}>
        <View style={styles.titleText}>
          <Text style={styles.eyebrow}>{eyebrow}</Text>
          <Text style={styles.title}>{dish.name}</Text>
          {dish.altName !== null && dish.altName !== dish.name ? (
            <Text style={styles.altName}>also called {dish.altName}</Text>
          ) : null}
        </View>

        {/* Beside the name, because that is what it edits and because it is the one action
            here that should not need scrolling to find. The editor holds the dish's
            identity, its recipe, and the delete (SPEC §19.4). */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Edit ${dish.name}`}
          onPress={() => router.push(`/dish/edit/${dish.id}`)}
          style={({ pressed }) => [styles.editButton, pressed && styles.editPressed]}
        >
          <PencilLine size={16} strokeWidth={1.7} color={colors.ink} />
        </Pressable>
      </View>

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

      {/* Only for a dish that needs prep, which is a handful of them. This is the section
          that makes the hard exclusion answerable: Today says the dish is held back for
          want of batter, and this is where the batter gets started (SPEC §20.4). */}
      {prep === null ? null : (
        <>
          <Text style={styles.heading}>Prep</Text>
          <PrepSection
            status={prep}
            now={now}
            onStart={() => {
              startPrepForDish(dish);
              // Asked here rather than at launch: this is the first moment the app has
              // something to say, and the first moment the request explains itself
              // (SPEC §20.5). The prep is recorded either way — a denied permission
              // costs the reminder, never the feature.
              void requestNotifications();
            }}
            onDiscard={() => {
              if (prep.prepId !== null) discardPrep(prep.prepId);
            }}
          />
        </>
      )}

      <Text style={styles.heading}>Recipe</Text>
      <Recipe
        ingredients={dish.ingredientsText}
        method={dish.methodText}
        onEdit={() => router.push(`/dish/edit/${dish.id}`)}
      />

      {/* Absent rather than empty when there are nothing but a heading to show. The editor
          behind "Add recipe" / "Edit recipe" holds this field too, so notes are always one
          tap away without a section that exists only to say it has nothing in it. */}
      {dish.notes === null ? null : (
        <>
          <Text style={styles.heading}>Notes</Text>
          <Text style={styles.notes}>{dish.notes}</Text>
        </>
      )}

      {/* Pulled forward into Phase 6: it captures a note per cook, and text that vanishes on
          save reads as a bug however the roadmap is written. */}
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
  titleRow: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: space.lg,
  },
  titleText: {
    flex: 1,
    minWidth: 0,
  },
  editButton: {
    width: layout.minTouchTarget,
    height: layout.minTouchTarget,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: border.thin,
    borderColor: colors.line,
    borderRadius: radius.control,
    backgroundColor: colors.steel1,
    // Optically level with the title rather than with the eyebrow above it.
    marginTop: space.md,
  },
  editPressed: {
    backgroundColor: colors.steelPressed,
  },
  notes: {
    ...text.body,
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
