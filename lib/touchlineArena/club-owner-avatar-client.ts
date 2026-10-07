import type { AvatarCurrent, projectAvatarRecoveryContext } from "./club-owner-avatar-upload-contract.ts";
import { CLUB_OWNER_AVATAR_TRANSPORT_MAX_BYTES } from "./club-owner-avatar-transport-limits.ts";

type Phase = "disabled" | "ready" | "sending" | "unknown" | "refresh_required" | "conflict" | "rejected" | "invalidated";
type ActionResult = Phase | "invalid" | "busy" | "blocked";
type Current = Pick<AvatarCurrent, "actorId" | "revision" | "avatarUrl">;
type Options = Readonly<{
  enabled?: boolean;
  /** Captured authoritative page context, not editable Auth metadata. */
  current: Current;
  baseGeneration: string;
  bytes: Uint8Array;
  contentType: string;
  isCurrent: () => boolean;
  randomUUID: () => string;
  request: typeof fetch;
  now?: () => number;
  scheduleTimeout?: (callback: () => void, ms: number) => () => void;
}>;
type Snapshot = Readonly<{
  phase: Phase;
  accountId: string;
  expectedRevision: string;
  baseGeneration: string;
  operationId: string | null;
  currentAvatarUrl: string | null;
  error: string | null;
}>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MAX_REVISION = BigInt("9223372036854775807");
// Browser admission mirrors server limits; it is not security enforcement. Do
// not import runtime server validators here: their dependency graph includes
// the native image decoder. Server byte validation remains mandatory.
const RESPONSE_BYTES = 8192, DEADLINE_MS = 30_000;
const revision = (value: unknown): value is string => typeof value === "string"
  && /^(0|[1-9][0-9]{0,18})$/.test(value) && BigInt(value) <= MAX_REVISION;
const uuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);
const url = (operation: string) => `/api/account/avatar?version=${operation}`;
const schedule = (callback: () => void, ms: number) => { const timer = setTimeout(callback, ms); return () => clearTimeout(timer); };
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
function exactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  return Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
const rejectedCodes: Readonly<Record<number, readonly string[]>> = {
  400: ["INVALID_ACCOUNT_OR_OPERATION", "INVALID_LENGTH", "LENGTH_MISMATCH", "EMPTY", "INVALID_BODY"],
  408: ["ABORTED", "BODY_TIMEOUT", "UPLOAD_ABORTED"],
  413: ["TOO_LARGE"], 415: ["CONTENT_ENCODING_NOT_SUPPORTED", "RAW_IMAGE_BODY_REQUIRED"],
  422: ["empty", "too_large", "pixel_limit", "unsupported_format", "heic_unsupported", "animated", "invalid_image"],
  428: ["VALID_REVISION_REQUIRED"],
};

/** One immutable file choice per controller. Construction, observation and
 * retries never perform implicit network work. The host calls send(true) only
 * after the file-selection gesture, and retry(true) only after a distinct retry
 * gesture. It must invalidate on account changes and dispose on unmount; client
 * session observation is a cancellation fence, never server authorization.
 *
 * A valid committed receipt only yields refresh_required. Keep the original
 * image until a fresh authoritative page context is obtained; create a new
 * controller for that context/next choice. No receipt-driven image replacement,
 * automatic rebase/retry, durable browser journal, or object deletion exists.
 * In-memory bytes/operation are lost on reload: reload must read server state,
 * not silently manufacture a retry. Timeout/cancel cannot prove rollback or
 * stop already-started server work. This module does not decode images.
 */
