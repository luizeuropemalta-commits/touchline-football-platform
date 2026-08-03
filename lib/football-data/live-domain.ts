import type {
  FootballDataProviderName,
  TouchlineBallCoordinate,
  TouchlineFantasyEvent,
  TouchlineFantasyFormation,
  TouchlineFantasyLineupMember,
  TouchlineFixture,
} from "@/lib/football-data/types";

/**
 * Provider-neutral public contract consumed by TouchLine Live.
 * Provider payloads and provider-specific IDs never reach the client through
 * this model, so a future data source can replace Sportmonks in one adapter.
 */
export type TouchlineLiveMatchSnapshot = {
  schemaVersion: 1;
  match: TouchlineFixture;
  lineups: TouchlineFantasyLineupMember[];
  formations: TouchlineFantasyFormation[];
  events: TouchlineFantasyEvent[];
  ball: TouchlineBallCoordinate | null;
  fetchedAt: string;
  source: {
    provider: FootballDataProviderName;
    mode: "official" | "touchline-visualisation" | "cached";
  };
};

export type TouchlineLiveLeagueSnapshot = {
  schemaVersion: 1;
  fixtures: TouchlineFixture[];
  fetchedAt: string;
  source: {
    provider: FootballDataProviderName;
    mode: "official" | "cached";
  };
};
