import { awaitAvatarStep, createAvatarEnvironmentGuard } from "./club-owner-avatar-upload-contract.ts";
import type { AvatarRetentionRpc } from "./club-owner-avatar-retention-worker.ts";
const signatures: Readonly<Record<string, readonly string[]>> = Object.freeze({
  touchline_list_due_qa_avatar_retention_candidates: ["p_project_ref", "p_limit"],
  touchline_begin_qa_avatar_retention_attempt: ["p_project_ref", "p_candidate", "p_attempt"],
  touchline_record_qa_avatar_retention_attempt: ["p_project_ref", "p_attempt", "p_outcome"],
  touchline_claim_qa_avatar_retention_discovery: ["p_project_ref", "p_attempt", "p_limit"],
  touchline_register_qa_avatar_retention_candidate: ["p_project_ref", "p_actor", "p_operation", "p_digest", "p_object_key"],
  touchline_ack_qa_avatar_retention_discovery: ["p_project_ref", "p_actor", "p_operation", "p_attempt", "p_expected_offset", "p_next_offset", "p_complete"],
});
type Config = Readonly<{ supabaseOrigin: string; serviceRoleKey: string; assertEnvironment: () => void; fetchImpl: typeof fetch }>;

/** Native-fetch bridge for a server runtime: six fixed RPCs, no SDK downloads,
 * default environment, credentials lookup or retry. One unresolved native job
 * per instance; a timeout does not free its resource slot prematurely.
 */
export function createAvatarRetentionRpc(config: Config): AvatarRetentionRpc {
  const { supabaseOrigin, serviceRoleKey, fetchImpl } = config;
  if (supabaseOrigin !== "https://xgxbwqxjssxxuihuwmgy.supabase.co" || typeof serviceRoleKey !== "string"
    || !serviceRoleKey.trim() || /[\r\n]/.test(serviceRoleKey) || typeof config.assertEnvironment !== "function"
    || typeof fetchImpl !== "function") throw Error("QA_RETENTION_RPC_CONFIGURATION");
  const assertEnvironment = createAvatarEnvironmentGuard(config.assertEnvironment); let busy = false;
  return async (name, args, outerSignal) => {
    const failure = () => ({ data: null, error: { code: "QA_RETENTION_RPC_UNCONFIRMED" } });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      assertEnvironment(); outerSignal.throwIfAborted();
      const expected = Object.hasOwn(signatures, name) ? signatures[name] : null;
      if (busy || !expected || args.p_project_ref !== "xgxbwqxjssxxuihuwmgy" || Object.keys(args).length !== expected.length
        || expected.some(key => !Object.hasOwn(args, key))
        || Object.values(args).some(value => !["string", "number", "boolean"].includes(typeof value)
          || (typeof value === "string" && value.length > 256) || (typeof value === "number" && !Number.isSafeInteger(value)))) return failure();
      const body = JSON.stringify(args), deadline = new AbortController();
      const signal = AbortSignal.any([outerSignal, deadline.signal]);
      timer = setTimeout(() => deadline.abort(), 10_000);
      const guard = () => { assertEnvironment(); signal.throwIfAborted(); };
      busy = true;
      const job = (async () => {
        let response: Response | undefined, reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
        const cancel = () => { if (reader) void reader.cancel().catch(() => undefined); else if (response) void response.body?.cancel().catch(() => undefined); };
        try {
          guard();
          response = await fetchImpl(`${supabaseOrigin}/rest/v1/rpc/${name}`, {
            method: "POST", redirect: "error", cache: "no-store", signal,
            headers: { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}`, "content-type": "application/json", "accept-encoding": "identity" }, body,
          });
          guard();
          const sizeHeader = response.headers.get("content-length"), encoding = response.headers.get("content-encoding");
          if (response.status !== 200 || response.redirected || !response.body
            || response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json"
            || (encoding && encoding.toLowerCase() !== "identity") || (sizeHeader !== null
              && (!/^(0|[1-9][0-9]{0,5})$/.test(sizeHeader) || Number(sizeHeader) > 65_536))) throw Error();
          reader = response.body.getReader(); signal.addEventListener("abort", cancel, { once: true });
          const bytes = new Uint8Array(65_536); let size = 0;
          while (true) {
            guard(); const part = await reader.read(); guard();
            if (part.done) break;
            if (!(part.value instanceof Uint8Array) || part.value.byteLength > bytes.length - size) throw Error();
            bytes.set(part.value, size); size += part.value.byteLength;
          }
          if (sizeHeader !== null && Number(sizeHeader) !== size) throw Error();
          const data: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, size)));
          if (!data || typeof data !== "object" || Array.isArray(data)) throw Error();
          guard(); return { data, error: null };
        } finally { signal.removeEventListener("abort", cancel); cancel(); try { reader?.releaseLock(); } catch {} busy = false; }
      })();
      return await awaitAvatarStep(() => job, signal);
    } catch { return failure(); }
    finally { if (timer !== undefined) clearTimeout(timer); }
  };
}
