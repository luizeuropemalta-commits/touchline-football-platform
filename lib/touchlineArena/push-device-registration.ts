"use client";

const INSTALLATION_KEY = "touchline:push-installation-id:v1";

type DeviceRegistration = Readonly<{
  installationId: string;
  permission: NotificationPermission;
  subscription: PushSubscriptionJSON;
}>;

function installationId() {
  const existing = window.localStorage.getItem(INSTALLATION_KEY);
  if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
  const next = crypto.randomUUID();
  window.localStorage.setItem(INSTALLATION_KEY, next);
  return next;
}

export function touchlinePushIsConfigured() {
  const value = process.env.NEXT_PUBLIC_TOUCHLINE_WEB_PUSH_PUBLIC_KEY?.trim();
  return value && /^[A-Za-z0-9_-]{20,200}$/.test(value) ? value : null;
}

function urlBase64ToUint8Array(value: string) {
  const padded = `${value}${"=".repeat((4 - (value.length % 4)) % 4)}`.replace(/-/g, "+").replace(/_/g, "/");
  const bytes = atob(padded);
  return Uint8Array.from(bytes, (character) => character.charCodeAt(0));
}

async function awaitPushPreparation<T>(operation: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error("touchline-push-preparation-timeout")), 15_000);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

/**
 * This only registers a device owned by the signed-in user. It never sends a
 * notification. A subscription is created solely after browser permission and
 * a configured public VAPID key are both present.
 */
export async function registerTouchlinePushDevice(): Promise<"registered" | "permission-required" | "unsupported" | "subscription-unconfigured"> {
  if (!("serviceWorker" in navigator) || !("Notification" in window) || !("PushManager" in window)) return "unsupported";
  if (Notification.permission !== "granted") return "permission-required";
  const publicKey = touchlinePushIsConfigured();
  if (!publicKey) return "subscription-unconfigured";
  // Browser preparation promises cannot be aborted and ready may never settle.
  // Bound each await separately: a late result must not continue to subscribe or
  // save after the UI has reported failure. Do not unsubscribe on timeout; an
  // explicit retry can reuse a subscription that the browser completed late.
  const worker = await awaitPushPreparation(navigator.serviceWorker.register("/touchline-push-sw.js", { scope: "/" }));
  await awaitPushPreparation(navigator.serviceWorker.ready);
  const existing = await awaitPushPreparation(worker.pushManager.getSubscription());
  const subscription = existing ?? await awaitPushPreparation(worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));

  const payload: DeviceRegistration = {
    installationId: installationId(),
    permission: Notification.permission,
    subscription: subscription.toJSON(),
  };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch("/api/notifications/devices", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const acknowledgement: unknown = await response.json().catch(() => null);
    if (!response.ok || !acknowledgement || typeof acknowledgement !== "object"
      || Array.isArray(acknowledgement)
      || (acknowledgement as Record<string, unknown>).ok !== true
      || (acknowledgement as Record<string, unknown>).delivery !== "not-sent") {
      // A successful HTTP response alone is not proof that this account's device
      // was stored. Preserve the subscription for explicit retry, without sending.
      throw new Error("touchline-device-registration-failed");
    }
    return "registered";
  } finally {
    clearTimeout(timeout);
  }
}
