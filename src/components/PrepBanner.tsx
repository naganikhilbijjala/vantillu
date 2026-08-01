import { format } from 'date-fns';
import { Pressable, Text, View } from 'react-native';
import { dishPhrase, prepHeadline } from '../db/prepModel';
import type { LivePrep } from '../db/todayModel';
import { fonts, layout, type Palette, radius, space, type Theme } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/useTheme';

/**
 * "Something is ready for you" — the one piece of the Today screen that is about the
 * fridge rather than the repertoire.
 *
 * Curry green while there is time, turmeric once the row expires within 24 h. That is the
 * same meaning the two colours carry on a reason chip and on the gauge: turmeric is "act
 * on this now", green is "this is prepared and waiting". Never red — a batter with hours
 * left is an opportunity, not a failure.
 *
 * The headline and the dish phrase come from `prepModel.ts`, because a prep reminder says
 * the same two sentences and they must not drift apart.
 */

export interface PrepBannerProps {
  prep: LivePrep;
  now: Date;
  /** "Used it up". Absent while there is no writer, as on a preview screen. */
  onDiscard?: () => void;
}

function expiryPhrase(prep: LivePrep, now: Date): string | null {
  if (prep.expiresAt === null) return null;
  if (!prep.expiringSoon) return `good through ${format(prep.expiresAt, 'EEEE')}`;

  const hours = Math.max(
    1,
    Math.round((prep.expiresAt.getTime() - now.getTime()) / 3_600_000),
  );
  return `about ${hours} ${hours === 1 ? 'hour' : 'hours'} left`;
}

function tone(colors: Palette, expiringSoon: boolean) {
  return expiringSoon
    ? { fill: colors.turmericBg, rule: colors.turmeric, ink: colors.turmericInk }
    : { fill: colors.curryBg, rule: colors.curry, ink: colors.curryInk };
}

export function PrepBanner({ prep, now, onDiscard }: PrepBannerProps) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const { fill, rule, ink } = tone(colors, prep.expiringSoon);

  const expiry = expiryPhrase(prep, now);
  const detail = `${expiry === null ? '' : `${expiry}. `}${dishPhrase(prep.dishNames)}`;

  return (
    <View
      style={[styles.banner, { backgroundColor: fill, borderLeftColor: rule }]}
      accessibilityRole="summary"
    >
      <View style={[styles.dot, { backgroundColor: rule }]} />
      <Text style={[styles.text, { color: ink }]}>
        <Text style={styles.headline}>{prepHeadline(prep.kind, prep.label)}</Text>
        {` — ${detail}`}
      </Text>

      {/* The banner is where you are standing when you finish the batter, so this is
          where saying so belongs. No confirmation: it removes a claim about the fridge,
          not history, and the dish's own Prep section starts another one. */}
      {onDiscard === undefined ? null : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mark this prep as used up"
          hitSlop={space.md}
          onPress={onDiscard}
          style={({ pressed }) => [styles.discard, pressed && { opacity: 0.6 }]}
        >
          <Text style={[styles.discardLabel, { color: ink }]}>Used it up</Text>
        </Pressable>
      )}
    </View>
  );
}

const makeStyles = ({ text }: Theme) => ({
  banner: {
    flexDirection: 'row' as const,
    alignItems: 'flex-start' as const,
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 13,
    // A left rule rather than a full border: it reads as an annotation on the page rather
    // than as another card competing with the suggestions below it.
    borderLeftWidth: 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: space.sm,
  },
  // The tone supplies the colour, applied inline after this style so it wins.
  text: {
    ...text.bodySmall,
    flex: 1,
  },
  // Addressed by family, not by `fontWeight` — Android synthesises weights on a loaded
  // TTF rather than swapping the face.
  headline: {
    fontFamily: fonts.sansMedium,
  },
  // Aligned with the first line of text rather than centred in the banner, which grows to
  // two or three lines and would leave the action floating beside the middle of a sentence.
  discard: {
    alignSelf: 'flex-start' as const,
    justifyContent: 'center' as const,
    minHeight: layout.minTouchTarget - space.xl,
    paddingHorizontal: space.md,
    borderRadius: radius.control,
  },
  discardLabel: {
    ...text.control,
    fontSize: 11.5,
    textDecorationLine: 'underline' as const,
  },
});
