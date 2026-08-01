import { Text, View } from 'react-native';
import type { CookTimelineEntry } from '../db/cookModel';
import { border, radius, space, type Theme } from '../theme/tokens';
import { useThemedStyles } from '../theme/useTheme';

/**
 * What happened the last few times you cooked this.
 *
 * The chronological sequence of `tweakNote`s is the point — it is what becomes the user's
 * real recipe, which is why they live on the cook event and are never folded into the dish
 * (`CLAUDE.md`). So the notes are the emphasised line and the date is the quiet one.
 *
 * A rail with a dot per cook, per the mockup. The dot picks up a rating's colour when there
 * is one; nothing writes ratings today (SPEC §7.1), so in practice they are all neutral and
 * this only lights up if ratings ever come back.
 */

export interface CookTimelineProps {
  entries: readonly CookTimelineEntry[];
}

export function CookTimeline({ entries }: CookTimelineProps) {
  const styles = useThemedStyles(makeStyles);

  if (entries.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>
          Notes you leave after cooking will collect here. They're the part that turns
          into a recipe.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.rail}>
      {entries.map((entry, index) => (
        <View
          key={entry.id}
          style={[styles.event, index === entries.length - 1 && styles.eventLast]}
        >
          <View
            style={[
              styles.dot,
              entry.rating === 3 && styles.dotGood,
              entry.rating === 1 && styles.dotBad,
            ]}
          />
          <Text style={styles.date}>
            {entry.isEstimated ? `about ${entry.dateLabel}` : entry.dateLabel}
            {entry.ratingLabel === null ? '' : ` · ${entry.ratingLabel}`}
            {entry.isBatch ? ' · batch' : ''}
          </Text>
          {entry.tweakNote === null ? (
            <Text style={styles.noNote}>no note</Text>
          ) : (
            <Text style={styles.note}>{entry.tweakNote}</Text>
          )}
        </View>
      ))}
    </View>
  );
}

const makeStyles = ({ colors, text }: Theme) => ({
  rail: {
    borderLeftWidth: border.thin,
    borderLeftColor: colors.lineSoft,
    paddingLeft: 15,
    marginLeft: 3,
  },
  event: {
    paddingBottom: 17,
  },
  eventLast: {
    paddingBottom: space.xs,
  },
  // Sits on the rail, which is 15px of padding plus the border to the left of the content.
  dot: {
    position: 'absolute' as const,
    left: -19,
    top: 5,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.line,
  },
  dotGood: {
    backgroundColor: colors.curry,
  },
  dotBad: {
    backgroundColor: colors.gongura,
  },
  date: {
    ...text.meta,
  },
  note: {
    ...text.body,
    fontSize: 13,
    marginTop: 3,
  },
  noNote: {
    ...text.bodySmall,
    color: colors.ink3,
    fontStyle: 'italic' as const,
    marginTop: 2,
  },
  empty: {
    borderWidth: border.thin,
    borderStyle: 'dashed' as const,
    borderColor: colors.line,
    borderRadius: radius.tile,
    padding: 14,
  },
  emptyText: {
    ...text.bodySmall,
    textAlign: 'center' as const,
  },
});
