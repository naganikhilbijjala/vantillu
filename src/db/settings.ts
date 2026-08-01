import { localDateKey } from '../core/slots';
import { parseLocalIso, toLocalIso } from './time';

/**
 * How the `setting` table is read (`docs/SPEC.md` §6, §18.4).
 *
 * The veg-only pair and the onboarding marker. There is deliberately no theme setting —
 * the scheme follows the OS (§14) — so nothing else has needed a row yet.
 *
 * The veg-only pair defaults to *off*. Silently hiding chicken curry on a fresh install
 * would read as a bug rather than a feature, which is why the weekday set starts empty.
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
  /**
   * Local ISO datetime of the moment onboarding stopped being a question. Written when
   * the flow finishes — including when it finishes with nothing picked — and backfilled
   * on an install that predates Phase 8 (SPEC §18.4).
   *
   * A marker rather than a dish count, because "picked nothing" and "has not been asked"
   * look identical in the `dish` table and must not behave the same way.
   */
  onboardedAt: 'onboardedAt',
  /**
   * JSON object of `dishId → local ISO datetime`: when each dish was last scheduled a prep
   * reminder. The only thing the notification planner has to remember, and the reason it
   * can stay a pure function of rows (SPEC §20.3).
   */
  prepNudgedAt: 'prepNudgedAt',
} as const;

export interface SettingRow {
  key: string;
  value: string;
}

export type SettingMap = ReadonlyMap<string, string>;

export function toSettingMap(rows: readonly SettingRow[]): SettingMap {
  return new Map(rows.map((row) => [row.key, row.value]));
}

/**
 * Has the user been past onboarding?
 *
 * Any non-empty value counts. The timestamp is there for the export and for reading the
 * table by hand; nothing branches on what it says, so a value written by an older build
 * still reads as "yes".
 */
export function isOnboarded(settings: SettingMap): boolean {
  return (settings.get(SETTING_KEYS.onboardedAt) ?? '') !== '';
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

/**
 * When each dish was last scheduled a prep reminder (SPEC §20.3).
 *
 * One row holding a small JSON object rather than a row per dish: it is written by a
 * background sync rather than by anything the user does, and a settings table that grows a
 * key per dish would turn every read of it into a scan. Same tolerance for a corrupt value
 * as the veg-only weekdays — an unreadable marker means "never nudged", which errs toward
 * one extra reminder rather than toward silence.
 */
export function parsePrepNudgedAt(raw: string | undefined): Map<string, Date> {
  const out = new Map<string, Date>();
  if (!raw) return out;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
      return out;
    for (const [dishId, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value !== 'string') continue;
      const at = parseLocalIso(value);
      if (!Number.isNaN(at.getTime())) out.set(dishId, at);
    }
  } catch {
    return new Map();
  }
  return out;
}

export function serialisePrepNudgedAt(entries: ReadonlyMap<string, Date>): string {
  const out: Record<string, string> = {};
  for (const [dishId, at] of entries) out[dishId] = toLocalIso(at);
  return JSON.stringify(out);
}
