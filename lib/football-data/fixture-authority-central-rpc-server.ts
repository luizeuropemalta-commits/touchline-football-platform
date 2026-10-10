import "server-only";
import type { CentralQuotaRpc } from "./fixture-authority-store-server.ts";

const fail = () => new Error("Central quota database unavailable.");
const limit = 8192;
const names = new Set(["touchline_central_quota_admit", "touchline_central_quota_complete"]);

/** Authority-host only. No environment discovery, content-DB fallback, SDK
 * retries or activation. The central credential must never reach workers. */
export function createCentralQuotaRpc(config: Readonly<{
  enabled?: boolean; projectRef: string; serviceKey: string; accountScope: string; timeoutMs?: number;
}>, fetchImpl: typeof fetch = fetch): CentralQuotaRpc {
  const { projectRef, serviceKey, accountScope } = config;
  const enabled = config.enabled === true;
  const timeout = config.timeoutMs ?? 1500;
  if (!/^[a-z0-9]{20}$/.test(projectRef) || !/^[a-z][a-z0-9_-]{0,63}$/.test(accountScope)
    || typeof serviceKey !== "string" || !/^[A-Za-z0-9_.-]{32,8192}$/.test(serviceKey)
    || !Number.isSafeInteger(timeout) || timeout < 1 || timeout > 5000) throw fail();
  const base = `https://${projectRef}.supabase.co/rest/v1/rpc/`;
  return async (name, args, signal) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const abort = new AbortController();
    let rejectStopped: (error: Error) => void = () => {};
    const stop = () => { abort.abort(); rejectStopped(fail()); void reader?.cancel().catch(() => {}); };
    try {
      if (!enabled || signal.aborted || !names.has(name) || args.p_account_scope !== accountScope) throw fail();
      const body = JSON.stringify(args);
      if (new TextEncoder().encode(body).byteLength > limit) throw fail();
      const stopped = new Promise<never>((_, reject) => { rejectStopped = reject; });
      signal.addEventListener("abort", stop, { once: true });
      if (signal.aborted) stop();
      timer = setTimeout(stop, timeout);
      const work = (async () => {
        if (abort.signal.aborted) throw fail();
        const response = await fetchImpl(base + name, {
          method: "POST", redirect: "error", credentials: "omit", cache: "no-store", signal: abort.signal,
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json", Accept: "application/json" },
          body,
        });
        if (abort.signal.aborted || !response.ok || response.redirected || !response.body
          || response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
          void response.body?.cancel().catch(() => {}); throw fail();
        }
        reader = response.body.getReader();
        const chunks: Uint8Array[] = []; let size = 0;
        while (true) {
          const chunk = await reader.read();
          if (abort.signal.aborted) throw fail();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > limit) throw fail();
          chunks.push(chunk.value);
        }
        const bytes = new Uint8Array(size); let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
        if (!value || typeof value !== "object" || Array.isArray(value)) throw fail();
        // Exact receipt projection is enforced by createCentralQuotaStore.
        return value;
      })();
      return await Promise.race([work, stopped]);
    } catch {
      abort.abort(); throw fail();
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      signal.removeEventListener("abort", stop);
      void reader?.cancel().catch(() => {});
    }
  };
}
