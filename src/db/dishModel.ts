import { trimToNull } from './rows';
import { toLocalIso } from './time';

/**
 * The recipe editor, on the way out and on the way back in.
 *
 * A sibling of `cookModel.ts`: the same shape of module for the app's other write. No `db`
 * and no clock — `now` is an argument — so what gets stored, what counts as an edit, and
 * how free text turns back into something that reads like a recipe are all asserted in
 * Node rather than checked by typing into a phone.
 *
 * The dish's `notes` ride along with the recipe because they are edited on the same screen,
 * not because they are part of it. They stay a distinct kind of note from `ingredientsText`
 * / `methodText` and from a cook event's `tweakNote` (`CLAUDE.md`), and nothing here folds
 * one into another.
 */

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/** What the three inputs hold. Raw, untrimmed, exactly as typed. */
export interface DishRecipeInput {
  ingredientsText: string;
  methodText: string;
  notes: string;
}

/**
 * The columns the editor writes, and nothing else.
 *
 * Deliberately narrow. `name`, `role`, `effort` and the rest of the dish's identity are not
 * in here, so this write cannot touch them; neither can it revive a soft-deleted row or
 * rewrite `createdAt`. `updatedAt` is stamped because every write stamps it
 * (`docs/SPEC.md` §11.3) — it is *recorded*, not derived, so it does not conflict with the
 * rule against stored derived values.
 */
export interface DishRecipeUpdate {
  ingredientsText: string | null;
  methodText: string | null;
  notes: string | null;
  updatedAt: string;
}

/** The three fields as they are stored, which is trimmed or null. */
export interface DishRecipeText {
  ingredientsText: string | null;
  methodText: string | null;
  notes: string | null;
}

/**
 * An emptied field stores `NULL`, not `''`.
 *
 * That matters beyond tidiness: `hasRecipe` and every "has a recipe" count read through
 * `hasText`, so a recipe the user cleared has to become genuinely absent again. A dish that
 * still claimed a recipe after its text was deleted would be unfixable from the UI.
 */
export function toDishRecipeUpdate(input: DishRecipeInput, now: Date): DishRecipeUpdate {
  return {
    ingredientsText: trimToNull(input.ingredientsText),
    methodText: trimToNull(input.methodText),
    notes: trimToNull(input.notes),
    updatedAt: toLocalIso(now),
  };
}

/**
 * Whether the form holds anything the stored version does not.
 *
 * Both sides are trimmed first, so adding a space and taking it away again is not an edit.
 * The editor uses this to decide whether leaving needs a confirmation — a guard that fires
 * on every visit would be trained away in a day, and one that never fires loses a recipe
 * the first time someone reaches for the back gesture mid-sentence.
 */
export function hasRecipeEdits(input: DishRecipeInput, saved: DishRecipeText): boolean {
  return (
    trimToNull(input.ingredientsText) !== trimToNull(saved.ingredientsText) ||
    trimToNull(input.methodText) !== trimToNull(saved.methodText) ||
    trimToNull(input.notes) !== trimToNull(saved.notes)
  );
}

// ---------------------------------------------------------------------------
// Reading it back out
// ---------------------------------------------------------------------------

/**
 * Leading bullet characters, which people type out of habit. Anchored, so "1 - 2 tsp"
 * keeps its dash.
 */
const LEADING_BULLET = /^[-–—*•·]+\s*/;

/**
 * Ingredients, one per line.
 *
 * Storage is a single free-text blob — there is no structured ingredient model and there
 * deliberately never will be in v1 (`docs/SPEC.md` §12), because a parser for "a small
 * piece of jaggery" buys nothing until shopping lists exist. So the list is a *rendering*
 * decision, made here where it can be tested rather than in the component.
 *
 * Bullets the user typed themselves are stripped, or the view would show "• - salt". Blank
 * lines disappear, so trailing newlines and a line of nothing but a dash cost nothing.
 */
export function ingredientLines(text: string | null): string[] {
  if (text === null) return [];
  return text
    .split('\n')
    .map((line) => line.trim().replace(LEADING_BULLET, '').trim())
    .filter((line) => line !== '');
}

/**
 * The method, split into paragraphs on blank lines.
 *
 * Single newlines stay inside a paragraph, because a step written across two lines is one
 * step. Splitting on every newline instead would space out a wrapped sentence as though it
 * were two instructions.
 */
export function methodParagraphs(text: string | null): string[] {
  if (text === null) return [];
  return text
    .split(/\n[ \t]*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph !== '');
}
