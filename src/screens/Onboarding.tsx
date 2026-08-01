import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import {
  Check,
  CookingPot,
  type LucideIcon,
  PencilLine,
  Smartphone,
  TrendingUp,
} from 'lucide-react-native';
import { type ReactNode, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GhostButton } from '../components/GhostButton';
import { PrimaryButton } from '../components/PrimaryButton';
import { SmallButton } from '../components/SmallButton';
import {
  type CatalogSection,
  groupCatalogByRole,
  isSectionFull,
  selectedEntries,
  setSectionKeys,
  toggleKey,
} from '../db/onboardingModel';
import { finishOnboarding } from '../db/queries/onboarding';
import { roleConfigQuery } from '../db/queries/roles';
import type { RoleConfigRow } from '../db/roles';
import { SEED_CATALOG, type SeedCatalogEntry } from '../db/seedCatalog';
import { border, layout, radius, space, type Theme } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/useTheme';

/**
 * Onboarding: what this app is, and then an optional head start.
 *
 * **The repertoire is what the user cooks — the seed file is not it.** `assets/
 * seed_dishes.json` is a suggestion list offered once to save some typing, and that is the
 * whole of its role. It is offered with **nothing ticked**, it is skippable, and skipping
 * it is a perfectly normal way to start: dishes are added from the Dishes tab, by hand, one
 * at a time, as the user thinks of things they cook. An earlier version of this screen had
 * all sixty-eight pre-ticked, which quietly made a stranger's list the answer to "what do
 * you cook" (`docs/SPEC.md` §18.1).
 *
 * **It does not ask about your cooking history.** A second step used to collect a
 * last-cooked bucket per dish and write `isEstimated` events. It was an interview before
 * the app had shown anything, in exchange for day counts the app will learn on its own
 * within a week (§18.3).
 *
 * **Not a route, unlike the sketch in `IMPLEMENTATION.md` §3.** Onboarding is not somewhere
 * you navigate to — it is the state the app is in before it has a repertoire, in exactly the
 * way the migration gate and the boot failure in `app/_layout.tsx` are. The gate is
 * `useOnboardingGate`, and it is live, so committing the write below is what dismisses this
 * screen — there is nothing to navigate.
 */

type Step = 'intro' | 'starter';

