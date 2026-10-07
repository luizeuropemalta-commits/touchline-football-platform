import { createHash } from "node:crypto";
import { CLUB_OWNER_AVATAR_MAX_EDGE } from "./club-owner-avatar-validation.ts";
import { CLUB_OWNER_AVATAR_TRANSPORT_MAX_BYTES } from "./club-owner-avatar-transport-limits.ts";
import { getClubOwnerAvatarOutputPolicy } from "./club-owner-avatar-output-policy.ts";
import {
  AVATAR_UPLOAD_TOTAL_TIMEOUT_MS, avatarUploadTimeout, awaitAvatarStep, isAvatarAccountId, isAvatarRevision,
  AvatarEnvironmentChangedError, createAvatarEnvironmentGuard,
  parseAvatarUploadRequest, readAvatarUploadBody, parseAvatarRecoveryResult,
  type AvatarCurrent, type AvatarPublication, type AvatarReceipt, type AvatarRecoveryUploadDependencies,
} from "./club-owner-avatar-upload-contract.ts";

const avatarUrl = (operationId: string) => `/api/account/avatar?version=${operationId}`;
function validCurrent(value: AvatarCurrent, actorId: string) {
  return value && value.actorId === actorId && isAvatarRevision(value.revision)
    && (value.avatarUrl === null || typeof value.avatarUrl === "string")
    && (value.operationId === null || isAvatarAccountId(value.operationId))
    && (value.digest === null || /^[a-f0-9]{64}$/.test(value.digest));
}
function validReceipt(value: AvatarReceipt, input: AvatarPublication) {
  return value && ["actorId", "operationId", "expectedRevision", "digest", "objectKey"].every(key => value[key as keyof AvatarPublication] === input[key as keyof AvatarPublication])
    && isAvatarRevision(value.revision) && BigInt(value.revision) === BigInt(input.expectedRevision) + BigInt(1)
    && value.avatarUrl === avatarUrl(input.operationId);
}

/** Local orchestration only: no route, storage implementation or feature enabled.
 * A committed acknowledgement is not a claim that this photo remains current:
 * callers must refresh authoritative state and ignore stale account/generation
 * responses. No automatic retries, rebase, deletion or cookie retargeting.
 */
