import { Text, View } from 'react-native';
import {
  HELD_BACK_MAX_CLAUSES,
  type HeldBackGroup,
  type HeldBackReason,
} from '../core/scoring';
import type { Candidate, Slot } from '../core/types';
import { space, type Theme } from '../theme/tokens';
import { useThemedStyles } from '../theme/useTheme';

/**
 * Why something the user expected to see isn't there (`docs/SPEC.md` §4.6).
 *
 * Only three of the six filters reach here. The other three — archived, always-available,
 * wrong slot — would list most of the repertoire and say nothing. These three hide dishes
 * the user was actively looking for, and a silent omission there reads as a bug.
 *
 * Prose, not a list, and capped: each clause names two dishes and then counts the rest,
 * so a slot that holds back fifteen dishes still costs three sentences. The wording lives
 * here rather than in `src/core/` because SPEC fixes the chip labels but leaves this copy
 * to the screen that renders it.
 */

export interface HeldBackNoteProps {
  groups: readonly HeldBackGroup[];
  slot: Slot;
  isWeekend: boolean;
}

const NAMES_BEFORE_COUNT = 2;

function names(candidates: readonly Candidate[]): string {
  const all = candidates.map((c) => c.name);
  if (all.length === 1) return all[0];
  if (all.length === 2) return `${all[0]} and ${all[1]}`;
  const rest = all.length - NAMES_BEFORE_COUNT;
  return `${all.slice(0, NAMES_BEFORE_COUNT).join(', ')} and ${rest} ${
    rest === 1 ? 'other' : 'others'
  }`;
}

const SLOT_NOUN: Record<Slot, string> = {
  breakfast: 'breakfast',
  lunch: 'lunch',
  dinner: 'dinner',
  snack: 'a snack',
};

/** Distinct prep labels, in the order the dishes came in. */
function prepLabels(candidates: readonly Candidate[]): string[] {
  const seen = new Set<string>();
  for (const c of candidates) {
    if (c.prepLabel !== null && c.prepLabel.trim() !== '') seen.add(c.prepLabel);
  }
  return [...seen];
}

function clause(
  reason: HeldBackReason,
  candidates: readonly Candidate[],
  slot: Slot,
  isWeekend: boolean,
): string {
  const subject = names(candidates);
  const plural = candidates.length > 1;

  switch (reason) {
    case 'over_effort_budget':
      return `${subject} ${plural ? 'want' : 'wants'} more time than ${
        isWeekend ? 'a weekend' : 'a weekday'
      } ${SLOT_NOUN[slot]} allows.`;

    case 'prep_not_ready': {
      const labels = prepLabels(candidates);
      const verb = plural ? 'need' : 'needs';
      return labels.length === 0
        ? `${subject} ${verb} prep that isn't ready yet.`
        : `${subject} ${verb} prep first — ${labels.join(', ')}.`;
    }

    case 'non_veg_day':
      return `${subject} ${plural ? 'are' : 'is'} set aside — today is vegetarian.`;
  }
}

export function HeldBackNote({ groups, slot, isWeekend }: HeldBackNoteProps) {
  const styles = useThemedStyles(makeStyles);
  if (groups.length === 0) return null;

  // `groupHeldBack` returns one group per surfaced reason, so there can only ever be
  // three. Slicing anyway keeps the cap SPEC states honest if a fourth is added later.
  const clauses = groups
    .slice(0, HELD_BACK_MAX_CLAUSES)
    .map((group) => clause(group.reason, group.candidates, slot, isWeekend));

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>Held back</Text>
      {clauses.map((sentence) => (
        <Text key={sentence} style={styles.body}>
          {sentence}
        </Text>
      ))}
    </View>
  );
}

const makeStyles = ({ text }: Theme) => ({
  section: {
    gap: space.sm,
  },
  heading: {
    ...text.sectionHeading,
    marginBottom: space.xs,
  },
  body: {
    ...text.bodySmall,
  },
});
