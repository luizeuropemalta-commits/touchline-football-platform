type Dependencies = {
  enabled: boolean;
  actor: () => Promise<{ id: string; allowed: boolean } | null>;
  resolveFixture: (providerId: string) => Promise<string | null>;
  read: (fixtureId: string, userId: string) => Promise<unknown>;
  write: (fixtureId: string, userId: string, active: boolean) => Promise<unknown>;
};

/** Saved interest is not delivery consent or evidence of a working push channel. */
export async function handleFixtureAlert(request: Request, providerId: string, deps: Dependencies) {
  const json = (status: number, value: unknown) => Response.json(value, {
    status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
  if (!deps.enabled) return json(503, { ok: false, error: "ALERTS_NOT_ENABLED" });
  if (!["GET", "PUT"].includes(request.method)) return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  if (!/^[1-9]\d{0,14}$/.test(providerId)) return json(400, { ok: false, error: "INVALID_FIXTURE" });
  if (request.method === "PUT" && (request.headers.get("origin") !== new URL(request.url).origin
    || request.headers.get("sec-fetch-site") === "cross-site")) return json(403, { ok: false, error: "INVALID_ORIGIN" });
  try {
    const actor = await deps.actor();
    if (!actor) return json(401, { ok: false, error: "AUTHENTICATION_REQUIRED" });
    if (!actor.allowed) return json(403, { ok: false, error: "ARENA_ACCESS_REQUIRED" });
    let active: boolean | undefined;
    if (request.method === "PUT") {
      const value = await request.json().catch(() => null);
      if (!value || Array.isArray(value) || typeof value !== "object" || Object.keys(value).length !== 1
        || typeof value.active !== "boolean") return json(400, { ok: false, error: "INVALID_SUBSCRIPTION" });
      active = value.active;
    }
    const fixtureId = await deps.resolveFixture(providerId);
    if (!fixtureId) return json(404, { ok: false, error: "FIXTURE_NOT_FOUND" });
    const result = active === undefined ? await deps.read(fixtureId, actor.id) : await deps.write(fixtureId, actor.id, active);
    if (!result || typeof result !== "object" || Array.isArray(result)
      || typeof (result as { subscribed?: unknown }).subscribed !== "boolean") throw new Error("invalid-summary");
    return json(200, { ok: true, data: { subscribed: (result as { subscribed: boolean }).subscribed }, delivery: "unavailable" });
  } catch {
    return json(503, { ok: false, error: "ALERTS_UNAVAILABLE" });
  }
}