export function Onboarding() {
  const styles = useThemedStyles(makeStyles);
  const roleRows = useLiveQuery(roleConfigQuery());

  const [step, setStep] = useState<Step>('intro');
  // **Nothing pre-ticked.** The list is a shortcut, not a default repertoire, and the
  // honest opening position is that the app knows nothing about what this person cooks.
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [error, setError] = useState<Error | null>(null);

  // The one write in the app that cannot be repeated harmlessly: a second tap would insert
  // every picked dish twice, and the gate only closes on the re-render after the first.
  const saving = useRef(false);

  const roles = useMemo(() => roleRows.data ?? [], [roleRows.data]);
  const picked = useMemo(() => selectedEntries(SEED_CATALOG, selected), [selected]);

  function finish(entries: readonly SeedCatalogEntry[]) {
    if (saving.current) return;
    saving.current = true;
    try {
      finishOnboarding(entries);
    } catch (caught) {
      saving.current = false;
      setError(caught instanceof Error ? caught : new Error(String(caught)));
    }
  }

  // Roles carry the section labels and their order, so there is nothing honest to draw on
  // the second step until that read lands. It is seeded at boot, so this is one frame at
  // most — unless it failed, in which case saying so beats a blank screen.
  if (roleRows.error !== undefined) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Text style={styles.error}>{roleRows.error.message}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      {step === 'intro' ? (
        <IntroStep
          error={error}
          onContinue={() => setStep('starter')}
          // Straight past the starter list, with nothing taken from it. The Dishes tab is
          // where dishes come from either way; this only skips the shortcut.
          onSkip={() => finish([])}
        />
      ) : (
        <StarterStep
          roles={roles}
          selected={selected}
          picked={picked.length}
          onToggle={(key) => setSelected((current) => toggleKey(current, key))}
          onSection={(entries, on) =>
            setSelected((current) => setSectionKeys(current, entries, on))
          }
          onBack={() => setStep('intro')}
          onFinish={() => finish(picked)}
          error={error}
        />
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — what the app is
// ---------------------------------------------------------------------------

/**
 * Four things, which together are the whole app.
 *
 * The order matters: what it is for, then what it needs from you, then what it gives back,
 * then the thing people ask about an app that holds years of their life. The third one is
 * deliberately honest about the wait — an app that promises insight on day one and then
 * says "new dish" for a fortnight reads as broken rather than as patient.
 */
const POINTS: readonly { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: CookingPot,
    title: 'One question',
    body: 'What should I cook right now? Vantillu answers it from the dishes you already make, ranked by how long it has been and what time of day it is.',
  },
  {
    icon: PencilLine,
    title: 'Your dishes, added by you',
    body: 'Nothing is suggested that you have not told it you cook. Add dishes from the Dishes tab whenever one comes to mind — a name and a meal is all it needs.',
  },
  {
    icon: Check,
    title: 'Logging is one tap',
    body: 'Tap a suggestion on Today, confirm, done. Jot a note for next time if you want — those notes are what slowly turn into your real recipe.',
  },
  {
    icon: TrendingUp,
    title: 'The rhythm builds itself',
    body: 'After three cooks of a dish it works out how often you usually make it and starts flagging what is overdue. Until then it says "new dish" rather than inventing a number.',
  },
  {
    icon: Smartphone,
    title: 'It stays on this phone',
    body: 'No account, no sign-in, nothing uploaded. Just this phone, which is also why the export in settings will matter one day.',
  },
];

function IntroStep({
  error,
  onContinue,
  onSkip,
}: {
  error: Error | null;
  onContinue: () => void;
  onSkip: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();

  return (
    <>
      <ScrollView contentContainerStyle={styles.introScroll}>
        <Text style={styles.eyebrow}>A cooking log</Text>
        <Text style={styles.introTitle}>Vantillu</Text>

        <View style={styles.points}>
          {POINTS.map(({ icon: Icon, title, body }) => (
            <View key={title} style={styles.point}>
              <View style={styles.pointIcon}>
                <Icon size={17} strokeWidth={1.7} color={colors.ink2} />
              </View>
              <View style={styles.pointBody}>
                <Text style={styles.pointTitle}>{title}</Text>
                <Text style={styles.pointText}>{body}</Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <Footer error={error}>
        <PrimaryButton label="Start with a few suggestions" onPress={onContinue} />
        <GhostButton label="Skip — I'll add my own" onPress={onSkip} />
      </Footer>
    </>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — the optional starter list
// ---------------------------------------------------------------------------

type PickRow =
  | { kind: 'section'; id: string; section: CatalogSection }
  | { kind: 'dish'; id: string; entry: SeedCatalogEntry };

function toRows(sections: readonly CatalogSection[]): PickRow[] {
  const out: PickRow[] = [];
  for (const section of sections) {
    out.push({ kind: 'section', id: `role:${section.role}`, section });
    for (const entry of section.entries) {
      out.push({ kind: 'dish', id: entry.key, entry });
    }
  }
  return out;
}

function StarterStep({
  roles,
  selected,
  picked,
  onToggle,
  onSection,
  onBack,
  onFinish,
  error,
}: {
  roles: readonly RoleConfigRow[];
  selected: ReadonlySet<string>;
  picked: number;
  onToggle: (key: string) => void;
  onSection: (entries: readonly SeedCatalogEntry[], on: boolean) => void;
  onBack: () => void;
  onFinish: () => void;
  error: Error | null;
}) {
  const styles = useThemedStyles(makeStyles);

  const rows = useMemo(() => toRows(groupCatalogByRole(SEED_CATALOG, roles)), [roles]);

  return (
    <>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Optional</Text>
        <Text style={styles.title}>Anything here you cook?</Text>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(row) => row.id}
        contentContainerStyle={styles.list}
        // The ticks live outside `data`, which never changes here — without this a cell
        // can keep the tick state it was last rendered with.
        extraData={selected}
        ListHeaderComponent={
          <Text style={styles.blurb}>
            A list of common Andhra dishes, purely to save you some typing. Tick the ones
            you actually make and leave the rest — you can add anything else from the
            Dishes tab, any time.
          </Text>
        }
        renderItem={({ item }) =>
          item.kind === 'section' ? (
            <SectionHeading
              section={item.section}
              full={isSectionFull(selected, item.section.entries)}
              onPress={(on) => onSection(item.section.entries, on)}
            />
          ) : (
            <CheckRow
              entry={item.entry}
              checked={selected.has(item.entry.key)}
              onPress={() => onToggle(item.entry.key)}
            />
          )
        }
      />

      <Footer error={error}>
        <PrimaryButton
          label={
            picked === 0
              ? 'Start with none'
              : `Add ${picked} ${picked === 1 ? 'dish' : 'dishes'}`
          }
          onPress={onFinish}
        />
        <GhostButton label="Back" onPress={onBack} />
      </Footer>
    </>
  );
}

function SectionHeading({
  section,
  full,
  onPress,
}: {
  section: CatalogSection;
  full: boolean;
  onPress: (on: boolean) => void;
}) {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.sectionRow}>
      <Text style={styles.sectionLabel}>{section.label}</Text>
      <SmallButton label={full ? 'None' : 'All'} onPress={() => onPress(!full)} />
    </View>
  );
}

/** What a person needs in order to recognise a dish: the other name, and how long it takes. */
function subtitleFor(entry: SeedCatalogEntry): string {
  return [
    entry.altName === entry.name ? null : entry.altName,
    entry.minutes === null ? null : `${entry.minutes} min`,
    entry.prepLabel,
  ]
    .filter((part): part is string => part !== null && part !== '')
    .join(' · ');
}

function CheckRow({
  entry,
  checked,
  onPress,
}: {
  entry: SeedCatalogEntry;
  checked: boolean;
  onPress: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const subtitle = subtitleFor(entry);

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={entry.name}
      onPress={onPress}
      style={({ pressed }) => [styles.checkRow, pressed && styles.rowPressed]}
    >
      <View style={[styles.box, checked && styles.boxChecked]}>
        {checked ? <Check size={13} strokeWidth={2.6} color={colors.onInk} /> : null}
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowName} numberOfLines={1}>
          {entry.name}
        </Text>
        {subtitle === '' ? null : (
          <Text style={styles.rowMeta} numberOfLines={1}>
            {subtitle}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------

/**
 * The action bar, pinned rather than at the end of the list. Sixty-eight rows is a long
 * way to scroll to find out how to leave, and every step here is one you should be able to
 * end at any moment.
 */
function Footer({ error, children }: { error: Error | null; children: ReactNode }) {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.footer}>
      {error === null ? null : <Text style={styles.error}>{error.message}</Text>}
      {children}
    </View>
  );
}

const makeStyles = ({ colors, text }: Theme) => ({
  safeArea: {
    flex: 1,
    backgroundColor: colors.steel2,
  },
  header: {
    paddingHorizontal: layout.screenPaddingH,
    paddingTop: space.md,
    paddingBottom: space.lg,
  },
  introScroll: {
    paddingHorizontal: layout.screenPaddingH,
    paddingTop: space.xxl,
    paddingBottom: space.xxl,
  },
  eyebrow: {
    ...text.eyebrow,
  },
  title: {
    ...text.title,
    marginTop: 3,
  },
  introTitle: {
    ...text.title,
    fontSize: 32,
    lineHeight: 36,
    marginTop: space.xs,
  },
  blurb: {
    ...text.bodySmall,
    paddingBottom: space.lg,
  },
  points: {
    marginTop: space.xxl,
    gap: space.xl,
  },
  point: {
    flexDirection: 'row' as const,
    gap: space.lg,
  },
  pointIcon: {
    width: 30,
    height: 30,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderRadius: radius.tile,
    backgroundColor: colors.steel1,
    borderWidth: border.thin,
    borderColor: colors.lineSoft,
  },
  pointBody: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  pointTitle: {
    ...text.cardTitle,
    fontSize: 15,
  },
  pointText: {
    ...text.bodySmall,
  },
  list: {
    paddingHorizontal: layout.screenPaddingH,
    paddingBottom: space.xxl,
  },
  sectionRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'space-between' as const,
    gap: space.lg,
    paddingTop: space.xl,
    paddingBottom: space.md,
  },
  sectionLabel: {
    ...text.sectionHeading,
    flex: 1,
  },
  checkRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.lg,
    paddingVertical: 10,
    minHeight: layout.minTouchTarget,
    borderBottomWidth: border.hairline,
    borderBottomColor: colors.lineSoft,
  },
  rowPressed: {
    backgroundColor: colors.steel1,
  },
  box: {
    width: 20,
    height: 20,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    borderWidth: border.thin,
    borderColor: colors.line,
    borderRadius: 5,
  },
  boxChecked: {
    backgroundColor: colors.ink,
    borderColor: colors.ink,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowName: {
    ...text.rowTitle,
  },
  rowMeta: {
    ...text.meta,
    marginTop: space.xs,
  },
  footer: {
    gap: space.md,
    paddingHorizontal: layout.screenPaddingH,
    paddingTop: space.lg,
    paddingBottom: space.md,
    borderTopWidth: border.thin,
    borderTopColor: colors.lineSoft,
    backgroundColor: colors.steel1,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
  },
  error: {
    ...text.bodySmall,
    color: colors.gongura,
  },
});
