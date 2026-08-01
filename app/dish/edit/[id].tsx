import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackLink } from '../../../src/components/BackLink';
import { GhostButton } from '../../../src/components/GhostButton';
import { PrimaryButton } from '../../../src/components/PrimaryButton';
import { TextField } from '../../../src/components/TextField';
import type { DishListItem } from '../../../src/db/dishesModel';
import { type DishRecipeInput, hasRecipeEdits } from '../../../src/db/dishModel';
import { saveDishRecipe } from '../../../src/db/queries/dish';
import { useDish } from '../../../src/hooks/useDishes';
import { useKeyboardInset } from '../../../src/hooks/useKeyboardInset';
import { layout, space, type Theme } from '../../../src/theme/tokens';
import { useThemedStyles } from '../../../src/theme/useTheme';

/**
 * The recipe editor: ingredients, method, and the dish's own notes.
 *
 * `IMPLEMENTATION.md` §3 sketches this route as "add/edit dish + recipe". Phase 7 owns the
 * recipe and the notes only, so that is all it edits — the dish's identity (name, role,
 * effort, slots) is not editable anywhere yet, and when it becomes editable it widens this
 * screen rather than needing another route.
 *
 * **Free text on purpose.** No structured ingredient rows, no unit picker, no required
 * fields, and no completion meter (`docs/SPEC.md` §12 and the empty-state rule in
 * `CLAUDE.md`). Saving all three fields blank is a perfectly good outcome: it clears the
 * recipe and leaves a normal dish.
 *
 * This is the one screen in the app holding text that exists nowhere else until it is saved,
 * so leaving with unsaved edits asks first — see `guardedExit` below.
 */
export default function EditDishRecipe() {
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { dish, isReady, error } = useDish(id);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      {error ? (
        <View style={styles.gutter}>
          <BackLink label="Dish" onPress={() => router.back()} />
          <Text style={styles.error}>{error.message}</Text>
        </View>
      ) : dish === undefined ? (
        <View style={styles.gutter}>
          <BackLink label="Dish" onPress={() => router.back()} />
          {/* Only a real miss once the read has landed; before that it is just loading. */}
          {isReady ? (
            <Text style={styles.missing}>That dish is no longer in your repertoire.</Text>
          ) : null}
        </View>
      ) : (
        // Keyed by dish, so the three inputs initialise from the row rather than from the
        // undefined it was before the live query landed.
        <RecipeForm key={dish.id} dish={dish} onDone={() => router.back()} />
      )}
    </SafeAreaView>
  );
}

/** The three fields, in the order they appear. */
type FieldKey = 'ingredients' | 'method' | 'notes';