export async function handleClubOwnerAvatarUpload(request: Request, deps: AvatarRecoveryUploadDependencies,
  limits: { totalTimeoutMs?: number; readTimeoutMs?: number; assertEnvironment?: () => void } = {}): Promise<Response> {
  const json = (status: number, body: unknown) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
  // "rejected" describes this request, not the history of a reused operation ID.
  // Failed authoritative reads must never claim that an earlier attempt did not commit.
  const reject = (status: number, error: string, state: "rejected" | "unknown" = status >= 500 ? "unknown" : "rejected") => json(status, { ok: false, state, error });
  const contract = parseAvatarUploadRequest(request);
  if (!contract.ok) return reject(contract.status, contract.error);
  const deadline = new AbortController();
  const duration = avatarUploadTimeout(limits.totalTimeoutMs, AVATAR_UPLOAD_TOTAL_TIMEOUT_MS);
  const expires = performance.now() + duration;
  const timer = setTimeout(() => deadline.abort(), duration);
  const signal = AbortSignal.any([request.signal, deadline.signal]);
  let writeStarted = false, commitObserved = false;
  const assertConfiguration = createAvatarEnvironmentGuard(limits.assertEnvironment);
  const guard = () => { assertConfiguration(); if (performance.now() >= expires) deadline.abort(); signal.throwIfAborted(); };
  const step = async <T>(work: () => PromiseLike<T>) => {
    guard(); const result = await awaitAvatarStep(work, signal); guard(); return result;
  };
  const committed = (receipt: AvatarReceipt) => {
    // A replay has no new write, but its valid receipt still records a commit.
    // Cancellation between step's resolution and this continuation cannot turn
    // that history into a pre-write rejection or acknowledge expired success.
    commitObserved = true;
    guard();
    return json(200, { ok: true, state: "committed", requiresRefresh: true,
      accountId: receipt.actorId, operationId: receipt.operationId, revision: receipt.revision, avatarUrl: receipt.avatarUrl });
  };
  try {
    const actor = await step(() => deps.actor(signal));
    if (!actor) return reject(401, "AUTHENTICATION_REQUIRED");
    if (!isAvatarAccountId(actor.id)) return reject(503, "ACCOUNT_UNCONFIRMED");
    if (actor.allowed !== true) return reject(403, "ACCESS_REQUIRED");
    if (actor.id.toLowerCase() !== contract.accountId) return reject(409, "ACCOUNT_CHANGED");
    const actorId = contract.accountId;
    const beginInput = { actorId, operationId: contract.operationId, expectedRevision: contract.expectedRevision, baseGeneration: contract.baseGeneration };
    const beginAnswer = await step(() => {
      // A lost begin acknowledgement can leave durable pending work. Mark this
      // BEFORE dispatch, not after await; cancellation never proves rollback.
      writeStarted = true;
      return deps.beginOperation(beginInput, signal);
    });
    if (beginAnswer?.status === "unknown") return reject(503, "BEGIN_UNCONFIRMED", "unknown");
    const begin = parseAvatarRecoveryResult({ version: 1, ...beginAnswer }, beginInput, "begin");
    if (begin.status === "unknown") return reject(503, "BEGIN_UNCONFIRMED", "unknown");
    if (begin.status !== "started" && begin.status !== "committed") {
      const errors = { pending: "OPERATION_PENDING", busy: "OPERATION_BUSY", fenced: "OPERATION_FENCED",
        conflict: "REVISION_CONFLICT", operation_conflict: "OPERATION_CONFLICT" };
      // Even a known terminal operation is not fresh account readiness.
      return reject(409, errors[begin.status], "unknown");
    }
    const replay = begin.status === "committed";
    if (replay) commitObserved = true;
    const outputPolicy = getClubOwnerAvatarOutputPolicy(begin.status);
    if (!outputPolicy) return reject(503, "BEGIN_UNCONFIRMED", "unknown");
    const body = await step(() => readAvatarUploadBody(request, signal, limits.readTimeoutMs, assertConfiguration));
    if (!body.ok) return reject(body.error === "too_large" ? 413 : ["aborted", "body_timeout"].includes(body.error) ? 408 : 400, body.error.toUpperCase(), "unknown");
    const image = await step(() => deps.validate(body.bytes, signal));
    if (!image.ok) return reject(422, image.error, "unknown");
    if (!Buffer.isBuffer(image.bytes) || !image.bytes.length || image.bytes.length > CLUB_OWNER_AVATAR_TRANSPORT_MAX_BYTES || image.contentType !== "image/webp"
      || !Number.isInteger(image.width) || !Number.isInteger(image.height) || image.width < 1 || image.height < 1
      || image.width > CLUB_OWNER_AVATAR_MAX_EDGE || image.height > CLUB_OWNER_AVATAR_MAX_EDGE) return reject(503, "VALIDATION_UNCONFIRMED");
    // Begin is already durable. Reject only this image admission; leave the
    // pending operation for explicit observe/fence/refresh recovery. Never
    // delete an object, manufacture rollback, or silently retry another image.
    if (image.bytes.length > outputPolicy.maxBytes) return reject(422, "OUTPUT_TOO_LARGE", "unknown");
    const digest = createHash("sha256").update(image.bytes).digest("hex");
    const input: AvatarPublication = { actorId, operationId: contract.operationId, expectedRevision: contract.expectedRevision, digest,
      objectKey: `${actorId}/${contract.operationId}/${digest}.webp` };
    const current = await step(() => deps.readCurrent(actorId, signal));
    if (!validCurrent(current, actorId)) return reject(503, "PROFILE_UNCONFIRMED");
    if (replay) {
      const prior = begin.snapshot.operation?.receipt;
      if (!prior || prior.actorId !== actorId || prior.operationId !== input.operationId) return reject(503, "RECEIPT_UNCONFIRMED", "unknown");
      if (prior.digest !== digest || prior.expectedRevision !== input.expectedRevision) return reject(409, "OPERATION_CONFLICT");
      if (!validReceipt(prior, input)) return reject(503, "RECEIPT_UNCONFIRMED", "unknown");
      if (BigInt(current.revision) > BigInt(prior.revision)) return reject(409, "OPERATION_SUPERSEDED");
      if (current.revision !== prior.revision || current.operationId !== prior.operationId || current.digest !== prior.digest || current.avatarUrl !== prior.avatarUrl) return reject(503, "PROFILE_UNCONFIRMED", "unknown");
      return committed(prior);
    }
    if (current.revision !== input.expectedRevision) return reject(409, "REVISION_CONFLICT", "unknown");
    const stored = await step(() => {
      writeStarted = true;
      return deps.createImmutable({ ...input, bytes: image.bytes, contentType: image.contentType }, signal);
    });
    if (!stored || stored.objectKey !== input.objectKey || stored.digest !== digest) return reject(503, "STORAGE_UNCONFIRMED", "unknown");
    const publication = { ...input, generation: begin.snapshot.operation!.generation! };
    const answer = await step(() => deps.publishV2(publication, signal));
    if (answer?.status === "unknown") return reject(503, "PUBLICATION_UNCONFIRMED", "unknown");
    const result = parseAvatarRecoveryResult({ version: 1, ...answer }, publication, "publish");
    if (result.status === "conflict") return reject(409, "REVISION_CONFLICT", "unknown");
    if (result.status === "operation_conflict") return reject(409, "OPERATION_CONFLICT", "unknown");
    const receipt = result.status === "committed" ? result.snapshot.operation?.receipt : null;
    if (!receipt || !validReceipt(receipt, input)) return reject(503, "PUBLICATION_UNCONFIRMED", "unknown");
    return committed(receipt);
  } catch (error) {
    // A timeout/cancel cannot prove an already-started create/CAS was rolled back.
    const uncertainCommit = writeStarted || commitObserved;
    let configurationFailed = error instanceof AvatarEnvironmentChangedError;
    try { assertConfiguration(); } catch { configurationFailed = true; }
    if (configurationFailed) return reject(503, "UPLOAD_UNCONFIRMED", "unknown");
    return reject(uncertainCommit ? 503 : signal.aborted ? 408 : 503,
      uncertainCommit ? "UPLOAD_UNCONFIRMED" : signal.aborted ? "UPLOAD_ABORTED" : "UPLOAD_UNAVAILABLE",
      uncertainCommit || !signal.aborted ? "unknown" : "rejected");
  } finally { clearTimeout(timer); }
}
