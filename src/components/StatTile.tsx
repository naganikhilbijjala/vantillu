import { Text, View } from 'react-native';
import { radius, space, type Theme } from '../theme/tokens';
import { useThemedStyles } from '../theme/useTheme';

/**
 * One number with a label. Four of these are the "Pattern" block on a dish detail screen,
 * and the same tile carries the Phase 11 insights.
 *
 * `unit` is a separate, smaller run rather than part of the value so the numbers line up
 * across a row of tiles — "9 times" and "24 d ago" have the same visual weight on the digit.
 * A value the app cannot honestly supply is an em dash, never a zero.
 */

export interface StatTileProps {
  label: string;
  value: string;
  unit?: string;
}

export function StatTile({ label, value, unit }: StatTileProps) {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.tile}>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.value}>
        {value}
        {unit === undefined ? null : <Text style={styles.unit}> {unit}</Text>}
      </Text>
    </View>
  );
}

/** Two-up grid. Wrapping rather than a fixed column count keeps it honest at large fonts. */
export function StatGrid({ children }: { children: React.ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return <View style={styles.grid}>{children}</View>;
}

const makeStyles = ({ colors, text }: Theme) => ({
  grid: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 8,
  },
  tile: {
    // Half the row, less half the gap. Two per line, and a third wraps rather than shrinks.
    flexGrow: 1,
    flexBasis: '47%' as const,
    backgroundColor: colors.steel1,
    borderRadius: radius.tile,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  label: {
    ...text.bodySmall,
    fontSize: 11.5,
    lineHeight: 15,
  },
  value: {
    ...text.statValue,
    marginTop: space.xs,
  },
  unit: {
    ...text.statValue,
    fontSize: 12,
    color: colors.ink3,
  },
});