function RecipeForm({ dish, onDone }: { dish: DishListItem; onDone: () => void }) {
  const styles = useThemedStyles(makeStyles);

  const [ingredientsText, setIngredientsText] = useState(dish.ingredientsText ?? '');
  const [methodText, setMethodText] = useState(dish.methodText ?? '');
  const [notes, setNotes] = useState(dish.notes ?? '');

  const input: DishRecipeInput = { ingredientsText, methodText, notes };
  const edited = hasRecipeEdits(input, dish);

  /**
   * Keeping the field you are typing in above the keyboard.
   *
   * `KeyboardAvoidingView` used to be here and did nothing on Android: edge-to-edge is
   * mandatory in this SDK, so the window no longer resizes and there is no inset for it to
   * mirror. Notes is the last field on the screen, which is why it was the one you could not
   * see. `useKeyboardInset` explains the platform detail.
   *
   * Two parts, and both are needed. The inset becomes scrollable room at the bottom, or there
   * is nowhere for the last field to go. Then the focused field is scrolled to the top of
   * what is left, which is what actually puts it in front of you — shrinking the viewport on
   * its own leaves the scroll offset where it was and the field below the fold.
   */
  const scrollRef = useRef<ScrollView>(null);
  const keyboardInset = useKeyboardInset();
  const [focused, setFocused] = useState<FieldKey | null>(null);

  // Where each field sits in the scrolled content. Measured in two parts because `onLayout`
  // reports a child's offset inside its own parent, and the fields live in a container that
  // is itself offset from the top of the content.
  const formTop = useRef(0);
  const fieldTops = useRef<Record<FieldKey, number>>({
    ingredients: 0,
    method: 0,
    notes: 0,
  });

  // Keyed on the inset as well as the field, so the order of "focus fired" and "keyboard
  // finished animating" stops mattering: focusing scrolls with the room available now, and
  // the arriving inset scrolls again with the room there turned out to be. A single scroll on
  // focus alone gets clamped short, because the padding it needs does not exist yet.
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyboardInset is the trigger
  useEffect(() => {
    if (focused === null) return;
    scrollRef.current?.scrollTo({
      y: Math.max(formTop.current + fieldTops.current[focused] - space.lg, 0),
      animated: true,
    });
    // `keyboardInset` is not read in the body and is not meant to be. It is here as a
    // trigger: removing it — which is what the rule's own fix suggests — leaves only the
    // scroll that happens before the padding exists, and the bug comes straight back.
  }, [focused, keyboardInset]);

  /**
   * Leaving without saving, with a confirmation only when there is something to lose.
   *
   * The recipe is the longest thing anyone types into this app and the only text with no
   * copy anywhere else, so a stray back gesture mid-sentence must not be able to bin it.
   * `hasRecipeEdits` trims both sides, so this stays quiet on the way out of a screen that
   * was only read.
   */
  const guardedExit = useCallback(() => {
    if (!edited) {
      onDone();
      return;
    }
    Alert.alert('Discard changes?', "The text you've typed won't be saved.", [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: onDone },
    ]);
  }, [edited, onDone]);

  // Android's hardware back would otherwise discard silently. iOS has no back gesture on
  // this route — the root layout disables it — so Save and Cancel are the only ways out of
  // an edited form on both platforms.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      guardedExit();
      return true;
    });
    return () => subscription.remove();
  }, [guardedExit]);

  /** Focus and blur for one field. Blur only clears if focus has not already moved on. */
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

  return (
    <ScrollView
      ref={scrollRef}
      // The keyboard's height becomes scrollable room, which is what gives the last field
      // somewhere to go. `paddingBottom` rather than a spacer view so it collapses to nothing
      // when the keyboard is down and leaves no dead space behind.
      contentContainerStyle={[
        styles.scroll,
        { paddingBottom: space.xxl + keyboardInset },
      ]}
      // Without this the first tap on Save only dismisses the keyboard, and the second one
      // lands on a button that has moved.
      keyboardShouldPersistTaps="handled"
    >
      <BackLink label={dish.name} onPress={guardedExit} />

      <Text style={styles.eyebrow}>{dish.name}</Text>
      <Text style={styles.title}>Recipe &amp; notes</Text>
      <Text style={styles.blurb}>
        However much or little you want. Free text — no units to fill in, nothing
        required.
      </Text>

      <View
        style={styles.form}
        onLayout={(event) => {
          formTop.current = event.nativeEvent.layout.y;
        }}
      >
        <View onLayout={measure('ingredients')}>
          <TextField
            label="Ingredients"
            value={ingredientsText}
            onChangeText={setIngredientsText}
            placeholder={'1 cup toor dal\n2 green chillies\nlemon-sized tamarind'}
            hint="One per line."
            lines={6}
            {...focusProps('ingredients')}
          />
        </View>

        <View onLayout={measure('method')}>
          <TextField
            label="Method"
            value={methodText}
            onChangeText={setMethodText}
            placeholder={'Pressure cook 4 whistles.\n\nTemper and pour over.'}
            hint="Leave a blank line between steps."
            lines={8}
            {...focusProps('method')}
          />
        </View>

        {/* The third kind of note, and the one that changes least: what is true about the
            dish every time. Per-cook observations belong on the cook event, which is what
            the log sheet writes and the timeline shows. */}
        <View onLayout={measure('notes')}>
          <TextField
            label="Notes"
            value={notes}
            onChangeText={setNotes}
            placeholder="Better the next day. Travels well."
            hint="About the dish itself, not about one cook."
            lines={3}
            {...focusProps('notes')}
          />
        </View>
      </View>

      <View style={styles.actions}>
        <PrimaryButton
          label="Save"
          onPress={() => {
            saveDishRecipe(dish.id, input);
            // No invalidation: `useLiveQuery` re-runs on the write, so the screen behind
            // has the new text before this one finishes popping.
            onDone();
          }}
        />
        <GhostButton label="Cancel" onPress={guardedExit} />
      </View>
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
  actions: {
    marginTop: space.xxl,
    gap: space.md,
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
