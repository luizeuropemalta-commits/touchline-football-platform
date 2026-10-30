import { parseOwnPublicOwner, parsePublicOwnerProfile, parsePublicOwners, publicOwnerId, publicOwnerName, publicOwnerQuery, samePeopleOrigin } from "./clubowner-public-contract.ts";
import { TOUCHLINE_QA_ORIGIN } from "./public-origin.ts";

export type PeopleDependencies = {
  enabled: boolean;
  currentActor: () => Promise<{ allowed: boolean; photoAllowed?: boolean } | null>;
  rpc: (name: string, args?: Record<string, unknown>) => Promise<unknown>;
  photoEnabled?: boolean;
  photoUrls?: (ids: readonly string[]) => Promise<Record<string, string>>;
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
    let photoAllowed = false;
    if (endpoint === "own" || write) {
      const actor = await currentActor();
      if (!actor) return fail(401, "unauthorized");
      if (!actor.allowed) return fail(403, "forbidden");
      photoAllowed = actor.photoAllowed === true;
    }
    const withPhotos = async <T extends { publicId: string }>(rows: T[]) => {
      if (!dependencies.photoEnabled) return rows;
      if (!dependencies.photoUrls) throw new Error("PUBLIC_AVATAR_UNAVAILABLE");
      const urls = await dependencies.photoUrls(rows.map(row => row.publicId));
      return rows.map(row => ({ ...row, avatarUrl: urls[row.publicId.toLowerCase()] ?? null }));
    };
    if (endpoint === "directory") {
      const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
      if (!publicOwnerQuery(query)) return fail(400, "invalid");
      return peopleResponse({ profiles: parsePublicOwners(await withPhotos(parsePublicOwners(await rpc("touchline_people_search", { p_query: query })))) });
    }
    if (endpoint === "profile") {
      const profile = parsePublicOwnerProfile(await rpc("touchline_people_profile", { p_public_id: id }));
      return profile ? peopleResponse({ profile: parsePublicOwnerProfile((await withPhotos([profile]))[0]) }) : fail(404, "not_found");
    }
    if (endpoint === "own" && !write) return peopleResponse({ profile: parseOwnPublicOwner(await rpc("touchline_people_own_profile")),
      ...(dependencies.photoEnabled ? { photoSharingAllowed: photoAllowed } : {}) });
    // Bound the body, reject unknown keys (especially actor/owner/public IDs).
    const body = await boundedBody(request);
    if (!body) return fail(400, "invalid");
    if (endpoint === "own") {
      const photo = Object.hasOwn(body, "photoPublished");
      if (Object.keys(body).length !== (photo ? 3 : 2) || !publicOwnerName(body.displayName) || typeof body.published !== "boolean"
        || (photo && (typeof body.photoPublished !== "boolean" || (body.photoPublished && !body.published)))) return fail(400, "invalid");
      if (photo && (!dependencies.photoEnabled || new URL(request.url).origin !== TOUCHLINE_QA_ORIGIN)) return fail(503, "unavailable");
      if (photo && !photoAllowed) return fail(403, "forbidden");
      const profile = parseOwnPublicOwner(await rpc(photo ? "touchline_people_save_profile_v2" : "touchline_people_save_profile",
        { p_display_name: body.displayName, p_published: body.published, ...(photo ? { p_photo_published: body.photoPublished } : {}) }));
      if (!profile) throw new Error("EMPTY_SAVED_PROFILE");
      return peopleResponse({ profile });
    }
    if (Object.keys(body).length !== 1 || typeof body.active !== "boolean") return fail(400, "invalid");
    const profile = parsePublicOwnerProfile(await rpc("touchline_people_set_follow", { p_public_id: id, p_active: body.active }));
    if (!profile) throw new Error("EMPTY_FOLLOW_PROFILE");
    return peopleResponse({ profile: parsePublicOwnerProfile((await withPhotos([profile]))[0]) });
  } catch (error) {
    const message = error && typeof error === "object" && "message" in error ? String(error.message) : "";
    if (message === "PEOPLE_NOT_FOUND") return fail(404, "not_found");
    if (message === "PEOPLE_FORBIDDEN") return fail(403, "forbidden");
    if (message === "PEOPLE_SELF_FOLLOW") return fail(400, "invalid");
    return fail(503, "unavailable");
  }
}
