import { createHash } from "node:crypto";
import sharp from "sharp";
import { getClubOwnerAvatarResourceAdmission, type ClubOwnerAvatarResourceScope } from "./club-owner-avatar-resource-admission.ts";
import { CLUB_OWNER_AVATAR_MAX_BYTES, CLUB_OWNER_AVATAR_MAX_EDGE } from "./club-owner-avatar-validation.ts";
import { CLUB_OWNER_AVATAR_TRANSPORT_MAX_BYTES } from "./club-owner-avatar-transport-limits.ts";
import { avatarUploadTimeout, awaitAvatarStep, createAvatarEnvironmentGuard, isAvatarAccountId, isAvatarRevision, type AvatarUploadDependencies } from "./club-owner-avatar-upload-contract.ts";

export const CLUB_OWNER_AVATAR_BUCKET = "touchline-club-owner-avatars";
export const CLUB_OWNER_AVATAR_STORAGE_TIMEOUT_MS = 10_000;
type Upload = Parameters<AvatarUploadDependencies["createImmutable"]>[0];
export type ClubOwnerAvatarObjectIdentity = Readonly<{ actorId: string; operationId: string; digest: string }>;
type StorageConfig = Readonly<{
  supabaseOrigin: string; serviceRoleKey: string; fetchImpl: typeof fetch; timeoutMs?: number;
  resourceScope?: ClubOwnerAvatarResourceScope;
  assertEnvironment?: () => void;
}>;

export class ClubOwnerAvatarStorageError extends Error {
  readonly state: "rejected" | "unknown";
  constructor(state: "rejected" | "unknown") {
    super(state === "unknown" ? "AVATAR_STORAGE_UNCONFIRMED" : "AVATAR_STORAGE_REJECTED");
    this.name = "ClubOwnerAvatarStorageError"; this.state = state;
  }
}
const discard = (response: Response) => { void response.body?.cancel().catch(() => undefined); };
const checksum = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

// Accept only the static, metadata-free WebP container emitted by our validator.
// Full decoding below additionally rejects corrupt payloads and dimensions >512.
function staticWebp(bytes: Buffer) {
  if (bytes.length < 20 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP"
    || bytes.readUInt32LE(4) !== bytes.length - 8) return false;
  let offset = 12, images = 0;
  while (offset + 8 <= bytes.length) {
    const type = bytes.toString("ascii", offset, offset + 4), size = bytes.readUInt32LE(offset + 4);
    if (!["VP8 ", "VP8L", "VP8X", "ALPH"].includes(type) || size > bytes.length - offset - 8) return false;
    if (type === "VP8X" && (size !== 10 || (bytes[offset + 8] & ~16) !== 0)) return false;
    if (type === "VP8 " || type === "VP8L") images++;
    offset += 8 + size + size % 2;
  }
  return offset === bytes.length && images === 1;
}

/** Node/server composition seam only. No environment reads, default fetch,
 * bucket creation, SQL publication, retries, deletion, listing or signed URLs.
 * Installed storage-js uses POST /object + x-upsert:false; its Blob download
 * allocates the entire response. We instead require injected fetch and consume
 * Response.body under a byte cap. The transport must honor redirect:error and
 * stream responses, not prebuffer them. Mock tests do not prove hosted Storage.
 * Service credentials bypass Storage RLS: protect this factory server-side.
 * Bucket metadata is checked per call, not proof against a later admin change.
 * Deadline bounds waiting; it cannot prove native decode or remote writes stop.
 */
