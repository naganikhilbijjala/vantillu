import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { DishListRow } from '../src/components/DishListRow';
import { GhostButton } from '../src/components/GhostButton';
import { PillToggle } from '../src/components/PillToggle';
import { PrimaryButton } from '../src/components/PrimaryButton';
import { SearchField } from '../src/components/SearchField';
import { SegmentedField } from '../src/components/SegmentedField';
import { TextField } from '../src/components/TextField';
import { slotForDate } from '../src/core/slots';
import type { Slot } from '../src/core/types';
import { confirmationFor } from '../src/db/cookModel';
import { ALL_ROLES, type DishListItem, filterDishes } from '../src/db/dishesModel';
// Shared with the dish editor, which offers the same four. Two copies would eventually
// disagree about whether `snack` is a real slot.
import { SLOT_OPTIONS } from '../src/db/dishModel';
import { logCook, newMealId } from '../src/db/queries/cook';
import { asSlot } from '../src/db/rows';
import { useDishes } from '../src/hooks/useDishes';
import { layout, radius, space, type Theme } from '../src/theme/tokens';
import { useThemedStyles } from '../src/theme/useTheme';

/**
 * Log a cook.
 *
 * **One route, not two, and internal steps rather than pushed screens.** `IMPLEMENTATION.md`
 * §3 sketched this as `log/[dishId].tsx`, but "add another dish to this meal" has to carry a
 * `mealId` across a return to the dish picker, and threading that through route params to a
 * second screen puts the meal grouping in the navigator instead of in one component.
 *
 * **Hard rule 6 governs the entry, not the form.** Arriving with a `dishId` — from a
 * suggestion card, or from a dish's detail screen — opens straight on the form with the slot
 * already right, so logging is one tap from Today and then one confirm. The picker only
 * appears when the caller genuinely does not know the dish yet, which is the FAB. Nothing
 * may ever be inserted before that form.
 *
 * Everything on the form is optional except the dish. **There is no rating field** — it was
 * dropped after using the sheet, because it is one more decision on the path the app exists
 * to make frictionless, and the note says anything a rating could in the user's own words.
 * `cook_event.rating` stays nullable and unwritten; SPEC §7.1 records what that costs.
 */
