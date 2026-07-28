import { type DimensionValue, View } from 'react-native';
import {
  GAUGE_DUE_FRACTION,
  gaugeFillFraction,
  staleness,
  stalenessState,
} from '../core/interval';
import { gauge, type Theme } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/useTheme';

/**
 * How overdue a dish is, as a bar that fills toward the dish's own median interval
 * (SPEC §8). The hairline marks "due"; past that the fill turns red and clamps at 1.4×,
 * so a dish 400 % overdue still reads as a full bar instead of breaking the layout.
 *
 * With no median — under three cooks, or two cooks on the same day — the bar is hollow
 * and dashed. "No data" and "just cooked" must never look alike, which is why an unknown
 * median is not a zero-width solid bar.
 */

export interface IntervalGaugeProps {
  daysSince: number | null;
  /** Null (or 0) means there is no honest rhythm yet — renders hollow. */
  medianInterval: number | null;
  /** Fixed width for a dishes-list row. Omit to fill the container, as on a card. */
  width?: number;
  /**
   * Screen-reader text. Omit wherever the same fact is already stated in text next to the
   * gauge — on a suggestion card the reason chip says it, and a second reading is noise.
   */
  label?: string;
}

export function IntervalGauge({
  daysSince,
  medianInterval,
  width,
  label,
}: IntervalGaugeProps) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();

  const ratio = staleness(daysSince, medianInterval);
  // `stalenessState` owns the "median of 0 counts as unknown" rule, so the hollow bar
  // and the "new dish" chip can never disagree about what counts as no history.
  const state = stalenessState(medianInterval, ratio);
  const isUnknown = state === 'new';

  const fillWidth: DimensionValue = `${gaugeFillFraction(ratio) * 100}%`;
  const fillColor = state === 'recent' ? colors.turmeric : colors.gongura;

  const a11y = label
    ? {
        accessible: true,
        accessibilityRole: 'progressbar' as const,
        accessibilityValue: { text: label },
      }
    : {
        accessibilityElementsHidden: true,
        importantForAccessibility: 'no-hide-descendants' as const,
      };

  return (
    <View
      style={[
        styles.track,
        isUnknown ? styles.trackUnknown : styles.trackKnown,
        width === undefined ? styles.trackFlexible : { width },
      ]}
      {...a11y}
    >
      {isUnknown ? null : (
        <View style={[styles.fill, { width: fillWidth, backgroundColor: fillColor }]} />
      )}
      <View style={styles.dueMarker} />
    </View>
  );
}

const makeStyles = ({ colors }: Theme) => ({
  track: {
    height: gauge.height,
    justifyContent: 'center' as const,
  },
  trackFlexible: {
    alignSelf: 'stretch' as const,
  },
  // `lineSoft`, not `steel0`: the unfilled remainder should read as faintly in dark as it
  // does in light, and a divider-weight colour is the one that stays proportionally faint
  // against whichever surface it sits on.
  trackKnown: {
    backgroundColor: colors.lineSoft,
    borderRadius: gauge.trackRadius,
  },
  // Square on purpose: Android draws a dashed border as solid as soon as there is a
  // corner radius, and losing the dashes would lose the whole "no data" signal.
  trackUnknown: {
    borderWidth: 1,
    borderStyle: 'dashed' as const,
    borderColor: colors.line,
    borderRadius: 0,
  },
  fill: {
    position: 'absolute' as const,
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: gauge.trackRadius,
  },
  dueMarker: {
    position: 'absolute' as const,
    left: `${GAUGE_DUE_FRACTION * 100}%` as DimensionValue,
    top: -gauge.markerOverhang,
    bottom: -gauge.markerOverhang,
    width: gauge.markerWidth,
    backgroundColor: colors.ink3,
  },
});