export function createClubOwnerAvatarClient(options: Options) {
  const { enabled, isCurrent, randomUUID, request, contentType, baseGeneration } = options;
  const now = options.now ?? (() => performance.now()), scheduleTimeout = options.scheduleTimeout ?? schedule;
  const accountId = options.current?.actorId, expectedRevision = options.current?.revision, currentAvatarUrl = options.current?.avatarUrl;
  let phase: Phase = enabled === true ? "rejected" : "disabled", error: string | null = null;
  let bytes: Uint8Array | undefined, operationId: string | null = null, invalidated = false, active: AbortController | undefined;
  if (enabled === true) {
    try {
      if (!uuid(accountId) || !revision(expectedRevision) || BigInt(expectedRevision) === MAX_REVISION || !revision(baseGeneration)
        || (currentAvatarUrl !== null && (typeof currentAvatarUrl !== "string" || currentAvatarUrl.length > 512_000))
        || (expectedRevision !== "0" && (typeof currentAvatarUrl !== "string"
          || !uuid(currentAvatarUrl.slice("/api/account/avatar?version=".length))
          || currentAvatarUrl !== url(currentAvatarUrl.slice("/api/account/avatar?version=".length))))
        || !(options.bytes instanceof Uint8Array) || !options.bytes.length || options.bytes.length > CLUB_OWNER_AVATAR_TRANSPORT_MAX_BYTES
        || !["application/octet-stream", "image/jpeg", "image/png", "image/webp"].includes(contentType)
        || typeof isCurrent !== "function" || typeof randomUUID !== "function" || typeof request !== "function"
        || typeof now !== "function" || typeof scheduleTimeout !== "function") throw Error();
      bytes = new Uint8Array(options.bytes);
      const operation = randomUUID();
      if (!uuid(operation)) throw Error();
      operationId = operation; phase = "ready";
    } catch { bytes = undefined; error = "INVALID_SELECTION"; }
  }
  function invalidate() {
    invalidated = true; phase = "invalidated"; error = null; bytes = undefined; active?.abort();
  }
  function current() {
    if (invalidated) return false;
    try { if (isCurrent() === true) return true; } catch { /* No account authorization can be inferred. */ }
    invalidate(); return false;
  }
  function snapshot(): Snapshot {
    if (phase !== "disabled" && phase !== "rejected") current();
    return Object.freeze({ phase, accountId, expectedRevision, baseGeneration, operationId, currentAvatarUrl, error });
  }
  function classify(status: number, value: unknown): { phase: Phase; error: string | null } {
    const unknown = { phase: "unknown", error: "UPLOAD_UNCONFIRMED" } as const;
    if (!isRecord(value)) return unknown;
    if (status === 200) {
      return exactKeys(value, ["ok", "state", "requiresRefresh", "accountId", "operationId", "revision", "avatarUrl"])
        && value.ok === true && value.state === "committed" && value.requiresRefresh === true
        && value.accountId === accountId && value.operationId === operationId && uuid(value.accountId) && uuid(value.operationId)
        && revision(value.revision) && BigInt(value.revision) === BigInt(expectedRevision) + BigInt(1) && value.avatarUrl === url(operationId!)
        ? { phase: "refresh_required", error: null } : unknown;
    }
    if (!exactKeys(value, ["ok", "state", "error"]) || value.ok !== false || value.state !== "rejected" || typeof value.error !== "string") return unknown;
    if (status === 409 && ["REVISION_CONFLICT", "OPERATION_CONFLICT", "OPERATION_SUPERSEDED"].includes(value.error)) return { phase: "conflict", error: value.error };
    if (status === 409 && value.error === "ACCOUNT_CHANGED" || status === 401 && value.error === "AUTHENTICATION_REQUIRED"
      || status === 403 && ["ACCESS_REQUIRED", "INVALID_ORIGIN"].includes(value.error)) return { phase: "invalidated", error: null };
    return rejectedCodes[status]?.includes(value.error) ? { phase: "rejected", error: value.error } : unknown;
  }
  async function attempt(explicitUserAction: unknown, retry: boolean): Promise<ActionResult> {
    if (explicitUserAction !== true) return "invalid";
    if (phase === "disabled") return "disabled";
    if (invalidated) return "invalidated";
    if (phase === "sending") return "busy";
    if (!bytes || !operationId) return "rejected";
    if (!current()) return "invalidated";
    if (phase !== (retry ? "unknown" : "ready")) return "blocked";
    phase = "sending"; error = null;
    const controller = new AbortController(); active = controller;
    let clearTimeout = () => {};
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined, body: ReadableStream<Uint8Array> | null = null, bodyComplete = false;
    const cancelBody = () => { if (reader) void reader.cancel().catch(() => undefined); else if (body) void body.cancel().catch(() => undefined); };
    controller.signal.addEventListener("abort", cancelBody);
    const wait = <T>(work: () => PromiseLike<T>): Promise<T> => new Promise((resolve, reject) => {
      const abort = () => { controller.signal.removeEventListener("abort", abort); reject(Error()); };
      if (controller.signal.aborted) { abort(); return; }
      controller.signal.addEventListener("abort", abort, { once: true });
      try { Promise.resolve(work()).then(value => {
        controller.signal.removeEventListener("abort", abort);
        if (controller.signal.aborted) abort(); else resolve(value);
      }, () => { controller.signal.removeEventListener("abort", abort); reject(Error()); }); }
      catch { controller.signal.removeEventListener("abort", abort); reject(Error()); }
    });
    try {
      const started = now();
      if (!Number.isFinite(started)) throw Error();
      const expires = started + DEADLINE_MS;
      const guard = () => {
        const time = now();
        if (!Number.isFinite(time) || time >= expires) controller.abort();
        if (!current()) throw Error();
        controller.signal.throwIfAborted();
      };
      clearTimeout = scheduleTimeout(() => controller.abort(), DEADLINE_MS);
      guard();
      const result = await wait(async () => {
        const response = await wait(() => request("/api/account/avatar", { method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error", signal: controller.signal,
          headers: { "content-type": contentType, "x-touchline-expected-account": accountId, "x-touchline-avatar-operation": operationId!, "x-touchline-avatar-generation": baseGeneration, "if-match": `"${expectedRevision}"` },
          // A transport cannot mutate the retained retry snapshot.
          body: new Uint8Array(bytes!) as BodyInit,
        }).then(response => {
          try { guard(); return response; }
          catch { void response.body?.cancel().catch(() => undefined); throw Error(); }
        }));
        guard();
        body = response.body;
        if (response.redirected || response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json" || !response.body) throw Error();
        const length = response.headers.get("content-length");
        if (length !== null && (!/^(0|[1-9][0-9]*)$/.test(length) || BigInt(length) > BigInt(RESPONSE_BYTES))) throw Error();
        reader = response.body.getReader();
        const buffer = new Uint8Array(RESPONSE_BYTES); let used = 0;
        while (true) {
          guard(); const part = await wait(() => reader!.read()); guard();
          if (part.done) break;
          if (!(part.value instanceof Uint8Array) || part.value.byteLength > RESPONSE_BYTES - used) throw Error();
          buffer.set(part.value, used); used += part.value.byteLength;
        }
        bodyComplete = true;
        const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, used)));
        guard(); return classify(response.status, value);
      });
      // The outer wait introduces a microtask boundary after receipt parsing.
      guard();
      if (result.phase === "invalidated") invalidate();
      // A retry's pre-write rejection describes that HTTP request, not the
      // history of the already-uncertain operation (which may have committed).
      else if (retry && result.phase === "rejected") { phase = "unknown"; error = "UPLOAD_UNCONFIRMED"; }
      else { phase = result.phase; error = result.error; }
      return phase;
    } catch {
      if (!current()) return "invalidated";
      phase = "unknown"; error = "UPLOAD_UNCONFIRMED"; return "unknown";
    } finally {
      clearTimeout();
      if (!bodyComplete) cancelBody();
      controller.signal.removeEventListener("abort", cancelBody);
      try { reader?.releaseLock(); } catch { /* Pending cancellation is not awaited. */ }
      if (active === controller) active = undefined;
    }
  }
  return Object.freeze({ snapshot, send: (explicitUserAction: unknown) => attempt(explicitUserAction, false),
    retry: (explicitUserAction: unknown) => attempt(explicitUserAction, true), invalidate, dispose: invalidate });
}

