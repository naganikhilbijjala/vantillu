import { Text, View } from 'react-native';
import { PREP_KIND_ACTION } from '../core/prep';
import { type DishPrepStatus, isUsablePhase, prepStatusLine } from '../db/prepModel';
import { border, radius, space, type Theme } from '../theme/tokens';
import { useThemedStyles } from '../theme/useTheme';
import { SmallButton } from './SmallButton';

/**
 * What is in the fridge for this dish, and the one button that changes it
 * (`docs/SPEC.md` §20.4).
 *
 * This is the section that makes the hard exclusion answerable. A dish with `prepKind` and
 * nothing live is invisible on Today by design — suggesting dosa with no batter is worse
 * than suggesting nothing (§5.2) — and until Phase 9 the only way out of that was a
 * dev-tools button. The held-back note says *why* the dish is missing; this says what to
 * do about it.
 *
 * Absent entirely for a dish that needs no prep, which is most of them. A "no prep needed"
 * line under every dal would be a completion meter on data nobody entered.
 */

export interface PrepSectionProps {
  status: DishPrepStatus;
  now: Date;
  onStart: () => void;
  onDiscard: () => void;
}

export function PrepSection({ status, now, onStart, onDiscard }: PrepSectionProps) {
  const styles = useThemedStyles(makeStyles);
  const going = status.phase === 'pending' || isUsablePhase(status.phase);

  return (
    <View style={styles.section}>
      <Text style={styles.line}>{prepStatusLine(status, now)}</Text>
      <View style={styles.actions}>
        {going ? (
          // No confirmation. It destroys no history — only a claim about the fridge that
          // the person holding the bowl is better placed to make — and starting again is
          // the button right here.
          <SmallButton label="Used it up" onPress={onDiscard} />
        ) : (
          <SmallButton label={PREP_KIND_ACTION[status.kind]} onPress={onStart} />
        )}
        {status.leadHours === null || going ? null : (
          <Text style={styles.lead}>
            ready in {status.leadHours} {status.leadHours === 1 ? 'hour' : 'hours'}
          </Text>
        )}
      </View>
    </View>
  );
}

const makeStyles = ({ colors, text }: Theme) => ({
  section: {
    marginTop: space.md,
    padding: 13,
    borderWidth: border.thin,
    borderColor: colors.lineSoft,
    borderRadius: radius.tile,
    backgroundColor: colors.steel1,
    gap: space.lg,
  },
  line: {
    ...text.bodySmall,
    color: colors.ink,
  },
  actions: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.lg,
  },
  lead: {
    ...text.meta,
    flex: 1,
  },
});
