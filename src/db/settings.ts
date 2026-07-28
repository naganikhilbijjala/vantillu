import { localDateKey } from '../core/slots';

/**
 * How the `setting` table is read (`docs/SPEC.md` §6).
 *
 * Only the veg-only pair lives here. There is deliberately no theme setting — the scheme
 * follows the OS (§14) — so nothing else has needed a row yet.
 *
 * Both default to *off*. Silently hiding chicken curry on a fresh install would read as a
 * bug rather than a feature, which is why the weekday set starts empty.
 *
 * No `db` import: this half is a pure function of rows already read, which is what lets
 * `buildTodayModel` be exercised outside the app. The reads and writes are in
 * `queries/settings.ts`.
 */

export const SETTING_KEYS = {
  /** JSON array of ISO weekday numbers, 1 = Monday. Configured in settings, not here. */
  vegOnlyWeekdays: 'vegOnlyWeekdays',
  /** A single local date key, or empty for none. The Today screen's one-day override. */
  vegOnlyToday: 'vegOnlyToday',
} as const;

export interface SettingRow {
  key: string;
  value: string;
}

export type SettingMap = ReadonlyMap<string, string>;

export function toSettingMap(rows: readonly SettingRow[]): SettingMap {
  return new Map(rows.map((row) => [row.key, row.value]));
}

/** `getDay()` is 0 = Sunday; ISO is 1 = Monday, 7 = Sunday. */
export function isoWeekday(date: Date): number {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

/**
 * Malformed JSON returns the empty default rather than throwing. A corrupt settings row
 * must not be able to stop the Today screen from rendering.
 */
export function parseVegOnlyWeekdays(raw: string | undefined): number[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (value): value is number => Number.isInteger(value) && value >= 1 && value <= 7,
    );
  } catch {
    return [];
  }
}

export function isVegOnlyToday(settings: SettingMap, now: Date): boolean {
  return settings.get(SETTING_KEYS.vegOnlyToday) === localDateKey(now);
}

/** The weekday set, or the one-day override. Either one is enough. */
export function isVegOnlyDay(settings: SettingMap, now: Date): boolean {
  if (isVegOnlyToday(settings, now)) return true;
  const weekdays = parseVegOnlyWeekdays(settings.get(SETTING_KEYS.vegOnlyWeekdays));
  return weekdays.includes(isoWeekday(now));
}
