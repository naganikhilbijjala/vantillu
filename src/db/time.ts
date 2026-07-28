import { format } from 'date-fns';

/**
 * Local ISO datetime — `2026-07-26T08:14:00`, no timezone suffix.
 *
 * Deliberately not `Date.toISOString()`, which converts to UTC. This app has one user
 * in one timezone and every question it answers is about their local day, so storing
 * local time keeps "what did I cook this morning" honest (`docs/SPEC.md` §2.1).
 *
 * Lives in `src/db/` rather than `src/core/` because it reads the clock — `src/core/`
 * stays pure and takes dates as arguments.
 */
export const LOCAL_ISO_FORMAT = "yyyy-MM-dd'T'HH:mm:ss";

export function toLocalIso(date: Date): string {
  return format(date, LOCAL_ISO_FORMAT);
}

export function nowLocalIso(): string {
  return toLocalIso(new Date());
}
