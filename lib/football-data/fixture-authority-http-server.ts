import "server-only";
import type { FixtureAuthorityCall } from "./sportmonks-fixture-authority.ts";

const FAILURE = "Fixture authority unavailable.";
const MAX_BYTES = 8_192;
const OPERATIONS = {
  touchline_fixture_quota_admit: "admit",
  touchline_fixture_quota_complete: "complete",
} as const;

/** Prepared transport only: no environment defaults, database fallback, retries,
 * or worker activation. The future gateway must authenticate this worker and
 * bind its scope/receipt ownership server-side; this client is not that gate. */
export function createFixtureAuthorityHttpTransport(config: Readonly<{
  url: string;
  workerToken: string;
  accountScope: string;
  timeoutMs?: number;
}>, fetchImpl: typeof fetch = fetch): FixtureAuthorityCall {
  let target: URL;
  try { target = new URL(config.url); } catch { throw new Error(FAILURE); }
  const { workerToken, accountScope } = config;
  const timeoutMs = config.timeoutMs ?? 2_000;
  if (target.protocol !== "https:" || target.username || target.password || target.search || target.hash
    || target.port || target.pathname !== "/api/internal/football-data/quota"
    || !/^[A-Za-z0-9_-]{32,256}$/.test(workerToken)
    || !/^[a-z][a-z0-9_-]{0,63}$/.test(accountScope)
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 5_000) throw new Error(FAILURE);
  const url = target.href;

  return async (name, args, signal) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const controller = new AbortController();
    let rejectStopped: (error: Error) => void = () => {};
    const stop = () => {
      controller.abort();
      rejectStopped(new Error(FAILURE));
      void reader?.cancel().catch(() => {});
    };
    try {
      if (signal.aborted || !Object.hasOwn(OPERATIONS, name)
        || args.p_account_scope !== accountScope) throw new Error(FAILURE);
      const body = JSON.stringify({ operation: OPERATIONS[name], args });
      if (new TextEncoder().encode(body).byteLength > MAX_BYTES) throw new Error(FAILURE);
      const stopped = new Promise<never>((_, reject) => { rejectStopped = reject; });
      signal.addEventListener("abort", stop, { once: true });
      timer = setTimeout(stop, timeoutMs);
      const work = (async () => {
        const response = await fetchImpl(url, {
          method: "POST", redirect: "error", cache: "no-store", credentials: "omit",
          headers: { Authorization: `Bearer ${workerToken}`, "Content-Type": "application/json", Accept: "application/json" },
          body, signal: controller.signal,
        });
        if (controller.signal.aborted || !response.ok || response.redirected
          || response.headers.get("content-type")?.split(";")[0].trim() !== "application/json"
          || !response.body) {
          void response.body?.cancel().catch(() => {});
          throw new Error(FAILURE);
        }
        reader = response.body.getReader();
        let size = 0;
        const chunks: Uint8Array[] = [];
        while (true) {
          const chunk = await reader.read();
          if (controller.signal.aborted) throw new Error(FAILURE);
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > MAX_BYTES) throw new Error(FAILURE);
          chunks.push(chunk.value);
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        const data: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
        if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(FAILURE);
        return data;
      })();
      return await Promise.race([work, stopped]);
    } catch {
      controller.abort();
      void reader?.cancel().catch(() => {});
      throw new Error(FAILURE);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      signal.removeEventListener("abort", stop);
    }
  };
}
