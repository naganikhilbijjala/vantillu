import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';
import * as schema from './schema';

export const DATABASE_NAME = 'vantillu.db';

/**
 * `enableChangeListener` is what makes `useLiveQuery` re-run on write — without it
 * every screen would need manual invalidation.
 */
export const sqliteDatabase = openDatabaseSync(DATABASE_NAME, {
  enableChangeListener: true,
});

// Off by default in SQLite; `dish_slot` and `cook_event` both depend on the cascade.
sqliteDatabase.execSync('PRAGMA foreign_keys = ON;');

export const db = drizzle(sqliteDatabase, { schema });

export type Database = typeof db;
