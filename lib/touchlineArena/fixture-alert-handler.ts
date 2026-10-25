import { isFixtureAlertRevision } from "./fixture-alert-readiness.ts";

type Dependencies = {
  enabled: boolean;
  actor: () => Promise<{ id: string; allowed: boolean } | null>;
  resolveFixture: (providerId: string) => Promise<string | null>;
  read: (fixtureId: string, userId: string) => Promise<unknown>;
  write: (fixtureId: string, userId: string, active: boolean, expectedRevision: string) => Promise<unknown>;
};

/** Saved interest is not delivery consent or evidence of a working push channel. */
export async function handleFixtureAlert(request: Request, providerId: string, deps: Dependencies) {
  const json = (status: number, value: unknown) => Response.json(value, {
    status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie, X-Touchline-Expected-Account" },
  });
  if (!deps.enabled) return json(503, { ok: false, error: "ALERTS_NOT_ENABLED" });
  if (!["GET", "PUT"].includes(request.method)) return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  if (!/^[1-9]\d{0,14}$/.test(providerId)) return json(400, { ok: false, error: "INVALID_FIXTURE" });
  const expectedAccount = request.headers.get("X-Touchline-Expected-Account");
  if (!expectedAccount || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(expectedAccount)) return json(400, { ok: false, error: "INVALID_ACCOUNT_CONTEXT" });
  if (request.method === "PUT" && (request.headers.get("origin") !== new URL(request.url).origin
    || request.headers.get("sec-fetch-site") === "cross-site")) return json(403, { ok: false, error: "INVALID_ORIGIN" });
  try {
    const actor = await deps.actor();
    if (!actor) return json(401, { ok: false, error: "AUTHENTICATION_REQUIRED" });
    if (!actor.allowed) return json(403, { ok: false, error: "ARENA_ACCESS_REQUIRED" });
    if (actor.id.toLowerCase() !== expectedAccount.toLowerCase()) return json(409, { ok: false, error: "ACCOUNT_CHANGED" });
    let active: boolean | undefined;
    let expectedRevision: string | undefined;
    if (request.method === "PUT") {
      const value = await request.json().catch(() => null);
      if (!value || Array.isArray(value) || typeof value !== "object" || Object.keys(value).length !== 2
        || !Object.hasOwn(value, "active") || !Object.hasOwn(value, "expectedRevision")
        || typeof value.active !== "boolean" || !isFixtureAlertRevision(value.expectedRevision)
        || value.expectedRevision === "9223372036854775807") return json(400, { ok: false, error: "INVALID_SUBSCRIPTION" });
      active = value.active;
      expectedRevision = value.expectedRevision;
    }
    const fixtureId = await deps.resolveFixture(providerId);
    if (!fixtureId) return json(404, { ok: false, error: "FIXTURE_NOT_FOUND" });
    const result = active === undefined ? await deps.read(fixtureId, actor.id) : await deps.write(fixtureId, actor.id, active, expectedRevision!);
    if (active !== undefined && result && typeof result === "object" && !Array.isArray(result)
      && Object.keys(result).length === 1 && Object.hasOwn(result, "conflict")
      && (result as { conflict?: unknown }).conflict === true) return json(409, { ok: false, error: "REVISION_CONFLICT" });
    if (!result || typeof result !== "object" || Array.isArray(result)
      || typeof (result as { subscribed?: unknown }).subscribed !== "boolean"
      || !isFixtureAlertRevision((result as { revision?: unknown }).revision)) throw new Error("invalid-summary");
    const summary = result as { subscribed: boolean; revision: string };
    if (active !== undefined && (summary.subscribed !== active
      || summary.revision !== (BigInt(expectedRevision!) + BigInt(1)).toString())) throw new Error("invalid-write-receipt");
    return json(200, { ok: true, data: { accountId: actor.id, fixtureId: providerId, subscribed: summary.subscribed, revision: summary.revision }, delivery: "unavailable" });
  } catch {
    return json(503, { ok: false, error: "ALERTS_UNAVAILABLE" });
  }
}
