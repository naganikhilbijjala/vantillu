import { Link } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DishCard } from '../src/components/DishCard';
import { IntervalGauge } from '../src/components/IntervalGauge';
import { Chip, ReasonChips } from '../src/components/ReasonChip';
import { staleness } from '../src/core/interval';
import { reasons } from '../src/core/scoring';
import type { Candidate, Context } from '../src/core/types';
import {
  border,
  type ColorScheme,
  gauge,
  layout,
  radius,
  space,
  type Theme,
} from '../src/theme/tokens';
import {
  ThemeSchemeProvider,
  useColorSchemeName,
  useTheme,
  useThemedStyles,
} from '../src/theme/useTheme';

/**
 * Phase 3 component gallery. Throwaway — the same components get their real data from
 * `useLiveQuery` in Phase 4, and this screen goes away once Today exists.
 *
 * It exists to check the three shared components against fixed inputs, on device, without
 * needing the right cook history in the database to reach each state. The gauge row is the
 * phase's acceptance criterion: ratios 0.3, 1.0, 1.6, and null.
 *
 * The gallery renders twice: once in the scheme the OS is currently in, then again pinned
 * to the other one. Both palettes are therefore checkable in a single pass, without
 * digging through system settings between looks.
 */

// ---------------------------------------------------------------------------
// Specimens — plain objects, deliberately not read from the database.
// ---------------------------------------------------------------------------

function specimen(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: 'specimen',
    name: 'Specimen',
    role: 'dal',
    slots: ['lunch', 'dinner'],
    effort: 'medium',
    isVeg: true,
    isArchived: false,
    isAlwaysAvailable: false,
    primaryIngredient: 'toor dal',
    prepKind: null,
    prepLabel: null,
    usesLeftoverRice: false,
    season: null,
    daysSince: 7,
    medianInterval: 7,
    lastRating: null,
    createdAt: '2026-01-01T00:00:00',
    ...overrides,
  };
}

const ctx: Context = {
  slot: 'dinner',
  isWeekend: false,
  season: 'monsoon',
  isVegOnlyDay: false,
  livePrepDishIds: ['live-prep', 'expiring-prep'],
  expiringPrepDishIds: ['expiring-prep'],
  hadRiceStapleInLast24h: true,
  recentIngredients: [],
  rolesFilledByBatch: [],
};

/** The four states the gauge has to get right, plus the three edges that hide bugs. */
const GAUGE_CASES = [
  { label: 'ratio 0.3 — not due', daysSince: 3, medianInterval: 10 },
  { label: 'ratio 1.0 — exactly due', daysSince: 10, medianInterval: 10 },
  { label: 'ratio 1.6 — long overdue', daysSince: 16, medianInterval: 10 },
  { label: 'no median — new dish', daysSince: 4, medianInterval: null },
  { label: 'ratio 3.0 — clamps at 1.4', daysSince: 30, medianInterval: 10 },
  { label: 'median 0 — reads as unknown', daysSince: 2, medianInterval: 0 },
  { label: 'never cooked', daysSince: null, medianInterval: null },
];

const CHIP_CASES: { label: string; candidate: Candidate }[] = [
  { label: 'new', candidate: specimen({ medianInterval: null }) },
  { label: 'recent', candidate: specimen({ daysSince: 3, medianInterval: 10 }) },
  { label: 'due', candidate: specimen({ daysSince: 10, medianInterval: 10 }) },
  { label: 'overdue', candidate: specimen({ daysSince: 19, medianInterval: 10 }) },
  { label: 'day singular', candidate: specimen({ daysSince: 1, medianInterval: 10 }) },
  {
    label: 'prep live',
    candidate: specimen({ id: 'live-prep', prepKind: 'batter' }),
  },
  {
    label: 'prep expiring',
    candidate: specimen({ id: 'expiring-prep', prepKind: 'soaked' }),
  },
  {
    label: 'leftover rice + quick',
    candidate: specimen({ effort: 'quick', usesLeftoverRice: true }),
  },
  {
    label: 'capped at three',
    candidate: specimen({
      id: 'expiring-prep',
      effort: 'instant',
      prepKind: 'marinated',
      usesLeftoverRice: true,
      daysSince: 19,
      medianInterval: 10,
    }),
  },
];

const CARD_CASES: {
  candidate: Candidate;
  roleLabel: string;
  minutes: number | null;
  hasRecipe: boolean;
}[] = [
  {
    candidate: specimen({
      id: 'expiring-prep',
      name: 'Dosa',
      role: 'tiffin',
      primaryIngredient: 'urad dal',
      effort: 'quick',
      prepKind: 'batter',
      daysSince: 8,
      medianInterval: 6,
    }),
    roleLabel: 'Tiffin',
    minutes: 20,
    hasRecipe: true,
  },
  {
    candidate: specimen({
      name: 'Ivy gourd fry',
      role: 'dry_curry',
      primaryIngredient: 'ivy gourd',
      daysSince: 34,
      medianInterval: 16,
    }),
    roleLabel: 'Dry curry',
    minutes: 30,
    hasRecipe: false,
  },
  {
    candidate: specimen({
      name: 'Buttermilk stew',
      role: 'gravy',
      primaryIngredient: 'curd',
      effort: 'quick',
      daysSince: 2,
      medianInterval: null,
    }),
    roleLabel: 'Gravy',
    minutes: null,
    hasRecipe: false,
  },
];

// ---------------------------------------------------------------------------

