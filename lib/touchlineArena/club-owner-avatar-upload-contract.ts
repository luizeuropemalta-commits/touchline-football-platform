import type { ClubOwnerAvatarValidation } from "./club-owner-avatar-validation.ts";
import { CLUB_OWNER_AVATAR_TRANSPORT_MAX_BYTES } from "./club-owner-avatar-transport-limits.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_REVISION = BigInt("9223372036854775807");
export const AVATAR_UPLOAD_READ_TIMEOUT_MS = 10_000;
export const AVATAR_UPLOAD_TOTAL_TIMEOUT_MS = 30_000;

export class AvatarEnvironmentChangedError extends Error {
  constructor() { super("AVATAR_CONFIGURATION_CHANGED"); this.name = "AvatarEnvironmentChangedError"; }
}

/** Capture a synchronous assertion, never environment values or credentials.
 * Once observed, failure is permanent for this guard even if configuration is
 * restored. No assertion preserves legacy behavior; this is not cancellation.
 */
export function createAvatarEnvironmentGuard(assertEnvironment?: () => void): () => void {
  const assertion = assertEnvironment;
  let failed = assertion !== undefined && typeof assertion !== "function";
  return () => {
    if (failed) throw new AvatarEnvironmentChangedError();
    try {
      const result: unknown = assertion?.();
      if (result !== undefined) {
        // An async assertion cannot authorize a synchronous sensitive boundary.
        // Observe its rejection, but do not wait for it or treat it as admission.
        void Promise.resolve(result).catch(() => undefined);
        throw new AvatarEnvironmentChangedError();
      }
    } catch { failed = true; throw new AvatarEnvironmentChangedError(); }
  };
}
export const isAvatarAccountId = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
export function isAvatarRevision(value: unknown): value is string {
  return typeof value === "string" && /^(0|[1-9][0-9]{0,18})$/.test(value) && BigInt(value) <= MAX_REVISION;
}
export function avatarUploadTimeout(value: number | undefined, maximum: number) {
  return value !== undefined && Number.isFinite(value) && value > 0 ? Math.max(1, Math.min(Math.floor(value), maximum)) : maximum;
}

export type AvatarCurrent = Readonly<{ actorId: string; revision: string; avatarUrl: string | null; operationId: string | null; digest: string | null }>;
export type AvatarPublication = Readonly<{ actorId: string; operationId: string; expectedRevision: string; digest: string; objectKey: string }>;
export type AvatarReceipt = AvatarPublication & Readonly<{ revision: string; avatarUrl: string }>;
export type AvatarPublishResult = Readonly<{ status: "committed"; receipt: AvatarReceipt }>
  | Readonly<{ status: "conflict" | "operation_conflict" | "unknown" }>;

export type AvatarBeginInput = Readonly<{ actorId: string; operationId: string; expectedRevision: string; baseGeneration: string }>;
export type AvatarPublicationV2 = AvatarPublication & Readonly<{ generation: string }>;
export type AvatarOperationSnapshot = Readonly<{
  version: 1; actorId: string; revision: string; generation: string; activeOperationId: string | null;
  fencedThroughGeneration: string; requestedOperationId: string;
  operation: Readonly<{ operationId: string; state: "pending" | "committed" | "fenced"; expectedRevision: string;
    baseGeneration: string | null; generation: string | null; legacy: boolean; receipt: AvatarReceipt | null }> | null;
}>;
export type AvatarRecoveryResult = Readonly<{ status: "started" | "pending" | "busy" | "committed" | "fenced" | "conflict" | "operation_conflict"; snapshot: AvatarOperationSnapshot }>
  | Readonly<{ status: "unknown" }>;

/** Strict SQL envelope boundary shared with the injected handler. No absence,
 * readiness or historical generation is inferred from a missing response. */
