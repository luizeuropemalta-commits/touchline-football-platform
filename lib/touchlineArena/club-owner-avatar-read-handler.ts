import { createHash } from "node:crypto";
import {
  AVATAR_UPLOAD_TOTAL_TIMEOUT_MS, avatarUploadTimeout, awaitAvatarStep, isAvatarAccountId, isAvatarRevision,
  type AvatarCurrent, type AvatarUploadDependencies,
} from "./club-owner-avatar-upload-contract.ts";
import { CLUB_OWNER_AVATAR_TRANSPORT_MAX_BYTES } from "./club-owner-avatar-transport-limits.ts";
import type { ClubOwnerAvatarObjectIdentity } from "./club-owner-avatar-storage.ts";
import { isTouchlineIsolatedPreviewRequest, TOUCHLINE_ISOLATED_PREVIEW_HEADER } from "../touchlinePreview/isolation.ts";

type ReadDependencies = Pick<AvatarUploadDependencies, "actor" | "readCurrent"> & {
  readImmutable: (identity: ClubOwnerAvatarObjectIdentity, signal: AbortSignal) => Promise<Buffer | null>;
};
const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
} as const;
const uuid = (value: unknown): value is string => isAvatarAccountId(value) && value === value.toLowerCase();
const avatarUrl = (operation: string) => `/api/account/avatar?version=${operation}`;
function current(value: AvatarCurrent, actor: string): AvatarCurrent {
  if (!value || value.actorId !== actor || !isAvatarRevision(value.revision)) throw Error();
  const { revision, avatarUrl: url, operationId, digest } = value;
  if (revision === "0") {
    if ((url !== null && typeof url !== "string") || operationId !== null || digest !== null) throw Error();
  } else if (!uuid(operationId) || typeof digest !== "string" || !/^[a-f0-9]{64}$/.test(digest) || url !== avatarUrl(operationId)) throw Error();
  return { actorId: actor, revision, avatarUrl: url, operationId, digest };
}

/** No route or auth composition is enabled here. actor() must validate getUser,
 * access and the customer boundary once; this handler captures that result and
 * never retargets by query/header/cookie changes during the operation. A second
 * current-state read prevents serving a known superseded version; it cannot lock
 * out future commits after that read. No arbitrary/legacy URL fetch or deletion.
 */
export async function handleClubOwnerAvatarRead(request: Request, deps: ReadDependencies,
  config: { enabled?: boolean; requestOrigin?: string; timeoutMs?: number } = {}): Promise<Response> {
  const reply = (status: number, error: string) => Response.json({ ok: false, error }, { status, headers: {
    ...PRIVATE_HEADERS, ...(status === 405 ? { Allow: "GET" } : {}),
  } });
  if (config.enabled !== true) return reply(503, "AVATAR_READ_DISABLED");
  try {
    const origin = new URL(config.requestOrigin ?? "");
    if (origin.protocol !== "https:" || origin.origin !== config.requestOrigin || origin.username || origin.password) return reply(503, "AVATAR_READ_UNCONFIGURED");
    const target = new URL(request.url), suppliedOrigin = request.headers.get("origin"), site = request.headers.get("sec-fetch-site");
    if (target.origin !== origin.origin || target.pathname !== "/api/account/avatar"
      || (suppliedOrigin !== null && suppliedOrigin !== origin.origin)
      || (site !== null && site !== "same-origin" && site !== "none")
      || isTouchlineIsolatedPreviewRequest(request.headers.get(TOUCHLINE_ISOLATED_PREVIEW_HEADER))) return reply(403, "AVATAR_READ_FORBIDDEN");
    if (request.method !== "GET") return reply(405, "METHOD_NOT_ALLOWED");
    const versions = target.searchParams.getAll("version");
    if (versions.length !== 1 || !uuid(versions[0]) || [...target.searchParams.keys()].some(key => key !== "version")) return reply(400, "INVALID_AVATAR_VERSION");
    const version = versions[0], controller = new AbortController();
    const duration = avatarUploadTimeout(config.timeoutMs, AVATAR_UPLOAD_TOTAL_TIMEOUT_MS), expires = performance.now() + duration;
    const timer = setTimeout(() => controller.abort(), duration);
    const signal = AbortSignal.any([request.signal, controller.signal]);
    const guard = () => { if (performance.now() >= expires) controller.abort(); signal.throwIfAborted(); };
    const step = async <T>(work: () => PromiseLike<T>) => { guard(); const value = await awaitAvatarStep(work, signal); guard(); return value; };
    try {
      const actor = await step(() => deps.actor(signal));
      guard();
      if (actor === null) return reply(401, "AUTHENTICATION_REQUIRED");
      if (!actor || !isAvatarAccountId(actor.id)) throw Error();
      if (actor.allowed !== true) return reply(403, "AVATAR_READ_FORBIDDEN");
      const actorId = actor.id.toLowerCase();
      const before = current(await step(() => deps.readCurrent(actorId, signal)), actorId);
      guard();
      if (before.revision === "0" || before.operationId !== version) return reply(404, "AVATAR_NOT_FOUND");
      const image = await step(() => deps.readImmutable({ actorId, operationId: version, digest: before.digest! }, signal));
      guard();
      if (image === null) return reply(404, "AVATAR_NOT_FOUND");
      if (!Buffer.isBuffer(image) || !image.length || image.length > CLUB_OWNER_AVATAR_TRANSPORT_MAX_BYTES) throw Error();
      // Own the bytes across the second asynchronous read. The reader validates
      // WebP/container/dimensions; verify its digest again at the response seam.
      const bytes = Buffer.from(image);
      if (createHash("sha256").update(bytes).digest("hex") !== before.digest) throw Error();
      const after = current(await step(() => deps.readCurrent(actorId, signal)), actorId);
      guard();
      if (after.revision !== before.revision || after.operationId !== before.operationId || after.digest !== before.digest || after.avatarUrl !== before.avatarUrl) return reply(404, "AVATAR_NOT_FOUND");
      const response = new Response(bytes as BodyInit, { status: 200, headers: {
        ...PRIVATE_HEADERS, "Content-Type": "image/webp", "Content-Length": String(bytes.length),
      } });
      guard(); return response;
    } finally { clearTimeout(timer); }
  } catch { return reply(503, "AVATAR_READ_UNAVAILABLE"); }
}
