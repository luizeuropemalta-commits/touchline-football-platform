import webPush from "web-push";
import type { TouchlineDeviceRegistration } from "./push-device-contract.ts";

/** Restrict server egress to supported browser push providers, never arbitrary
 * HTTPS addresses supplied at device registration. Do not follow redirects.
 */
export function isSupportedMatchPushEndpoint(value: string): boolean {
  if (value.length > 2048 || /[\s\\#]/.test(value) || !value.startsWith("https://")) return false;
  try {
    const url = new URL(value);
    if (url.username || url.password || url.port || url.pathname === "/") return false;
    return url.hostname === "fcm.googleapis.com"
      || url.hostname === "updates.push.services.mozilla.com"
      || /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.push\.apple\.com$/.test(url.hostname);
  } catch { return false; }
}

type Input = {
  subscription: NonNullable<TouchlineDeviceRegistration["subscription"]>;
  payload: string;
  vapid: { subject: string; publicKey: string; privateKey: string };
  expiresAt: Date;
  signal: AbortSignal;
};

/** Server transport only; caller must run consent/source/lease policy first.
 * Encryption uses web-push, while fetch supplies abort and redirect control.
 * No environment reads, key generation, retries or automatic activation.
 */
export async function sendMatchWebPush(input: Input, request: typeof fetch = fetch): Promise<"provider_accepted" | "rejected"> {
  const remaining = input.expiresAt.getTime() - Date.now();
  if (input.signal.aborted || !Number.isFinite(remaining) || remaining < 1000
    || !isSupportedMatchPushEndpoint(input.subscription.endpoint)
    || !input.payload || Buffer.byteLength(input.payload, "utf8") > 3072) throw new Error("push-input-invalid");
  const details = webPush.generateRequestDetails(input.subscription, input.payload, {
    vapidDetails: input.vapid, contentEncoding: "aes128gcm",
    TTL: Math.min(300, Math.floor(remaining / 1000)), urgency: "normal",
  });
  const requestRemaining = input.expiresAt.getTime() - Date.now();
  if (input.signal.aborted || requestRemaining < 1000) throw new Error("push-input-invalid");
  details.headers.TTL = String(Math.min(300, Math.floor(requestRemaining / 1000)));
  const signal = AbortSignal.any([input.signal, AbortSignal.timeout(Math.min(15_000, requestRemaining))]);
  const response = await request(details.endpoint, {
    method: "POST", headers: details.headers as Record<string, string>,
    body: new Uint8Array(details.body!), redirect: "error", signal,
  });
  void response.body?.cancel().catch(() => {});
  if (signal.aborted) throw new Error("push-outcome-uncertain");
  if (response.status === 201) return "provider_accepted";
  if (response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status)) return "rejected";
  throw new Error("push-outcome-uncertain");
}
