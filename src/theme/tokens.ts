import { Platform, StyleSheet, type TextStyle, type ViewStyle } from 'react-native';

/**
 * Design tokens, derived from `docs/vantillu-mockup.html`.
 *
 * Brushed-steel neutrals with three accents pulled from food — turmeric, gongura red,
 * curry green. Deliberately not warm cream and terracotta.
 *
 * Two schemes, one set of semantic names. The mockup is light-only, so the dark palette is
 * *designed* rather than transcribed: it keeps the same green-tinted steel hue family, and
 * the three accents are brightened, because the light values are too dark to read against
 * a dark surface (SPEC §14).
 *
 * No React in this file — see `useTheme.ts` for the hooks that resolve a scheme and build
 * scheme-aware StyleSheets.
 *
 * Web `em` letter-spacing does not survive the port — React Native measures
 * `letterSpacing` in points, so every value below is the mockup's em figure multiplied by
 * its own font size.
 */

export type ColorScheme = 'light' | 'dark';

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

/**
 * Every colour the app is allowed to use, named by *role* rather than by appearance.
 *
 * The three `steel` values are surfaces ordered by prominence, not by brightness:
 * `steel2` is the screen, `steel1` sits on top of it, `steel0` is the contrast fill behind
 * a neutral chip. In light they run light → lighter; in dark they run dark → lighter. Pick
 * one by what it is for, never by how bright it looks in the scheme you happen to be in.
 */
export interface Palette {
  /** Contrast fill: neutral chips, the insights bars. */
  steel0: string;
  /** Raised surface: cards, stat tiles, the tab bar. */
  steel1: string;
  /** The screen itself. */
  steel2: string;
  /**
   * A raised surface while pressed — one step brighter than `steel1` in *both* schemes.
   * It needs its own role because "brighter" is `steel2` in light and `steel0` in dark, so
   * no single member of the ordered triple expresses it.
   */
  steelPressed: string;

  /** Stronger divider, and the dashed outline of an empty state. */
  line: string;
  /** Default divider and card border. */
  lineSoft: string;

  /** Primary text, and the fill of a selected control. */
  ink: string;
  /** Secondary text. */
  ink2: string;
  /** Tertiary text: eyebrows, metadata, the "due" hairline. */
  ink3: string;
  /** Text drawn *on* `ink` — a selected slot button, the FAB glyph. */
  onInk: string;

  /** Not due yet, and the quick-effort chip. */
  turmeric: string;
  turmericBg: string;
  turmericInk: string;

  /** Past due. */
  gongura: string;
  gonguraBg: string;
  gonguraInk: string;

  /** Prep is alive, leftover rice — the "something is ready for you" accent. */
  curry: string;
  curryBg: string;
  curryInk: string;
}

/** Transcribed from the mockup's CSS custom properties. */
const light: Palette = {
  steel0: '#E4E8E7',
  steel1: '#F6F8F7',
  steel2: '#FBFCFC',
  steelPressed: '#FBFCFC',

  line: '#CBD2D0',
  lineSoft: '#DDE3E1',

  ink: '#151B19',
  ink2: '#5A6663',
  ink3: '#8C9794',
  onInk: '#FBFCFC',

  turmeric: '#BE8E17',
  turmericBg: '#F7EED6',
  turmericInk: '#6E520A',

  gongura: '#A32E1C',
  gonguraBg: '#F8E5E1',
  gonguraInk: '#A32E1C',

  curry: '#33604A',
  curryBg: '#DFEBE3',
  curryInk: '#244634',
};

/**
 * The same roles after dark. Not in the mockup — designed here, so it wants an eye on a
 * real screen before it is trusted.
 *
 * Two rules held it together. Surfaces get *lighter* as they rise, which is the inverse of
 * light mode but keeps a chip standing out from the card it sits on. And each accent is
 * split in two: a brightened graphic value for gauge fills and dots, plus a
 * low-saturation `Bg` and a high-lightness `Ink` for chips, since a chip that reuses the
 * graphic value as text on a dark tint fails contrast outright.
 */
const dark: Palette = {
  steel0: '#262E2B',
  steel1: '#1B211F',
  steel2: '#131817',
  steelPressed: '#262E2B',

  line: '#3D4744',
  lineSoft: '#2C3432',

  ink: '#E8EDEB',
  ink2: '#A8B3B0',
  ink3: '#7E8987',
  onInk: '#131817',

  turmeric: '#D9A62A',
  turmericBg: '#362B10',
  turmericInk: '#E8C46A',

  gongura: '#D9563C',
  gonguraBg: '#3A1C16',
  gonguraInk: '#EE9C8B',

  curry: '#5FA37E',
  curryBg: '#173023',
  curryInk: '#8FCFAA',
};

