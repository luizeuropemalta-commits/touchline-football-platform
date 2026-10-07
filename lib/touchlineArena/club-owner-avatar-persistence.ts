import type { SupabaseClient } from "@supabase/supabase-js";
import {
  avatarUploadTimeout, awaitAvatarStep, isAvatarAccountId, isAvatarRevision,
  parseAvatarRecoveryResult,
  parseAvatarOperationStatus, parseAvatarFenceResult,
  type AvatarCurrent, type AvatarPublication, type AvatarPublishResult, type AvatarReceipt, type AvatarUploadDependencies,
  type AvatarRecoveryUploadDependencies, type AvatarBeginInput, type AvatarPublicationV2, type AvatarRecoveryResult,
  type AvatarControlSnapshot, type AvatarFenceInput, type AvatarFenceResult, type AvatarRecoveryContext, type AvatarControlTracker,
} from "./club-owner-avatar-upload-contract.ts";

type Persistence = Pick<AvatarUploadDependencies, "readCurrent" | "findOperation" | "publish">
  & Pick<AvatarRecoveryUploadDependencies, "beginOperation" | "publishV2"> & {
    readOperationStatus: (operationId: string | null, signal: AbortSignal) => Promise<AvatarControlSnapshot>;
    fenceOperation: (input: AvatarFenceInput, signal: AbortSignal) => Promise<AvatarFenceResult>;
    readRecoveryContext: (signal: AbortSignal) => Promise<AvatarRecoveryContext>;
  };
const MAX_REVISION = BigInt("9223372036854775807");
const TIMEOUT_MS = 10_000;
const unavailable = () => new Error("AVATAR_PERSISTENCE_UNCONFIRMED");
const record = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const uuid = (value: unknown): value is string => isAvatarAccountId(value) && value === value.toLowerCase();
const validDigest = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
const url = (operationId: string) => `/api/account/avatar?version=${operationId}`;

function parsePublication(value: unknown, actor: string): AvatarPublication {
  const row = record(value);
  if (!row || row.actorId !== actor || !uuid(row.operationId) || !isAvatarRevision(row.expectedRevision)
    || BigInt(row.expectedRevision) >= MAX_REVISION || !validDigest(row.digest)
    || row.objectKey !== `${actor}/${row.operationId}/${row.digest}.webp`) throw unavailable();
  // Snapshot only validated scalars before the first asynchronous boundary.
  return { actorId: actor, operationId: row.operationId, expectedRevision: row.expectedRevision, digest: row.digest, objectKey: row.objectKey as string };
}
function parseReceipt(value: unknown, actor: string, operation: string): AvatarReceipt {
  const input = parsePublication(value, actor), row = record(value)!;
  if (input.operationId !== operation || !isAvatarRevision(row.revision)
    || BigInt(row.revision) !== BigInt(input.expectedRevision) + BigInt(1) || row.avatarUrl !== url(operation)) throw unavailable();
  return { ...input, revision: row.revision, avatarUrl: row.avatarUrl as string };
}
function parseCurrent(value: unknown, actor: string): AvatarCurrent {
  const row = record(value);
  if (!row || row.actorId !== actor || !isAvatarRevision(row.revision)) throw unavailable();
  if (row.revision === "0") {
    if ((row.avatarUrl !== null && typeof row.avatarUrl !== "string") || row.operationId !== null || row.digest !== null) throw unavailable();
    return { actorId: actor, revision: "0", avatarUrl: row.avatarUrl, operationId: null, digest: null };
  }
  if (!uuid(row.operationId) || !validDigest(row.digest) || row.avatarUrl !== url(row.operationId)) throw unavailable();
  return { actorId: actor, revision: row.revision, avatarUrl: row.avatarUrl as string, operationId: row.operationId, digest: row.digest };
}

/** Instantiate once per authenticated server request with a captured authorized
 * actor and a private service client. This adapter does NOT authenticate callers,
 * derive access from metadata, configure credentials or activate a route.
 * SQL/ACL deployment and real persistence remain separate admission requirements.
 * Limits bound waiting only: abort/timeout cannot prove a transaction rolled back.
 * No automatic replay, rebase, mutation outside the RPC, or object deletion.
 */
