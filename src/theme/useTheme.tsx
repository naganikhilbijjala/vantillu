import { createContext, type ReactNode, useContext } from 'react';
import {
  type ImageStyle,
  StyleSheet,
  type TextStyle,
  useColorScheme,
  type ViewStyle,
} from 'react-native';
import { buildTheme, type ColorScheme, type Theme } from './tokens';

/**
 * How a screen gets the active theme.
 *
 * The scheme follows the OS and nothing else — there is no in-app light/dark setting, so
 * there is nothing to persist and nothing to add to the Phase 10 export. Should that
 * change, `useColorSchemeName` is the only function that needs to know (SPEC §14).
 *
 * Phase 3 originally shipped without a provider, on the grounds that a context holding one
 * static palette earns nothing. Two schemes changes that: the provider below lets the
 * scratch screen render the dark palette next to the light one without touching the device
 * settings, which is the whole point of building components in isolation.
 */

/** Null means "whatever the OS says", which is the normal case. */
const ForcedSchemeContext = createContext<ColorScheme | null>(null);

/**
 * Pins a subtree to one scheme regardless of the OS setting. Intended for previews and
 * screenshots; app screens should never wrap themselves in this.
 */
export function ThemeSchemeProvider({
  scheme,
  children,
}: {
  scheme: ColorScheme;
  children: ReactNode;
}) {
  return (
    <ForcedSchemeContext.Provider value={scheme}>{children}</ForcedSchemeContext.Provider>
  );
}

export function useColorSchemeName(): ColorScheme {
  const forced = useContext(ForcedSchemeContext);
  const os = useColorScheme();
  // `useColorScheme()` is null until the native module reports in, and on iOS it only ever
  // returns 'dark' when app.json sets `userInterfaceStyle` to automatic. Light is the
  // fallback either way — it is the palette the mockup defines.
  return forced ?? (os === 'dark' ? 'dark' : 'light');
}

export function useTheme(): Theme {
  return buildTheme(useColorSchemeName());
}

type NamedStyles<T> = { [P in keyof T]: ViewStyle | TextStyle | ImageStyle };

/**
 * Per-scheme StyleSheets, built once each and then reused.
 *
 * `StyleSheet.create` cannot run at module scope any more — it would capture one palette
 * forever — but it must not run on every render either, or every style object is a new
 * identity and nothing downstream can memoise. So each factory keeps a small cache: at most
 * two entries, keyed by scheme, and the factory itself is the WeakMap key so a component
 * that unmounts for good takes its cache with it.
 *
 * Define the factory at module scope, outside the component:
 *
 * ```tsx
 * const makeStyles = ({ colors, text }: Theme) => ({ ... });
 * function Card() { const styles = useThemedStyles(makeStyles); }
 * ```
 */
const styleCache = new WeakMap<object, Map<ColorScheme, unknown>>();

export function useThemedStyles<T extends NamedStyles<T>>(
  factory: (theme: Theme) => T & NamedStyles<T>,
): T {
  const theme = useTheme();

  let perScheme = styleCache.get(factory);
  if (!perScheme) {
    perScheme = new Map();
    styleCache.set(factory, perScheme);
  }

  const cached = perScheme.get(theme.scheme) as T | undefined;
  if (cached) return cached;

  const created = StyleSheet.create(factory(theme));
  perScheme.set(theme.scheme, created);
  return created;
}
