export type TouchlinePushPermission = "granted" | "denied" | "default";

export type TouchlineDeviceRegistration = Readonly<{
  installationId: string;
  permission: TouchlinePushPermission;
  subscription: Readonly<{
    endpoint: string;
    keys: Readonly<{ p256dh: string; auth: string }>;
  }> | null;
}>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PERMISSIONS = new Set<TouchlinePushPermission>(["granted", "denied", "default"]);

function isNonBlankString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isHttpsPushEndpoint(value: unknown): value is string {
  if (!isNonBlankString(value) || value.length > 2048 || /\s/.test(value)) return false;
  try {
    const endpoint = new URL(value);
    return endpoint.protocol === "https:" && endpoint.hostname.length > 0;
  } catch {
    return false;
  }
}

/**
 * A browser permission alone never means push is active. A granted device must
 * carry a complete HTTPS PushSubscription; all other permission states must
 * carry no subscription so stale devices cannot be mistaken for deliverable.
 */
export function parseTouchlineDeviceRegistration(value: unknown): TouchlineDeviceRegistration | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const installationId = typeof input.installationId === "string" ? input.installationId.trim() : "";
  const permission = typeof input.permission === "string" ? input.permission : "";
  if (!UUID.test(installationId) || !PERMISSIONS.has(permission as TouchlinePushPermission)) return null;
  if (input.subscription === null && permission !== "granted") {
    return { installationId, permission: permission as TouchlinePushPermission, subscription: null };
  }
  if (permission !== "granted" || !input.subscription || typeof input.subscription !== "object" || Array.isArray(input.subscription)) return null;
  const subscription = input.subscription as Record<string, unknown>;
  const keys = subscription.keys;
  if (!isHttpsPushEndpoint(subscription.endpoint)
    || !keys || typeof keys !== "object" || Array.isArray(keys)
    || !isNonBlankString((keys as Record<string, unknown>).p256dh)
    || !isNonBlankString((keys as Record<string, unknown>).auth)) return null;
  return {
    installationId,
    permission: "granted",
    subscription: {
      endpoint: subscription.endpoint,
      keys: { p256dh: (keys as Record<string, string>).p256dh, auth: (keys as Record<string, string>).auth },
    },
  };
}
