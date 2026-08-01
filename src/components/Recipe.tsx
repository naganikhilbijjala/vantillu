import { Text, View } from 'react-native';
import { ingredientLines, methodParagraphs } from '../db/dishModel';
import { border, radius, space, type Theme } from '../theme/tokens';
import { useThemedStyles } from '../theme/useTheme';
import { SmallButton } from './SmallButton';

/**
 * The recipe, as the detail screen shows it.
 *
 * Two blobs of free text in, a list and some paragraphs out. There is no structured
 * ingredient model and deliberately never will be in v1 (`docs/SPEC.md` §12) — a parser for
 * "a small piece of jaggery" and "4 whistles" is weeks of work and buys nothing until
 * shopping lists exist. The splitting is pure and lives in `src/db/dishModel.ts` where it is
 * tested; this file only decides what it looks like.
 *
 * **The empty state is inviting, never nagging** (`CLAUDE.md`). A dish with no recipe is a
 * normal dish, not an incomplete one: the copy says the app works fine without one, and
 * there is no progress bar, no "1 of 3 fields", and nothing red.
 */

export interface RecipeProps {
  ingredients: string | null;
  method: string | null;
  onEdit: () => void;
}

export function Recipe({ ingredients, method, onEdit }: RecipeProps) {
  const styles = useThemedStyles(makeStyles);

  const lines = ingredientLines(ingredients);
  const paragraphs = methodParagraphs(method);

  if (lines.length === 0 && paragraphs.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>
          No recipe saved yet. Add it whenever you have a minute — the app works fine
          without one.
        </Text>
        {/* Wrapped, because `SmallButton` sets `alignSelf: flex-start` for the inline case
            and `alignSelf` beats the box's `alignItems: center`. The wrapper shrinks to the
            button and gets centred in its place. */}
        <View>
          <SmallButton label="Add recipe" onPress={onEdit} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.recipe}>
      {lines.length === 0 ? null : (
        <View style={styles.lines}>
          {lines.map((line, index) => (
            // Keyed by position, which is the only identity these have — they are lines of
            // one text field, they never reorder, and they hold no state. Content would be
            // the tempting choice and is wrong: "1 tsp oil" appearing twice for two
            // temperings is an ordinary recipe, not a duplicate.
            // biome-ignore lint/suspicious/noArrayIndexKey: no identity but position
            <View key={index} style={styles.line}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.lineText}>{line}</Text>
            </View>
          ))}
        </View>
      )}

      {paragraphs.map((paragraph, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: as above — position is the identity
        <Text key={index} style={styles.paragraph}>
          {paragraph}
        </Text>
      ))}

      <SmallButton label="Edit recipe" onPress={onEdit} />
    </View>
  );
}

const makeStyles = ({ colors, text }: Theme) => ({
  recipe: {
    gap: space.md,
  },
  lines: {
    gap: 3,
  },
  line: {
    flexDirection: 'row' as const,
    gap: space.md,
  },
  bullet: {
    ...text.body,
    color: colors.ink3,
  },
  lineText: {
    ...text.body,
    flex: 1,
  },
  paragraph: {
    ...text.body,
  },
  empty: {
    borderWidth: border.thin,
    borderStyle: 'dashed' as const,
    borderColor: colors.line,
    borderRadius: radius.tile,
    padding: 14,
    alignItems: 'center' as const,
    gap: space.md,
  },
  emptyText: {
    ...text.bodySmall,
    textAlign: 'center' as const,
  },
});
