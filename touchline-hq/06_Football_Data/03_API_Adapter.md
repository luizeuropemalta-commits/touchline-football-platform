# API Adapter

Version: 0.2  
Author: Touchline Executive Documentation Board  
Last Updated: 2026-06-26  
Status: Active Architecture  
Dependencies: 01_Data_Strategy, 02_Sportmonks, 07_Architecture, 08_Database  
Future Related Documents: Provider Interface Spec, API Error Handling Rules, Provider Certification Tests, Sportmonks Starter Capability Map

The API adapter layer allows Touchline to connect multiple football data providers without rewriting the product.

## Required Capabilities

- Normalize player data.
- Normalize club data.
- Normalize match data.
- Normalize market values.
- Track provider source.
- Handle provider errors.
- Support provider replacement.

## Internal Interface

All provider adapters must satisfy the same internal contract:

```ts
interface FootballDataProvider {
  searchPlayers(query: string, options?: SearchOptions): Promise<PlayerSearchResult[]>;
  getPlayerById(providerPlayerId: string, options?: FetchOptions): Promise<ProviderPlayer | null>;
  getTeamById(providerTeamId: string, options?: FetchOptions): Promise<ProviderTeam | null>;
  getCoachById(providerCoachId: string, options?: FetchOptions): Promise<ProviderCoach | null>;
  getFixtureById(providerFixtureId: string, options?: FetchOptions): Promise<ProviderFixture | null>;
  getFixturesByDate(date: string, options?: FetchOptions): Promise<ProviderFixture[]>;
  getLiveScores(options?: LiveScoreOptions): Promise<ProviderLiveScore[]>;
  getStandings(params: StandingsParams): Promise<ProviderStanding[]>;
  getTransfers(params: TransferParams): Promise<ProviderTransfer[]>;
  getSeasons(params?: SeasonParams): Promise<ProviderSeason[]>;
  getCompetitions(params?: CompetitionParams): Promise<ProviderCompetition[]>;
  getSquad(params: SquadParams): Promise<ProviderSquadMember[]>;
  getPlayerStats(params: PlayerStatsParams): Promise<ProviderPlayerStats[]>;
  getTeamStats(params: TeamStatsParams): Promise<ProviderTeamStats[]>;
  getRateLimitStatus(): Promise<ProviderRateLimitStatus>;
}
```

This is an architectural contract, not production code in this document.

## Provider Implementations

Required providers:

| Provider Adapter | Role |
| --- | --- |
| `LegacyFootballProvider` | Wraps existing API-Football/API-Sports implementation during migration |
| `SportmonksFootballProvider` | Preferred new structured football provider |
| `OptaFootballProvider` | Future enterprise placeholder |
| `SportradarFootballProvider` | Future enterprise placeholder |
| `StatsPerformFootballProvider` | Future enterprise placeholder |
| `ApiFootballProvider` | Optional explicit adapter if kept separately from Legacy |

## Provider Factory

Provider selection must be environment-driven:

```text
FOOTBALL_DATA_PROVIDER=sportmonks
```

The provider factory returns one adapter:

```text
sportmonks -> SportmonksFootballProvider
legacy -> LegacyFootballProvider
api-football -> ApiFootballProvider
opta -> OptaFootballProvider
sportradar -> SportradarFootballProvider
statsperform -> StatsPerformFootballProvider
```

## Normalization Rule

Provider response:

```text
Sportmonks Player
API-Football Player
Opta Player
```

Must become:

```text
Touchline Normalized Player
```

The rest of the app must only see Touchline normalized models.

## Error Handling Rules

Adapters must return structured errors:

- provider unavailable
- unauthorized
- rate limited
- unsupported endpoint
- subscription missing
- invalid response
- partial data
- timeout

No raw provider error should be shown directly to users.

## Adapter Certification

A provider is not approved until it passes:

- authentication validation
- endpoint coverage validation
- response normalization validation
- rate limit behavior validation
- cache compatibility validation
- data quality validation
- fallback behavior validation

## Starter Capability Adapter Scope

The Sportmonks Starter capability map defines which methods should be activated first:

```text
06_Football_Data/10_Sportmonks_Starter_Capability_Map.md
```

Adapter activation order:

1. `getCompetitions`
2. `getSeasons`
3. `getTeamById`
4. `getSquad`
5. `getPlayerById`
6. `searchPlayers`
7. `getFixturesByDate`
8. `getStandings`

Methods that exist in the provider interface but should remain controlled until later:

- `getLiveScores`
- match events
- lineups
- injuries and suspensions
- commentaries
- trends
- news

## Includes Ownership Rule

Sportmonks includes are provider-specific.

Only the Sportmonks adapter or sync engine may decide includes such as:

```text
participants, scores, lineups, events, statistics.type, country, seasons, player, position
```

Frontend components must never request provider includes.

Business logic must ask for Touchline internal models only.
