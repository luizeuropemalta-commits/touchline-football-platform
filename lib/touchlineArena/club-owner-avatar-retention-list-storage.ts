import { awaitAvatarStep, createAvatarEnvironmentGuard, isAvatarAccountId } from "./club-owner-avatar-upload-contract.ts";

type Config = Readonly<{ supabaseOrigin: string; serviceRoleKey: string; assertEnvironment: () => void; fetchImpl: typeof fetch }>;
/** Read-only POST contract verified in installed storage-js 2.108.2,
 * StorageFileApi.list(). No runtime credentials, recursive paths or retries.
 * One original in-flight job per factory; timeout cannot release a stuck job.
 */
export function createAvatarRetentionListStorage(config: Config) {
  const { supabaseOrigin, serviceRoleKey, fetchImpl } = config;
  if (supabaseOrigin !== "https://xgxbwqxjssxxuihuwmgy.supabase.co" || typeof serviceRoleKey !== "string"
    || !serviceRoleKey.trim() || /[\r\n]/.test(serviceRoleKey) || typeof fetchImpl !== "function" || typeof config.assertEnvironment !== "function") throw Error("QA_RETENTION_LIST_CONFIGURATION");
  const assertEnvironment = createAvatarEnvironmentGuard(config.assertEnvironment);
  let busy = false;
  return Object.freeze({
    async listPage(prefix: string, offset: number, limit: 25, outerSignal: AbortSignal): Promise<ReadonlyArray<Readonly<{ id: string | null; name: string }>>> {
      assertEnvironment(); outerSignal.throwIfAborted();
      const segments = typeof prefix === "string" ? prefix.split("/") : [];
      if (segments.length !== 3 || segments[2] !== "" || !segments.slice(0, 2).every(id => isAvatarAccountId(id) && id === id.toLowerCase())
        || limit !== 25 || !Number.isSafeInteger(offset) || offset < 0 || offset % 25 !== 0 || offset > 2_147_483_622 || busy) throw Error("QA_RETENTION_LIST_INPUT");
      busy = true;
      const deadline = new AbortController(), timer = setTimeout(() => deadline.abort(), 10_000);
      const signal = AbortSignal.any([outerSignal, deadline.signal]);
      const guard = () => { assertEnvironment(); signal.throwIfAborted(); };
      // Keep admission until original transport/body work settles, even if the
      // caller has already left its timeout race. Late responses are cancelled.
      const job = (async () => {
        let response: Response | undefined, reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
        const cancel = () => { if (reader) void reader.cancel().catch(() => undefined); else if (response) void response.body?.cancel().catch(() => undefined); };
        try {
          guard();
          response = await fetchImpl(`${supabaseOrigin}/storage/v1/object/list/touchline-club-owner-avatars`, {
            method: "POST", redirect: "error", cache: "no-store", signal,
            headers: { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}`, "content-type": "application/json", "accept-encoding": "identity" },
            body: JSON.stringify({ prefix, limit: 25, offset, sortBy: { column: "name", order: "asc" } }),
          });
          guard();
          const length = response.headers.get("content-length"), encoding = response.headers.get("content-encoding");
          if (response.status !== 200 || response.redirected || !response.body
            || response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json"
            || (encoding && encoding.toLowerCase() !== "identity")
            || (length !== null && (!/^(0|[1-9][0-9]{0,5})$/.test(length) || Number(length) > 65_536))) throw Error();
          reader = response.body.getReader(); signal.addEventListener("abort", cancel, { once: true });
          const bytes = new Uint8Array(65_536); let size = 0;
          while (true) {
            guard(); const part = await reader.read(); guard();
            if (part.done) break;
            if (!(part.value instanceof Uint8Array) || part.value.byteLength > bytes.length - size) throw Error();
            bytes.set(part.value, size); size += part.value.byteLength;
          }
          if (length !== null && Number(length) !== size) throw Error();
          const page: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(0, size)));
          if (!Array.isArray(page) || page.length > 25) throw Error();
          const rows = page.map(value => {
            if (!value || typeof value !== "object" || Array.isArray(value) || typeof value.name !== "string"
              || (value.id !== null && typeof value.id !== "string")) throw Error();
            return Object.freeze({ id: value.id as string | null, name: value.name as string });
          });
          guard(); return Object.freeze(rows);
        } finally {
          signal.removeEventListener("abort", cancel); cancel();
          try { reader?.releaseLock(); } catch { /* Unsettled reader remains accounted for by job. */ }
          busy = false;
        }
      })();
      try { return await awaitAvatarStep(() => job, signal); }
      catch { throw Error("QA_RETENTION_LIST_UNAVAILABLE"); }
      finally { clearTimeout(timer); }
    },
  });
}
