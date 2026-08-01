import { describe, expect, it } from 'vitest';
import {
  type DishRecipeInput,
  hasRecipeEdits,
  ingredientLines,
  methodParagraphs,
  toDishRecipeUpdate,
} from '../src/db/dishModel';
import { LOCAL_ISO_FORMAT } from '../src/db/time';
import { day } from './fixtures';

/**
 * `src/db/dishModel.ts` — the recipe editor's write, and the rendering rules that turn two
 * blobs of free text back into something that reads like a recipe.
 */

const NOW = day(2026, 8, 1, 17);

function input(overrides: Partial<DishRecipeInput> = {}): DishRecipeInput {
  return { ingredientsText: '', methodText: '', notes: '', ...overrides };
}

describe('toDishRecipeUpdate', () => {
  it('writes only the three text fields and the timestamp', () => {
    // The narrow shape is the point: this write must not be able to touch the dish's
    // identity, its createdAt, or its deletedAt.
    expect(Object.keys(toDishRecipeUpdate(input(), NOW)).sort()).toEqual([
      'ingredientsText',
      'methodText',
      'notes',
      'updatedAt',
    ]);
  });

  it('trims each field', () => {
    const update = toDishRecipeUpdate(
      input({ ingredientsText: '  1 cup toor dal  ', notes: ' Better the next day.\n' }),
      NOW,
    );
    expect(update.ingredientsText).toBe('1 cup toor dal');
    expect(update.notes).toBe('Better the next day.');
  });

  it('stores an emptied field as null, not as an empty string', () => {
    // A cleared recipe has to become genuinely absent again, or `hasRecipe` keeps claiming
    // one and nothing in the UI can undo that.
    const update = toDishRecipeUpdate(
      input({ ingredientsText: '   ', methodText: '\n\n', notes: '' }),
      NOW,
    );
    expect(update.ingredientsText).toBeNull();
    expect(update.methodText).toBeNull();
    expect(update.notes).toBeNull();
  });

  it('stamps updatedAt as a local ISO datetime, never UTC', () => {
    const update = toDishRecipeUpdate(input(), NOW);
    expect(update.updatedAt).toBe('2026-08-01T17:00:00');
    expect(update.updatedAt).not.toMatch(/[Z+]/);
    expect(LOCAL_ISO_FORMAT).toBe("yyyy-MM-dd'T'HH:mm:ss");
  });

  it('keeps the recipe body and the dish notes as separate fields', () => {
    // Three distinct kinds of note (CLAUDE.md). Nothing here may fold one into another.
    const update = toDishRecipeUpdate(
      input({ methodText: 'Four whistles.', notes: 'Amma cooks it drier.' }),
      NOW,
    );
    expect(update.methodText).toBe('Four whistles.');
    expect(update.notes).toBe('Amma cooks it drier.');
  });
});

describe('hasRecipeEdits', () => {
  const saved = {
    ingredientsText: '1 cup toor dal',
    methodText: 'Four whistles.',
    notes: null,
  };

  it('is false when the form matches what is stored', () => {
    expect(
      hasRecipeEdits(
        input({ ingredientsText: '1 cup toor dal', methodText: 'Four whistles.' }),
        saved,
      ),
    ).toBe(false);
  });

  it('ignores whitespace the user added and took away again', () => {
    // A guard that fired on every visit would be trained away within a day.
    expect(
      hasRecipeEdits(
        input({ ingredientsText: '  1 cup toor dal\n', methodText: 'Four whistles. ' }),
        saved,
      ),
    ).toBe(false);
  });

  it('notices a change in any of the three fields', () => {
    const unchanged = { ingredientsText: '1 cup toor dal', methodText: 'Four whistles.' };
    expect(hasRecipeEdits(input({ ...unchanged, notes: 'Travels well.' }), saved)).toBe(
      true,
    );
    expect(
      hasRecipeEdits(input({ ...unchanged, methodText: 'Five whistles.' }), saved),
    ).toBe(true);
    expect(hasRecipeEdits(input({ ...unchanged, ingredientsText: '' }), saved)).toBe(
      true,
    );
  });

  it('treats an empty form over an empty dish as unedited', () => {
    expect(
      hasRecipeEdits(input(), { ingredientsText: null, methodText: null, notes: null }),
    ).toBe(false);
  });
});

describe('ingredientLines', () => {
  it('is empty for a dish with no ingredients', () => {
    expect(ingredientLines(null)).toEqual([]);
    expect(ingredientLines('   \n\n')).toEqual([]);
  });

  it('splits on newlines and drops the blank ones', () => {
    expect(ingredientLines('1 cup toor dal\n\n2 green chillies\n')).toEqual([
      '1 cup toor dal',
      '2 green chillies',
    ]);
  });

  it('strips bullet characters the user typed', () => {
    // Otherwise the view renders "• - salt".
    expect(ingredientLines('- salt\n* jaggery\n• tamarind\n-')).toEqual([
      'salt',
      'jaggery',
      'tamarind',
    ]);
  });

  it('keeps a dash that is part of the text', () => {
    expect(ingredientLines('1 - 2 tsp chilli powder')).toEqual([
      '1 - 2 tsp chilli powder',
    ]);
  });
});

describe('methodParagraphs', () => {
  it('is empty for a dish with no method', () => {
    expect(methodParagraphs(null)).toEqual([]);
    expect(methodParagraphs('  ')).toEqual([]);
  });

  it('splits on blank lines', () => {
    expect(methodParagraphs('Soak overnight.\n\nGrind fine.')).toEqual([
      'Soak overnight.',
      'Grind fine.',
    ]);
  });

  it('keeps a single newline inside a paragraph', () => {
    // A step written across two lines is one step, not two instructions.
    expect(methodParagraphs('Pressure cook 4 whistles,\nthen rest 10 minutes.')).toEqual([
      'Pressure cook 4 whistles,\nthen rest 10 minutes.',
    ]);
  });

  it('treats a line of spaces as a blank line', () => {
    expect(methodParagraphs('Temper.\n   \nPour over.')).toEqual([
      'Temper.',
      'Pour over.',
    ]);
  });
});
