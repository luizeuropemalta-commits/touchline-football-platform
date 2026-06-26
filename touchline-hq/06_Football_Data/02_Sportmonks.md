# Sportmonks

Version: 0.2  
Author: Touchline Executive Documentation Board  
Last Updated: 2026-06-26  
Status: Preferred Provider Candidate  
Dependencies: 01_Data_Strategy, 03_API_Adapter, 04_Sync_Engine, 05_Cache_Strategy, 06_Rate_Limit, 07_Data_Quality  
Future Related Documents: Sportmonks Pricing Review, Sportmonks Endpoint Mapping, Sportmonks Validation Test Results

Sportmonks is a candidate licensed football data provider.

It should be evaluated for:

- Player data coverage.
- Club data coverage.
- Fixtures and live scores.
- Statistics depth.
- Pricing.
- Rate limits.
- Commercial usage rights.
- Data freshness.

Sportmonks must be integrated through the generic API adapter layer, never hardcoded as the only provider.

## Strategic Role

Sportmonks is the preferred structured football data provider for the next engineering phase.

It should power:

- players
- teams/clubs
- coaches
- fixtures
- livescores
- standings
- seasons
- competitions/leagues
- transfers
- squads
- player statistics
- team statistics

It must not directly power frontend components.

## Official Documentation References

Sportmonks documentation confirms broad endpoint coverage for players, teams, squads, coaches, fixtures, livescores, standings, leagues/seasons, transfers and include-based response enrichment.

Primary references:

- Sportmonks endpoint overview: https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints
- Sportmonks includes guide: https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/includes
- Sportmonks players endpoint: https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints/players/get-all-players
- Sportmonks team/player/squad/coach entities: https://docs.sportmonks.com/v3/endpoints-and-entities/entities/team-player-squad-coach-and-referee
- Sportmonks fixtures guide: https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/livescores-and-fixtures/fixtures
- Sportmonks latest updated livescores: https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints/livescores/get-latest-updated-livescores

## Endpoint Validation Matrix

| Touchline Need | Sportmonks Domain | Status | Notes |
| --- | --- | --- | --- |
| Players | Players | Valid provider domain | Must map to Touchline player model |
| Teams / Clubs | Teams | Valid provider domain | Touchline should call them Clubs internally |
| Coaches | Coaches | Valid provider domain | Can support future coach cards |
| Fixtures | Fixtures | Valid provider domain | Used for schedules and match details |
| Livescores | Livescores | Valid provider domain | Used for Live Arena, cache required |
| Standings | Standings | Valid provider domain | Used for competitions and league tables |
| Seasons | Seasons | Valid provider domain | Required for correct historical context |
| Competitions | Leagues / Competitions | Valid provider domain | Normalize as competitions internally |
| Transfers | Transfers | Valid provider domain | Must be separated from Touchline card transfers |
| Squads | Team Squads | Valid provider domain | Used for club profile and player relationship references |
| Includes | `include=` parameter | Valid pattern | Adapter must control includes |
| Rate limit | Provider/account dependent | Needs live account validation | Store provider usage status internally |

## Sportmonks Adapter Rules

The Sportmonks adapter must:

1. Accept Touchline internal method calls.
2. Convert them into Sportmonks requests.
3. Add token server-side only.
4. Apply provider-specific includes.
5. Normalize responses to Touchline internal models.
6. Return provider metadata and sync status.
7. Never leak Sportmonks raw shape to frontend components.

## First Sportmonks Validation Tests

Before production use, validate:

- token authentication
- player search/get-by-id
- team get-by-id
- squad by team/season
- coach get-by-id
- fixtures by date
- livescores latest updated
- standings by season/league
- seasons for league
- competitions/leagues list
- transfers by player/team if available in plan
- rate limit headers or account usage response
- include behavior

## Risk

Sportmonks may not provide every business-specific value Touchline wants, especially market value or agent/agency representation data. Those fields may require:

- a second licensed provider
- official club/agent workflows
- manual verification
- public link references only

Touchline must not assume Sportmonks replaces every football data need.
