import "server-only";
import { createHash } from "node:crypto";
import { SportmonksFootballProvider } from "./providers/sportmonks.ts";
import { createFixtureAuthorityHttpTransport } from "./fixture-authority-http-server.ts";
import { createSportmonksFixtureAuthority } from "./sportmonks-fixture-authority.ts";

type CentralProviderConfig = Readonly<{ enabled?: false }> | Readonly<{
  enabled: true;
  authorityUrl: string;
  workerToken: string;
  accountScope: string;
}>;

/** Explicit worker construction. No content-database client, central service key,
 * environment discovery or unguarded fallback. Existing jobs are migrated only
 * after the central SQL/configuration gates. OFF denies provider HTTP reads. */
export function createCentralFootballDataProvider(config: CentralProviderConfig = {}, authorityFetch: typeof fetch = fetch) {
  if (config.enabled !== true) return new SportmonksFootballProvider({ fixtureGuard: null });
  const call = createFixtureAuthorityHttpTransport({ url: config.authorityUrl,
    workerToken: config.workerToken, accountScope: config.accountScope, timeoutMs: 2500 }, authorityFetch);
  const guard = createSportmonksFixtureAuthority(config.accountScope, call);
  const cacheNamespace = createHash("sha256").update(JSON.stringify([
    "touchline-central-policy-v1", new URL(config.authorityUrl).href, config.accountScope, config.workerToken,
  ])).digest("hex");
  return new SportmonksFootballProvider({ fixtureGuard: { ...guard, cacheNamespace } });
}

/** Runtime worker binding. Intentionally separate from the content database.
 * Missing/OFF configuration denies new provider HTTP, even with a valid
 * Sportmonks token. No per-database quota fallback is permitted. */
export function createConfiguredCentralFootballDataProvider(
  expectedScope?: string,
  environment: Readonly<Record<string, string | undefined>> = process.env,
  authorityFetch: typeof fetch = fetch,
) {
  const flag = environment.TOUCHLINE_SPORTMONKS_CENTRAL_ENABLED;
  if (flag === undefined || flag === '' || flag === 'false') return createCentralFootballDataProvider();
  if (flag !== 'true') throw new Error('Central football-data binding unavailable.');
  const accountScope = environment.TOUCHLINE_SPORTMONKS_FIXTURE_ACCOUNT_SCOPE;
  if (!accountScope || (expectedScope !== undefined && expectedScope !== accountScope)) {
    throw new Error('Central football-data binding unavailable.');
  }
  return createCentralFootballDataProvider({ enabled: true, accountScope,
    authorityUrl: environment.TOUCHLINE_SPORTMONKS_CENTRAL_URL ?? '',
    workerToken: environment.TOUCHLINE_SPORTMONKS_CENTRAL_WORKER_TOKEN ?? '',
  }, authorityFetch);
}
