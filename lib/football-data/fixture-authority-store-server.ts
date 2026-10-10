import "server-only";
import type { FixtureAuthorityCommand } from "./fixture-authority-command-server.ts";

type RpcName = "touchline_central_quota_admit" | "touchline_central_quota_complete";
export type CentralQuotaRpc = (name: RpcName, args: Readonly<Record<string, unknown>>, signal: AbortSignal) => Promise<unknown>;
export type CentralQuotaResult = Readonly<{ allowed: false }> | Readonly<{ allowed: true; token: string }> | Readonly<{ persisted: boolean }>;
const failure = () => new Error("Central fixture authority unavailable.");

/** Trusted gateway boundary only. The injected RPC must target the ONE central
 * database, reject DB errors and honor cancellation. Never inject a worker's
 * content DB or accept a principal/destination from the HTTP request body.
 * This adapter enables no environment and proves no SQL ownership by itself. */
export function createCentralQuotaStore(config: Readonly<{
  enabled?: boolean; accountScope: string; timeoutMs?: number;
}>, rpc: CentralQuotaRpc): (command: FixtureAuthorityCommand, signal: AbortSignal) => Promise<CentralQuotaResult> {
  const { accountScope } = config;
  const enabled = config.enabled === true;
  const timeoutMs = config.timeoutMs ?? 2_000;
  if (!/^[a-z][a-z0-9_-]{0,63}$/.test(accountScope) || typeof rpc !== "function"
    || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 5_000) throw failure();
  return async (command, signal) => {
    if (!enabled || signal.aborted || command.principal.accountScope !== accountScope) throw failure();
    const operation = command.operation;
    if (operation !== "admit" && operation !== "complete") throw failure();
    const args = Object.freeze({
      p_worker_id: command.principal.workerId, p_environment: command.principal.environment,
      p_account_scope: accountScope, p_request_id: command.requestId,
      p_endpoint: command.endpoint, p_attempt: command.attempt,
      ...(command.operation === "admit" ? { p_budget_ms: command.budgetMs }
        : { p_token: command.token, p_observation: command.observation }),
    });
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let rejectStopped: (error: Error) => void = () => {};
    const stop = () => { controller.abort(); rejectStopped(failure()); };
    try {
      const stopped = new Promise<never>((_, reject) => { rejectStopped = reject; });
      signal.addEventListener("abort", stop, { once: true });
      if (signal.aborted) stop();
      timer = setTimeout(stop, timeoutMs);
      const work = (async () => {
        if (controller.signal.aborted) throw failure();
        const data = await rpc(operation === "admit" ? "touchline_central_quota_admit" : "touchline_central_quota_complete", args, controller.signal);
        if (controller.signal.aborted || !data || typeof data !== "object" || Array.isArray(data)) throw failure();
        const result = data as Record<string, unknown>;
        const keys = Object.keys(result).sort().join(",");
        if (operation === "complete") {
          if (keys !== "persisted" || typeof result.persisted !== "boolean") throw failure();
          return Object.freeze({ persisted: result.persisted });
        }
        if (keys === "allowed" && result.allowed === false) return Object.freeze({ allowed: false as const });
        if (keys !== "allowed,token" || result.allowed !== true || typeof result.token !== "string"
          || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(result.token)) throw failure();
        return Object.freeze({ allowed: true as const, token: result.token });
      })();
      return await Promise.race([work, stopped]);
    } catch {
      controller.abort();
      // No retry or fallback. A lost admission response may have committed;
      // only durable reconciliation can resolve that unknown state.
      throw failure();
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      signal.removeEventListener("abort", stop);
    }
  };
}
