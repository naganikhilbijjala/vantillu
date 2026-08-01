import { format } from 'date-fns';
import { describe, expect, it } from 'vitest';
import {
  blankDishValues,
  canSaveDish,
  type DishFormInput,
  type DishRecipeInput,
  dishFormProblems,
  hasDishEdits,
  hasRecipeEdits,
  ingredientLines,
  methodParagraphs,
  parseMinutes,
  toDishFormInput,
  toDishRecipeUpdate,
  toDishUpdate,
  toNewDishRow,
} from '../src/db/dishModel';
import { LOCAL_ISO_FORMAT } from '../src/db/time';
import { day } from './fixtures';

/**
 * `src/db/dishModel.ts` — the dish editor's write, and the rendering rules that turn two
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

// ---------------------------------------------------------------------------
// The dish's identity — the half Phase 7 deferred
// ---------------------------------------------------------------------------

const BLANK = blankDishValues('staple');

function form(overrides: Partial<DishFormInput> = {}): DishFormInput {
  return { ...toDishFormInput(BLANK), name: 'Rasam', slots: ['lunch'], ...overrides };
}

describe('what stops a dish being saved', () => {
  it('accepts a name and one meal, and nothing else', () => {
    // The whole recipe is optional, and stays optional. A dish with no recipe is a normal
    // dish (SPEC §17.2), and adding identity fields does not quietly reverse that.
    expect(dishFormProblems(form())).toEqual([]);
    expect(canSaveDish(form())).toBe(true);
  });

  it('needs a name that is not just whitespace', () => {
    expect(dishFormProblems(form({ name: '   ' }))).toEqual(['give it a name']);
  });

  it('needs at least one meal, or the dish is invisible forever', () => {
    // Eligibility filter 3 drops a dish whose slots do not include the current one, and it
    // is one of the *silent* filters (SPEC §4.1) — so a slotless dish would sit in the
    // repertoire looking perfectly normal and never once be suggested.
    expect(dishFormProblems(form({ slots: [] }))).toEqual(['pick at least one meal']);
  });

  it('lists both when both are missing, in the order the form reads', () => {
    expect(dishFormProblems(form({ name: '', slots: [] }))).toEqual([
      'give it a name',
      'pick at least one meal',
    ]);
  });
});

describe('parseMinutes', () => {
  it('takes a plain positive integer', () => {
    expect(parseMinutes('30')).toBe(30);
    expect(parseMinutes(' 45 ')).toBe(45);
  });

  it('drops anything else rather than refusing the save', () => {
    // Minutes are display-only (SPEC §1.2) — never a filter, never scored. Being unable to
    // save a dish over a typo in the one field that changes nothing would be absurd.
    for (const raw of ['', '   ', 'abc', '30 min', '-5', '0', '2.5', '1e3']) {
      expect(parseMinutes(raw)).toBeNull();
    }
  });
});

describe('toDishUpdate', () => {
  it('writes the identity and the recipe, and nothing the form cannot set', () => {
    // The absences are the point. `prepKind`, `prepLeadHours`, `prepLabel`, `season`,
    // `usesLeftoverRice`, `isFestive` and `source` are seeded and unaskable, so leaving
    // them out is what stops renaming a seeded dish from wiping the fact it needs batter.
    expect(Object.keys(toDishUpdate(form(), NOW)).sort()).toEqual([
      'altName',
      'effort',
      'ingredientsText',
      'isVeg',
      'methodText',
      'minutes',
      'name',
      'notes',
      'primaryIngredient',
      'role',
      'updatedAt',
    ]);
  });

  it('trims, and stores an emptied field as null rather than an empty string', () => {
    const update = toDishUpdate(
      form({ name: '  Rasam  ', altName: '   ', primaryIngredient: ' tamarind ' }),
      NOW,
    );
    expect(update.name).toBe('Rasam');
    expect(update.altName).toBeNull();
    expect(update.primaryIngredient).toBe('tamarind');
  });
});

describe('toNewDishRow', () => {
  it('leaves every field the form does not ask about empty', () => {
    const row = toNewDishRow(form(), 'dish-1', NOW);

    expect(row.prepKind).toBeNull();
    expect(row.prepLeadHours).toBeNull();
    expect(row.prepLabel).toBeNull();
    expect(row.season).toBeNull();
    expect(row.source).toBeNull();
    expect(row.usesLeftoverRice).toBe(false);
    expect(row.isFestive).toBe(false);
    expect(row.isArchived).toBe(false);
  });

  it('stamps createdAt and updatedAt together, and leaves no tombstone', () => {
    const row = toNewDishRow(form(), 'dish-1', NOW);
    expect(row.createdAt).toBe(format(NOW, LOCAL_ISO_FORMAT));
    expect(row.updatedAt).toBe(row.createdAt);
    expect(row.deletedAt).toBeNull();
  });
});

describe('hasDishEdits', () => {
  it('is quiet on the way out of a form that was only read', () => {
    const saved = { ...BLANK, name: 'Rasam', slots: ['lunch'] as const };
    expect(hasDishEdits(toDishFormInput(saved), saved)).toBe(false);
  });

  it('ignores a space added and taken away, and slot order', () => {
    const saved = { ...BLANK, name: 'Rasam', slots: ['lunch', 'dinner'] as const };
    expect(
      hasDishEdits(form({ name: ' Rasam ', slots: ['dinner', 'lunch'] }), saved),
    ).toBe(false);
  });

  it('notices every field the form owns', () => {
    const saved = { ...BLANK, name: 'Rasam', slots: ['lunch'] as const };
    const edits: Partial<DishFormInput>[] = [
      { name: 'Rasam podi' },
      { altName: 'Chaaru' },
      { role: 'gravy' },
      { primaryIngredient: 'tamarind' },
      { effort: 'quick' },
      { minutes: '20' },
      { isVeg: false },
      { slots: ['lunch', 'dinner'] },
      { notes: 'Better the next day.' },
    ];
    for (const edit of edits) {
      expect(hasDishEdits(form(edit), saved)).toBe(true);
    }
  });

  it('fires as soon as a new dish is given a name', () => {
    // The add form starts equal to `blankDishValues`, which is what makes the discard
    // prompt work there without a second code path.
    expect(hasDishEdits(toDishFormInput(BLANK), BLANK)).toBe(false);
    expect(hasDishEdits({ ...toDishFormInput(BLANK), name: 'R' }, BLANK)).toBe(true);
  });
});
