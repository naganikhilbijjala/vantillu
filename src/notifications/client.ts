import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { PlannedNotification } from '../db/prepModel';

/**
 * The only module that talks to the notification system.
 *
 * Everything about *what* to say and *when* is decided in `src/db/prepModel.ts`, which is
 * pure and tested in Node. What is left here is the mechanism: permission, the Android
 * channel, and turning a list of planned notifications into the set the OS is holding.
 *
 * **Permission is never requested from here on its own initiative.** The scheduler only
 * ever schedules against a permission that has already been granted, and the grant is
 * asked for from a tap — starting a dish's prep — because that is the first moment the app
 * has anything to say and the first moment the request explains itself (`docs/SPEC.md`
 * §20.5). A cold permission dialog on launch is how an app gets denied forever.
 *
 * Local only. There is no push token, no server, and nothing leaves the device (hard rule 5).
 */

/** Android groups notifications by channel, and a channel is required to post at all. */
export const PREP_CHANNEL_ID = 'prep';

let configured = false;

/**
 * Idempotent: the handler and the channel are process-wide, and the hook that calls this
 * remounts whenever the root layout does.
 */
export async function configureNotifications(): Promise<void> {
  if (configured) return;
  configured = true;

  // Without a handler, a notification that arrives while the app is open is swallowed —
  // which for a reminder to go and soak something is precisely when it is most useful.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    // `DEFAULT` rather than `HIGH`: this is a nudge about lentils, so it belongs in the
    // shade rather than on top of whatever the phone was doing.
    await Notifications.setNotificationChannelAsync(PREP_CHANNEL_ID, {
      name: 'Prep reminders',
      description: 'Soak, grind or marinate ahead of a dish you are due to cook.',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
}

// ---------------------------------------------------------------------------
// Permission, as a tiny store
// ---------------------------------------------------------------------------

/**
 * `null` until asked, so a screen can tell "not granted" from "not looked yet" and avoid
 * rendering an offer to enable something that is already on.
 */
let granted: boolean | null = null;
const listeners = new Set<() => void>();

function publish(next: boolean): void {
  if (granted === next) return;
  granted = next;
  for (const listener of listeners) listener();
}

export function subscribeToPermission(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function permissionSnapshot(): boolean | null {
  return granted;
}

/** Reads the current state without prompting. Safe to call on any render path. */
export async function refreshPermission(): Promise<boolean> {
  const { granted: ok } = await Notifications.getPermissionsAsync();
  publish(ok);
  return ok;
}

/**
 * Prompts, once. Android 13+ needs `POST_NOTIFICATIONS` at runtime and iOS needs an
 * explicit request; `requestPermissionsAsync` covers both, and both platforms silently
 * return the existing answer rather than re-prompting once the user has decided.
 */
export async function requestPermission(): Promise<boolean> {
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) {
    publish(true);
    return true;
  }
  const { granted: ok } = await Notifications.requestPermissionsAsync();
  publish(ok);
  return ok;
}

// ---------------------------------------------------------------------------
// Syncing the plan
// ---------------------------------------------------------------------------

export interface SyncResult {
  scheduled: number;
  cancelled: number;
}

/**
 * Make the OS hold exactly the notifications in `planned`, and no others of ours.
 *
 * A set difference on identifiers rather than a cancel-all-and-reschedule, because
 * cancelling and re-adding an unchanged reminder every time the app opens is how a
 * notification that was about to fire gets dropped. The ids encode the moment they fire
 * (see `PlannedNotification`), so a plan whose timing changed produces a different id and
 * the difference falls out on its own.
 *
 * `ownedPrefixes` is what makes this safe to run beside anything else that ever schedules:
 * only identifiers the planner minted are eligible for cancellation.
 */
export async function syncScheduled(
  planned: readonly PlannedNotification[],
  ownedPrefixes: readonly string[],
  now: Date = new Date(),
): Promise<SyncResult> {
  await configureNotifications();

  const existing = await Notifications.getAllScheduledNotificationsAsync();
  const ours = existing
    .map((request) => request.identifier)
    .filter((id) => ownedPrefixes.some((prefix) => id.startsWith(`${prefix}:`)));

  // A moment that has already passed would fire immediately, which is the one thing worse
  // than not firing: a reminder to soak something for a meal that is already over.
  const wanted = planned.filter((item) => item.fireAt > now);
  const wantedIds = new Set(wanted.map((item) => item.id));
  const held = new Set(ours);

  let cancelled = 0;
  for (const id of ours) {
    if (wantedIds.has(id)) continue;
    await Notifications.cancelScheduledNotificationAsync(id);
    cancelled += 1;
  }

  let scheduled = 0;
  for (const item of wanted) {
    if (held.has(item.id)) continue;
    await Notifications.scheduleNotificationAsync({
      identifier: item.id,
      content: { title: item.title, body: item.body },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: item.fireAt,
        channelId: PREP_CHANNEL_ID,
      },
    });
    scheduled += 1;
  }

  return { scheduled, cancelled };
}

/** Everything currently pending, for dev tools. */
export async function listScheduled(): Promise<{ id: string; title: string | null }[]> {
  const existing = await Notifications.getAllScheduledNotificationsAsync();
  return existing.map((request) => ({
    id: request.identifier,
    title: request.content.title ?? null,
  }));
}

/** Dev tools: prove delivery works without waiting for an evening. */
export async function scheduleTestNotification(inSeconds = 10): Promise<void> {
  await configureNotifications();
  await Notifications.scheduleNotificationAsync({
    identifier: `prep-test:${inSeconds}`,
    content: {
      title: 'Start the soak for Rajma',
      body: 'Last cooked 14 days ago. Soak overnight.',
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: inSeconds,
      repeats: false,
      channelId: PREP_CHANNEL_ID,
    },
  });
}
