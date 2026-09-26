import { ECDH } from "node:crypto";

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

function decodeCanonicalKey(value: unknown, bytes: number): Buffer | null {
  if (typeof value !== "string" || value.length !== Math.ceil(bytes * 4 / 3)
    || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const decoded = Buffer.from(value, "base64url");
  return decoded.length === bytes && decoded.toString("base64url") === value ? decoded : null;
}

function validSubscriptionKeys(value: Record<string, unknown>): boolean {
  // RFC8291: uncompressed P-256 public point and a 16-octet auth secret.
  // Node-only consumers: registration handler and server preference lookup.
  const publicKey = decodeCanonicalKey(value.p256dh, 65);
  if (!publicKey || publicKey[0] !== 4 || !decodeCanonicalKey(value.auth, 16)) return false;
  try {
    // Length/prefix alone cannot prove that the point belongs to the curve.
    ECDH.convertKey(publicKey, "prime256v1");
    return true;
  } catch {
    return false;
  }
}

function isHttpsPushEndpoint(value: unknown): value is string {
  // Reject URL repair and URL credentials before retaining an opaque delivery
  // address. Preserve legitimate path/query tokens exactly as supplied.
  if (!isNonBlankString(value) || value.length > 2048 || /[\s\\#]/.test(value)
    || !/^https:\/\/[^/]/i.test(value)) return false;
  try {
    const endpoint = new URL(value);
    return endpoint.protocol === "https:" && endpoint.hostname.length > 0
      && endpoint.username === "" && endpoint.password === "";
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
    || !validSubscriptionKeys(keys as Record<string, unknown>)) return null;
  return {
    installationId,
    permission: "granted",
    subscription: {
      endpoint: subscription.endpoint,
      keys: { p256dh: (keys as Record<string, string>).p256dh, auth: (keys as Record<string, string>).auth },
    },
  };
}
