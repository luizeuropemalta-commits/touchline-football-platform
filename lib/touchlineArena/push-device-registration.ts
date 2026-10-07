"use client";

const INSTALLATION_KEY = "touchline:push-installation-id:v1";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Refusal = "permission-required" | "unsupported" | "subscription-unconfigured";
type RehearsalOptions = Readonly<{
  expectedAccountId: string;
  signal: AbortSignal;
  /** Caller binds the initial account and mounted lifecycle, and aborts when
   * either changes. This guard is an invalidation fence, never authentication. */
  isCurrentAccount: () => boolean;
}>;
type RegistrationResult = { status: Refusal } | { status: "registered"; accountId?: string; installationId?: string };

type DeviceRegistration = Readonly<{
  installationId: string;
  permission: NotificationPermission;
  subscription: PushSubscriptionJSON;
}>;

function installationId(requirePersistence: boolean) {
  const existing = window.localStorage.getItem(INSTALLATION_KEY);
  if (existing && (requirePersistence ? UUID : /^[0-9a-f-]{36}$/i).test(existing)) return existing;
  const next = crypto.randomUUID();
  if (!UUID.test(next)) throw new Error("touchline-device-installation-unavailable");
  window.localStorage.setItem(INSTALLATION_KEY, next);
  if (requirePersistence && window.localStorage.getItem(INSTALLATION_KEY) !== next) {
    throw new Error("touchline-device-installation-unavailable");
  }
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

async function awaitPushPreparation<T>(operation: Promise<T>, signal?: AbortSignal, onTimeout?: () => void): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        abort = () => reject(new Error("touchline-push-registration-aborted"));
        signal?.addEventListener("abort", abort, { once: true });
        if (signal?.aborted) abort();
        timeout = setTimeout(() => {
          onTimeout?.();
          reject(new Error("touchline-push-preparation-timeout"));
        }, 15_000);
      }),
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
    if (abort) signal?.removeEventListener("abort", abort);
  }
}

/**
 * This only registers a device owned by the signed-in user. It never sends a
 * notification. A subscription is created solely after browser permission and
 * a configured public VAPID key are both present.
 */
async function registerDevice(rehearsal?: RehearsalOptions): Promise<RegistrationResult> {
  const check = () => {
    if (rehearsal && (rehearsal.signal.aborted || rehearsal.isCurrentAccount() !== true)) {
      throw new Error("touchline-push-registration-aborted");
    }
  };
  if (rehearsal && (typeof rehearsal.expectedAccountId !== "string" || !UUID.test(rehearsal.expectedAccountId))) {
    throw new Error("touchline-device-account-invalid");
  }
  check();
  if (!("serviceWorker" in navigator) || !("Notification" in window) || !("PushManager" in window)) return { status: "unsupported" };
  if (Notification.permission !== "granted") return { status: "permission-required" };
  const publicKey = touchlinePushIsConfigured();
  if (!publicKey) return { status: "subscription-unconfigured" };
  // Browser preparation promises cannot be aborted and ready may never settle.
  // Bound each await separately: a late result must not continue to subscribe or
  // save after the UI has reported failure. Do not unsubscribe on timeout; an
  // explicit retry can reuse a subscription that the browser completed late.
  const worker = await awaitPushPreparation(navigator.serviceWorker.register("/touchline-push-sw.js", { scope: "/" }), rehearsal?.signal);
  check();
  await awaitPushPreparation(navigator.serviceWorker.ready, rehearsal?.signal);
  check();
  const existing = await awaitPushPreparation(worker.pushManager.getSubscription(), rehearsal?.signal);
  check();
  const requestedKey = urlBase64ToUint8Array(publicKey);
  if (Notification.permission !== "granted") throw new Error("touchline-push-permission-changed");
  const subscription = existing ?? await awaitPushPreparation(worker.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: requestedKey }), rehearsal?.signal);
  check();
  // A subscription may survive a VAPID rotation. Never save an unverifiable
  // binding or silently replace it; the user must explicitly re-register.
  const boundKey = subscription.options?.applicationServerKey;
  const boundBytes = boundKey ? new Uint8Array(boundKey) : null;
  if (!boundBytes || boundBytes.length !== requestedKey.length
    || !boundBytes.every((value, index) => value === requestedKey[index])) {
    throw new Error("touchline-push-re-registration-required");
  }

  const payload: DeviceRegistration = {
    installationId: installationId(Boolean(rehearsal)),
    permission: Notification.permission,
    subscription: subscription.toJSON(),
  };
  check();
  if (Notification.permission !== "granted") throw new Error("touchline-push-permission-changed");
  const controller = new AbortController();
  const cancel = () => controller.abort();
  rehearsal?.signal.addEventListener("abort", cancel, { once: true });
  try {
    check();
    // Bound fetch AND full JSON consumption even if the collaborator ignores
    // abort. The post-await checks prevent late continuations starting a stage.
    const response = await awaitPushPreparation((async () => {
      const response = await fetch("/api/notifications/devices", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(rehearsal ? { "X-Touchline-Expected-Account": rehearsal.expectedAccountId } : {}) },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      check(); controller.signal.throwIfAborted();
      const body: unknown = await response.json().catch(() => null);
      check(); controller.signal.throwIfAborted();
      return { ok: response.ok, body };
    })(), controller.signal, cancel);
    check();
    const receipt = response.body;
    if (!response.ok || !receipt || typeof receipt !== "object" || Array.isArray(receipt)
      || (receipt as Record<string, unknown>).ok !== true
      || (receipt as Record<string, unknown>).delivery !== "not-sent") {
      // A successful HTTP response alone is not proof that this account's device
      // was stored. Preserve the subscription for explicit retry, without sending.
      throw new Error("touchline-device-registration-failed");
    }
    if (rehearsal) {
      const { accountId, installationId: acknowledgedInstallation } = receipt as Record<string, unknown>;
      if (typeof accountId !== "string" || !UUID.test(accountId) || accountId.toLowerCase() !== rehearsal.expectedAccountId.toLowerCase()
        || typeof acknowledgedInstallation !== "string" || !UUID.test(acknowledgedInstallation)
        || acknowledgedInstallation.toLowerCase() !== payload.installationId.toLowerCase()) throw new Error("touchline-device-registration-failed");
      return { status: "registered", accountId, installationId: acknowledgedInstallation };
    }
    return { status: "registered" };
  } finally {
    rehearsal?.signal.removeEventListener("abort", cancel);
    controller.abort();
  }
}

/** Existing game registration API and return strings remain unchanged. */
export async function registerTouchlinePushDevice(): Promise<"registered" | Refusal> {
  return (await registerDevice()).status;
}

/** Explicit rehearsal registration only. No permission prompt, preference write,
 * send or unsubscribe. Cancellation fences this client, not rollback of a save
 * already in flight; uncertainty requires a new explicit attempt and fresh ACK.
 */
export async function registerTouchlinePushDeviceForRehearsal(options: RehearsalOptions): Promise<
  { status: Refusal } | { status: "registered"; accountId: string; installationId: string }
> {
  const result = await registerDevice(options);
  if (options.signal.aborted || options.isCurrentAccount() !== true) throw new Error("touchline-push-registration-aborted");
  if (result.status !== "registered") return result;
  if (!result.accountId || !result.installationId) throw new Error("touchline-device-registration-failed");
  return { status: "registered", accountId: result.accountId, installationId: result.installationId };
}
