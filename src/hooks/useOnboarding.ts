import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { useEffect } from 'react';
import { dishCountQuery, markOnboarded } from '../db/queries/onboarding';
import { settingsQuery } from '../db/queries/settings';
import { isOnboarded, toSettingMap } from '../db/settings';

/**
 * Whether the app has a repertoire yet, and therefore whether onboarding runs.
 *
 * Two facts, both live, because either one alone gets it wrong:
 *
 * - **The marker alone** would re-run onboarding on the author's phone, which has been
 *   carrying the full seed since Phase 1 and has never been asked anything.
 * - **The dish count alone** would re-run it for anyone who deliberately finished with
 *   nothing picked, on every launch, forever. Nagging by construction.
 *
 * Live rather than read once at boot, so the moment `finishOnboarding` commits, the gate
 * flips and the real app renders — the same `useLiveQuery` mechanism every other screen
 * relies on, rather than a second way of knowing the database changed.
 */

export interface OnboardingGate {
  /** True only when the user has never been asked *and* owns nothing. */
  needed: boolean;
  /** False until both reads have landed. Rendering before that would flash a screen. */
  isReady: boolean;
  error: Error | undefined;
}

export function useOnboardingGate(): OnboardingGate {
  const settings = useLiveQuery(settingsQuery());
  const dishes = useLiveQuery(dishCountQuery());

  const isReady = settings.updatedAt !== undefined && dishes.updatedAt !== undefined;
  const marked = isOnboarded(toSettingMap(settings.data ?? []));
  const dishCount = dishes.data?.[0]?.n ?? 0;

  // An install that predates Phase 8 already has a repertoire and was never asked, so the
  // answer is "done" — recorded once rather than re-derived, or deleting every dish some
  // day would bring the flow back out of nowhere. Self-limiting: the write flips `marked`,
  // which is a dependency, so it cannot loop.
  useEffect(() => {
    if (!isReady || marked || dishCount === 0) return;
    markOnboarded();
  }, [isReady, marked, dishCount]);

  return {
    needed: isReady && !marked && dishCount === 0,
    isReady,
    error: settings.error ?? dishes.error,
  };
}
