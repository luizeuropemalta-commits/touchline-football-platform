import { randomUUID } from "node:crypto";
import type { AvatarRetentionRpc } from "./club-owner-avatar-retention-worker.ts";
import { awaitAvatarStep, createAvatarEnvironmentGuard, isAvatarAccountId } from "./club-owner-avatar-upload-contract.ts";

type Config = Readonly<{
  supabaseOrigin: string;
  assertEnvironment: () => void;
  rpc: AvatarRetentionRpc;
  /** Server-owned boundary: stable name ordering, exact prefix, maximum 25 rows.
   * No recursive listing, request-controlled URL or credentials at this seam. */
  listPage: (prefix: string, offset: number, limit: 25, signal: AbortSignal) => PromiseLike<unknown>;
}>;
const project = "xgxbwqxjssxxuihuwmgy";
const record = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const canonicalId = (value: unknown): value is string => isAvatarAccountId(value) && value === value.toLowerCase();

/** One recurring discovery page, not a cleanup worker or activation entrypoint.
 * SQL remains the authority for registration. A lost registration/ACK response
 * leaves the durable offset untouched; the next lease safely repeats the page.
 */
export async function runAvatarRetentionDiscoveryPage(config: Config, outerSignal: AbortSignal) {
  const result = { status: "processed" as "processed" | "incomplete", listed: 0, registered: 0, denied: 0, skipped: 0, acknowledged: false };
  const assertEnvironment = createAvatarEnvironmentGuard(config.assertEnvironment);
  const deadline = new AbortController(), timer = setTimeout(() => deadline.abort(), 25_000);
  const signal = AbortSignal.any([outerSignal, deadline.signal]);
  let leaseExpires: number | undefined;
  const guard = () => {
    assertEnvironment(); signal.throwIfAborted();
    if (leaseExpires !== undefined && leaseExpires <= Date.now()) throw Error("AVATAR_DISCOVERY_LEASE_EXPIRED");
  };
  const rpc = async (name: string, args: Record<string, unknown>) => {
    guard();
    const response = await awaitAvatarStep(() => config.rpc(name, { p_project_ref: project, ...args }, signal), signal);
    guard();
    if (response.error) throw Error("AVATAR_DISCOVERY_RPC");
    return record(response.data);
  };
  try {
    guard();
    if (config.supabaseOrigin !== `https://${project}.supabase.co`) throw Error("AVATAR_DISCOVERY_TARGET");
    const attemptId = randomUUID();
    const claimed = await rpc("touchline_claim_qa_avatar_retention_discovery", { p_attempt: attemptId, p_limit: 1 });
    if (claimed?.version !== 1 || claimed.allowed !== true || !Array.isArray(claimed.scans) || claimed.scans.length > 1) throw Error("AVATAR_DISCOVERY_CLAIM");
    if (claimed.scans.length === 0) return result;
    const scan = record(claimed.scans[0]);
    if (!scan || !canonicalId(scan.actorId) || !canonicalId(scan.operationId)
      || scan.prefix !== `${scan.actorId}/${scan.operationId}/` || scan.attemptId !== attemptId
      || scan.limit !== 25 || typeof scan.offset !== "number" || !Number.isSafeInteger(scan.offset)
      || scan.offset < 0 || scan.offset % 25 !== 0 || scan.offset > 2_147_483_622
      || typeof scan.expiresAt !== "string") throw Error("AVATAR_DISCOVERY_IDENTITY");
    leaseExpires = Date.parse(scan.expiresAt);
    if (!Number.isFinite(leaseExpires) || leaseExpires > Date.now() + 31_000) throw Error("AVATAR_DISCOVERY_LEASE");
    const actorId = scan.actorId, operationId = scan.operationId, prefix = scan.prefix as string, offset = scan.offset;
    guard();
    const page = await awaitAvatarStep(() => config.listPage(prefix, offset, 25, signal), signal);
    guard();
    if (!Array.isArray(page) || page.length > 25) throw Error("AVATAR_DISCOVERY_PAGE");
    result.listed = page.length;
    for (const value of page) {
      guard();
      const file = record(value);
      // Storage folders have no UUID id. Never recurse or derive a key from a
      // path-like name, metadata URL, or untrusted directory entry.
      if (!file || !canonicalId(file.id) || typeof file.name !== "string" || !/^[a-f0-9]{64}\.webp$/.test(file.name)) {
        result.skipped++; continue;
      }
      const digest = file.name.slice(0, 64);
      const registered = await rpc("touchline_register_qa_avatar_retention_candidate", {
        p_actor: actorId, p_operation: operationId, p_digest: digest, p_object_key: `${prefix}${file.name}`,
      });
      if (registered?.version !== 1) throw Error("AVATAR_DISCOVERY_REGISTRATION");
      if (registered.allowed === false) result.denied++;
      else if (registered.allowed === true && canonicalId(registered.candidateId)) result.registered++;
      else throw Error("AVATAR_DISCOVERY_REGISTRATION");
    }
    const complete = page.length < 25;
    const ack = await rpc("touchline_ack_qa_avatar_retention_discovery", {
      p_actor: actorId, p_operation: operationId, p_attempt: attemptId,
      p_expected_offset: offset, p_next_offset: complete ? 0 : offset + 25, p_complete: complete,
    });
    if (ack?.version !== 1 || ack.acknowledged !== true || ack.reconciliationRequired !== true) throw Error("AVATAR_DISCOVERY_ACK");
    result.acknowledged = true;
  } catch { result.status = "incomplete"; }
  finally { clearTimeout(timer); }
  return result;
}
