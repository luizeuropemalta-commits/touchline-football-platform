import type { SportmonksFixtureGuard } from "./providers/sportmonks.ts";
import type { SportmonksQuotaObservation } from "./sportmonks-quota-observation.ts";
import { SPORTMONKS_PREQUERY_ENDPOINTS, type SportmonksPrequeryEndpoint } from "./sportmonks-quota-observation.ts";

/** Server-owned transport must bind to the correct database, honor cancellation,
 * and return only the RPC data after rejecting transport/database errors.
 * This adapter alone does not install the RPCs or activate any worker.
 */
export type FixtureAuthorityCall = (name: "touchline_fixture_quota_admit" | "touchline_fixture_quota_complete",
  args: Record<string, unknown>, signal: AbortSignal) => Promise<unknown>;
const uuid = (value: unknown): value is string => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const scope = (value: unknown): value is string => typeof value === "string" && /^[a-z][a-z0-9_-]{0,63}$/.test(value);
function unavailable(): never { throw new Error("Fixture authority unavailable."); }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return unavailable();
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).sort().join(",") !== [...keys].sort().join(",")) unavailable();
}
function date(value: unknown): value is string | null {
  if (value === null) return true;
  if (typeof value !== "string") return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}
function sanitized(value: SportmonksQuotaObservation, requestId: string, attempt: number, endpoint: SportmonksPrequeryEndpoint) {
  const operation = SPORTMONKS_PREQUERY_ENDPOINTS[endpoint].operation;
  if (value.requestId !== requestId || value.attempt !== attempt || value.operation !== operation
    || !date(value.observedAt) || !date(value.resetAt) || !date(value.cooldownUntil)
    || !Number.isInteger(value.status) || value.status < 0 || value.status > 599
    || !(value.remaining === null || Number.isSafeInteger(value.remaining) && value.remaining >= 0)
    || !(value.requestedEntity === null || /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(value.requestedEntity))) unavailable();
  return { requestId, attempt, operation, observedAt: value.observedAt,
    status: value.status, requestedEntity: value.requestedEntity, remaining: value.remaining,
    resetAt: value.resetAt, cooldownUntil: value.cooldownUntil };
}

export function createSportmonksFixtureAuthority(accountScope: string, call: FixtureAuthorityCall): SportmonksFixtureGuard {
  if (!scope(accountScope) || typeof call !== "function") unavailable();
  return Object.freeze<SportmonksFixtureGuard>({ accountScope, createPort(context) {
    if (context.accountScope !== accountScope || !uuid(context.requestId)
      || !Object.hasOwn(SPORTMONKS_PREQUERY_ENDPOINTS, context.endpoint)
      || context.entity !== SPORTMONKS_PREQUERY_ENDPOINTS[context.endpoint].entity) unavailable();
    const requestId = context.requestId;
    const endpoint = context.endpoint;
    const base = { p_account_scope: accountScope, p_request_id: requestId, p_endpoint: endpoint };
    function check(attempt: number, budget: number, signal: AbortSignal) {
      if (signal.aborted || !Number.isSafeInteger(attempt) || attempt < 1
        || !Number.isFinite(budget) || budget < 1 || budget > 2_147_483_647) unavailable();
    }
    return Object.freeze<ReturnType<SportmonksFixtureGuard["createPort"]>>({
      async beforeAttempt({ attempt, remainingBudgetMs, signal }) {
        check(attempt, remainingBudgetMs, signal);
        const data = record(await call("touchline_fixture_quota_admit", {
          ...base, p_attempt: attempt, p_budget_ms: Math.floor(remainingBudgetMs),
        }, signal));
        if (signal.aborted) unavailable();
        if (data.allowed === false) { exact(data, ["allowed"]); return { allowed: false as const }; }
        exact(data, ["allowed", "token"]);
        if (data.allowed !== true || !uuid(data.token)) unavailable();
        return { allowed: true as const, token: data.token };
      },
      async afterAttempt({ attempt, remainingBudgetMs, signal, token, observation }) {
        check(attempt, remainingBudgetMs, signal);
        if (!uuid(token)) unavailable();
        const receipt = record(await call("touchline_fixture_quota_complete", {
          ...base, p_attempt: attempt, p_token: token,
          p_observation: sanitized(observation, requestId, attempt, endpoint),
        }, signal));
        if (signal.aborted) unavailable();
        exact(receipt, ["persisted"]);
        if (receipt.persisted !== true) unavailable();
        return { persisted: true as const };
      },
    });
  } });
}