function avatarStorageOperation(config: StorageConfig) {
  let origin: string;
  try {
    const url = new URL(config.supabaseOrigin);
    if (url.protocol !== "https:" || url.origin !== config.supabaseOrigin || url.username || url.password
      || !config.serviceRoleKey.trim() || /[\r\n]/.test(config.serviceRoleKey) || typeof config.fetchImpl !== "function") throw Error();
    origin = url.origin;
  } catch { throw new ClubOwnerAvatarStorageError("rejected"); }
  // Capture configuration once. Neither caller input nor a later config mutation
  // can retarget authenticated requests or replace the transport.
  const { serviceRoleKey, fetchImpl, resourceScope } = config;
  const assertConfiguration = createAvatarEnvironmentGuard(config.assertEnvironment);
  const duration = avatarUploadTimeout(config.timeoutMs, CLUB_OWNER_AVATAR_STORAGE_TIMEOUT_MS);
    function operation(upload: Upload, outerSignal: AbortSignal, readOnly: false): Promise<{ objectKey: string; digest: string }>;
    function operation(upload: ClubOwnerAvatarObjectIdentity, outerSignal: AbortSignal, readOnly: true): Promise<Buffer | null>;
    async function operation(upload: Upload | ClubOwnerAvatarObjectIdentity, outerSignal: AbortSignal, readOnly: boolean): Promise<{ objectKey: string; digest: string } | Buffer | null> {
      const resources = getClubOwnerAvatarResourceAdmission(), owned = resourceScope === undefined;
      const scope = owned ? resources.tryAcquire() : resourceScope;
      if (!scope) throw new ClubOwnerAvatarStorageError("rejected");
      const deadline = new AbortController(), expires = performance.now() + duration;
      const timer = setTimeout(() => deadline.abort(), duration);
      const signal = AbortSignal.any([outerSignal, deadline.signal]);
      const responses = new Set<Response>();
      let createStarted = false;
      const guard = () => { assertConfiguration(); resources.assertOpen(scope); if (performance.now() >= expires) deadline.abort(); signal.throwIfAborted(); };
      const step = async <T>(work: () => PromiseLike<T>) => { guard(); const value = await awaitAvatarStep(work, signal); guard(); return value; };
      async function request(path: string, method: "GET" | "POST", body?: Buffer) {
        return step(() => {
          if (method === "POST") createStarted = true;
          return fetchImpl(`${origin}/storage/v1/${path}`, {
            method, redirect: "error", cache: "no-store", signal,
            headers: { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}`, ...(body ? { "content-type": "image/webp", "x-upsert": "false" } : {}) },
            ...(body ? { body: body as BodyInit } : {}),
          }).then(response => {
            responses.add(response);
            try { guard(); if (response.redirected) throw Error(); return response; }
            catch { discard(response); throw Error(); }
          });
        });
      }
      async function bounded(response: Response, limit: number) {
        let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
        let complete = false;
        const cancel = () => { if (reader) void reader.cancel().catch(() => undefined); else discard(response); };
        try {
          guard();
          const encoding = response.headers.get("content-encoding"), declared = response.headers.get("content-length");
          if ((encoding && encoding.toLowerCase() !== "identity") || (declared !== null
            && (!/^(0|[1-9][0-9]{0,6})$/.test(declared) || Number(declared) > limit)) || !response.body) throw Error();
          reader = response.body.getReader(); signal.addEventListener("abort", cancel, { once: true });
          const bytes = Buffer.allocUnsafe(limit); let size = 0;
          while (true) {
            const part = await step(() => reader!.read());
            if (part.done) break;
            if (!(part.value instanceof Uint8Array) || part.value.byteLength > limit - size) throw Error();
            bytes.set(part.value, size); size += part.value.byteLength;
          }
          if (declared !== null && Number(declared) !== size) throw Error();
          complete = true; guard(); return bytes.subarray(0, size);
        } finally {
          signal.removeEventListener("abort", cancel);
          if (!complete) cancel();
          try { reader?.releaseLock(); } catch { /* Pending cancellation is not awaited. */ }
        }
      }
      async function json(response: Response): Promise<Record<string, unknown>> {
        if (response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") { discard(response); throw Error(); }
        const value: unknown = JSON.parse((await bounded(response, 4096)).toString("utf8"));
        if (!value || typeof value !== "object" || Array.isArray(value)) throw Error();
        return value as Record<string, unknown>;
      }
      // Follow original native promises inside ONE child. Only the outer caller
      // races this job; a timeout cannot free its ticket while Sharp is pending.
      async function verifyWebpNative(bytes: Buffer, digest: string) {
        guard();
        if (!bytes.length || bytes.length > CLUB_OWNER_AVATAR_MAX_BYTES || checksum(bytes) !== digest || !staticWebp(bytes)) throw Error();
        const decoder = sharp(bytes, { failOn: "warning", limitInputPixels: CLUB_OWNER_AVATAR_MAX_EDGE ** 2 });
        const metadata = await decoder.metadata();
        guard();
        if (metadata.format !== "webp" || !metadata.width || !metadata.height || metadata.width > CLUB_OWNER_AVATAR_MAX_EDGE
          || metadata.height > CLUB_OWNER_AVATAR_MAX_EDGE || (metadata.pages ?? 1) !== 1) throw Error();
        await decoder.raw().timeout({ seconds: 5 }).toBuffer();
        guard();
      }
      async function verifyBucket() {
        const bucketResponse = await request(`bucket/${CLUB_OWNER_AVATAR_BUCKET}`, "GET");
        if (bucketResponse.status !== 200) { discard(bucketResponse); throw Error(); }
        const bucket = await json(bucketResponse);
        if (bucket.id !== CLUB_OWNER_AVATAR_BUCKET || bucket.name !== CLUB_OWNER_AVATAR_BUCKET || bucket.public !== false
          || bucket.file_size_limit !== CLUB_OWNER_AVATAR_MAX_BYTES || !Array.isArray(bucket.allowed_mime_types)
          || bucket.allowed_mime_types.length !== 1 || bucket.allowed_mime_types[0] !== "image/webp") throw Error();
      }
      try {
        guard();
        const { actorId, operationId, digest } = upload;
        if (!isAvatarAccountId(actorId) || actorId !== actorId.toLowerCase() || !isAvatarAccountId(operationId)
          || operationId !== operationId.toLowerCase() || typeof digest !== "string" || !/^[a-f0-9]{64}$/.test(digest)) throw Error();
        const objectKey = `${actorId}/${operationId}/${digest}.webp`;
        const path = `${CLUB_OWNER_AVATAR_BUCKET}/${objectKey}`;
        if (readOnly) {
          await verifyBucket();
          const response = await request(`object/authenticated/${path}`, "GET");
          if (response.status === 404) { guard(); return null; }
          if (response.status !== 200 || response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "image/webp") throw Error();
          const bytes = await bounded(response, CLUB_OWNER_AVATAR_TRANSPORT_MAX_BYTES);
          await step(() => resources.runNative(scope, () => verifyWebpNative(bytes, digest)));
          guard(); return bytes;
        }
        const creation = upload as Upload;
        if (!isAvatarRevision(creation.expectedRevision) || creation.objectKey !== objectKey
          || creation.contentType !== "image/webp" || !Buffer.isBuffer(creation.bytes) || !creation.bytes.length
          || creation.bytes.length > CLUB_OWNER_AVATAR_TRANSPORT_MAX_BYTES) throw Error();
        let bytes!: Buffer;
        await step(() => resources.runNative(scope, async () => {
          guard(); bytes = Buffer.from(creation.bytes);
          await verifyWebpNative(bytes, digest);
        }));
        await verifyBucket();
        const created = await request(`object/${path}`, "POST", bytes);
        if (created.status === 409) {
          const error = await json(created);
          if (!["ResourceAlreadyExists", "KeyAlreadyExists", "already_exists"].includes(String(error.code))) throw Error();
        } else {
          discard(created);
          if (created.status !== 200 && created.status !== 201) throw Error();
        }
        const existing = await request(`object/authenticated/${path}`, "GET");
        if (existing.status !== 200 || existing.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "image/webp") { discard(existing); throw Error(); }
        const stored = await bounded(existing, bytes.length);
        if (checksum(stored) !== digest || !stored.equals(bytes)) throw Error();
        guard(); return { objectKey, digest };
      } catch {
        // A rejected await also needs an observation. Keep the adapter poisoned
        // after detected drift, but retain Storage's pre/post-write error shape.
        try { assertConfiguration(); } catch { /* Failure is latched by the guard. */ }
        // Rejection is local to this attempt, not proof that this key never existed.
        // A started POST may have persisted despite timeout or a lost response.
        throw new ClubOwnerAvatarStorageError(createStarted ? "unknown" : "rejected");
      } finally {
        clearTimeout(timer);
        // Also release a response received just before an await boundary aborted.
        for (const response of responses) discard(response);
        responses.clear();
        if (owned) resources.close(scope);
      }
    }
  return operation;
}

export function createClubOwnerAvatarStorage(config: StorageConfig): Pick<AvatarUploadDependencies, "createImmutable"> {
  const operation = avatarStorageOperation(config);
  return Object.freeze({ createImmutable: (upload: Upload, signal: AbortSignal) => operation(upload, signal, false) });
}

/** Read-only interface. Call only after server authorization and a canonical
 * current-operation read; this object cannot establish ownership on its own.
 * Key is derived internally; no arbitrary URLs, paths or historical listing.
 * Bytes are fully bounded/digest-verified/decoded before being returned. A 404
 * means this exact object is absent, not that SQL publication was rolled back.
 */
export function createClubOwnerAvatarReader(config: StorageConfig) {
  const operation = avatarStorageOperation(config);
  return Object.freeze({ readImmutable: (identity: ClubOwnerAvatarObjectIdentity, signal: AbortSignal) => operation(identity, signal, true) });
}
