import { useCallback, useSyncExternalStore } from 'react';
import {
  permissionSnapshot,
  refreshPermission,
  requestPermission,
  subscribeToPermission,
} from '../notifications/client';

/**
 * Whether the app may post a notification, as something React can render against.
 *
 * A store rather than per-component state, because two places care and they must not
 * disagree: the dish detail screen, which asks for the permission when prep is started,
 * and the background scheduler, which has to start working the moment it is granted
 * without waiting for a remount.
 *
 * `null` means "not looked yet", which is distinct from "denied" — a screen that treated
 * them alike would flash an offer to enable notifications at someone who already has them.
 */
export function useNotificationPermission(): boolean | null {
  return useSyncExternalStore(subscribeToPermission, permissionSnapshot);
}

export interface NotificationPermissionRequest {
  granted: boolean | null;
  /** Prompts if it has not been decided, then resolves to the answer. */
  request: () => Promise<boolean>;
  refresh: () => Promise<boolean>;
}

export function useRequestNotificationPermission(): NotificationPermissionRequest {
  return {
    granted: useNotificationPermission(),
    request: useCallback(() => requestPermission(), []),
    refresh: useCallback(() => refreshPermission(), []),
  };
}
