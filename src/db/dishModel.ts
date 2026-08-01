import type { Effort, Slot } from '../core/types';
import { type NewDishRow, trimToNull } from './rows';
import { toLocalIso } from './time';

/**
 * The dish editor, on the way out and on the way back in.
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
 *
 * Phase 7 shipped only the recipe half and said the identity fields would *widen this
 * route* whenever they arrived (`docs/SPEC.md` §17.3). They arrived when onboarding made
 * the gap load-bearing: with the seed no longer inserting itself, a dish the user unticked
 * — or one the seed never had — had no way into the repertoire at all (§19).
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
// The dish's identity
// ---------------------------------------------------------------------------

/** The four slot options, in day order. Shared, so the log sheet cannot disagree. */
export const SLOT_OPTIONS: readonly { value: Slot; label: string }[] = [
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'dinner', label: 'Dinner' },
  { value: 'snack', label: 'Snack' },
];

/** In rank order (SPEC §1.2), which is also the order anyone would read them in. */
export const EFFORT_OPTIONS: readonly { value: Effort; label: string }[] = [
  { value: 'instant', label: 'Instant' },
  { value: 'quick', label: 'Quick' },
  { value: 'medium', label: 'Medium' },
  { value: 'project', label: 'Project' },
];

/** What the identity half of the form holds. Raw, untrimmed, exactly as typed. */
export interface DishIdentityInput {
  name: string;
  altName: string;
  role: string;
  primaryIngredient: string;
  effort: Effort;
  /** Raw text, because it comes from a keyboard. Parsed by `parseMinutes`. */
  minutes: string;
  slots: Slot[];
  isVeg: boolean;
}

/** The whole form: who the dish is, and how you make it. */
export interface DishFormInput extends DishIdentityInput, DishRecipeInput {}

/**
 * Minutes, or nothing.
 *
 * Display-only either way (SPEC §1.2) — it never enters a filter or the score — so a value
 * that is not a plain positive number is dropped rather than rejected. Being unable to save
 * a dish over a typo in the one field that changes nothing would be absurd.
 */
export function parseMinutes(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number.parseInt(trimmed, 10);
  return value > 0 ? value : null;
}

/**
 * What is stopping this dish from being saved, in the words the form shows.
 *
 * Only two things can, and both are load-bearing rather than tidiness. A dish with **no
 * name** cannot be found or picked. A dish with **no slot** fails eligibility filter 3
 * forever (SPEC §4.1) — it would sit in the repertoire looking normal and never once be
 * suggested, which is the worst kind of bug: invisible, and indistinguishable from the
 * engine simply not liking it.
 *
 * Everything else is optional, including the entire recipe. A dish with no recipe is a
 * normal dish (§17.2), and that rule does not get quietly reversed here.
 */
export function dishFormProblems(input: DishIdentityInput): string[] {
  const problems: string[] = [];
  if (trimToNull(input.name) === null) problems.push('give it a name');
  if (input.slots.length === 0) problems.push('pick at least one meal');
  return problems;
}

export function canSaveDish(input: DishIdentityInput): boolean {
  return dishFormProblems(input).length === 0;
}

/**
 * The identity columns the editor writes, and nothing else.
 *
 * Deliberately narrow in the other direction now. `prepKind`, `prepLeadHours`, `prepLabel`,
 * `season`, `usesLeftoverRice`, `isFestive` and `source` are **absent on purpose**: the seed
 * sets them, the form does not ask, and leaving them out of the update is what stops editing
 * a seeded dish's name from silently wiping the fact that dosa needs batter. Anything the
 * form cannot set, it must not be able to clear.
 */
export interface DishIdentityUpdate {
  name: string;
  altName: string | null;
  role: string;
  primaryIngredient: string | null;
  effort: string;
  minutes: number | null;
  isVeg: boolean;
  updatedAt: string;
}

export type DishUpdate = DishIdentityUpdate & DishRecipeUpdate;

/** Identity plus recipe, for an existing dish. Slots are a separate table, handled apart. */
export function toDishUpdate(input: DishFormInput, now: Date): DishUpdate {
  return {
    // `name` is the one field that cannot be null, and `canSaveDish` is what guarantees it.
    name: trimToNull(input.name) ?? '',
    altName: trimToNull(input.altName),
    role: input.role,
    primaryIngredient: trimToNull(input.primaryIngredient),
    effort: input.effort,
    minutes: parseMinutes(input.minutes),
    isVeg: input.isVeg,
    ...toDishRecipeUpdate(input, now),
  };
}

