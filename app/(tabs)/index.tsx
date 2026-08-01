import { format } from 'date-fns';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DishCard } from '../../src/components/DishCard';
import { FAB_SIZE, Fab } from '../../src/components/Fab';
import { GhostButton } from '../../src/components/GhostButton';
import { HeldBackNote } from '../../src/components/HeldBackNote';
import { PillToggle } from '../../src/components/PillToggle';
import { PrepBanner } from '../../src/components/PrepBanner';
import { SlotSwitcher } from '../../src/components/SlotSwitcher';
import { DEFAULT_SUGGESTION_COUNT } from '../../src/core/scoring';
import type { Slot } from '../../src/core/types';
import { useToday } from '../../src/hooks/useToday';
import { border, layout, radius, space, type Theme } from '../../src/theme/tokens';
import { useThemedStyles } from '../../src/theme/useTheme';

/**
 * Today — the screen the whole app exists for: *what should I cook right now?*
 *
 * Reading order is the order the questions arrive in. What time is it and which meal is
 * this; is anything already prepared and waiting; here are three things, each with the
 * reason it is being offered; and finally, what you were expecting to see and why it
 * isn't here.
 *
 * The suggestions themselves are ranked in `src/core/scoring.ts` and assembled by
 * `useToday`. Nothing on this screen decides what to cook — it decides how to say it.
 */

const PART_OF_DAY: Record<Slot, string> = {
  breakfast: 'morning',
  lunch: 'afternoon',
  dinner: 'evening',
  // Never auto-detected, so this only appears if the clock ever starts returning it.
  snack: 'day',
};

const TITLE: Record<Slot, string> = {
  breakfast: "What's for breakfast?",
  lunch: "What's for lunch?",
  dinner: "What's for dinner?",
  snack: 'Something to snack on?',
};

/** SPEC calls it a "show three more" affordance; the label stays honest when fewer remain. */
const MORE_LABEL = ['', 'Show one more', 'Show two more', 'Show three more'];

export default function Today() {
  const styles = useThemedStyles(makeStyles);
  const {
    now,
    slot,
    autoSlot,
    isOverridden,
    selectSlot,
    suggestions,
    heldBack,
    livePrep,
    display,
    isWeekend,
    isVegOnlyDay,
    vegOnlyOverride,
    toggleVegOnlyToday,
    dishCount,
    isReady,
    error,
  } = useToday();

  // How far the list has been expanded, remembered against the slot it was expanded for.
  // Changing the slot asks a new question, so it gets the short answer again — derived
  // rather than reset in an effect, which would render the long list for one frame first.
  const [expansion, setExpansion] = useState({
    slot,
    count: DEFAULT_SUGGESTION_COUNT,
  });
  const visibleCount =
    expansion.slot === slot ? expansion.count : DEFAULT_SUGGESTION_COUNT;

  const shown = suggestions.slice(0, visibleCount);
  const remaining = suggestions.length - shown.length;

  // Top edge only: the tab bar owns the bottom inset now, and claiming it here too would
  // double-pad the FAB away from the bar it should sit just above.
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          {/* The eyebrow states the real time of day; the title states the slot being
              answered for. They differ while an override is in force, and saying both is
              what keeps the override from feeling like the app lost track of the clock. */}
          <Text style={styles.eyebrow}>
            {format(now, 'EEEE')} {PART_OF_DAY[autoSlot]}
            {isOverridden ? ' · showing another slot' : ''}
          </Text>
          <Text style={styles.title}>{TITLE[slot]}</Text>
        </View>

        <SlotSwitcher slot={slot} onSelect={selectSlot} />

        <View style={styles.gutter}>
          <PillToggle
            label="Veg only today"
            selected={isVegOnlyDay}
            // On because of the weekday set rather than the override: true, but not this
            // control's to switch off (SPEC §6).
            locked={isVegOnlyDay && !vegOnlyOverride}
            onPress={toggleVegOnlyToday}
          />
        </View>

        {livePrep.map((prep) => (
          <View key={prep.id} style={styles.gutter}>
            <PrepBanner prep={prep} now={now} />
          </View>
        ))}

        {error ? (
          <View style={styles.gutter}>
            <Text style={styles.error}>{error.message}</Text>
          </View>
        ) : !isReady ? null : shown.length === 0 ? (
          <View style={styles.gutter}>
            <EmptyState slot={slot} dishCount={dishCount} />
          </View>
        ) : (
          <View style={styles.cards}>
            {shown.map((ranked) => {
              const info = display.get(ranked.candidate.id);
              return (
                <DishCard
                  key={ranked.candidate.id}
                  name={ranked.candidate.name}
                  roleLabel={info?.roleLabel ?? ranked.candidate.role}
                  primaryIngredient={ranked.candidate.primaryIngredient}
                  minutes={info?.minutes ?? null}
                  hasRecipe={info?.hasRecipe ?? false}
                  daysSince={ranked.candidate.daysSince}
                  medianInterval={ranked.candidate.medianInterval}
                  reasons={ranked.reasons}
                />
              );
            })}
          </View>
        )}

        {remaining > 0 && (
          <View style={styles.gutter}>
            <GhostButton
              label={MORE_LABEL[Math.min(remaining, DEFAULT_SUGGESTION_COUNT)]}
              onPress={() =>
                setExpansion({ slot, count: visibleCount + DEFAULT_SUGGESTION_COUNT })
              }
            />
          </View>
        )}

        {heldBack.length > 0 && (
          <View style={styles.gutter}>
            <HeldBackNote groups={heldBack} slot={slot} isWeekend={isWeekend} />
          </View>
        )}
      </ScrollView>

      {/* Phase 6 wires this to the log sheet. Present now because it is the screen's
          primary action and the layout has to be built around it, not beside it. */}
      <Fab />
    </SafeAreaView>
  );
}

/**
 * Inviting, never nagging. An empty slot is a normal state — there are only so many
 * breakfast dishes — so this explains and offers a way forward rather than scolding.
 */
function EmptyState({ slot, dishCount }: { slot: Slot; dishCount: number }) {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>
        {dishCount === 0
          ? 'No dishes yet. Add the things you already cook and this fills itself in.'
          : `Nothing lines up for ${slot} just now. Try another slot, or cook off-script — logging it still counts.`}
      </Text>
    </View>
  );
}

const makeStyles = ({ colors, text }: Theme) => ({
  safeArea: {
    flex: 1,
    backgroundColor: colors.steel2,
  },
  scroll: {
    gap: 14,
    // Clears the FAB, so the last card and the held-back prose stay reachable.
    paddingBottom: FAB_SIZE + space.xxl,
  },
  header: {
    paddingHorizontal: layout.screenPaddingH,
    paddingTop: space.md,
  },
  gutter: {
    paddingHorizontal: layout.screenPaddingH,
  },
  eyebrow: {
    ...text.eyebrow,
  },
  title: {
    ...text.title,
    marginTop: 3,
  },
  cards: {
    paddingHorizontal: layout.screenPaddingH,
    gap: space.md,
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
  error: {
    ...text.bodySmall,
    color: colors.gongura,
  },
});
