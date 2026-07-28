import { Text, View } from 'react-native';
import type { Reason } from '../core/scoring';
import { type Palette, radius, space, type Theme } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/useTheme';

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

/**
 * Each tone is a surface plus the text colour that is legible on it. The pairs are held
 * together here rather than picked at each call site, because after dark a chip that reused
 * the graphic accent as its text colour would fail contrast against the tinted fill.
 */
function toneColors(colors: Palette, tone: ChipTone) {
  switch (tone) {
    case 'turmeric':
      return { background: colors.turmericBg, text: colors.turmericInk };
    case 'gongura':
      return { background: colors.gonguraBg, text: colors.gonguraInk };
    case 'curry':
      return { background: colors.curryBg, text: colors.curryInk };
    case 'neutral':
      return { background: colors.steel0, text: colors.ink2 };
  }
}

/** The bare pill. Exported because role filters and metadata need it without a `Reason`. */
export function Chip({ label, tone = 'neutral' }: ChipProps) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const { background, text } = toneColors(colors, tone);

  return (
    <View style={[styles.chip, { backgroundColor: background }]}>
      <Text style={[styles.label, { color: text }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

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

/** Row wrapper for a set of chips — the gap and wrapping are part of the component. */
export function ReasonChips({ reasons }: { reasons: readonly Reason[] }) {
  const styles = useThemedStyles(makeStyles);
  if (reasons.length === 0) return null;

  return (
    <View style={styles.row}>
      {reasons.map((reason) => (
        <ReasonChip key={`${reason.kind}:${reason.label}`} reason={reason} />
      ))}
    </View>
  );
}

const makeStyles = ({ text }: Theme) => ({
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  label: {
    ...text.chip,
  },
  row: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 5,
    marginTop: space.md,
  },
});
