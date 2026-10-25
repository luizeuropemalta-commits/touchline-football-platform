import { evaluateNotificationQuietHours } from "./notification-quiet-hours.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const row = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

export type FixtureAlertStatusObservation = Readonly<{
  accountId: string; fixtureId: string; installationId: string | null;
  subscribed: boolean;
  configuration: "configured" | "unconfigured";
  device: "not-requested" | "missing" | "registered" | "invalid";
  preference: "consent-required" | "paused" | "enabled" | "quiet-hours" | "unconfirmed";
  // Configuration and persisted registration never prove browser possession,
  // worker health, current source eligibility or actual physical receipt.
  operational: "unknown"; delivery: "unconfirmed"; active: false;
}>;

export function fixtureAlertPreferenceStatus(value: unknown, now: Date): FixtureAlertStatusObservation["preference"] {
  if (value === null) return "consent-required";
  if (!row(value) || !row(value.settings) || !row(value.channels)) return "unconfirmed";
  if (value.frequency === "paused") return "paused";
  const consent = typeof value.explicit_consent_at === "string" ? Date.parse(value.explicit_consent_at) : NaN;
  if (!Number.isFinite(now.getTime())) return "unconfirmed";
  if (!Number.isFinite(consent) || consent > now.getTime()
    || value.channels.push !== true || value.settings.goalsAndEvents !== true || value.frequency !== "realtime") return "consent-required";
  const quiet = evaluateNotificationQuietHours(value.quiet_hours, now);
  return quiet === "invalid" ? "unconfirmed" : quiet === "quiet" ? "quiet-hours" : "enabled";
}

export type FixtureAlertStatusDependencies = Readonly<{
  enabled: boolean;
  actor: (signal: AbortSignal) => Promise<{ id: string; allowed: boolean } | null>;
  resolveFixture: (providerId: string, signal: AbortSignal) => Promise<string | null>;
  observe: (accountId: string, canonicalFixtureId: string, installationId: string | null, signal: AbortSignal) => Promise<{
    subscribed: boolean; configured: boolean; device: FixtureAlertStatusObservation["device"]; preferences: unknown;
  }>;
  now?: () => Date;
}>;

/** GET only, bounded and observational. Dependencies cannot request writes or
 * sends. Expected account/installation are conditions, never owner selectors. */
export async function handleFixtureAlertStatus(request: Request, fixtureId: string, deps: FixtureAlertStatusDependencies): Promise<Response> {
  const headers = { "Cache-Control": "private, no-store", "CDN-Cache-Control": "no-store", "Vercel-CDN-Cache-Control": "no-store",
    Vary: "Cookie, X-Touchline-Expected-Account, X-Touchline-Installation", Allow: "GET" };
  const fail = (status: number, error: string) => Response.json({ ok: false, error }, { status, headers });
  if (request.method !== "GET") return fail(405, "METHOD_NOT_ALLOWED");
  if (request.headers.get("sec-fetch-site") === "cross-site") return fail(403, "INVALID_ORIGIN");
  if (!/^[1-9]\d{0,14}$/.test(fixtureId)) return fail(400, "INVALID_FIXTURE");
  const expectedAccount = request.headers.get("X-Touchline-Expected-Account");
  const installation = request.headers.get("X-Touchline-Installation");
  if (!expectedAccount || !UUID.test(expectedAccount) || (installation !== null && !UUID.test(installation))) return fail(400, "INVALID_CONTEXT");
  if (!deps.enabled) return fail(503, "ALERTS_NOT_ENABLED");
  const controller = new AbortController();
  const cancel = () => controller.abort();
  request.signal.addEventListener("abort", cancel, { once: true });
  if (request.signal.aborted) cancel();
  const timer = setTimeout(cancel, 8_000);
  async function bounded<T>(operation: () => Promise<T>): Promise<T> {
    controller.signal.throwIfAborted();
    let listener: (() => void) | undefined;
    try {
      const value = await Promise.race([operation(), new Promise<never>((_resolve, reject) => {
        listener = () => reject(new Error("observation-aborted"));
        controller.signal.addEventListener("abort", listener, { once: true });
        if (controller.signal.aborted) listener();
      })]);
      controller.signal.throwIfAborted();
      return value;
    } finally { if (listener) controller.signal.removeEventListener("abort", listener); }
  }
  try {
    const actor = await bounded(() => deps.actor(controller.signal));
    if (!actor) return fail(401, "AUTHENTICATION_REQUIRED");
    if (!UUID.test(actor.id) || actor.allowed !== true) return fail(403, "ARENA_ACCESS_REQUIRED");
    if (actor.id.toLowerCase() !== expectedAccount.toLowerCase()) return fail(409, "ACCOUNT_CHANGED");
    const canonicalFixture = await bounded(() => deps.resolveFixture(fixtureId, controller.signal));
    if (canonicalFixture === null) return fail(404, "FIXTURE_NOT_FOUND");
    if (!UUID.test(canonicalFixture)) throw new Error("invalid-fixture");
    const installationId = installation?.toLowerCase() ?? null;
    const observation = await bounded(() => deps.observe(actor.id, canonicalFixture, installationId, controller.signal));
    if (typeof observation.subscribed !== "boolean" || typeof observation.configured !== "boolean"
      || !["not-requested", "missing", "registered", "invalid"].includes(observation.device)
      || (installationId === null) !== (observation.device === "not-requested")) throw new Error("invalid-observation");
    const data: FixtureAlertStatusObservation = {
      accountId: actor.id, fixtureId, installationId, subscribed: observation.subscribed,
      configuration: observation.configured ? "configured" : "unconfigured", device: observation.device,
      preference: fixtureAlertPreferenceStatus(observation.preferences, (deps.now ?? (() => new Date()))()),
      operational: "unknown", delivery: "unconfirmed", active: false,
    };
    return Response.json({ ok: true, version: 1, data }, { status: 200, headers });
  } catch { return fail(503, "ALERT_STATUS_UNCONFIRMED"); }
  finally { clearTimeout(timer); request.signal.removeEventListener("abort", cancel); controller.abort(); }
}
