import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BackLink } from '../../../src/components/BackLink';
import { GhostButton } from '../../../src/components/GhostButton';
import { PrimaryButton } from '../../../src/components/PrimaryButton';
import { TextField } from '../../../src/components/TextField';
import type { DishListItem } from '../../../src/db/dishesModel';
import { type DishRecipeInput, hasRecipeEdits } from '../../../src/db/dishModel';
import { saveDishRecipe } from '../../../src/db/queries/dish';
import { useDish } from '../../../src/hooks/useDishes';
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

function RecipeForm({ dish, onDone }: { dish: DishListItem; onDone: () => void }) {
  const styles = useThemedStyles(makeStyles);

  const [ingredientsText, setIngredientsText] = useState(dish.ingredientsText ?? '');
  const [methodText, setMethodText] = useState(dish.methodText ?? '');
  const [notes, setNotes] = useState(dish.notes ?? '');

  const input: DishRecipeInput = { ingredientsText, methodText, notes };
  const edited = hasRecipeEdits(input, dish);

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

  return (
    <KeyboardAvoidingView
      // `padding` is right on iOS; Android's own adjustResize already handles the inset and
      // doubling it pushes the form off screen (IMPLEMENTATION.md §7).
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.flex}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <BackLink label={dish.name} onPress={guardedExit} />

        <Text style={styles.eyebrow}>{dish.name}</Text>
        <Text style={styles.title}>Recipe &amp; notes</Text>
        <Text style={styles.blurb}>
          However much or little you want. Free text — no units to fill in, nothing
          required.
        </Text>

        <View style={styles.form}>
          <TextField
            label="Ingredients"
            value={ingredientsText}
            onChangeText={setIngredientsText}
            placeholder={'1 cup toor dal\n2 green chillies\nlemon-sized tamarind'}
            hint="One per line."
            lines={6}
          />

          <TextField
            label="Method"
            value={methodText}
            onChangeText={setMethodText}
            placeholder={'Pressure cook 4 whistles.\n\nTemper and pour over.'}
            hint="Leave a blank line between steps."
            lines={8}
          />

          {/* The third kind of note, and the one that changes least: what is true about the
              dish every time. Per-cook observations belong on the cook event, which is what
              the log sheet writes and the timeline shows. */}
          <TextField
            label="Notes"
            value={notes}
            onChangeText={setNotes}
            placeholder="Better the next day. Travels well."
            hint="About the dish itself, not about one cook."
            lines={3}
          />
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
    </KeyboardAvoidingView>
  );
}

const makeStyles = ({ colors, text }: Theme) => ({
  safeArea: {
    flex: 1,
    backgroundColor: colors.steel2,
  },
  flex: {
    flex: 1,
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