export function parseAvatarRecoveryResult(value: unknown, input: AvatarBeginInput | AvatarPublicationV2, action: "begin" | "publish"): AvatarRecoveryResult {
  const fail = (): never => { throw Error("AVATAR_RECOVERY_UNCONFIRMED"); };
  const record = (v: unknown): Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : fail();
  const uuid = (v: unknown): v is string => isAvatarAccountId(v) && v === v.toLowerCase();
  const row = record(value), s = record(row.snapshot);
  const statuses = action === "begin" ? ["started", "pending", "busy", "committed", "fenced", "conflict", "operation_conflict"] : ["committed", "conflict", "operation_conflict"];
  if (row.version !== 1 || !statuses.includes(String(row.status)) || s.version !== 1 || s.actorId !== input.actorId
    || s.requestedOperationId !== input.operationId || !isAvatarRevision(s.revision) || !isAvatarRevision(s.generation)
    || !(s.activeOperationId === null || uuid(s.activeOperationId))
    || !(s.fencedThroughGeneration === "-1" || isAvatarRevision(s.fencedThroughGeneration))
    || BigInt(s.fencedThroughGeneration as string) >= BigInt(s.generation)) fail();
  let operation: AvatarOperationSnapshot["operation"] = null;
  if (s.operation !== null) {
    const o = record(s.operation);
    if (o.operationId !== input.operationId || !["pending", "committed", "fenced"].includes(String(o.state))
      || !isAvatarRevision(o.expectedRevision) || BigInt(o.expectedRevision) === MAX_REVISION || typeof o.legacy !== "boolean") fail();
    if (o.legacy) {
      if (o.state !== "committed" || o.baseGeneration !== null || o.generation !== null) fail();
    } else {
      if (!isAvatarRevision(o.baseGeneration) || !isAvatarRevision(o.generation)
        || BigInt(o.baseGeneration) > MAX_REVISION - BigInt(2) || BigInt(o.generation) !== BigInt(o.baseGeneration) + BigInt(1)
        || BigInt(o.generation) > BigInt(s.generation as string)) fail();
      if (o.state === "pending" ? s.activeOperationId !== o.operationId || s.generation !== o.generation
        : s.activeOperationId === o.operationId || BigInt(s.generation as string) <= BigInt(o.generation as string)) fail();
    }
    let receipt: AvatarReceipt | null = null;
    if (o.state === "committed") {
      const r = record(o.receipt);
      if (r.actorId !== input.actorId || r.operationId !== input.operationId || r.expectedRevision !== o.expectedRevision
        || !isAvatarRevision(r.revision) || BigInt(r.revision) !== BigInt(o.expectedRevision as string) + BigInt(1)
        || BigInt(s.revision as string) < BigInt(r.revision) || typeof r.digest !== "string" || !/^[a-f0-9]{64}$/.test(r.digest)
        || r.objectKey !== `${input.actorId}/${input.operationId}/${r.digest}.webp`
        || r.avatarUrl !== `/api/account/avatar?version=${input.operationId}`) fail();
      receipt = { actorId: input.actorId, operationId: input.operationId, expectedRevision: r.expectedRevision as string,
        revision: r.revision as string, digest: r.digest as string, objectKey: r.objectKey as string, avatarUrl: r.avatarUrl as string };
    } else if (o.receipt !== null) fail();
    operation = { operationId: input.operationId, state: o.state as "pending" | "committed" | "fenced", expectedRevision: o.expectedRevision as string,
      baseGeneration: o.baseGeneration as string | null, generation: o.generation as string | null, legacy: o.legacy as boolean, receipt };
  }
  if (["started", "pending", "committed", "fenced"].includes(String(row.status))) {
    if (!operation || operation.state !== (row.status === "started" ? "pending" : row.status) || operation.expectedRevision !== input.expectedRevision) fail();
    if (action === "begin") {
      if (!operation!.legacy && operation!.baseGeneration !== (input as AvatarBeginInput).baseGeneration) fail();
      if (row.status === "started" && (operation!.legacy || s.revision !== input.expectedRevision)) fail();
    } else {
      const p = input as AvatarPublicationV2;
      if (operation!.legacy || operation!.generation !== p.generation || operation!.receipt?.digest !== p.digest || operation!.receipt?.objectKey !== p.objectKey) fail();
    }
  }
  if (row.status === "busy" && (s.activeOperationId === null || s.activeOperationId === input.operationId || operation !== null)) fail();
  return { status: row.status as Exclude<AvatarRecoveryResult["status"], "unknown">, snapshot: {
    version: 1, actorId: input.actorId, revision: s.revision as string, generation: s.generation as string,
    activeOperationId: s.activeOperationId as string | null, fencedThroughGeneration: s.fencedThroughGeneration as string,
    requestedOperationId: input.operationId, operation,
  } };
}

