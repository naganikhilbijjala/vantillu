import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Trash2 } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackLink } from '../../../src/components/BackLink';
import { ChipField } from '../../../src/components/ChipField';
import { ConfirmDialog } from '../../../src/components/ConfirmDialog';
import { GhostButton } from '../../../src/components/GhostButton';
import { PillToggle } from '../../../src/components/PillToggle';
import { PrimaryButton } from '../../../src/components/PrimaryButton';
import { SegmentedField } from '../../../src/components/SegmentedField';
import { TextField } from '../../../src/components/TextField';
import type { Effort, Slot } from '../../../src/core/types';
import {
  blankDishValues,
  canSaveDish,
  type DishFormInput,
  type DishFormValues,
  dishFormProblems,
  EFFORT_OPTIONS,
  hasDishEdits,
  SLOT_OPTIONS,
  toDishFormInput,
} from '../../../src/db/dishModel';
import { createDish, deleteDish, saveDish } from '../../../src/db/queries/dish';
import { roleConfigQuery } from '../../../src/db/queries/roles';
import type { RoleConfigRow } from '../../../src/db/roles';
import { useDish } from '../../../src/hooks/useDishes';
import { useKeyboardInset } from '../../../src/hooks/useKeyboardInset';
import { border, layout, radius, space, type Theme } from '../../../src/theme/tokens';
import { useTheme, useThemedStyles } from '../../../src/theme/useTheme';

/**
 * The dish editor: who the dish is, how you make it, and what is always true about it.
 *
 * **One route for both adding and editing**, which is what `IMPLEMENTATION.md` §3 sketched
 * ("add/edit dish + recipe") and what Phase 7 deferred half of. `id` is `new` for a dish
 * that does not exist yet — safe as a sentinel because every real id is a UUID.
 *
 * Phase 7 shipped the recipe half alone and said the identity fields would widen this route
 * whenever they arrived. Phase 8 is what made them urgent: with the seed no longer loading
 * itself, a dish the user unticked during onboarding — or one the seed never had — had no
 * way into the repertoire at all (`docs/SPEC.md` §19).
 *
 * **Two fields are required and the rest are not.** A dish needs a name to be found and at
 * least one meal slot to ever be suggested (§4.1, filter 3); everything else, the entire
 * recipe included, is optional. A dish with no recipe is a normal dish (§17.2) and adding
 * identity fields does not quietly reverse that.
 */
export default function EditDish() {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';

  const { dish, isReady, error } = useDish(isNew ? undefined : id);
  const roleRows = useLiveQuery(roleConfigQuery());
  const roles = useMemo(() => roleRows.data ?? [], [roleRows.data]);

  // A stored dish, or the shape of one. A new dish waits on `role_config` — it supplies
  // both the chip labels and the role the form opens on, and it is seeded at boot, so this
  // is one frame at most.
  const saved: DishFormValues | undefined = isNew
    ? roles.length === 0
      ? undefined
      : blankDishValues(roles[0].role)
    : dish;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      {error ? (
        <View style={styles.gutter}>
          <BackLink label="Back" onPress={() => router.back()} />
          <Text style={styles.error}>{error.message}</Text>
        </View>
      ) : saved === undefined ? (
        <View style={styles.gutter}>
          <BackLink label="Back" onPress={() => router.back()} />
          {/* Only a real miss once the read has landed; before that it is just loading. */}
          {isReady && !isNew ? (
            <Text style={styles.missing}>That dish is no longer in your repertoire.</Text>
          ) : null}
        </View>
      ) : (
        // Keyed by dish, so the inputs initialise from the row rather than from the
        // undefined it was before the live query landed.
        <DishForm
          key={isNew ? 'new' : dish?.id}
          dishId={isNew ? undefined : dish?.id}
          saved={saved}
          roles={roles}
          cookCount={dish?.cookCount ?? 0}
          onCancel={() => router.back()}
          onSaved={(dishId) =>
            // `replace`, not `push`: after adding a dish you want to be looking at it, and
            // the way back should be the list rather than the form you just left.
            isNew ? router.replace(`/dish/${dishId}`) : router.back()
          }
          onDeleted={() => {
            // Not `back()`: that lands on the detail screen of a dish that no longer
            // exists, which handles it gracefully but reads as the delete having failed.
            // All the way out to the list, which is where the dish visibly disappears.
            if (router.canDismiss()) router.dismissAll();
            else router.replace('/dishes');
          }}
        />
      )}
    </SafeAreaView>
  );
}

