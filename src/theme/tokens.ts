import { Platform, StyleSheet, type TextStyle, type ViewStyle } from 'react-native';

/**
 * Design tokens, derived from `docs/vantillu-mockup.html`.
 *
 * Brushed-steel neutrals with three accents pulled from food — turmeric, gongura red,
 * curry green. Deliberately not warm cream and terracotta.
 *
 * There is no theme provider and no dark palette: SPEC §12 cuts dark mode, so the theme
 * is a single static light palette and a plain module beats a React context that would
 * only ever hold one value. Screens import the tokens they need directly.
 *
 * Web `em` letter-spacing does not survive the port — React Native measures
 * `letterSpacing` in points, so every value below is the mockup's em figure multiplied by
 * its own font size.
 */

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

export const colors = {
  /** App background, and the fill behind a neutral chip. */
  steel0: '#E4E8E7',
  /** Raised surface: cards, stat tiles, the tab bar. */
  steel1: '#F6F8F7',
  /** Screen surface — the lightest neutral, and the colour of text on ink. */
  steel2: '#FBFCFC',

  line: '#CBD2D0',
  lineSoft: '#DDE3E1',

  /** Primary text, and the fill of pressed/selected controls. */
  ink: '#151B19',
  /** Secondary text. */
  ink2: '#5A6663',
  /** Tertiary text: eyebrows, metadata, the "due" hairline. */
  ink3: '#8C9794',

  /** Not due yet, and the quick-effort chip. */
  turmeric: '#BE8E17',
  turmericBg: '#F7EED6',
  turmericInk: '#6E520A',

  /** Past due. */
  gongura: '#A32E1C',
  gonguraBg: '#F8E5E1',
  gonguraInk: '#A32E1C',

  /** Prep is alive, leftover rice — the "something is ready for you" accent. */
  curry: '#33604A',
  curryBg: '#DFEBE3',
  curryInk: '#244634',
} as const;

// ---------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------

/**
 * Custom fonts have to be addressed by family name per weight — `fontWeight` on a loaded
 * TTF is unreliable on Android, which synthesises rather than swapping the face. These
 * strings must match the keys passed to `useFonts` in `app/_layout.tsx`.
 */
export const fonts = {
  sans: 'FamiljenGrotesk_400Regular',
  sansMedium: 'FamiljenGrotesk_500Medium',
  sansSemiBold: 'FamiljenGrotesk_600SemiBold',
  mono: 'DMMono_400Regular',
  monoMedium: 'DMMono_500Medium',
} as const;

/**
 * The five sizes the mockup actually uses. Fractional sizes are intentional — they come
 * straight from the mockup, and Android renders type ~1px larger than iOS at the same
 * `fontSize`, so nothing here is pixel-tuned to one platform.
 */
export const text = {
  /** Screen title: "What's for breakfast?" */
  title: {
    fontFamily: fonts.sansSemiBold,
    fontSize: 25,
    lineHeight: 28,
    letterSpacing: -0.5,
    color: colors.ink,
  },
  /** Mono, uppercase, above a title or a section. */
  eyebrow: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    letterSpacing: 0.95,
    textTransform: 'uppercase',
    color: colors.ink3,
  },
  /** Section heading inside a screen — same treatment as an eyebrow. */
  sectionHeading: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    letterSpacing: 0.95,
    textTransform: 'uppercase',
    color: colors.ink3,
  },
  /** Dish name on a card. */
  cardTitle: {
    fontFamily: fonts.sansMedium,
    fontSize: 16.5,
    letterSpacing: -0.17,
    color: colors.ink,
  },
  /** Dish name in a list row. */
  rowTitle: {
    fontFamily: fonts.sansMedium,
    fontSize: 14.5,
    color: colors.ink,
  },
  /** Mono metadata under a name: role · ingredient. */
  meta: {
    fontFamily: fonts.mono,
    fontSize: 10.5,
    letterSpacing: 0.21,
    color: colors.ink3,
  },
  /** Mono figure: minutes on a card, days in a list row. */
  figure: {
    fontFamily: fonts.mono,
    fontSize: 11.5,
    color: colors.ink2,
  },
  /** Large mono number in a stat tile. */
  statValue: {
    fontFamily: fonts.mono,
    fontSize: 21,
    letterSpacing: -0.42,
    color: colors.ink,
  },
  /** Recipe text, notes, held-back prose. */
  body: {
    fontFamily: fonts.sans,
    fontSize: 13.5,
    lineHeight: 22,
    color: colors.ink,
  },
  /** Supporting copy: empty states, the held-back explainer. */
  bodySmall: {
    fontFamily: fonts.sans,
    fontSize: 12.5,
    lineHeight: 20,
    color: colors.ink2,
  },
  chip: {
    fontFamily: fonts.sans,
    fontSize: 11,
  },
  /** Control labels: slot buttons, role filters, secondary buttons. */
  control: {
    fontFamily: fonts.sans,
    fontSize: 12.5,
    color: colors.ink2,
  },
} satisfies Record<string, TextStyle>;

// ---------------------------------------------------------------------------
// Space, radius, borders
// ---------------------------------------------------------------------------

export const space = {
  xs: 4,
  sm: 6,
  md: 9,
  lg: 13,
  xl: 20,
  xxl: 26,
} as const;

export const radius = {
  /** Small controls: slot buttons, text inputs. */
  control: 7,
  button: 8,
  tile: 9,
  card: 11,
  sheet: 18,
  /** Anything larger than the tallest pill renders as a capsule. */
  pill: 999,
} as const;

export const border = {
  hairline: StyleSheet.hairlineWidth,
  thin: 1,
} as const;

export const layout = {
  /** Every screen's horizontal gutter. */
  screenPaddingH: 20,
  /** Android and iOS both want 44+ for a comfortable tap. */
  minTouchTarget: 44,
} as const;

// ---------------------------------------------------------------------------
// Depth
// ---------------------------------------------------------------------------

/**
 * Never write a bare `elevation` (Android-only) or `shadow*` (iOS-only) — one platform
 * silently gets nothing. Everything that needs depth uses a token from here (hard rule 8).
 *
 * Cards are deliberately absent: they read as raised through a border and a lighter fill,
 * which is stable across both platforms and does not blur at 3px.
 */
export const elevation = {
  /** Floats above content: the FAB, the log sheet. */
  float: Platform.select({
    ios: {
      shadowColor: colors.ink,
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.22,
      shadowRadius: 12,
    },
    default: { elevation: 6 },
  }) as ViewStyle,
} satisfies Record<string, ViewStyle>;

// ---------------------------------------------------------------------------
// Gauge
// ---------------------------------------------------------------------------

/**
 * Gauge geometry (SPEC §8). The two *ratios* — the 1.4 clamp and the 71.4 % due mark —
 * live in `src/core/interval.ts` because they are scoring maths and unit tested there.
 * What is left here is pure appearance.
 */
export const gauge = {
  height: 3,
  trackRadius: 2,
  /** Width in a dishes-list row. On a card the gauge is full width. */
  compactWidth: 56,
  /** The "due" hairline. */
  markerWidth: 1,
  /** How far the marker stands out above and below the track. */
  markerOverhang: 3,
} as const;
