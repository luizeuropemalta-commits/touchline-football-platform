import { isPlayerSocialSameOrigin, parsePlayerSocialMutation, parsePlayerSocialProviderId, parsePlayerSocialSummary, type PlayerSocialKind } from "./player-social-contract.ts";

export type PlayerSocialDependencies = {
  enabled: boolean;
  currentActor: () => Promise<{ id: string; allowed: boolean } | null>;
  resolvePlayer: (providerId: string) => Promise<string | null>;
  read: (playerId: string, userId: string | null) => Promise<unknown>;
  write: (playerId: string, userId: string, kind: PlayerSocialKind, active: boolean) => Promise<unknown>;
};

/** HTTP boundary: identity is resolved server-side; totals never come from a browser. */
export async function handlePlayerSocial(request: Request, providerId: string, deps: PlayerSocialDependencies): Promise<Response> {
  const json = (status: number, body: unknown) => Response.json(body, {
    status, headers: { "Cache-Control": "private, no-store", "Vary": "Cookie" },
  });
  if (!deps.enabled) return json(503, { ok: false, error: "SOCIAL_UNAVAILABLE" });
  if (request.method !== "GET" && request.method !== "PUT") return json(405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  const id = parsePlayerSocialProviderId(providerId);
  if (!id) return json(400, { ok: false, error: "INVALID_PLAYER" });
  if (request.method === "PUT" && !isPlayerSocialSameOrigin(request)) return json(403, { ok: false, error: "INVALID_ORIGIN" });
  try {
    const actor = await deps.currentActor();
    if (request.method === "PUT" && !actor) return json(401, { ok: false, error: "AUTHENTICATION_REQUIRED" });
    if (request.method === "PUT" && !actor?.allowed) return json(403, { ok: false, error: "ARENA_ACCESS_REQUIRED" });
    const mutation = request.method === "PUT" ? parsePlayerSocialMutation(await request.json().catch(() => null)) : null;
    if (request.method === "PUT" && !mutation) return json(400, { ok: false, error: "INVALID_REACTION" });
    const playerId = await deps.resolvePlayer(id);
    if (!playerId) return json(404, { ok: false, error: "PLAYER_NOT_FOUND" });
    const result = mutation && actor
      ? await deps.write(playerId, actor.id, mutation.kind, mutation.active)
      : await deps.read(playerId, actor?.allowed ? actor.id : null);
    const summary = parsePlayerSocialSummary(result);
    if (!summary) return json(503, { ok: false, error: "SOCIAL_UNAVAILABLE" });
    return json(200, { ok: true, data: summary, canReact: Boolean(actor?.allowed) });
  } catch {
    // Never return SQL errors, credentials, actor IDs, or fake successful counts.
    return json(503, { ok: false, error: "SOCIAL_UNAVAILABLE" });
  }
}
