import { awaitAvatarStep, createAvatarEnvironmentGuard, isAvatarAccountId } from "./club-owner-avatar-upload-contract.ts";

export type AvatarRetentionCandidate = Readonly<{ actorId: string; operationId: string; digest: string; objectKey: string }>;
type Config = Readonly<{
  supabaseOrigin: string;
  serviceRoleKey: string;
  assertEnvironment: () => void;
  authorize: (candidate: AvatarRetentionCandidate, signal: AbortSignal) => Promise<unknown>;
  fetchImpl: typeof fetch;
}>;

/** Server-only QA transport, deliberately not reachable from upload/UI.
 * Compose authorize with a fresh durable begin-attempt RPC, not a cached
 * classifier response. Caller persists each outcome and schedules reconciliation.
 * `accepted` acknowledges HTTP 200 only: it does NOT establish lasting absence,
 * stop a late POST, finalize a journal or make retentionReady true.
 * No list, wildcard, retry, arbitrary bucket, SQL deletion or public URL.
 */
export function createAvatarRetentionStorage(config: Config) {
  const { supabaseOrigin, serviceRoleKey, fetchImpl, authorize } = config;
  if (supabaseOrigin !== "https://xgxbwqxjssxxuihuwmgy.supabase.co" || !serviceRoleKey.trim()
    || /[\r\n]/.test(serviceRoleKey) || typeof config.assertEnvironment !== "function"
    || typeof authorize !== "function" || typeof fetchImpl !== "function") throw Error("QA_RETENTION_CONFIGURATION");
  const assertEnvironment = createAvatarEnvironmentGuard(config.assertEnvironment);
  return Object.freeze({
    async removeCandidate(input: AvatarRetentionCandidate, outerSignal: AbortSignal): Promise<"accepted" | "denied" | "unknown"> {
      const deadline = new AbortController();
      const timer = setTimeout(() => deadline.abort(), 10_000);
      const signal = AbortSignal.any([outerSignal, deadline.signal]);
      let dispatched = false;
      const guard = () => { assertEnvironment(); signal.throwIfAborted(); };
      try {
        guard();
        const { actorId, operationId, digest, objectKey } = input;
        if (!isAvatarAccountId(actorId) || actorId !== actorId.toLowerCase()
          || !isAvatarAccountId(operationId) || operationId !== operationId.toLowerCase()
          || typeof digest !== "string" || !/^[a-f0-9]{64}$/.test(digest)
          || objectKey !== `${actorId}/${operationId}/${digest}.webp`) return "denied";
        // Snapshot primitives before the first await; caller mutation cannot
        // replace an authorized object with another path.
        const candidate = Object.freeze({ actorId, operationId, digest, objectKey });
        const result = await awaitAvatarStep(() => authorize(candidate, signal), signal);
        guard();
        if (!result || typeof result !== "object" || Array.isArray(result)) return "denied";
        const grant = result as Record<string, unknown>;
        if (grant.allowed !== true || grant.actorId !== actorId || grant.operationId !== operationId
          || grant.digest !== digest || grant.objectKey !== objectKey) return "denied";
        // There is no async work between final guard and dispatch. SQL's terminal
        // operation and monotonic revision guard must make eligibility stable.
        guard(); dispatched = true;
        const response = await awaitAvatarStep(() => fetchImpl(`${supabaseOrigin}/storage/v1/object/touchline-club-owner-avatars`, {
          method: "DELETE", redirect: "error", cache: "no-store", signal,
          headers: { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}`, "content-type": "application/json", "accept-encoding": "identity" },
          body: JSON.stringify({ prefixes: [objectKey] }),
        }).then(value => {
          // Body contents are not evidence of absence and are never allocated.
          void value.body?.cancel().catch(() => undefined);
          return value;
        }), signal);
        guard();
        return !response.redirected && response.status === 200 ? "accepted" : "unknown";
      } catch {
        // Do not expose provider/SQL errors, object keys or service credentials.
        return dispatched ? "unknown" : "denied";
      } finally { clearTimeout(timer); }
    },
  });
}
