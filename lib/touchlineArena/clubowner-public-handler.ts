import { parseOwnPublicOwner, parsePublicOwnerProfile, parsePublicOwners, publicOwnerId, publicOwnerName, publicOwnerQuery, samePeopleOrigin } from "./clubowner-public-contract.ts";

export type PeopleDependencies = {
  enabled: boolean;
  currentActor: () => Promise<{ allowed: boolean } | null>;
  rpc: (name: string, args?: Record<string, unknown>) => Promise<unknown>;
};
export type PeopleEndpoint = "directory" | "profile" | "own" | "follow";
async function boundedBody(request: Request): Promise<Record<string, unknown> | null> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return null;
  const length = request.headers.get("content-length");
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > 1024)) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const buffer = new Uint8Array(1024); let size = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      if (size + next.value.byteLength > buffer.byteLength) { await reader.cancel(); return null; }
      buffer.set(next.value, size); size += next.value.byteLength;
    }
    const body: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, size)));
    return body && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
  } catch { await reader.cancel().catch(() => undefined); return null; }
  finally { reader.releaseLock(); }
}
export function peopleResponse(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" } });
}
export async function handlePublicOwners(request: Request, endpoint: PeopleEndpoint, dependencies: PeopleDependencies, id?: string) {
  const { enabled, currentActor, rpc } = dependencies;
  const fail = (status: number, error: string) => peopleResponse({ error }, status);
  if (!enabled) return fail(503, "unavailable");
  const write = request.method === "PUT";
  if (!((request.method === "GET" && endpoint !== "follow") || (write && (endpoint === "own" || endpoint === "follow")))) return fail(405, "method");
  if ((endpoint === "profile" || endpoint === "follow") && !publicOwnerId(id)) return fail(404, "not_found");
  if (write && !samePeopleOrigin(request)) return fail(403, "forbidden");
  try {
    if (endpoint === "own" || write) {
      const actor = await currentActor();
      if (!actor) return fail(401, "unauthorized");
      if (!actor.allowed) return fail(403, "forbidden");
    }
    if (endpoint === "directory") {
      const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
      if (!publicOwnerQuery(query)) return fail(400, "invalid");
      return peopleResponse({ profiles: parsePublicOwners(await rpc("touchline_people_search", { p_query: query })) });
    }
    if (endpoint === "profile") {
      const profile = parsePublicOwnerProfile(await rpc("touchline_people_profile", { p_public_id: id }));
      return profile ? peopleResponse({ profile }) : fail(404, "not_found");
    }
    if (endpoint === "own" && !write) return peopleResponse({ profile: parseOwnPublicOwner(await rpc("touchline_people_own_profile")) });
    // Bound the body, reject unknown keys (especially actor/owner/public IDs).
    const body = await boundedBody(request);
    if (!body) return fail(400, "invalid");
    if (endpoint === "own") {
      if (Object.keys(body).length !== 2 || !publicOwnerName(body.displayName) || typeof body.published !== "boolean") return fail(400, "invalid");
      const profile = parseOwnPublicOwner(await rpc("touchline_people_save_profile", { p_display_name: body.displayName, p_published: body.published }));
      if (!profile) throw new Error("EMPTY_SAVED_PROFILE");
      return peopleResponse({ profile });
    }
    if (Object.keys(body).length !== 1 || typeof body.active !== "boolean") return fail(400, "invalid");
    const profile = parsePublicOwnerProfile(await rpc("touchline_people_set_follow", { p_public_id: id, p_active: body.active }));
    if (!profile) throw new Error("EMPTY_FOLLOW_PROFILE");
    return peopleResponse({ profile });
  } catch (error) {
    const message = error && typeof error === "object" && "message" in error ? String(error.message) : "";
    if (message === "PEOPLE_NOT_FOUND") return fail(404, "not_found");
    if (message === "PEOPLE_FORBIDDEN") return fail(403, "forbidden");
    if (message === "PEOPLE_SELF_FOLLOW") return fail(400, "invalid");
    return fail(503, "unavailable");
  }
}
