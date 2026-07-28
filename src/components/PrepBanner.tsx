import { format } from 'date-fns';
import { Text, View } from 'react-native';
import { PREP_KIND_NOUN } from '../core/prep';
import type { LivePrep } from '../db/todayModel';
import { fonts, type Palette, space, type Theme } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/useTheme';

/**
 * "Something is ready for you" — the one piece of the Today screen that is about the
 * fridge rather than the repertoire.
 *
 * Curry green while there is time, turmeric once the row expires within 24 h. That is the
 * same meaning the two colours carry on a reason chip and on the gauge: turmeric is "act
 * on this now", green is "this is prepared and waiting". Never red — a batter with hours
 * left is an opportunity, not a failure.
 */

export interface PrepBannerProps {
  prep: LivePrep;
  now: Date;
}

/** Capitalised because it opens a sentence, and row labels are user-written free text. */
function headline(prep: LivePrep): string {
  const noun = prep.label ?? (prep.kind === null ? 'Prep' : PREP_KIND_NOUN[prep.kind]);
  return `${noun.charAt(0).toUpperCase()}${noun.slice(1)} is ready`;
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

/** Two names, then a count. A banner that lists eight dishes stops being a banner. */
function dishPhrase(names: readonly string[]): string {
  if (names.length === 1) return `${names[0]} is back in rotation.`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are back in rotation.`;
  const rest = names.length - 2;
  return `${names[0]}, ${names[1]} and ${rest} ${
    rest === 1 ? 'other' : 'others'
  } are back in rotation.`;
}

function tone(colors: Palette, expiringSoon: boolean) {
  return expiringSoon
    ? { fill: colors.turmericBg, rule: colors.turmeric, ink: colors.turmericInk }
    : { fill: colors.curryBg, rule: colors.curry, ink: colors.curryInk };
}

export function PrepBanner({ prep, now }: PrepBannerProps) {
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
        <Text style={styles.headline}>{headline(prep)}</Text>
        {` — ${detail}`}
      </Text>
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
});
