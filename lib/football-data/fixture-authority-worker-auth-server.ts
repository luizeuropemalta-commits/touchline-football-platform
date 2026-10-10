import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

export type FixtureAuthorityPrincipal = Readonly<{
  workerId: string;
  environment: "qa" | "production";
  accountScope: string;
}>;
type Worker = FixtureAuthorityPrincipal & Readonly<{ token: string }>;
const identifier = /^[a-z][a-z0-9_-]{0,63}$/;
const tokenPattern = /^[A-Za-z0-9_-]{32,256}$/;
const digest = (value: string) => createHash("sha256").update(value).digest();

/** Identity policy only; no endpoint or deployment activation. Configuration
 * must come from the authority's secret store, never from request JSON.
 * Downstream persistence must additionally bind receipts to workerId. */
export function createFixtureAuthorityWorkerAuthenticator(config: Readonly<{
  enabled?: boolean;
  workers: readonly Worker[];
}>): (authorization: string | null) => FixtureAuthorityPrincipal | null {
  if (config.enabled !== true) return () => null;
  if (!Array.isArray(config.workers) || config.workers.length < 1 || config.workers.length > 32) {
    throw new Error("Fixture authority identity configuration unavailable.");
  }
  const ids = new Set<string>();
  const tokens = new Set<string>();
  const entries = config.workers.map(worker => {
    if (!worker || typeof worker.workerId !== "string" || typeof worker.accountScope !== "string"
      || typeof worker.token !== "string" || !identifier.test(worker.workerId) || !identifier.test(worker.accountScope)
      || !["qa", "production"].includes(worker.environment) || !tokenPattern.test(worker.token)
      || ids.has(worker.workerId) || tokens.has(worker.token)) {
      throw new Error("Fixture authority identity configuration unavailable.");
    }
    ids.add(worker.workerId); tokens.add(worker.token);
    return { hash: digest(worker.token), principal: Object.freeze({
      workerId: worker.workerId, environment: worker.environment, accountScope: worker.accountScope,
    }) };
  });
  // Do not retain a plaintext token set in the returned closure.
  tokens.clear();
  return authorization => {
    if (typeof authorization !== "string" || authorization.length > 263) return null;
    const match = /^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(authorization);
    if (!match) return null;
    const hash = digest(match[1]);
    let principal: FixtureAuthorityPrincipal | null = null;
    // Scan all configured hashes; do not reveal a matched worker's list index.
    for (const entry of entries) {
      if (timingSafeEqual(hash, entry.hash)) principal = entry.principal;
    }
    return principal;
  };
}