export default function Scratch() {
  const styles = useThemedStyles(makeStyles);
  const scheme = useColorSchemeName();
  const otherScheme: ColorScheme = scheme === 'dark' ? 'light' : 'dark';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView>
        <View style={styles.page}>
          <Link href="/" style={styles.back}>
            ← vantillu
          </Link>
          <Text style={styles.eyebrow}>Phase 3 · {scheme} (following the OS)</Text>
          <Text style={styles.title}>Components</Text>
          <Gallery />
        </View>

        {/* Pinned to the scheme the device is *not* in, so one pass covers both. */}
        <ThemeSchemeProvider scheme={otherScheme}>
          <SchemePreview scheme={otherScheme} />
        </ThemeSchemeProvider>
      </ScrollView>
    </SafeAreaView>
  );
}

/** Renders inside the provider, so every token here resolves to the pinned scheme. */
function SchemePreview({ scheme }: { scheme: ColorScheme }) {
  const styles = useThemedStyles(makeStyles);

  return (
    <View style={[styles.page, styles.preview]}>
      <Text style={styles.eyebrow}>{scheme} · pinned preview</Text>
      <Gallery />
    </View>
  );
}

function Gallery() {
  const styles = useThemedStyles(makeStyles);
  const { text } = useTheme();

  return (
    <View>
      <Text style={styles.heading}>Interval gauge — full width</Text>
      {GAUGE_CASES.map((c) => (
        <View key={c.label} style={styles.gaugeRow}>
          <Text style={styles.caseLabel}>{c.label}</Text>
          {/* The gauge stretches to its container, so a row parent needs a flex box
              around it — the component itself stays direction-agnostic. */}
          <View style={styles.gaugeSlot}>
            <IntervalGauge
              daysSince={c.daysSince}
              medianInterval={c.medianInterval}
              label={c.label}
            />
          </View>
          <Text style={styles.figure}>
            {c.medianInterval ? staleness(c.daysSince, c.medianInterval).toFixed(2) : '—'}
          </Text>
        </View>
      ))}

      <Text style={styles.heading}>Interval gauge — list width</Text>
      <View style={styles.compactRow}>
        {GAUGE_CASES.map((c) => (
          <IntervalGauge
            key={c.label}
            daysSince={c.daysSince}
            medianInterval={c.medianInterval}
            width={gauge.compactWidth}
          />
        ))}
      </View>

      <Text style={styles.heading}>Reason chips</Text>
      {CHIP_CASES.map((c) => (
        <View key={c.label} style={styles.chipRow}>
          <Text style={styles.caseLabel}>{c.label}</Text>
          <ReasonChips reasons={reasons(c.candidate, ctx)} />
        </View>
      ))}

      <Text style={styles.heading}>Chip tones</Text>
      <View style={styles.toneRow}>
        <Chip label="neutral" />
        <Chip label="turmeric" tone="turmeric" />
        <Chip label="gongura" tone="gongura" />
        <Chip label="curry" tone="curry" />
      </View>

      <Text style={styles.heading}>Dish card</Text>
      <View style={styles.cards}>
        {CARD_CASES.map((c) => (
          <DishCard
            key={c.candidate.name}
            name={c.candidate.name}
            roleLabel={c.roleLabel}
            primaryIngredient={c.candidate.primaryIngredient}
            minutes={c.minutes}
            hasRecipe={c.hasRecipe}
            daysSince={c.candidate.daysSince}
            medianInterval={c.candidate.medianInterval}
            reasons={reasons(c.candidate, ctx)}
          />
        ))}
      </View>

      <Text style={styles.heading}>Type scale</Text>
      <Text style={text.title}>Title 25</Text>
      <Text style={text.cardTitle}>Card title 16.5</Text>
      <Text style={text.rowTitle}>Row title 14.5</Text>
      <Text style={text.body}>Body 13.5 — free text recipe, notes, held-back prose.</Text>
      <Text style={text.bodySmall}>Body small 12.5 — supporting copy.</Text>
      <Text style={text.meta}>meta 10.5 mono</Text>
      <Text style={text.statValue}>21</Text>
    </View>
  );
}

const makeStyles = ({ colors, text }: Theme) => ({
  safeArea: {
    flex: 1,
    backgroundColor: colors.steel2,
  },
  page: {
    backgroundColor: colors.steel2,
    paddingHorizontal: layout.screenPaddingH,
    paddingBottom: 40,
  },
  preview: {
    marginTop: space.xxl,
    borderTopWidth: border.thin,
    borderTopColor: colors.line,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingTop: space.xl,
  },
  back: {
    ...text.control,
    paddingVertical: space.md,
  },
  eyebrow: {
    ...text.eyebrow,
  },
  title: {
    ...text.title,
    marginTop: 3,
  },
  heading: {
    ...text.sectionHeading,
    marginTop: space.xxl,
    marginBottom: space.md,
  },
  caseLabel: {
    ...text.control,
    width: 150,
  },
  gaugeRow: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: space.lg,
    marginBottom: 14,
  },
  gaugeSlot: {
    flex: 1,
  },
  compactRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    alignItems: 'center' as const,
    gap: space.lg,
  },
  figure: {
    ...text.figure,
    width: 34,
    textAlign: 'right' as const,
  },
  chipRow: {
    marginBottom: space.sm,
  },
  toneRow: {
    flexDirection: 'row' as const,
    flexWrap: 'wrap' as const,
    gap: 5,
  },
  cards: {
    gap: space.md,
  },
});