/** REQUIRED FUTURE ADAPTER CONTRACT — not implemented or proven here:
 * - actor derives identity/access from a validated server session, never user_metadata.
 * - all operations use captured actorId; never retarget from later browser cookies.
 * - readCurrent/findOperation are authoritative owner-scoped reads, not cached guesses.
 * - createImmutable confirms exact bytes/digest at the supplied owner-scoped key;
 *   create-only, never overwrite. Existing objects require exact-content verification.
 * - publish atomically binds (actorId, operationId) to expectedRevision+digest+key,
 *   compares monotonic avatar_revision, updates users.avatar_url and increments
 *   exactly once, retaining a durable receipt. Same operation/different binding
 *   conflicts; same committed operation returns its receipt without another update.
 * - every avatar writer participates in that revision protocol; direct client
 *   avatar_url/revision writes must be constrained. String-URL CAS alone permits ABA.
 * - rejected CAS leaves the prior photo intact. Neither abort nor timeout implies
 *   rollback. No deletion dependency exists: uncertain or superseded objects stay.
 * - adapters enforce operation timeouts, ownership/RLS, immutable storage and
 *   admission/concurrency limits independently; Promise racing is NOT cancellation
 *   of native decoding/SQL/Storage, nor a global CPU or memory quota.
 * Tests with injected in-memory dependencies cannot prove these durable guarantees.
 */
export type AvatarUploadDependencies = {
  actor: (signal: AbortSignal) => Promise<{ id: string; allowed: boolean } | null>;
  validate: (bytes: Uint8Array, signal: AbortSignal) => Promise<ClubOwnerAvatarValidation>;
  readCurrent: (actorId: string, signal: AbortSignal) => Promise<AvatarCurrent>;
  findOperation: (input: { actorId: string; operationId: string }, signal: AbortSignal) => Promise<AvatarReceipt | null>;
  createImmutable: (input: AvatarPublication & { bytes: Buffer; contentType: "image/webp" }, signal: AbortSignal) => Promise<{ objectKey: string; digest: string }>;
  publish: (input: AvatarPublication, signal: AbortSignal) => Promise<AvatarPublishResult>;
};

/** Only started reserves a new worker. Committed permits bounded read-only byte
 * verification, never another create/publication. Pending never resumes work. */
export type AvatarRecoveryUploadDependencies = Omit<AvatarUploadDependencies, "findOperation" | "publish"> & {
  beginOperation: (input: AvatarBeginInput, signal: AbortSignal) => Promise<AvatarRecoveryResult>;
  publishV2: (input: AvatarPublicationV2, signal: AbortSignal) => Promise<AvatarRecoveryResult>;
};

export type AvatarControlSnapshot = Omit<AvatarOperationSnapshot, "requestedOperationId"> & { requestedOperationId: string | null };
export type AvatarFenceInput = Readonly<{ actorId: string; generation: string; expectedActiveOperationId: string | null }>;
export type AvatarFenceResult = Readonly<{ status: "barrier_applied" | "committed" | "conflict"; snapshot: AvatarControlSnapshot }>;
export type AvatarRecoveryContext = Readonly<{ current: AvatarCurrent; snapshot: AvatarControlSnapshot }>;
export type AvatarControlTracker = <T>(work: () => PromiseLike<T>) => Promise<T>;

/** Status has no readiness result. Null request means the CURRENT active
 * operation, not authoritative absence of a delayed begin from an old epoch. */
export function parseAvatarOperationStatus(value: unknown, actorId: string, requested: string | null): AvatarControlSnapshot {
  const fail = (): never => { throw Error("AVATAR_CONTROL_UNCONFIRMED"); };
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail();
  const s = value as Record<string, unknown>;
  const uuid = (v: unknown): v is string => isAvatarAccountId(v) && v === v.toLowerCase();
  if (!uuid(actorId) || !(requested === null || uuid(requested)) || s.version !== 1 || s.actorId !== actorId
    || !isAvatarRevision(s.revision) || !isAvatarRevision(s.generation)
    || !(s.activeOperationId === null || uuid(s.activeOperationId))
    || !(s.fencedThroughGeneration === "-1" || isAvatarRevision(s.fencedThroughGeneration))
    || BigInt(s.fencedThroughGeneration as string) >= BigInt(s.generation)) return fail();
  const operationId = requested ?? s.activeOperationId as string | null;
  if (s.requestedOperationId !== operationId) return fail();
  if (operationId === null) {
    if (s.operation !== null || s.activeOperationId !== null) return fail();
    return { version: 1, actorId, revision: s.revision, generation: s.generation, activeOperationId: null,
      fencedThroughGeneration: s.fencedThroughGeneration as string, requestedOperationId: null, operation: null };
  }
  if (s.operation !== null && (!s.operation || typeof s.operation !== "object" || Array.isArray(s.operation))) return fail();
  const op = s.operation as Record<string, unknown> | null;
  const result = parseAvatarRecoveryResult({ version: 1, status: op?.state ?? "conflict", snapshot: s }, {
    actorId, operationId, expectedRevision: op?.expectedRevision as string ?? s.revision,
    baseGeneration: op?.baseGeneration as string ?? "0",
  }, "begin");
  if (result.status === "unknown" || (s.activeOperationId === operationId && result.snapshot.operation?.state !== "pending")) return fail();
  return result.snapshot;
}

