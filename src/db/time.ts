import { addHours, format, parseISO } from 'date-fns';

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

/**
 * The inverse. `parseISO` reads an offset-less string as local time, which is exactly
 * what `toLocalIso` wrote — `new Date(string)` agrees for date-times but silently
 * switches to UTC for a bare `yyyy-MM-dd`, so it is not used here.
 */
export function parseLocalIso(value: string): Date {
  return parseISO(value);
}

/** Local ISO, shifted. Used wherever a lead time or a shelf life produces a timestamp. */
export function localIsoPlusHours(from: Date, hours: number): string {
  return toLocalIso(addHours(from, hours));
}
