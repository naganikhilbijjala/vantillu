import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { Check } from 'lucide-react-native';
import { type ReactNode, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { GhostButton } from '../components/GhostButton';
import { PillToggle } from '../components/PillToggle';
import { PrimaryButton } from '../components/PrimaryButton';
import { SmallButton } from '../components/SmallButton';
import {
  type CatalogSection,
  defaultSelection,
  groupCatalogByRole,
  isSectionFull,
  LAST_COOKED_OPTIONS,
  type LastCookedBucket,
  pruneEstimates,
  selectedEntries,
  setBucket,
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
 * Onboarding: pick your repertoire, then say roughly when you last cooked each thing.
 *
 * **Not a route, unlike the sketch in `IMPLEMENTATION.md` §3.** Onboarding is not somewhere
 * you navigate to — it is the state the app is in before it has a repertoire, in exactly the
 * way the migration gate and the boot failure in `app/_layout.tsx` are. Rendering it in place
 * of the `Stack` is what makes it impossible to flash Today first, to reach it with a back
 * gesture afterwards, or to leave it half-done in the navigator's history. The gate is
 * `useOnboardingGate`, and it is live, so committing the writes below is what dismisses this
 * screen — there is nothing to navigate.
 *
 * Both steps are skippable and nothing is required. `docs/SPEC.md` §18 has the reasoning;
 * the arithmetic and the grouping are in `src/db/onboardingModel.ts`, tested in Node.
 */

type Step = 'pick' | 'estimate';

export function Onboarding() {
  const styles = useThemedStyles(makeStyles);
  const roleRows = useLiveQuery(roleConfigQuery());

  const [step, setStep] = useState<Step>('pick');
  // Everything ticked. The seed file's own note is "accept what you cook, delete the rest",
  // and it is the faster answer for the common case (SPEC §18.1).
  const [selected, setSelected] = useState<ReadonlySet<string>>(() =>
    defaultSelection(SEED_CATALOG),
  );
  const [estimates, setEstimates] = useState<ReadonlyMap<string, LastCookedBucket>>(
    () => new Map(),
  );
  const [error, setError] = useState<Error | null>(null);

  // The one write in the app that cannot be repeated harmlessly: a second tap would insert
  // the whole repertoire twice, and the gate only closes on the re-render after the first.
  const saving = useRef(false);

  // Both memoised on the live query's own array, so ticking a box does not rebuild
  // sixty-eight rows: `roles` feeds the grouping, and the grouping feeds the list.
  const roles = useMemo(() => roleRows.data ?? [], [roleRows.data]);
  const picked = useMemo(() => selectedEntries(SEED_CATALOG, selected), [selected]);

  function finish(entries: readonly SeedCatalogEntry[]) {
    if (saving.current) return;
    saving.current = true;
    try {
      finishOnboarding({ entries, estimates: pruneEstimates(estimates, selected) });
    } catch (caught) {
      saving.current = false;
      setError(caught instanceof Error ? caught : new Error(String(caught)));
    }
  }

  // Roles carry the section labels and their order, so there is nothing honest to draw
  // until that read lands. It is seeded at boot, so this is one frame at most — unless it
  // failed, in which case saying so beats a blank screen that never resolves.
  if (roleRows.updatedAt === undefined || roleRows.error !== undefined) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        {roleRows.error === undefined ? null : (
          <View style={styles.header}>
            <Text style={styles.error}>{roleRows.error.message}</Text>
          </View>
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      {step === 'pick' ? (
        <PickStep
          roles={roles}
          selected={selected}
          onToggle={(key) => setSelected((current) => toggleKey(current, key))}
          onSection={(entries, on) =>
            setSelected((current) => setSectionKeys(current, entries, on))
          }
          pickedCount={picked.length}
          // Nothing picked means nothing to estimate, so the second step would be an empty
          // list with a Finish button on it. Skipping straight to the end is the same
          // outcome with one less dead screen.
          onContinue={() => (picked.length === 0 ? finish(picked) : setStep('estimate'))}
          error={error}
        />
      ) : (
        <EstimateStep
          entries={picked}
          roles={roles}
          estimates={estimates}
          onSet={(key, bucket) =>
            setEstimates((current) => setBucket(current, key, bucket))
          }
          onBack={() => setStep('pick')}
          onFinish={() => finish(picked)}
          error={error}
        />
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — what do you cook
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

function PickStep({
  roles,
  selected,
  onToggle,
  onSection,
  pickedCount,
  onContinue,
  error,
}: {
  roles: readonly RoleConfigRow[];
  selected: ReadonlySet<string>;
  onToggle: (key: string) => void;
  onSection: (entries: readonly SeedCatalogEntry[], on: boolean) => void;
  pickedCount: number;
  onContinue: () => void;
  error: Error | null;
}) {
  const styles = useThemedStyles(makeStyles);

  const rows = useMemo(() => toRows(groupCatalogByRole(SEED_CATALOG, roles)), [roles]);

  return (
    <>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Setting up · 1 of 2</Text>
        <Text style={styles.title}>What do you cook?</Text>
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
            A starter list, weighted to Andhra cooking. Untick anything you don't make —
            only the ticked ones become your repertoire.
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
            pickedCount === 0
              ? 'Continue with none'
              : `Continue with ${pickedCount} ${pickedCount === 1 ? 'dish' : 'dishes'}`
          }
          onPress={onContinue}
        />
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
// Step 2 — when did you last make these
// ---------------------------------------------------------------------------

function EstimateStep({
  entries,
  roles,
  estimates,
  onSet,
  onBack,
  onFinish,
  error,
}: {
  entries: readonly SeedCatalogEntry[];
  roles: readonly RoleConfigRow[];
  estimates: ReadonlyMap<string, LastCookedBucket>;
  onSet: (key: string, bucket: LastCookedBucket) => void;
  onBack: () => void;
  onFinish: () => void;
  error: Error | null;
}) {
  const styles = useThemedStyles(makeStyles);

  const rows = useMemo(
    () => toRows(groupCatalogByRole(entries, roles)),
    [entries, roles],
  );

  return (
    <>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Setting up · 2 of 2</Text>
        <Text style={styles.title}>When did you last make these?</Text>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(row) => row.id}
        contentContainerStyle={styles.list}
        extraData={estimates}
        ListHeaderComponent={
          <Text style={styles.blurb}>
            Only the ones you remember, and roughly is fine. Leave the rest blank — the
            app picks up your rhythm from the cooks you log from here on.
          </Text>
        }
        renderItem={({ item }) =>
          item.kind === 'section' ? (
            <Text style={styles.sectionLabelPlain}>{item.section.label}</Text>
          ) : (
            <EstimateRow
              entry={item.entry}
              bucket={estimates.get(item.entry.key)}
              onSet={(bucket) => onSet(item.entry.key, bucket)}
            />
          )
        }
      />

      <Footer error={error}>
        <PrimaryButton label="Finish" onPress={onFinish} />
        <GhostButton label="Back" onPress={onBack} />
      </Footer>
    </>
  );
}

function EstimateRow({
  entry,
  bucket,
  onSet,
}: {
  entry: SeedCatalogEntry;
  bucket: LastCookedBucket | undefined;
  onSet: (bucket: LastCookedBucket) => void;
}) {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={styles.estimateRow}>
      <Text style={styles.rowName} numberOfLines={1}>
        {entry.name}
      </Text>
      {/* Grouped, because the three are one answer rather than three switches — the row
          has no visible label of its own, so the dish name has to be the group's. */}
      <View
        style={styles.pills}
        accessibilityRole="radiogroup"
        accessibilityLabel={`When did you last make ${entry.name}?`}
      >
        {LAST_COOKED_OPTIONS.map((option) => (
          <PillToggle
            key={option.value}
            label={option.label}
            selected={bucket === option.value}
            onPress={() => onSet(option.value)}
          />
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------

/**
 * The action bar, pinned rather than at the end of the list. Sixty-eight rows is a long
 * way to scroll to find out how to leave, and both steps are ones you should be able to
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
  eyebrow: {
    ...text.eyebrow,
  },
  title: {
    ...text.title,
    marginTop: 3,
  },
  blurb: {
    ...text.bodySmall,
    paddingBottom: space.lg,
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
  sectionLabelPlain: {
    ...text.sectionHeading,
    paddingTop: space.xl,
    paddingBottom: space.md,
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
  estimateRow: {
    gap: space.md,
    paddingVertical: 11,
    borderBottomWidth: border.hairline,
    borderBottomColor: colors.lineSoft,
  },
  pills: {
    flexDirection: 'row' as const,
    gap: space.sm,
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
