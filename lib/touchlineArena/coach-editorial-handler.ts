import { legacyCoachCatalogue, parseCoachEditorial } from "./coach-catalogue-contract.ts";

export type CoachEditorialDependencies = {
  enabled: boolean;
  actor(): Promise<{ id: string; owner: boolean; allowed: boolean } | null>;
  rpc(name: string, args?: Record<string, unknown>): Promise<unknown>;
};
const response = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
async function body(request: Request): Promise<Record<string, unknown> | null> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json"
    || Number(request.headers.get("content-length")) > 4096 || !request.body) return null;
  const reader = request.body.getReader(); let length = 0; const chunks: Uint8Array[] = [];
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; void reader.cancel().catch(() => undefined); }, 5_000);
  try {
    for (;;) { const { done, value } = await reader.read(); if (done) break; length += value.byteLength;
      if (length > 4096) { await reader.cancel(); return null; } chunks.push(value); }
    if (timedOut) return null;
    const bytes = new Uint8Array(length); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; } finally { clearTimeout(timer); reader.releaseLock(); }
}
export async function handleCoachEditorial(request: Request, dependencies: CoachEditorialDependencies) {
  try {
    if (!dependencies.enabled) return response({ error: "COACH_CATALOGUE_DISABLED" }, 503);
    if (!["GET", "POST"].includes(request.method)) return response({ error: "METHOD_NOT_ALLOWED" }, 405);
    if (request.method === "POST" && (request.headers.get("origin") !== new URL(request.url).origin || request.headers.get("sec-fetch-site") === "cross-site")) return response({ error: "INVALID_ORIGIN" }, 403);
    const actor = await dependencies.actor();
    if (!actor || !actor.owner || !actor.allowed || !uuid(actor.id)) return response({ error: "FORBIDDEN" }, 403);
    if (request.method === "GET") {
      const state = parseCoachEditorial(await dependencies.rpc("touchline_read_coach_editorial"));
      return state ? response({ state }) : response({ error: "COACH_CATALOGUE_UNAVAILABLE" }, 503);
    }
    const input = await body(request);
    if (!input || !uuid(input.requestId) || input.confirmed !== true || typeof input.reason !== "string"
      || input.reason.trim().length < 20 || input.reason.length > 1000
      || !["bootstrap", "approve", "ignore", "reopen", "publish"].includes(String(input.action))
      || Object.keys(input).some(key => !["requestId", "confirmed", "reason", "action", "candidateId", "revision", "catalogueRevision"].includes(key))) return response({ error: "INVALID_INPUT" }, 400);
    if (!Number.isSafeInteger(input.catalogueRevision) || Number(input.catalogueRevision) < 0) return response({ error: "INVALID_INPUT" }, 400);
    const bootstrap = input.action === "bootstrap";
    if (bootstrap ? input.candidateId != null || input.revision != null : !uuid(input.candidateId) || !Number.isSafeInteger(input.revision) || Number(input.revision) < 1) return response({ error: "INVALID_INPUT" }, 400);
    // All imported identities/classifications come from the pinned local seed,
    // never a browser payload. Provenance remains explicitly historical.
    const seeds = bootstrap ? legacyCoachCatalogue().current.map(entry => ({ providerId: entry.coach.providerId, teamId: entry.coach.teamId,
      name: entry.coach.name, nationality: entry.coach.nationality, countryId: entry.coach.countryId,
      countryCode3: entry.countryCode3, observedAt: entry.fetchedAt, classification: entry.classification })) : null;
    const receipt = await dependencies.rpc("touchline_coach_editorial_command", { p_request_id: input.requestId, p_actor_id: actor.id,
      p_action: input.action, p_catalogue_revision: input.catalogueRevision, p_candidate_id: input.candidateId ?? null, p_revision: input.revision ?? null, p_reason: input.reason.trim(), p_bootstrap: seeds });
    if (!receipt || typeof receipt !== "object" || (receipt as Record<string, unknown>).requestId !== input.requestId.toLowerCase()
      || (receipt as Record<string, unknown>).action !== input.action) return response({ error: "COACH_RESULT_UNCONFIRMED" }, 503);
    return response({ receipt });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    return response({ error: ["40001", "23505", "22023"].includes(code) ? "COACH_REVIEW_CONFLICT" : "COACH_CATALOGUE_UNAVAILABLE" }, ["40001", "23505", "22023"].includes(code) ? 409 : 503);
  }
}
