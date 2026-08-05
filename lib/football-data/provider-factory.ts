import { SportmonksFootballProvider } from "@/lib/football-data/providers/sportmonks";
import type {
  FootballDataProvider,
  FootballDataProviderName,
} from "@/lib/football-data/types";

let cachedProvider: FootballDataProvider | null = null;

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
  return new SportmonksFootballProvider();
}

export function getFootballDataProvider() {
  cachedProvider ??= createFootballDataProvider();
  return cachedProvider;
}

export function resetFootballDataProviderForTests() {
  cachedProvider = null;
}