export const palettes: Record<ColorScheme, Palette> = { light, dark };

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

export type TextStyles = {
  /** Screen title: "What's for breakfast?" */
  title: TextStyle;
  /** Mono, uppercase, above a title. */
  eyebrow: TextStyle;
  /** Section heading inside a screen — same treatment as an eyebrow. */
  sectionHeading: TextStyle;
  /** Dish name on a card. */
  cardTitle: TextStyle;
  /** Dish name in a list row. */
  rowTitle: TextStyle;
  /** Mono metadata under a name: role · ingredient. */
  meta: TextStyle;
  /** Mono figure: minutes on a card, days in a list row. */
  figure: TextStyle;
  /** Large mono number in a stat tile. */
  statValue: TextStyle;
  /** Recipe text, notes, held-back prose. */
  body: TextStyle;
  /** Supporting copy: empty states, the held-back explainer. */
  bodySmall: TextStyle;
  /** Colour is supplied by the chip's tone. */
  chip: TextStyle;
  /** Control labels: slot buttons, role filters, secondary buttons. */
  control: TextStyle;
};

/**
 * The five sizes the mockup actually uses. Fractional sizes are intentional — they come
 * straight from the mockup, and Android renders type ~1px larger than iOS at the same
 * `fontSize`, so nothing here is pixel-tuned to one platform.
 *
 * Sizes and spacing are scheme-independent; only the colours change.
 */
export function createTextStyles(colors: Palette): TextStyles {
  return {
    title: {
      fontFamily: fonts.sansSemiBold,
      fontSize: 25,
      lineHeight: 28,
      letterSpacing: -0.5,
      color: colors.ink,
    },
    eyebrow: {
      fontFamily: fonts.mono,
      fontSize: 10.5,
      letterSpacing: 0.95,
      textTransform: 'uppercase',
      color: colors.ink3,
    },
    sectionHeading: {
      fontFamily: fonts.mono,
      fontSize: 10.5,
      letterSpacing: 0.95,
      textTransform: 'uppercase',
      color: colors.ink3,
    },
    cardTitle: {
      fontFamily: fonts.sansMedium,
      fontSize: 16.5,
      letterSpacing: -0.17,
      color: colors.ink,
    },
    rowTitle: {
      fontFamily: fonts.sansMedium,
      fontSize: 14.5,
      color: colors.ink,
    },
    meta: {
      fontFamily: fonts.mono,
      fontSize: 10.5,
      letterSpacing: 0.21,
      color: colors.ink3,
    },
    figure: {
      fontFamily: fonts.mono,
      fontSize: 11.5,
      color: colors.ink2,
    },
    statValue: {
      fontFamily: fonts.mono,
      fontSize: 21,
      letterSpacing: -0.42,
      color: colors.ink,
    },
    body: {
      fontFamily: fonts.sans,
      fontSize: 13.5,
      lineHeight: 22,
      color: colors.ink,
    },
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
    control: {
      fontFamily: fonts.sans,
      fontSize: 12.5,
      color: colors.ink2,
    },
  };
}

// ---------------------------------------------------------------------------
// Space, radius, borders — no colour, so no scheme
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

export type Elevation = {
  /** Floats above content: the FAB, the log sheet. */
  float: ViewStyle;
};

/**
 * Never write a bare `elevation` (Android-only) or `shadow*` (iOS-only) — one platform
 * silently gets nothing. Everything that needs depth uses a token from here (hard rule 8).
 *
 * Cards are deliberately absent: they read as raised through a border and a surface one
 * step lighter, which works in both schemes and does not blur at 3px. That matters more
 * after dark, where a shadow against a near-black background is nearly invisible and
 * surface lightness is doing all the work anyway.
 */
export function createElevation(scheme: ColorScheme): Elevation {
  return {
    float: Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 6 },
        // A shadow has less to work with on a dark surface, so it leans harder.
        shadowOpacity: scheme === 'dark' ? 0.5 : 0.22,
        shadowRadius: 12,
      },
      default: { elevation: 6 },
    }) as ViewStyle,
  };
}

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

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------

/** Everything that depends on the active scheme, resolved once per scheme. */
export interface Theme {
  scheme: ColorScheme;
  colors: Palette;
  text: TextStyles;
  elevation: Elevation;
}

const themes = new Map<ColorScheme, Theme>();

/** Memoised: two schemes exist, so each theme is built at most once per app run. */
export function buildTheme(scheme: ColorScheme): Theme {
  const existing = themes.get(scheme);
  if (existing) return existing;

  const colors = palettes[scheme];
  const theme: Theme = {
    scheme,
    colors,
    text: createTextStyles(colors),
    elevation: createElevation(scheme),
  };
  themes.set(scheme, theme);
  return theme;
}