/** Every field that can take focus, so the keyboard handling can scroll to any of them. */
type FieldKey =
  | 'name'
  | 'altName'
  | 'primaryIngredient'
  | 'minutes'
  | 'ingredients'
  | 'method'
  | 'notes';

function DishForm({
  dishId,
  saved,
  roles,
  cookCount,
  onCancel,
  onSaved,
  onDeleted,
}: {
  /** Undefined for a dish that does not exist yet — which is what makes this the add form. */
  dishId: string | undefined;
  saved: DishFormValues;
  roles: readonly RoleConfigRow[];
  /** How much history deleting would take with it. Named in the confirmation. */
  cookCount: number;
  onCancel: () => void;
  onSaved: (dishId: string) => void;
  onDeleted: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const isNew = dishId === undefined;

  const [input, setInput] = useState<DishFormInput>(() => toDishFormInput(saved));
  const set = <K extends keyof DishFormInput>(key: K, value: DishFormInput[K]) =>
    setInput((current) => ({ ...current, [key]: value }));

  const edited = hasDishEdits(input, saved);
  const problems = dishFormProblems(input);

  /**
   * Keeping the field you are typing in above the keyboard.
   *
   * `KeyboardAvoidingView` does nothing on Android: edge-to-edge is mandatory in this SDK,
   * so the window no longer resizes and there is no inset for it to mirror.
   * `useKeyboardInset` explains the platform detail. Two parts, and both are needed — the
   * inset becomes scrollable room at the bottom, then the focused field is scrolled to the
   * top of what is left. Shrinking the viewport alone leaves the scroll offset where it was
   * and the field below the fold.
   */
  const scrollRef = useRef<ScrollView>(null);
  const keyboardInset = useKeyboardInset();
  const [focused, setFocused] = useState<FieldKey | null>(null);

  // Where each field sits in the scrolled content. Measured in two parts because
  // `onLayout` reports a child's offset inside its own parent, and the fields live in a
  // container that is itself well down the page — the identity blurb and the title sit
  // above it. Adding only the inner offset scrolls short by the height of the header.
  const formTop = useRef(0);
  const fieldTops = useRef<Partial<Record<FieldKey, number>>>({});

  // Keyed on the inset as well as the field, so the order of "focus fired" and "keyboard
  // finished animating" stops mattering: focusing scrolls with the room available now, and
  // the arriving inset scrolls again with the room there turned out to be.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyboardInset is the trigger
  useEffect(() => {
    if (focused === null) return;
    scrollRef.current?.scrollTo({
      y: Math.max(formTop.current + (fieldTops.current[focused] ?? 0) - space.lg, 0),
      animated: true,
    });
  }, [focused, keyboardInset]);

  /** Which question is on screen. Both are drawn by the app, not by the platform. */
  const [asking, setAsking] = useState<'discard' | 'delete' | null>(null);

  /**
   * Leaving without saving, with a confirmation only when there is something to lose.
   *
   * The recipe is the longest thing anyone types into this app and the only text with no
   * copy anywhere else. `hasDishEdits` trims the text and ignores slot order, so this stays
   * quiet on the way out of a screen that was only read.
   */
  const guardedExit = useCallback(() => {
    if (!edited) {
      onCancel();
      return;
    }
    setAsking('discard');
  }, [edited, onCancel]);

  // Android's hardware back would otherwise discard silently. iOS has no back gesture on
  // this route — the root layout disables it — so Save and Cancel are the only ways out of
  // an edited form on both platforms.
  //
  // The dialog gets first refusal. `Modal` installs its own back handler while it is up and
  // ours would otherwise race it; closing the question here makes the outcome the same
  // whichever runs first, and back-dismisses-the-dialog is what it should do regardless.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (asking !== null) setAsking(null);
      else guardedExit();
      return true;
    });
    return () => subscription.remove();
  }, [guardedExit, asking]);

  function focusProps(key: FieldKey) {
    return {
      onFocus: () => setFocused(key),
      onBlur: () => setFocused((current) => (current === key ? null : current)),
    };
  }

  /** Records where a field starts, so focusing it can scroll to exactly there. */
  function measure(key: FieldKey) {
    return (event: { nativeEvent: { layout: { y: number } } }) => {
      fieldTops.current[key] = event.nativeEvent.layout.y;
    };
  }

  function save() {
    // Belt and braces: the button is already disabled, but a dish with no slot is
    // permanently unsuggestable and nothing downstream would ever say why.
    if (!canSaveDish(input)) return;

    if (dishId === undefined) {
      onSaved(createDish(input));
      return;
    }
    saveDish(dishId, input);
    // No invalidation: `useLiveQuery` re-runs on the write, so the screen behind has the
    // new text before this one finishes popping.
    onSaved(dishId);
  }

  /**
   * What deleting costs, said before it happens.
   *
   * This is the one action in the app that destroys history, so the count goes in the
   * message rather than being left for the user to remember. Soft underneath (SPEC §11.3),
   * but "recoverable by editing the database" is not something to offer as reassurance —
   * from in here it is gone.
   */
  const deleteMessage =
    cookCount === 0
      ? "Nothing has been logged against it, so there's no history to lose. This can't be undone."
      : `This also removes ${cookCount} logged ${cookCount === 1 ? 'cook' : 'cooks'} and any notes on them. This can't be undone.`;

  return (
    <ScrollView
      ref={scrollRef}
      contentContainerStyle={[
        styles.scroll,
        { paddingBottom: space.xxl + keyboardInset },
      ]}
      // Without this the first tap on Save only dismisses the keyboard, and the second one
      // lands on a button that has moved.
      keyboardShouldPersistTaps="handled"
    >
      <BackLink label={isNew ? 'Dishes' : saved.name} onPress={guardedExit} />

      <Text style={styles.eyebrow}>{isNew ? 'New dish' : saved.name}</Text>
      <Text style={styles.title}>{isNew ? 'Add a dish' : 'Edit dish'}</Text>
      <Text style={styles.blurb}>
        {isNew
          ? 'A name and a meal is all it takes. Everything else you can fill in whenever — or never.'
          : 'Change as much or as little as you like. Nothing here is required except the name and a meal.'}
      </Text>

      <View
        style={styles.form}
        onLayout={(event) => {
          formTop.current = event.nativeEvent.layout.y;
        }}
      >
        <View onLayout={measure('name')}>
          <TextField
            label="Name"
            value={input.name}
            onChangeText={(value) => set('name', value)}
            placeholder="Gutti vankaya"
            multiline={false}
            autoCapitalize="words"
            {...focusProps('name')}
          />
        </View>

        <View onLayout={measure('altName')}>
          <TextField
            label="Also called"
            value={input.altName}
            onChangeText={(value) => set('altName', value)}
            placeholder="Stuffed brinjal curry"
            hint="A regional or English name. Searched alongside the name."
            multiline={false}
            autoCapitalize="words"
            {...focusProps('altName')}
          />
        </View>

        {/* Labels come from `role_config`, never from the raw role string, so a renamed
            role shows its new name here too (SPEC §1.1). */}
        <ChipField
          label="Role"
          options={roles.map((role) => ({ value: role.role, label: role.label }))}
          selected={[input.role]}
          onToggle={(role) => set('role', role)}
        />

        {/* Many-to-many on purpose: tiffin is valid at breakfast *and* dinner (§1.3). */}
        <ChipField
          label="Meals"
          options={SLOT_OPTIONS}
          selected={input.slots}
          multiple
          onToggle={(slot: Slot) =>
            set(
              'slots',
              input.slots.includes(slot)
                ? input.slots.filter((current) => current !== slot)
                : [...input.slots, slot],
            )
          }
          hint="When you'd actually eat this. Pick as many as fit."
        />

        <SegmentedField
          label="Effort"
          options={EFFORT_OPTIONS}
          value={input.effort}
          onChange={(effort: Effort) => set('effort', effort)}
        />

        <View onLayout={measure('minutes')}>
          <TextField
            label="Minutes"
            value={input.minutes}
            onChangeText={(value) => set('minutes', value)}
            placeholder="30"
            hint="Shown on the card. Never used to rank anything."
            multiline={false}
            keyboardType="number-pad"
            {...focusProps('minutes')}
          />
        </View>

        <View onLayout={measure('primaryIngredient')}>
          <TextField
            label="Main ingredient"
            value={input.primaryIngredient}
            onChangeText={(value) => set('primaryIngredient', value)}
            placeholder="brinjal"
            hint="Searchable, and it stops the app suggesting this two days running."
            multiline={false}
            autoCapitalize="none"
            {...focusProps('primaryIngredient')}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.fieldLabel}>Vegetarian</Text>
          <PillToggle
            label={input.isVeg ? 'Vegetarian' : 'Contains meat or fish'}
            selected={input.isVeg}
            onPress={() => set('isVeg', !input.isVeg)}
          />
        </View>

        <View style={styles.rule} />

        <View onLayout={measure('ingredients')}>
          <TextField
            label="Ingredients"
            value={input.ingredientsText}
            onChangeText={(value) => set('ingredientsText', value)}
            placeholder={'1 cup toor dal\n2 green chillies\nlemon-sized tamarind'}
            hint="One per line."
            lines={6}
            {...focusProps('ingredients')}
          />
        </View>

        <View onLayout={measure('method')}>
          <TextField
            label="Method"
            value={input.methodText}
            onChangeText={(value) => set('methodText', value)}
            placeholder={'Pressure cook 4 whistles.\n\nTemper and pour over.'}
            hint="Leave a blank line between steps."
            lines={8}
            {...focusProps('method')}
          />
        </View>

        {/* The third kind of note, and the one that changes least: what is true about the
            dish every time. Per-cook observations belong on the cook event. */}
        <View onLayout={measure('notes')}>
          <TextField
            label="Notes"
            value={input.notes}
            onChangeText={(value) => set('notes', value)}
            placeholder="Better the next day. Travels well."
            hint="About the dish itself, not about one cook."
            lines={3}
            {...focusProps('notes')}
          />
        </View>
      </View>

      <View style={styles.actions}>
        {/* Says what is missing *before* the button refuses, so a disabled Save is never a
            dead end you have to guess your way out of. */}
        {problems.length === 0 ? null : (
          <Text style={styles.problems}>Nearly — {problems.join(' and ')}.</Text>
        )}
        <PrimaryButton
          label={isNew ? 'Add dish' : 'Save'}
          disabled={problems.length > 0}
          onPress={save}
        />
        <GhostButton label="Cancel" onPress={guardedExit} />
      </View>

      {/* Below Cancel and below a rule, because a destructive action should never sit
          where a thumb aiming for Save might land. Absent on the add form: there is
          nothing to delete, and "Cancel" already means "never mind". */}
      {isNew ? null : (
        <View style={styles.danger}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setAsking('delete')}
            style={({ pressed }) => [styles.deleteButton, pressed && styles.rowPressed]}
          >
            <Trash2 size={15} strokeWidth={1.7} color={colors.gonguraInk} />
            <Text style={styles.deleteLabel}>Delete this dish</Text>
          </Pressable>
        </View>
      )}

      <ConfirmDialog
        visible={asking === 'discard'}
        title={isNew ? 'Discard this dish?' : 'Discard changes?'}
        message="The text you've typed won't be saved."
        cancelLabel="Keep editing"
        confirmLabel="Discard"
        destructive
        onCancel={() => setAsking(null)}
        onConfirm={() => {
          setAsking(null);
          onCancel();
        }}
      />

      <ConfirmDialog
        visible={asking === 'delete'}
        title={`Delete ${saved.name}?`}
        message={deleteMessage}
        cancelLabel="Keep it"
        confirmLabel="Delete"
        destructive
        onCancel={() => setAsking(null)}
        onConfirm={() => {
          if (dishId === undefined) return;
          setAsking(null);
          deleteDish(dishId);
          onDeleted();
        }}
      />
    </ScrollView>
  );
}