export default function LogCook() {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { dishId, slot: slotParam } = useLocalSearchParams<{
    dishId?: string;
    slot?: string;
  }>();
  const { dishes, now } = useDishes();

  // The slot the *caller* was answering for, which is not the clock whenever Today's
  // manual override is in force: tapping a lunch suggestion at 8pm means lunch. Falls back
  // to the clock when the caller had no slot context, such as the detail screen.
  const defaultSlot =
    (slotParam === undefined ? null : asSlot(slotParam)) ?? slotForDate(now);

  // The dish being logged. Set from the route when the caller knew it, otherwise picked.
  const [selectedId, setSelectedId] = useState<string | undefined>(dishId);
  // Non-null once the user says this cook is part of a meal, and shared from then on.
  const [mealId, setMealId] = useState<string | null>(null);
  const [justLogged, setJustLogged] = useState<string | null>(null);

  const dish = useMemo(
    () => dishes.find((d) => d.id === selectedId),
    [dishes, selectedId],
  );

  return (
    <KeyboardAvoidingView
      // `padding` is right on iOS. Android gets nothing here — but *not* for the reason this
      // comment used to give. `adjustResize` is inert under the mandatory edge-to-edge of
      // this SDK, so there is no doubled inset to avoid; there is simply no inset at all
      // (`src/hooks/useKeyboardInset.ts`). The native form sheet is left to handle its own
      // keyboard, which so far it appears to. If the note field ever hides under the keyboard
      // the way the recipe editor's did, the fix is that screen's inset-plus-scroll rather
      // than another `behavior` guess.
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.sheet}
    >
      <View style={styles.grab} />
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {dish === undefined ? (
          <DishPicker
            dishes={dishes}
            mealId={mealId}
            justLogged={justLogged}
            onSelect={setSelectedId}
            onCancel={() => router.back()}
          />
        ) : (
          <CookForm
            key={dish.id}
            dish={dish}
            defaultSlot={defaultSlot}
            inMeal={mealId !== null}
            onSubmit={(input, addAnother) => {
              const meal = addAnother ? (mealId ?? newMealId()) : mealId;
              // The sheet does not ask how it turned out, so nothing is recorded. The
              // column and the −1.5 weight stay, dormant, per SPEC §7.1.
              logCook({ ...input, rating: null, dishId: dish.id, mealId: meal });

              if (!addAnother) {
                router.back();
                return;
              }
              // Stay open, keep the meal, and go back to the picker for the next dish.
              setMealId(meal);
              setJustLogged(confirmationFor(dish.name, dish.medianInterval));
              setSelectedId(undefined);
            }}
            onCancel={() => router.back()}
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------

function DishPicker({
  dishes,
  mealId,
  justLogged,
  onSelect,
  onCancel,
}: {
  dishes: readonly DishListItem[];
  mealId: string | null;
  justLogged: string | null;
  onSelect: (id: string) => void;
  onCancel: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const [search, setSearch] = useState('');

  const visible = useMemo(
    () => filterDishes(dishes, { role: ALL_ROLES, search }),
    [dishes, search],
  );

  return (
    <View style={styles.body}>
      <Text style={styles.title}>
        {mealId === null ? 'What did you cook?' : 'And what else?'}
      </Text>
      {justLogged === null ? null : <Text style={styles.confirmation}>{justLogged}</Text>}

      <SearchField value={search} onChangeText={setSearch} />

      {/* Not a FlatList: this is inside the sheet's ScrollView, and nesting two vertical
          scrollers breaks both. The repertoire is sixty rows, so rendering them all is
          cheaper than the machinery that would avoid it. */}
      <View>
        {visible.map((item) => (
          <DishListRow key={item.id} dish={item} onPress={() => onSelect(item.id)} />
        ))}
      </View>

      {visible.length === 0 ? (
        <Text style={styles.empty}>
          Nothing matches that. Search by name, regional name, or an ingredient.
        </Text>
      ) : null}

      <GhostButton label={mealId === null ? 'Cancel' : 'Done'} onPress={onCancel} />
    </View>
  );
}

// ---------------------------------------------------------------------------

interface FormInput {
  slot: Slot;
  tweakNote: string | null;
  isBatch: boolean;
}

function CookForm({
  dish,
  defaultSlot,
  inMeal,
  onSubmit,
  onCancel,
}: {
  dish: DishListItem;
  defaultSlot: Slot;
  inMeal: boolean;
  onSubmit: (input: FormInput, addAnother: boolean) => void;
  onCancel: () => void;
}) {
  const styles = useThemedStyles(makeStyles);

  // Nudged to a slot the dish is actually valid for when the default is not one of them —
  // reaching a lunch-only dish from the detail screen in the evening should not quietly
  // record it as dinner. Still fully overridable; this only picks the opening value.
  const [slot, setSlot] = useState<Slot>(() =>
    dish.slots.length === 0 || dish.slots.includes(defaultSlot)
      ? defaultSlot
      : dish.slots[0],
  );
  const [tweakNote, setTweakNote] = useState('');
  const [isBatch, setIsBatch] = useState(false);

  const input: FormInput = { slot, tweakNote, isBatch };

  return (
    <View style={styles.body}>
      <Text style={styles.title}>{dish.name}</Text>
      <Text style={styles.subtitle}>
        {[dish.roleLabel, dish.primaryIngredient].filter(Boolean).join(' · ')}
      </Text>

      <SegmentedField
        label="Meal"
        options={SLOT_OPTIONS}
        value={slot}
        onChange={setSlot}
      />

      {/* The sequence of these is what becomes the real recipe, so it is per cook event and
          never folded into the dish — the dish's own notes are a different field, edited on
          a different screen. */}
      <TextField
        label="For next time"
        value={tweakNote}
        onChangeText={setTweakNote}
        placeholder="Less tamarind, 4 whistles not 3"
        accessibilityLabel="Note for next time"
      />

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Batch</Text>
        <PillToggle
          label="Cooked a big batch"
          selected={isBatch}
          onPress={() => setIsBatch(!isBatch)}
        />
        <Text style={styles.hint}>
          Stops the app pushing another {dish.roleLabel.toLowerCase()} for two days.
        </Text>
      </View>

      <View style={styles.actions}>
        <PrimaryButton label="Log it" onPress={() => onSubmit(input, false)} />
        <Pressable
          accessibilityRole="button"
          onPress={() => onSubmit(input, true)}
          style={({ pressed }) => [styles.linkButton, pressed && styles.linkPressed]}
        >
          <Text style={styles.linkLabel}>
            {inMeal
              ? 'Log it and add another'
              : 'Log it and add another dish to this meal'}
          </Text>
        </Pressable>
        <GhostButton label="Cancel" onPress={onCancel} />
      </View>
    </View>
  );
}

const makeStyles = ({ colors, text }: Theme) => ({
  sheet: {
    flex: 1,
    backgroundColor: colors.steel2,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
  },
  grab: {
    width: 34,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.line,
    alignSelf: 'center' as const,
    marginTop: 8,
    marginBottom: space.lg,
  },
  scroll: {
    paddingHorizontal: layout.screenPaddingH,
    paddingBottom: space.xxl,
  },
  body: {
    gap: space.xl,
  },
  title: {
    ...text.title,
    fontSize: 18,
    lineHeight: 22,
  },
  subtitle: {
    ...text.meta,
    // Pulled up under the title, which the container gap would otherwise separate.
    marginTop: -space.xl + 3,
  },
  confirmation: {
    ...text.bodySmall,
    marginTop: -space.xl + space.sm,
    color: colors.curryInk,
  },
  field: {
    gap: 7,
  },
  fieldLabel: {
    ...text.eyebrow,
  },
  hint: {
    ...text.bodySmall,
    fontSize: 11.5,
    color: colors.ink3,
  },
  empty: {
    ...text.bodySmall,
    textAlign: 'center' as const,
  },
  actions: {
    gap: space.md,
  },
  linkButton: {
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    minHeight: layout.minTouchTarget,
  },
  linkPressed: {
    opacity: 0.6,
  },
  linkLabel: {
    ...text.control,
    textDecorationLine: 'underline' as const,
  },
});
