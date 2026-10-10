import "server-only";
import type { FixtureAuthorityPrincipal } from "./fixture-authority-worker-auth-server.ts";
import { SPORTMONKS_PREQUERY_ENDPOINTS, type SportmonksPrequeryEndpoint, type SportmonksQuotaObservation } from "./sportmonks-quota-observation.ts";

type Base = Readonly<{
  principal: FixtureAuthorityPrincipal;
  requestId: string;
  endpoint: SportmonksPrequeryEndpoint;
  attempt: number;
}>;
export type FixtureAuthorityCommand =
  | (Base & Readonly<{ operation: "admit"; budgetMs: number }>)
  | (Base & Readonly<{ operation: "complete"; token: string; observation: SportmonksQuotaObservation }>);

function invalid(): never { throw new Error("Fixture authority command rejected."); }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
function exact(value: Record<string, unknown>, keys: readonly string[]) {
  if (Object.keys(value).sort().join(",") !== [...keys].sort().join(",")) invalid();
}
function uuid(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) invalid();
  return value;
}
function integer(value: unknown, minimum: number, maximum = 2_147_483_647): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) invalid();
  return value;
}
function timestamp(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) invalid();
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(time).toISOString() !== value) invalid();
  return value;
}

/** Internal boundary, not an HTTP handler. Caller must authenticate FIRST and
 * bound/decode the JSON body. Never build principal from request JSON.
 * Persistence must atomically bind (scope, request, endpoint, attempt, token)
 * to this principal's worker/environment; validation alone proves no ownership. */
export function parseFixtureAuthorityCommand(
  principal: FixtureAuthorityPrincipal, payload: unknown,
): FixtureAuthorityCommand {
  if (!principal || typeof principal.workerId !== "string" || typeof principal.accountScope !== "string"
    || !/^[a-z][a-z0-9_-]{0,63}$/.test(principal.workerId)
    || !/^[a-z][a-z0-9_-]{0,63}$/.test(principal.accountScope)
    || !["qa", "production"].includes(principal.environment)) invalid();
  const identity = Object.freeze({ workerId: principal.workerId, environment: principal.environment, accountScope: principal.accountScope });
  const envelope = object(payload);
  exact(envelope, ["operation", "args"]);
  const args = object(envelope.args);
  const operation = envelope.operation;
  if (operation !== "admit" && operation !== "complete") invalid();
  exact(args, ["p_account_scope", "p_request_id", "p_endpoint", "p_attempt",
    ...(operation === "admit" ? ["p_budget_ms"] : ["p_token", "p_observation"])]);
  if (args.p_account_scope !== identity.accountScope || typeof args.p_endpoint !== "string"
    || !Object.hasOwn(SPORTMONKS_PREQUERY_ENDPOINTS, args.p_endpoint)) invalid();
  const endpoint = args.p_endpoint as SportmonksPrequeryEndpoint;
  const base = { principal: identity, requestId: uuid(args.p_request_id), endpoint, attempt: integer(args.p_attempt, 1) };
  if (operation === "admit") return Object.freeze({ ...base, operation, budgetMs: integer(args.p_budget_ms, 1) });

  const observation = object(args.p_observation);
  exact(observation, ["requestId", "attempt", "operation", "observedAt", "status", "requestedEntity", "remaining", "resetAt", "cooldownUntil"]);
  const spec = SPORTMONKS_PREQUERY_ENDPOINTS[endpoint];
  if (observation.requestId !== base.requestId || observation.attempt !== base.attempt || observation.operation !== spec.operation) invalid();
  const entity = observation.requestedEntity;
  if (entity !== null && (typeof entity !== "string" || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(entity))) invalid();
  // Keep a mismatching provider entity observable: persistence, not this parser,
  // decides whether that observation locks further admission as unknown.
  return Object.freeze({ ...base, operation, token: uuid(args.p_token), observation: Object.freeze({
    requestId: base.requestId, attempt: base.attempt, operation: spec.operation,
    observedAt: timestamp(observation.observedAt), status: integer(observation.status, 0, 599),
    requestedEntity: entity, remaining: observation.remaining === null ? null : integer(observation.remaining, 0, Number.MAX_SAFE_INTEGER),
    resetAt: timestamp(observation.resetAt), cooldownUntil: timestamp(observation.cooldownUntil),
  }) });
}