export function createClubOwnerAvatarPersistence(client: Pick<SupabaseClient, "rpc">, actorId: string,
  limits: { timeoutMs?: number; trackControl?: AvatarControlTracker } = {}): Persistence {
  if (!uuid(actorId)) throw unavailable();
  const actor = actorId, rpc = client.rpc.bind(client);
  const duration = avatarUploadTimeout(limits.timeoutMs, TIMEOUT_MS);
  const trackControl = limits.trackControl;
  const finalGuard = (signal: AbortSignal, expires: number) => {
    if (signal.aborted || performance.now() >= expires) throw unavailable();
  };
  async function run<T>(outer: AbortSignal, expires: number, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const timerController = new AbortController();
    const signal = AbortSignal.any([outer, timerController.signal]);
    const timer = setTimeout(() => timerController.abort(), duration);
    const guard = () => { if (performance.now() >= expires) timerController.abort(); signal.throwIfAborted(); };
    try {
      guard();
      const result = await awaitAvatarStep(() => work(signal), signal);
      guard();
      return result;
    } catch { throw unavailable(); }
    finally { clearTimeout(timer); }
  }
  async function query(name: string, args: Record<string, string | null>, signal: AbortSignal): Promise<unknown> {
    signal.throwIfAborted();
    // Installed SDK supports explicit retry(false). Keep all RPCs on POST;
    // future transport changes must not silently replay a publication attempt.
    const work = () => rpc(name, args).abortSignal(signal).retry(false);
    const response = await (trackControl ? trackControl(work) : work());
    signal.throwIfAborted();
    if (!response || response.error !== null || response.status !== 200) throw unavailable();
    return response.data;
  }
  return {
    async readOperationStatus(operationId, signal) {
      if (!(operationId === null || uuid(operationId))) throw unavailable();
      const expires = performance.now() + duration;
      const result = await run(signal, expires, async inner => parseAvatarOperationStatus(
        await query("touchline_read_club_owner_avatar_operation_status", { p_actor: actor, p_operation: operationId }, inner), actor, operationId));
      finalGuard(signal, expires); return result;
    },
    async fenceOperation(input, signal) {
      const captured = { actorId: input.actorId, generation: input.generation, expectedActiveOperationId: input.expectedActiveOperationId };
      if (captured.actorId !== actor || !isAvatarRevision(captured.generation)
        || !(captured.expectedActiveOperationId === null || uuid(captured.expectedActiveOperationId))) throw unavailable();
      const expires = performance.now() + duration;
      const result = await run(signal, expires, async inner => parseAvatarFenceResult(
        await query("touchline_fence_club_owner_avatar_operation", { p_actor: actor, p_generation: captured.generation,
          p_expected_active: captured.expectedActiveOperationId }, inner), captured));
      finalGuard(signal, expires); return result;
    },
    async readRecoveryContext(signal) {
      const expires = performance.now() + duration;
      const result = await run(signal, expires, async inner => {
        const readStatus = async () => parseAvatarOperationStatus(await query("touchline_read_club_owner_avatar_operation_status",
          { p_actor: actor, p_operation: null }, inner), actor, null);
        const before = await readStatus();
        finalGuard(inner, expires);
        const current = parseCurrent(await query("touchline_read_club_owner_avatar", { p_actor: actor }, inner), actor);
        finalGuard(inner, expires);
        const after = await readStatus();
        if (JSON.stringify(before) !== JSON.stringify(after) || current.revision !== after.revision) throw unavailable();
        return { current, snapshot: after };
      });
      finalGuard(signal, expires); return result;
    },
    async beginOperation(input, signal) {
      try {
        const expires = performance.now() + duration;
        const captured: AvatarBeginInput = { actorId: input.actorId, operationId: input.operationId,
          expectedRevision: input.expectedRevision, baseGeneration: input.baseGeneration };
        if (captured.actorId !== actor || !uuid(captured.operationId) || !isAvatarRevision(captured.expectedRevision)
          || BigInt(captured.expectedRevision) === MAX_REVISION || !isAvatarRevision(captured.baseGeneration)) throw unavailable();
        const result = await run<AvatarRecoveryResult>(signal, expires, async inner => parseAvatarRecoveryResult(
          await query("touchline_begin_club_owner_avatar_operation", { p_actor: actor, p_operation: captured.operationId,
            p_expected: captured.expectedRevision, p_base_generation: captured.baseGeneration }, inner), captured, "begin"));
        finalGuard(signal, expires); return result;
      } catch { return { status: "unknown" }; }
    },
    async publishV2(input, signal) {
      try {
        const expires = performance.now() + duration;
        const captured: AvatarPublicationV2 = { ...parsePublication(input, actor), generation: input.generation };
        if (!isAvatarRevision(captured.generation) || captured.generation === "0") throw unavailable();
        const result = await run<AvatarRecoveryResult>(signal, expires, async inner => parseAvatarRecoveryResult(
          await query("touchline_publish_club_owner_avatar_v2", { p_actor: actor, p_operation: captured.operationId,
            p_expected: captured.expectedRevision, p_generation: captured.generation,
            p_digest: captured.digest, p_key: captured.objectKey }, inner), captured, "publish"));
        finalGuard(signal, expires); return result;
      } catch { return { status: "unknown" }; }
    },
    async readCurrent(requestActor, signal) {
      const expires = performance.now() + duration;
      const result = await run(signal, expires, async inner => {
        if (requestActor !== actor) throw unavailable();
        const result = parseCurrent(await query("touchline_read_club_owner_avatar", { p_actor: actor }, inner), actor);
        inner.throwIfAborted();
        return result;
      });
      finalGuard(signal, expires);
      return result;
    },
    async findOperation(input, signal) {
      const expires = performance.now() + duration;
      const requestActor = input.actorId, operation = input.operationId;
      const result = await run(signal, expires, async inner => {
        if (requestActor !== actor || !uuid(operation)) throw unavailable();
        const value = await query("touchline_find_club_owner_avatar_operation", { p_actor: actor, p_operation: operation }, inner);
        // The SDK maps both SQL null and an empty HTTP 200 body to data:null.
        // Only a versioned, actor/operation-bound envelope proves absence.
        const envelope = record(value);
        if (!envelope || envelope.version !== 1 || envelope.actorId !== actor || envelope.operationId !== operation) throw unavailable();
        let result: AvatarReceipt | null;
        if (envelope.status === "absent" && envelope.receipt === null) result = null;
        else if (envelope.status === "found") result = parseReceipt(envelope.receipt, actor, operation);
        else throw unavailable();
        inner.throwIfAborted();
        return result;
      });
      finalGuard(signal, expires);
      return result;
    },
    async publish(input, signal) {
      try {
        const expires = performance.now() + duration;
        const captured = parsePublication(input, actor);
        const result = await run<AvatarPublishResult>(signal, expires, async inner => {
          const row = record(await query("touchline_publish_club_owner_avatar", {
            p_actor: actor, p_operation: captured.operationId, p_expected: captured.expectedRevision,
            p_digest: captured.digest, p_key: captured.objectKey,
          }, inner));
          if (row?.status === "conflict" || row?.status === "operation_conflict") {
            inner.throwIfAborted();
            return { status: row.status };
          }
          if (row?.status !== "committed") throw unavailable();
          const receipt = parseReceipt(row.receipt, actor, captured.operationId);
          if (receipt.expectedRevision !== captured.expectedRevision || receipt.digest !== captured.digest || receipt.objectKey !== captured.objectKey) throw unavailable();
          inner.throwIfAborted();
          return { status: "committed" as const, receipt };
        });
        finalGuard(signal, expires);
        return result;
      } catch { return { status: "unknown" }; }
    },
  };
}
