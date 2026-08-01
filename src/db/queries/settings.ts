import { isNull } from 'drizzle-orm';
import { localDateKey } from '../../core/slots';
import { db } from '../client';
import { setting } from '../schema';
import { SETTING_KEYS, serialisePrepNudgedAt } from '../settings';
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

/**
 * The one thing the notification planner has to remember (SPEC §20.3).
 *
 * Written by a background sync rather than by anything the user does, which is why it is a
 * single JSON row instead of a key per dish: it is rewritten whole every time, and the
 * pruning of dead entries happens in `updateNudgedAt` before it gets here.
 */
export function setPrepNudgedAt(entries: ReadonlyMap<string, Date>): void {
  writeSetting(SETTING_KEYS.prepNudgedAt, serialisePrepNudgedAt(entries));
}
