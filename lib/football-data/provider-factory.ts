import "server-only";
import { createConfiguredCentralFootballDataProvider } from "./central-provider-server.ts";
import type {
  FootballDataProvider,
  FootballDataProviderName,
} from "@/lib/football-data/types";

/**
 * Sportmonks is the only approved external football-data API. Keeping this
 * decision in the factory prevents an environment variable from silently
 * switching production to an old test provider.
 */
export function getConfiguredFootballDataProviderName(): FootballDataProviderName {
  return "sportmonks";
}

export function createFootballDataProvider(
  _name: FootballDataProviderName = "sportmonks",
): FootballDataProvider {
  return createConfiguredCentralFootballDataProvider();
}

export function getFootballDataProvider() {
  // Re-read binding on construction: a rotated/revoked worker or OFF flag must
  // not retain an older enabled singleton. Response cache is policy-scoped.
  return createFootballDataProvider();
}

export function resetFootballDataProviderForTests() {
  // Compatibility hook; factory instances are no longer cached.
}
