# Data Strategy

Version: 0.2  
Author: Touchline Executive Documentation Board  
Last Updated: 2026-06-26  
Status: Active Architecture  
Dependencies: 02_Product, 07_Architecture, 08_Database, 10_Security, 12_Legal  
Future Related Documents: Provider Matrix, Data Licensing Strategy, Data Quality Rules, Provider Certification Checklist, Sportmonks Starter Capability Map

Touchline must use a multi-provider football data strategy.

No single provider should control the future of the company.

## Core Principles

1. Store verified Touchline data separately from external reference data.
2. Track every external source.
3. Prefer licensed APIs for production-critical data.
4. Use public links as references, not copied databases.
5. Design for provider replacement from the beginning.

## Current Provider Position

Touchline currently has three football data sources in different maturity levels:

| Source | Current Role | Status | Strategic Use |
| --- | --- | --- | --- |
| API-Football / API-Sports | Existing legacy player search and optional enrichment | Legacy active | Keep temporarily as `LegacyFootballProvider` |
| Transfermarkt Link Registry | Public reference links, IDs and previews | Reference registry | Keep as link/reference layer, not full copied database |
| Sportmonks | New preferred licensed provider | Planned foundation | Add through adapter only |

## Database-First Rule

External APIs are synchronization providers only.

The frontend must read from Touchline internal APIs and Touchline database models.

The frontend must never call Sportmonks, API-Football, Transfermarkt or any future provider directly.

## Provider Independence Rule

The application must depend on a Touchline-owned interface:

```text
FootballDataProvider
```

Business logic must never depend on:

- Sportmonks field names
- API-Football field names
- provider URLs
- provider authentication headers
- provider-specific pagination
- provider-specific include syntax

Only adapter files may know provider-specific details.

## Official Source Priority

Touchline data priority:

1. Touchline verified internal records.
2. Licensed provider normalized records.
3. Public reference links.
4. User-submitted data pending review.

Provider data may enrich Touchline, but it must not overwrite verified Touchline records unless the rule is explicit and auditable.

## Migration Strategy

The old API must not be deleted blindly.

Migration order:

1. Inventory all legacy API usage.
2. Define `FootballDataProvider`.
3. Wrap API-Football/API-Sports as `LegacyFootballProvider`.
4. Add `SportmonksFootballProvider`.
5. Switch provider by environment variable.
6. Compare provider results.
7. Migrate one module at a time.
8. Remove the legacy provider only after every dependent page is stable.

## Environment Strategy

Required future environment variables:

```text
FOOTBALL_DATA_PROVIDER=sportmonks
SPORTMONKS_API_TOKEN=...
```

Legacy variables remain temporarily:

```text
API_FOOTBALL_KEY=...
APISPORTS_KEY=...
API_FOOTBALL_BASE_URL=...
API_FOOTBALL_SEASON=...
```

No provider token may ever be exposed to frontend code.

## Strategic Decision

Sportmonks should become the preferred provider for structured football data, but the company architecture must stay provider-neutral forever.

## Sportmonks Starter Capability Baseline

The official Sportmonks Starter capability map lives in:

```text
06_Football_Data/10_Sportmonks_Starter_Capability_Map.md
```

Strategic baseline:

1. Starter should be used first for selected-league football data, not global coverage.
2. V1 should prioritize competitions, seasons, teams, squads, player profiles, fixtures, calendar and standings.
3. Live Arena data, official lineups, match events and injuries should be delayed until the database-first foundation is stable.
4. Betting-style trends, odds and value bets should not be used in V1.
5. Market value and agent/agency truth must remain separate provider capabilities; Sportmonks should not be assumed to provide them.

## First Real Sportmonks Integration Test

The first real Sportmonks test should be:

```text
Team → Squad → Player Profile
```

This validates the most important Touchline relationship:

```text
Club profile
↓
Squad
↓
Player profile
```

The frontend must still read from Touchline internal APIs/database, never Sportmonks directly.
