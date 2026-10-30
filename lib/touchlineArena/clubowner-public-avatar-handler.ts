import { createHash } from "node:crypto";
import { awaitAvatarStep, isAvatarAccountId, isAvatarRevision, type AvatarCurrent } from "./club-owner-avatar-upload-contract.ts";
import { CLUB_OWNER_AVATAR_TRANSPORT_MAX_BYTES } from "./club-owner-avatar-transport-limits.ts";
import { publicOwnerAvatarHref, publicOwnerId } from "./clubowner-public-contract.ts";

export type PublicOwnerAvatar = Readonly<{ publicId: string; version: string; current: AvatarCurrent }>;
const uuid = (value: unknown): value is string => isAvatarAccountId(value) && value === value.toLowerCase();
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("PUBLIC_AVATAR_UNCONFIRMED");
  return value as Record<string, unknown>;
};

/** Private RPC envelope only. Never serialize it into a page/HTTP response.
 * The database filters live trusted access; the canonical owner classifier
 * remains a separate server check. The opaque version is not authorization.
 */
export function parsePublicOwnerAvatars(value: unknown, requested: readonly string[], isOwnerEmail: (email: string) => boolean): PublicOwnerAvatar[] {
  if (!Array.isArray(value) || value.length > requested.length || requested.length > 20) throw Error("PUBLIC_AVATAR_UNCONFIRMED");
  const seen = new Set<string>(), result: PublicOwnerAvatar[] = [];
  for (const item of value) {
    const row = record(item), c = record(row.current);
    if (!uuid(row.publicId) || !requested.includes(row.publicId) || seen.has(row.publicId)
      || typeof row.consentVersion !== "string" || !/^\d{1,20}(\.\d{1,6})?$/.test(row.consentVersion)
      || typeof row.email !== "string" || !row.email.trim() || row.customerEligible !== true
      || !uuid(c.actorId) || !isAvatarRevision(c.revision) || c.revision === "0" || !uuid(c.operationId)
      || typeof c.digest !== "string" || !/^[a-f0-9]{64}$/.test(c.digest)
      || c.avatarUrl !== `/api/account/avatar?version=${c.operationId}`) throw Error("PUBLIC_AVATAR_UNCONFIRMED");
    seen.add(row.publicId);
    const owner = isOwnerEmail(row.email);
    if (typeof owner !== "boolean") throw Error("PUBLIC_AVATAR_UNCONFIRMED");
    if (owner) continue;
    const current = Object.freeze({ actorId: c.actorId, revision: c.revision, operationId: c.operationId, digest: c.digest, avatarUrl: c.avatarUrl as string });
    const version = createHash("sha256").update(JSON.stringify([row.publicId, row.consentVersion, current.revision, current.operationId, current.digest])).digest("hex");
    result.push(Object.freeze({ publicId: row.publicId, version, current }));
  }
  return result;
}

const headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin" };
export async function handlePublicOwnerAvatar(request: Request, publicId: string, config: { enabled: boolean; origin: string }, deps: {
  read: (publicId: string, signal: AbortSignal) => Promise<PublicOwnerAvatar | null>;
  readImmutable: (current: AvatarCurrent, signal: AbortSignal) => Promise<Buffer | null>;
  assertEnvironment: () => void;
}): Promise<Response> {
  const fail = (status: number) => Response.json({ error: status === 404 ? "not_found" : "unavailable" }, { status, headers });
  if (!config.enabled) return fail(503);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    deps.assertEnvironment();
    if (request.method !== "GET") return fail(405);
    if (!publicOwnerId(publicId)) return fail(404);
    const id = publicId.toLowerCase(), url = new URL(request.url), versions = url.searchParams.getAll("v");
    if (url.origin !== config.origin || url.pathname !== `/api/touchline/clubowners/${publicId}/avatar`
      || (request.headers.has("origin") && request.headers.get("origin") !== config.origin)
      || (request.headers.has("sec-fetch-site") && !["same-origin", "none"].includes(request.headers.get("sec-fetch-site")!))
      || request.headers.has("x-touchline-isolated-preview")) return fail(403);
    if (versions.length !== 1 || !/^[a-f0-9]{64}$/.test(versions[0]) || [...url.searchParams.keys()].some(key => key !== "v")) return fail(404);
    const controller = new AbortController(), signal = AbortSignal.any([request.signal, controller.signal]);
    const expires = performance.now() + 15_000;
    timer = setTimeout(() => controller.abort(), 15_000);
    const guard = () => { deps.assertEnvironment(); if (performance.now() >= expires) controller.abort(); signal.throwIfAborted(); };
    const step = async <T>(work: () => Promise<T>) => { guard(); const value = await awaitAvatarStep(work, signal); guard(); return value; };
    const before = await step(() => deps.read(id, signal));
    if (!before || before.publicId !== id || before.version !== versions[0]) return fail(404);
    const image = await step(() => deps.readImmutable(before.current, signal));
    if (image === null) return fail(404);
    if (!Buffer.isBuffer(image) || image.length === 0 || image.length > CLUB_OWNER_AVATAR_TRANSPORT_MAX_BYTES) throw Error();
    const bytes = Buffer.from(image);
    if (createHash("sha256").update(bytes).digest("hex") !== before.current.digest) throw Error();
    const after = await step(() => deps.read(id, signal));
    if (!after || JSON.stringify(after) !== JSON.stringify(before)) return fail(404);
    const response = new Response(bytes as BodyInit, { headers: { ...headers, "Content-Type": "image/webp", "Content-Length": String(bytes.length) } });
    guard(); return response;
  } catch { return fail(503); }
  finally { if (timer !== undefined) clearTimeout(timer); }
}

export const publicOwnerAvatarUrls = (rows: readonly PublicOwnerAvatar[]) => Object.fromEntries(rows.map(row => [row.publicId, publicOwnerAvatarHref(row.publicId, row.version)]));
