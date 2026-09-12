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
  const worker = await navigator.serviceWorker.register("/touchline-push-sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  const existing = await worker.pushManager.getSubscription();
  const subscription = existing ?? await worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) });

  const payload: DeviceRegistration = {
    installationId: installationId(),
    permission: Notification.permission,
    subscription: subscription.toJSON(),
  };
  const response = await fetch("/api/notifications/devices", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error("touchline-device-registration-failed");
  return "registered";
}