type RecoveryContext = ReturnType<typeof projectAvatarRecoveryContext>;
type RecoveryPhase = "disabled" | "unobserved" | "observed" | "checking" | "fencing" | "unknown" | "refresh_required" | "invalidated";
type FencePair = Readonly<{ generation: string; expectedActiveOperationId: string | null }>;
type BarrierStatus = "barrier_applied" | "committed" | "conflict";
type RecoveryOptions = Readonly<{
  enabled?: boolean;
  accountId: string;
  initialContext?: unknown;
  isCurrent: () => boolean;
  request: typeof fetch;
  /** Optional same-account file choice; retiring it does not cancel remote SQL. */
  upload?: Readonly<{ snapshot: () => { accountId: string }; invalidate: () => void }>;
  now?: () => number;
  scheduleTimeout?: (callback: () => void, ms: number) => () => void;
}>;

function parseControlContext(value: unknown, accountId: string): RecoveryContext {
  if (!isRecord(value) || !exactKeys(value, ["accountId", "revision", "avatarUrl", "generation", "activeOperationId",
    "fencedThroughGeneration", "operationId", "operationState", "committedRevision", "uploadAllowed", "canUpload", "readyForSelection"])
    || value.accountId !== accountId || !revision(value.revision) || !revision(value.generation)
    || !(value.fencedThroughGeneration === "-1" || revision(value.fencedThroughGeneration))
    || BigInt(value.fencedThroughGeneration as string) >= BigInt(value.generation)
    || typeof value.uploadAllowed !== "boolean" || value.canUpload !== false || value.readyForSelection !== false
    || !(value.avatarUrl === null || typeof value.avatarUrl === "string" && value.avatarUrl.length <= 512_000)) throw Error();
  if (value.revision !== "0" && (typeof value.avatarUrl !== "string" || !uuid(value.avatarUrl.slice("/api/account/avatar?version=".length))
    || value.avatarUrl !== url(value.avatarUrl.slice("/api/account/avatar?version=".length)))) throw Error();
  // C1's fresh context selects CURRENT active work, not a historical receipt.
  if (value.activeOperationId === null) {
    if (value.operationId !== null || value.operationState !== null || value.committedRevision !== null) throw Error();
  } else if (!uuid(value.activeOperationId) || value.operationId !== value.activeOperationId || value.operationState !== "pending"
    || value.committedRevision !== null || BigInt(value.generation) < BigInt(1) || BigInt(value.generation) >= MAX_REVISION) throw Error();
  return Object.freeze({ accountId, revision: value.revision, avatarUrl: value.avatarUrl as string | null,
    generation: value.generation, activeOperationId: value.activeOperationId as string | null,
    fencedThroughGeneration: value.fencedThroughGeneration as string, operationId: value.operationId as string | null,
    operationState: value.operationState as "pending" | null, committedRevision: null, uploadAllowed: value.uploadAllowed,
    canUpload: false, readyForSelection: false });
}