const makeStyles = ({ colors, text }: Theme) => ({
  safeArea: {
    flex: 1,
    backgroundColor: colors.steel2,
  },
  scroll: {
    paddingHorizontal: layout.screenPaddingH,
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
  blurb: {
    ...text.bodySmall,
    marginTop: space.md,
  },
  form: {
    marginTop: space.xxl,
    gap: space.xl,
  },
  field: {
    gap: 7,
  },
  fieldLabel: {
    ...text.eyebrow,
  },
  // Where the dish's identity ends and the recipe begins.
  rule: {
    height: 1,
    backgroundColor: colors.lineSoft,
    marginVertical: space.xs,
  },
  actions: {
    marginTop: space.xxl,
    gap: space.md,
  },
  problems: {
    ...text.bodySmall,
    color: colors.ink2,
  },
  danger: {
    marginTop: space.xxl,
    paddingTop: space.xl,
    borderTopWidth: border.hairline,
    borderTopColor: colors.lineSoft,
    alignItems: 'center' as const,
  },
  deleteButton: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: space.md,
    minHeight: layout.minTouchTarget,
    paddingHorizontal: space.xl,
    borderRadius: radius.button,
  },
  rowPressed: {
    backgroundColor: colors.steel1,
  },
  // The `Ink` member of the accent pair, not the graphic one: gongura as text on `steel1`
  // measures 4.48:1 after dark, a hair under the 4.5 floor (SPEC §14.3).
  deleteLabel: {
    ...text.control,
    fontSize: 13,
    color: colors.gonguraInk,
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
