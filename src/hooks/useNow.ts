import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/**
 * A coarse clock.
 *
 * The Today screen is a function of the current time in three ways — which slot it is,
 * how many days since each dish, and which prep is still alive — so something has to make
 * the passage of time observable. A minute is fine granularity for all three, and the
 * screen renders the same tree from one minute to the next unless a boundary was crossed.
 *
 * The `AppState` listener is the part that matters. A phone left on the counter overnight
 * would otherwise wake to yesterday's slot and yesterday's day count, and the interval
 * alone does not fire reliably while an app is backgrounded.
 */

export const CLOCK_TICK_MS = 60_000;

export function useNow(intervalMs: number = CLOCK_TICK_MS): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = () => setNow(new Date());
    const interval = setInterval(tick, intervalMs);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') tick();
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [intervalMs]);

  return now;
}