export function parseAvatarFenceResult(value: unknown, input: AvatarFenceInput): AvatarFenceResult {
  if (!value || typeof value !== "object" || Array.isArray(value) || !isAvatarRevision(input.generation)) throw Error("AVATAR_CONTROL_UNCONFIRMED");
  const row = value as Record<string, unknown>;
  if (row.version !== 1 || !["barrier_applied", "committed", "conflict"].includes(String(row.status))) throw Error("AVATAR_CONTROL_UNCONFIRMED");
  const snapshot = parseAvatarOperationStatus(row.snapshot, input.actorId, input.expectedActiveOperationId);
  if (row.status === "barrier_applied" && BigInt(snapshot.fencedThroughGeneration) < BigInt(input.generation)) throw Error("AVATAR_CONTROL_UNCONFIRMED");
  if (row.status === "committed" && (snapshot.operation?.state !== "committed" || snapshot.operation.legacy
    || snapshot.operation.generation !== input.generation)) throw Error("AVATAR_CONTROL_UNCONFIRMED");
  return { status: row.status as AvatarFenceResult["status"], snapshot };
}

/** Public projection excludes Storage keys/digests. Policy permission and an
 * observed idle state are deliberately NOT upload readiness in this stage. */
export function projectAvatarRecoveryContext(context: AvatarRecoveryContext, uploadAllowed: boolean) {
  const { current, snapshot } = context;
  return Object.freeze({ accountId: current.actorId, revision: current.revision, avatarUrl: current.avatarUrl,
    generation: snapshot.generation, activeOperationId: snapshot.activeOperationId, fencedThroughGeneration: snapshot.fencedThroughGeneration,
    operationId: snapshot.requestedOperationId, operationState: snapshot.operation?.state ?? null,
    committedRevision: snapshot.operation?.receipt?.revision ?? null,
    uploadAllowed, canUpload: false as const, readyForSelection: false as const });
}

export function parseAvatarUploadRequest(request: Request):
  | { ok: true; accountId: string; operationId: string; expectedRevision: string; baseGeneration: string }
  | { ok: false; status: number; error: string } {
  if (request.method !== "POST") return { ok: false, status: 405, error: "METHOD_NOT_ALLOWED" };
  if (request.headers.get("origin") !== new URL(request.url).origin
    || (request.headers.has("sec-fetch-site") && request.headers.get("sec-fetch-site") !== "same-origin")) return { ok: false, status: 403, error: "INVALID_ORIGIN" };
  const accountId = request.headers.get("x-touchline-expected-account"), operationId = request.headers.get("x-touchline-avatar-operation");
  if (!isAvatarAccountId(accountId) || !isAvatarAccountId(operationId)) return { ok: false, status: 400, error: "INVALID_ACCOUNT_OR_OPERATION" };
  const revision = request.headers.get("if-match")?.match(/^"(0|[1-9][0-9]{0,18})"$/)?.[1];
  if (!isAvatarRevision(revision) || BigInt(revision) === MAX_REVISION) return { ok: false, status: 428, error: "VALID_REVISION_REQUIRED" };
  const baseGeneration = request.headers.get("x-touchline-avatar-generation");
  if (!isAvatarRevision(baseGeneration)) return { ok: false, status: 428, error: "VALID_GENERATION_REQUIRED" };
  if (request.headers.has("content-encoding") && request.headers.get("content-encoding")?.toLowerCase() !== "identity") return { ok: false, status: 415, error: "CONTENT_ENCODING_NOT_SUPPORTED" };
  // Content-Type is transport admission only; the validator inspects actual bytes.
  if (!["application/octet-stream", "image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"].includes(request.headers.get("content-type")?.toLowerCase() ?? "")) return { ok: false, status: 415, error: "RAW_IMAGE_BODY_REQUIRED" };
  return { ok: true, accountId: accountId.toLowerCase(), operationId: operationId.toLowerCase(), expectedRevision: revision, baseGeneration };
}