/** File-free recovery for a captured account. Construction/snapshot never send;
 * the host may explicitly call observe after reload, without persisted bytes or
 * a browser journal. Only fence(true) mutates, with a separate user gesture.
 * A lost fence is retried only with its original immutable epoch/active pair.
 * Neither idle, high-water nor uploadAllowed grants readiness: C1's false gates
 * remain false. No next-choice factory, automatic fence/retry or image update.
 * Server auth/CAS remain authority; isCurrent only fences this client lifetime.
 */
export function createClubOwnerAvatarRecoveryClient(options: RecoveryOptions) {
  const { enabled, accountId, isCurrent, request, upload } = options;
  const now = options.now ?? (() => performance.now()), scheduleTimeout = options.scheduleTimeout ?? schedule;
  let phase: RecoveryPhase = enabled === true ? "unobserved" : "disabled";
  let context: RecoveryContext | null = null, pendingFence: FencePair | null = null, barrierStatus: BarrierStatus | null = null;
  let active: AbortController | undefined, invalidated = false, uploadRetired = false;
  let invalidateUpload: (() => void) | undefined;
  let configured = false;
  if (enabled === true) {
    try {
      configured = uuid(accountId) && typeof isCurrent === "function" && typeof request === "function"
        && typeof now === "function" && typeof scheduleTimeout === "function"
        && (!upload || typeof upload.invalidate === "function" && upload.snapshot().accountId === accountId);
      if (!configured) throw Error();
      if (upload) invalidateUpload = upload.invalidate.bind(upload);
      if (options.initialContext !== undefined) { context = parseControlContext(options.initialContext, accountId); phase = "observed"; }
    } catch { phase = "unknown"; }
  }
  function retireUpload() {
    if (uploadRetired) return;
    uploadRetired = true; invalidateUpload?.();
  }
  function invalidate() {
    invalidated = true; phase = "invalidated"; context = null; pendingFence = null; barrierStatus = null; active?.abort();
    try { retireUpload(); } catch { /* Local collaborators cannot restore admission. */ }
  }
  function current() {
    if (invalidated) return false;
    try { if (isCurrent() === true) return true; } catch { /* Observation is not authentication. */ }
    invalidate(); return false;
  }
  function snapshot() {
    if (phase !== "disabled") current();
    return Object.freeze({ phase, accountId, context, pendingFence, barrierStatus, canUpload: false as const, readyForSelection: false as const });
  }
  async function attempt(action: "status" | "fence" | "retry", gesture?: unknown): Promise<RecoveryPhase | "invalid" | "busy" | "blocked"> {
    if (action !== "status" && gesture !== true) return "invalid";
    if (phase === "disabled") return "disabled";
    if (invalidated || !current()) return "invalidated";
    if (!configured) return "unknown";
    if (active) return "busy";
    if (action === "fence") {
      if (pendingFence || phase !== "observed" || !context || !context.uploadAllowed) return "blocked";
      pendingFence = Object.freeze({ generation: context.generation, expectedActiveOperationId: context.activeOperationId });
    } else if (action === "retry" && !pendingFence) return "blocked";
    const pair = action === "status" ? null : pendingFence!;
    phase = pair ? "fencing" : "checking"; barrierStatus = null;
    const controller = new AbortController(); active = controller;
    let stop = () => {};
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined, body: ReadableStream<Uint8Array> | null = null, complete = false;
    const cancelBody = () => { if (reader) void reader.cancel().catch(() => undefined); else if (body) void body.cancel().catch(() => undefined); };
    controller.signal.addEventListener("abort", cancelBody);
    const wait = <T>(work: () => PromiseLike<T>) => new Promise<T>((resolve, reject) => {
      const aborted = () => { controller.signal.removeEventListener("abort", aborted); reject(Error()); };
      if (controller.signal.aborted) { aborted(); return; }
      controller.signal.addEventListener("abort", aborted, { once: true });
      try { Promise.resolve(work()).then(value => {
        controller.signal.removeEventListener("abort", aborted); if (controller.signal.aborted) aborted(); else resolve(value);
      }, () => { controller.signal.removeEventListener("abort", aborted); reject(Error()); }); }
      catch { controller.signal.removeEventListener("abort", aborted); reject(Error()); }
    });
    try {
      const started = now(); if (!Number.isFinite(started)) throw Error(); const expires = started + 8_000;
      const guard = () => { const time = now(); if (!Number.isFinite(time) || time >= expires) controller.abort(); if (!current()) throw Error(); controller.signal.throwIfAborted(); };
      stop = scheduleTimeout(() => controller.abort(), 8_000); guard();
      // BEFORE dispatch: even a lost acknowledgement may have fenced the upload.
      if (pair) retireUpload();
      guard();
      const response = await wait(() => request("/api/account/avatar/recovery", {
        method: "POST", credentials: "same-origin", cache: "no-store", redirect: "error", signal: controller.signal,
        headers: { "content-type": "application/json", "x-touchline-expected-account": accountId },
        body: JSON.stringify(pair ? { action: "fence", ...pair, explicitRecoveryConsent: true } : { action: "status" }),
      }).then(response => { try { guard(); return response; } catch { void response.body?.cancel().catch(() => undefined); throw Error(); } }));
      guard(); body = response.body;
      if (response.status !== 200 || response.redirected || response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json" || !body) throw Error();
      const length = response.headers.get("content-length");
      if (length !== null && (!/^(0|[1-9][0-9]*)$/.test(length) || BigInt(length) > BigInt(RESPONSE_BYTES))) throw Error();
      reader = body.getReader(); const buffer = new Uint8Array(RESPONSE_BYTES); let used = 0;
      while (true) {
        guard(); const part = await wait(() => reader!.read()); guard(); if (part.done) break;
        if (!(part.value instanceof Uint8Array) || part.value.byteLength > RESPONSE_BYTES - used) throw Error();
        buffer.set(part.value, used); used += part.value.byteLength;
      }
      complete = true;
      if (length !== null && BigInt(length) !== BigInt(used)) throw Error();
      const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buffer.subarray(0, used)));
      if (!isRecord(value) || !exactKeys(value, pair ? ["ok", "state", "context", "barrierStatus"] : ["ok", "state", "context"])
        || value.ok !== true || value.state !== "observed") throw Error();
      const fresh = parseControlContext(value.context, accountId);
      if (context && (BigInt(fresh.generation) < BigInt(context.generation) || BigInt(fresh.revision) < BigInt(context.revision))) throw Error();
      if (pair) {
        if (!["barrier_applied", "committed", "conflict"].includes(String(value.barrierStatus))) throw Error();
        if (value.barrierStatus === "barrier_applied" && BigInt(fresh.fencedThroughGeneration) < BigInt(pair.generation)) throw Error();
        if (value.barrierStatus === "committed" && (pair.expectedActiveOperationId === null || BigInt(fresh.generation) <= BigInt(pair.generation))) throw Error();
      }
      guard(); context = fresh; barrierStatus = pair ? value.barrierStatus as BarrierStatus : null;
      if (pair) pendingFence = null;
      phase = pair ? "refresh_required" : "observed";
      return phase;
    } catch {
      if (!current()) return "invalidated";
      phase = "unknown"; return phase;
    } finally {
      stop(); if (!complete) cancelBody(); controller.signal.removeEventListener("abort", cancelBody);
      try { reader?.releaseLock(); } catch { /* Do not await hostile cancellation. */ }
      if (active === controller) active = undefined;
    }
  }
  return Object.freeze({ snapshot, observe: () => attempt("status"), fence: (gesture: unknown) => attempt("fence", gesture),
    retryFence: (gesture: unknown) => attempt("retry", gesture), invalidate, dispose: invalidate });
}
