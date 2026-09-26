import { createHash } from "node:crypto";
import { parseTouchlineDeviceRegistration } from "./push-device-contract.ts";

/** Server-side binding only, never an authorisation or an endpoint allowlist.
 * Store privately at enqueue and recompute from the current registration.
 * Preserve opaque endpoint bytes; URL repair must not merge subscriptions.
 */
export function touchlinePushSubscriptionFingerprint(registration: unknown): string | null {
  const parsed = parseTouchlineDeviceRegistration(registration);
  if (!parsed?.subscription || parsed.permission !== "granted") return null;
  const { endpoint, keys } = parsed.subscription;
  return `sha256:${createHash("sha256")
    .update(JSON.stringify(["touchline-push-subscription-v1", endpoint, keys.p256dh, keys.auth]), "utf8")
    .digest("hex")}`;
}
