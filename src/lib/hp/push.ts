import { deletePushSubscription, savePushSubscription } from "../hp-api";

// Public by design — this is the "who is this app" half of the VAPID pair,
// meant to sit in client code. Its counterpart (VAPID_PRIVATE_KEY) lives only
// as a Supabase edge function secret, never here.
const VAPID_PUBLIC_KEY =
  "BPZisvG5Xe_QxdRCUpmWAnqiU28-_wGmqFwKXutMVXiOjfVvr6ksd20SjBQjc_Z7EeKMj5gYF_xBcb2RV3lpn9E";

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** "granted" | "denied" | "default" (not yet asked), or null if unsupported. */
export function getPushPermission(): NotificationPermission | null {
  return isPushSupported() ? Notification.permission : null;
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replaceAll("-", "+").replaceAll("_", "/");
  const raw = atob(base64Safe);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

async function toSubscriptionKeys(sub: PushSubscription) {
  const json = sub.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!p256dh || !auth) throw new Error("Push subscription is missing its keys.");
  return { endpoint: sub.endpoint, p256dh, authKey: auth };
}

/** Returns the existing subscription if this browser already has one, else null. */
export async function getExistingPushSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.getRegistration("/sw.js");
  if (!registration) return null;
  return registration.pushManager.getSubscription();
}

/**
 * Asks for notification permission (must be called from a user gesture —
 * e.g. a click handler — or the browser silently ignores it) and, if
 * granted, subscribes this browser and saves it against the signed-in
 * account.
 */
export async function enablePushNotifications(): Promise<void> {
  if (!isPushSupported()) throw new Error("Push notifications are not supported here.");

  const registration = await navigator.serviceWorker.register("/sw.js");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission was not granted.");

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }));

  await savePushSubscription(await toSubscriptionKeys(subscription));
}

export async function disablePushNotifications(): Promise<void> {
  const subscription = await getExistingPushSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await deletePushSubscription(endpoint);
}
