import { randomUUID } from "node:crypto";
import { createAvatarRetentionStorage, type AvatarRetentionCandidate } from "./club-owner-avatar-retention-storage.ts";
import { awaitAvatarStep, createAvatarEnvironmentGuard, isAvatarAccountId } from "./club-owner-avatar-upload-contract.ts";

export type AvatarRetentionRpc = (name: string, args: Record<string, unknown>, signal: AbortSignal) => PromiseLike<{ data: unknown; error: unknown }>;
type Config = Readonly<{ supabaseOrigin: string; serviceRoleKey: string; fetchImpl: typeof fetch; assertEnvironment: () => void; rpc: AvatarRetentionRpc }>;
type Candidate = AvatarRetentionCandidate & { candidateId: string };
const project = "xgxbwqxjssxxuihuwmgy";
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
function parseCandidate(value: unknown): Candidate | null {
  const row = record(value);
  if (!row || !isAvatarAccountId(row.candidateId) || !isAvatarAccountId(row.actorId) || !isAvatarAccountId(row.operationId)
    || row.actorId !== row.actorId.toLowerCase() || row.operationId !== row.operationId.toLowerCase()
    || typeof row.digest !== "string" || !/^[a-f0-9]{64}$/.test(row.digest)
    || row.objectKey !== `${row.actorId}/${row.operationId}/${row.digest}.webp`) return null;
  return { candidateId: row.candidateId, actorId: row.actorId, operationId: row.operationId, digest: row.digest, objectKey: row.objectKey as string };
}

/** Bounded sequential QA batch. No activation, discovery, cron or user route.
 * RPC/fetch are server-owned injection seams, never request-controlled inputs.
 * Lost RPC responses leave the durable lease for recovery; no automatic retry.
 */
export async function runAvatarRetentionBatch(config: Config, outerSignal: AbortSignal) {
  const result = { status: "processed" as "processed" | "incomplete", inspected: 0, accepted: 0, denied: 0, unknown: 0 };
  const assertEnvironment = createAvatarEnvironmentGuard(config.assertEnvironment);
  const deadline = new AbortController(), timer = setTimeout(() => deadline.abort(), 55_000);
  const signal = AbortSignal.any([outerSignal, deadline.signal]);
  const guard = () => { assertEnvironment(); signal.throwIfAborted(); };
  const rpc = async (name: string, args: Record<string, unknown>, requestSignal = signal) => {
    guard(); requestSignal.throwIfAborted();
    const response = await awaitAvatarStep(() => config.rpc(name, { p_project_ref: project, ...args }, requestSignal), requestSignal);
    guard(); requestSignal.throwIfAborted();
    if (response.error) throw Error("AVATAR_RETENTION_RPC");
    return record(response.data);
  };
  try {
    guard();
    if (config.supabaseOrigin !== `https://${project}.supabase.co`) throw Error();
    const list = await rpc("touchline_list_due_qa_avatar_retention_candidates", { p_limit: 5 });
    if (list?.version !== 1 || !Array.isArray(list.candidates) || list.candidates.length > 5) throw Error();
    const candidates = list.candidates.map(parseCandidate);
    if (candidates.some(value => !value) || new Set(candidates.map(value => value!.candidateId)).size !== candidates.length) throw Error();
    for (const candidate of candidates as Candidate[]) {
      guard(); result.inspected++;
      const attemptId = randomUUID(); let began = false, authorityFailed = false;
      const transport = createAvatarRetentionStorage({ ...config, assertEnvironment,
        authorize: async (_identity, requestSignal) => {
          let grant: Record<string, unknown> | null;
          try { grant = await rpc("touchline_begin_qa_avatar_retention_attempt", { p_candidate: candidate.candidateId, p_attempt: attemptId }, requestSignal); }
          catch { authorityFailed = true; return null; }
          if (grant?.version !== 1 || typeof grant.allowed !== "boolean") { authorityFailed = true; return null; }
          if (!grant.allowed) return null;
          // A returned grant may have been committed even if malformed. Record
          // the attempted observation when possible, otherwise leave its lease.
          began = true;
          const checked = typeof grant.checkedAt === "string" ? Date.parse(grant.checkedAt) : NaN;
          const expires = typeof grant.expiresAt === "string" ? Date.parse(grant.expiresAt) : NaN;
          if (grant.version !== 1 || grant.candidateId !== candidate.candidateId || grant.attemptId !== attemptId
            || !Number.isFinite(checked) || !Number.isFinite(expires) || expires <= Date.now()
            || expires - checked !== 30_000 || checked > Date.now() + 1_000) { authorityFailed = true; return null; }
          return grant;
        },
      });
      const outcome = await transport.removeCandidate(candidate, signal);
      result[outcome]++;
      if (began) {
        const receipt = await rpc("touchline_record_qa_avatar_retention_attempt", { p_attempt: attemptId, p_outcome: outcome === "denied" ? "error" : outcome });
        if (receipt?.version !== 1 || receipt.recorded !== true || receipt.reconciliationRequired !== true) throw Error();
      }
      if (authorityFailed) throw Error("AVATAR_RETENTION_AUTHORITY_UNCONFIRMED");
    }
  } catch { result.status = "incomplete"; }
  finally { clearTimeout(timer); }
  return result;
}