/**
 * A brand-new dish row.
 *
 * The seven fields the form does not ask about start null or false — the same values a
 * hand-added dish would have had if the seed had never existed. A dish added here is a
 * plain one: no prep to wait for, no season, no leftover-rice boost.
 */
export function toNewDishRow(input: DishFormInput, id: string, now: Date): NewDishRow {
  const timestamp = toLocalIso(now);
  const update = toDishUpdate(input, now);

  return {
    id,
    name: update.name,
    altName: update.altName,
    role: update.role,
    primaryIngredient: update.primaryIngredient,
    effort: update.effort,
    minutes: update.minutes,
    isVeg: update.isVeg,
    prepKind: null,
    prepLeadHours: null,
    prepLabel: null,
    usesLeftoverRice: false,
    isFestive: false,
    season: null,
    ingredientsText: update.ingredientsText,
    methodText: update.methodText,
    notes: update.notes,
    source: null,
    isArchived: false,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
  };
}

/** The stored side of the form, for prefilling it and for spotting an edit. */
export interface DishFormValues extends DishRecipeText {
  name: string;
  altName: string | null;
  role: string;
  primaryIngredient: string | null;
  effort: Effort;
  minutes: number | null;
  slots: readonly Slot[];
  isVeg: boolean;
}

/**
 * The dish a blank form describes.
 *
 * Expressed as *stored* values rather than as form strings so that `hasDishEdits` works
 * unchanged on the add screen: a new dish starts out equal to this, and typing anything
 * makes it differ, which is exactly what the discard prompt needs to know.
 *
 * `role` has to open on something — a chip row with nothing lit reads as broken rather than
 * as a question — so it takes the first configured role, which is `staple`. Slots open
 * *empty* by contrast, because there is no defensible guess: pre-ticking lunch and dinner
 * would file a breakfast tiffin under the wrong meals for anyone who tapped straight past.
 * That is why an empty slot set is the one thing besides a missing name that blocks a save.
 */
export function blankDishValues(role: string): DishFormValues {
  return {
    name: '',
    altName: null,
    role,
    primaryIngredient: null,
    effort: 'medium',
    minutes: null,
    slots: [],
    isVeg: true,
    ingredientsText: null,
    methodText: null,
    notes: null,
  };
}

/** A stored dish, as the form's initial state. */
export function toDishFormInput(saved: DishFormValues): DishFormInput {
  return {
    name: saved.name,
    altName: saved.altName ?? '',
    role: saved.role,
    primaryIngredient: saved.primaryIngredient ?? '',
    effort: saved.effort,
    minutes: saved.minutes === null ? '' : String(saved.minutes),
    slots: [...saved.slots],
    isVeg: saved.isVeg,
    ingredientsText: saved.ingredientsText ?? '',
    methodText: saved.methodText ?? '',
    notes: saved.notes ?? '',
  };
}

function sameSlots(a: readonly Slot[], b: readonly Slot[]): boolean {
  if (a.length !== b.length) return false;
  const held = new Set(a);
  return b.every((slot) => held.has(slot));
}

/**
 * Whether the form holds anything the stored version does not.
 *
 * The recipe half trims both sides, so a space added and removed is not an edit; the slot
 * comparison ignores order, so tapping a slot off and back on is not one either. Both
 * matter for the same reason `hasRecipeEdits` did: a discard prompt that fires on the way
 * out of a screen you only read gets trained away, and then it is not there when it counts.
 */
export function hasDishEdits(input: DishFormInput, saved: DishFormValues): boolean {
  return (
    hasRecipeEdits(input, saved) ||
    trimToNull(input.name) !== trimToNull(saved.name) ||
    trimToNull(input.altName) !== saved.altName ||
    input.role !== saved.role ||
    trimToNull(input.primaryIngredient) !== saved.primaryIngredient ||
    input.effort !== saved.effort ||
    parseMinutes(input.minutes) !== saved.minutes ||
    input.isVeg !== saved.isVeg ||
    !sameSlots(input.slots, saved.slots)
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
