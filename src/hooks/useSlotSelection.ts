import { useCallback, useState } from 'react';
import { nextSlotBoundary, slotForDate } from '../core/slots';
import type { Slot } from '../core/types';

/**
 * Which slot the Today screen is answering for: the clock's, unless the user said
 * otherwise (`docs/SPEC.md` §2.2).
 *
 * An override lasts until the next slot boundary and then lapses — asking for lunch at
 * 09:00 should not still be in force at dinner. The expiry is stored as an instant rather
 * than as "the slot it was taken in", which is what makes the evening case right: dinner
 * runs 17:00 through 03:59, so an override taken at 21:00 survives midnight and ends at
 * 04:00 with the slot itself.
 *
 * Deliberately in memory only. There is no `setting` row for it, so nothing to migrate,
 * nothing in the Phase 10 export, and a relaunch simply re-reads the clock — which is what
 * anyone reopening the app hours later would expect anyway.
 */

interface Override {
  slot: Slot;
  /** Epoch ms. The override is spent once `now` reaches it. */
  until: number;
}

export interface SlotSelection {
  /** What the screen is showing. */
  slot: Slot;
  /** What the clock says, regardless of the override. Never `snack`. */
  autoSlot: Slot;
  isOverridden: boolean;
  selectSlot: (slot: Slot) => void;
}

export function useSlotSelection(now: Date): SlotSelection {
  const [override, setOverride] = useState<Override | null>(null);
  const autoSlot = slotForDate(now);

  // Derived, not cleared by an effect: a lapsed override is simply not read. Letting the
  // stale value sit in state keeps this render pure and costs one comparison.
  const active = override !== null && now.getTime() < override.until ? override : null;

  const selectSlot = useCallback((slot: Slot) => {
    const current = new Date();
    // Choosing the slot the clock is already in means "follow the clock again", so the
    // override is dropped rather than pinned to the same value.
    setOverride(
      slot === slotForDate(current)
        ? null
        : { slot, until: nextSlotBoundary(current).getTime() },
    );
  }, []);

  return {
    slot: active?.slot ?? autoSlot,
    autoSlot,
    isOverridden: active !== null,
    selectSlot,
  };
}
