import { StyleSheet, Text, View } from 'react-native';
import type { Reason } from '../core/scoring';
import { colors, radius, space, text } from '../theme/tokens';

/**
 * The chip that states *why* a dish is being suggested. Every suggestion shows at least
 * one — a suggestion without a stated reason gets ignored.
 *
 * The wording comes from `reasons()` in `src/core/scoring.ts` and is fixed by SPEC §4.6.
 * This component chooses colour only; it never rewrites a label.
 */

export type ChipTone = 'neutral' | 'turmeric' | 'gongura' | 'curry';

export interface ChipProps {
  label: string;
  tone?: ChipTone;
}

/** The bare pill. Exported because role filters and metadata need it without a `Reason`. */
export function Chip({ label, tone = 'neutral' }: ChipProps) {
  return (
    <View style={[styles.chip, { backgroundColor: TONE[tone].background }]}>
      <Text style={[styles.label, { color: TONE[tone].text }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const TONE: Record<ChipTone, { background: string; text: string }> = {
  neutral: { background: colors.steel0, text: colors.ink2 },
  turmeric: { background: colors.turmericBg, text: colors.turmericInk },
  gongura: { background: colors.gonguraBg, text: colors.gonguraInk },
  curry: { background: colors.curryBg, text: colors.curryInk },
};

/**
 * Colour carries the same meaning as the gauge: red is past due, turmeric is a nudge
 * ("quick", or prep that is about to die), green is something already prepared and
 * waiting, neutral is a plain statement of fact.
 */
export function toneForReason(reason: Reason): ChipTone {
  switch (reason.kind) {
    case 'staleness':
      return reason.state === 'due' || reason.state === 'overdue' ? 'gongura' : 'neutral';
    // Turmeric when the batter expires within 24 h — same "act on this now" colour as
    // the not-yet-due gauge fill. `expiringSoon` exists on the Reason for exactly this.
    case 'prep_ready':
      return reason.expiringSoon ? 'turmeric' : 'curry';
    case 'leftover_rice':
      return 'curry';
    case 'quick':
      return 'turmeric';
  }
}

export function ReasonChip({ reason }: { reason: Reason }) {
  return <Chip label={reason.label} tone={toneForReason(reason)} />;
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  label: {
    ...text.chip,
  },
});

/** Row wrapper for a set of chips — the gap and wrapping are part of the component. */
export function ReasonChips({ reasons }: { reasons: readonly Reason[] }) {
  if (reasons.length === 0) return null;
  return (
    <View style={chipRowStyles.row}>
      {reasons.map((reason) => (
        <ReasonChip key={`${reason.kind}:${reason.label}`} reason={reason} />
      ))}
    </View>
  );
}

const chipRowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: space.md,
  },
});
