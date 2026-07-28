import { describe, expect, it } from 'vitest';
import { PREP_KIND_NOUN, PREP_SHELF_LIFE_HOURS } from '../src/core/prep';

/** `docs/SPEC.md` §5.3. */

describe('PREP_SHELF_LIFE_HOURS', () => {
  it('gives batter three days and the two wet preps one', () => {
    expect(PREP_SHELF_LIFE_HOURS).toEqual({ batter: 72, soaked: 24, marinated: 24 });
  });

  it('covers every prep kind, so no kind falls through to undefined', () => {
    const kinds = Object.keys(PREP_SHELF_LIFE_HOURS).sort();
    expect(kinds).toEqual(['batter', 'marinated', 'soaked']);
    expect(Object.keys(PREP_KIND_NOUN).sort()).toEqual(kinds);
  });
});