/** Limits waiting only. A started dependency can still finish after rejection. */
export function awaitAvatarStep<T>(work: () => PromiseLike<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const aborted = () => { signal.removeEventListener("abort", aborted); reject(new Error("AVATAR_OPERATION_ABORTED")); };
    if (signal.aborted) { aborted(); return; }
    signal.addEventListener("abort", aborted, { once: true });
    try {
      Promise.resolve(work()).then(value => {
        signal.removeEventListener("abort", aborted);
        if (signal.aborted) aborted(); else resolve(value);
      }, error => { signal.removeEventListener("abort", aborted); reject(error); });
    } catch (error) { signal.removeEventListener("abort", aborted); reject(error); }
  });
}

type BodyError = "too_large" | "invalid_length" | "length_mismatch" | "empty" | "body_timeout" | "aborted" | "invalid_body";
export async function readAvatarUploadBody(request: Request, outerSignal?: AbortSignal, timeoutMs?: number, assertEnvironment?: () => void): Promise<
  { ok: true; bytes: Buffer } | { ok: false; error: BodyError }
> {
  const assertConfiguration = createAvatarEnvironmentGuard(assertEnvironment);
  assertConfiguration();
  const declared = request.headers.get("content-length");
  const refuse = (error: BodyError) => {
    void request.body?.cancel().catch(() => undefined);
    return { ok: false, error } as const;
  };
  if (declared !== null && !/^(0|[1-9][0-9]*)$/.test(declared)) return refuse("invalid_length");
  if (declared !== null && BigInt(declared) > BigInt(CLUB_OWNER_AVATAR_TRANSPORT_MAX_BYTES)) return refuse("too_large");
  if (!request.body) return { ok: false, error: "empty" };
  let reader: ReadableStreamDefaultReader<Uint8Array>;
  try { reader = request.body.getReader(); } catch { return { ok: false, error: "invalid_body" }; }
  const timerController = new AbortController();
  const duration = avatarUploadTimeout(timeoutMs, AVATAR_UPLOAD_READ_TIMEOUT_MS);
  const expires = performance.now() + duration;
  const timer = setTimeout(() => timerController.abort(), duration);
  const signal = AbortSignal.any([request.signal, timerController.signal, ...(outerSignal ? [outerSignal] : [])]);
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", cancel, { once: true });
  let completed = false;
  try {
    const chunks: Buffer[] = []; let total = 0, page: Buffer | null = null, pageUsed = 0;
    while (true) {
      assertConfiguration();
      // Continuous immediately-ready chunks must not starve the timer callback.
      if (performance.now() >= expires) timerController.abort();
      const { done, value } = await awaitAvatarStep(() => reader.read(), signal);
      assertConfiguration();
      if (performance.now() >= expires) timerController.abort();
      signal.throwIfAborted();
      if (done) break;
      if (!(value instanceof Uint8Array)) return { ok: false, error: "invalid_body" };
      if (value.byteLength > CLUB_OWNER_AVATAR_TRANSPORT_MAX_BYTES - total) return { ok: false, error: "too_large" };
      // Coalesce tiny chunks: both bytes AND buffer-count stay bounded (62 pages).
      // Snapshot producer-owned bytes before the next read, not before checking size.
      let offset = 0;
      while (offset < value.byteLength) {
        if (!page || pageUsed === page.length) {
          page = Buffer.allocUnsafe(Math.min(65_536, CLUB_OWNER_AVATAR_TRANSPORT_MAX_BYTES - total));
          chunks.push(page); pageUsed = 0;
        }
        const length = Math.min(page.length - pageUsed, value.byteLength - offset);
        page.set(value.subarray(offset, offset + length), pageUsed);
        pageUsed += length; offset += length; total += length;
      }
    }
    if (!total) return { ok: false, error: "empty" };
    if (declared !== null && BigInt(declared) !== BigInt(total)) return { ok: false, error: "length_mismatch" };
    if (page && pageUsed < page.length) chunks[chunks.length - 1] = page.subarray(0, pageUsed);
    completed = true; return { ok: true, bytes: Buffer.concat(chunks, total) };
  } catch (error) {
    // Configuration failure is a server uncertainty, never malformed image data.
    assertConfiguration();
    if (error instanceof AvatarEnvironmentChangedError) throw error;
    return { ok: false, error: request.signal.aborted || outerSignal?.aborted ? "aborted" : timerController.signal.aborted ? "body_timeout" : "invalid_body" };
  } finally {
    clearTimeout(timer); signal.removeEventListener("abort", cancel);
    if (!completed) cancel();
    try { reader.releaseLock(); } catch { /* A cancelled underlying stream may still be settling. */ }
  }
}
