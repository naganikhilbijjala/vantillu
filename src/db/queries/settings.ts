import { isNull } from 'drizzle-orm';
import { localDateKey } from '../../core/slots';
import { db } from '../client';
import { setting } from '../schema';
import { SETTING_KEYS } from '../settings';
import { nowLocalIso } from '../time';

/** Reads and writes against the `setting` table. How the values are *interpreted* is in
 *  `src/db/settings.ts`, which stays free of a `db` import. */

export function settingsQuery() {
  return db
    .select({ key: setting.key, value: setting.value })
    .from(setting)
    .where(isNull(setting.deletedAt));
}

function writeSetting(key: string, value: string): void {
  const now = nowLocalIso();
  db.insert(setting)
    .values({ key, value, createdAt: now, updatedAt: now, deletedAt: null })
    .onConflictDoUpdate({
      target: setting.key,
      set: { value, updatedAt: now, deletedAt: null },
    })
    .run();
}

/**
 * Turning the override off writes an empty string rather than deleting the row: the
 * comparison in `isVegOnlyToday` is against today's key, so an empty value reads as off
 * and the row keeps its `updatedAt` for the eventual export.
 */
export function setVegOnlyToday(on: boolean, now: Date): void {
  writeSetting(SETTING_KEYS.vegOnlyToday, on ? localDateKey(now) : '');
}
