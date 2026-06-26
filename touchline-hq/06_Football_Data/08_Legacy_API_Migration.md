# Legacy API Migration

Version: 0.1  
Author: Touchline Executive Architecture Board  
Last Updated: 2026-06-26  
Status: Draft Migration Plan  
Dependencies: 01_Data_Strategy, 02_Sportmonks, 03_API_Adapter, 04_Sync_Engine  
Future Related Documents: Provider Comparison Report, Legacy Removal Checklist, Sportmonks Validation Report

## Executive Summary

The current old football API integration is API-Football by API-Sports.

It is already used in production-oriented routes for player search, optional player enrichment and market sync fallback.

It must not be deleted yet.

It should become:

```text
LegacyFootballProvider
```

Then Sportmonks should be added as:

```text
SportmonksFootballProvider
```

The migration must happen one module at a time.

## 1. Legacy API Inventory

### Provider Name

Current legacy provider:

```text
API-Football / API-Sports
```

### Environment Variables

Current variables:

```text
API_FOOTBALL_KEY
APISPORTS_KEY
API_FOOTBALL_BASE_URL
API_FOOTBALL_SEASON
```

Current default base URL:

```text
https://v3.football.api-sports.io
```

### Current Legacy API Routes

| Route | Purpose | Current Provider Usage |
| --- | --- | --- |
| `/api/api-football/players/search` | Direct optional player search | Calls API-Football `/players` endpoint |
| `/api/player-database/search` | Touchline player search with enrichment | Uses API-Football when DB/search registry data is missing or incomplete |
| `/api/market-sync` | Scheduled market/player data sync | Uses `fetchExternalMarketPlayer`, which supports API-Football |

### Current Supporting Files

| File | Role |
| --- | --- |
| `lib/market-data/provider.ts` | Existing provider helper; supports API-Football and generic market API |
| `lib/market-data/season.ts` | Resolves API-Football season, currently defaults to current calendar year when `auto` |
| `lib/player-database.ts` | Maps/enriches player database records; interacts with profile enrichment |
| `components/player-api-search.tsx` | Older UI component for API-Football player lookup/manual Transfermarkt workflow |
| `components/player-database-search.tsx` | Current Global Football Search UI using internal APIs |

### Current Transfermarkt Reference Layer

Separate from API-Football:

| File/Route | Role |
| --- | --- |
| `lib/market-link-registry.ts` | Transfermarkt link registry, discovery and relationship helper |
| `lib/market-link-parser.ts` | Parses Transfermarkt player/agent/club IDs |
| `/api/market-links/add` | Adds Transfermarkt link record |
| `/api/market-links/search` | Searches saved market links |
| `/api/market-links/discover` | Discovers public Transfermarkt links by name |
| `/api/market-links/sync` | Scheduled registry sync |
| `/api/link-index/sync` | Indexes already-known links from Touchline activity |
| `/api/football-links/search` | Generic global football link search |

This layer is not a licensed data provider. It is a public link/reference registry.

## 2. Legacy API Dependencies

### Frontend Dependencies

Current frontend dependencies include:

- old player API search component
- player database/global football search
- player profile enrichment flows
- admin health display

### Database Dependencies

Legacy API results currently touch:

- `global_player_profiles`
- `players`
- `player_market_snapshots`
- `external_market_provider`
- `external_market_player_id`
- `external_market_url`
- `external_market_payload`
- `source_payload`

### Cron Dependencies

Current scheduled football-related jobs:

| Cron Path | Purpose |
| --- | --- |
| `/api/market-sync` | Daily player market/provider sync |
| `/api/radar/refresh` | Refresh saved radar links |
| `/api/link-index/sync` | Index known football links |
| `/api/market-links/sync` | Refresh Transfermarkt link registry |

### Health Check Dependencies

The admin/system health page checks API-Football configuration and provider connection state.

This should later become a provider-neutral health check:

```text
Football Data Provider Health
```

## 3. Legacy API Risks

| Risk | Impact | Recommendation |
| --- | --- | --- |
| API-Football is directly referenced in routes/components | Harder migration | Wrap as `LegacyFootballProvider` |
| Provider field names leak into source payload | Inconsistent data | Normalize before storing |
| `API_FOOTBALL_SEASON=auto` uses current calendar year | Wrong football season for some leagues | Provider adapter must support explicit season strategy |
| Market value availability is limited | Open/empty values in UI | Use licensed provider or clearly mark unavailable |
| Search can mix Transfermarkt links and API-Football IDs | Confusing identity model | Canonical provider mapping required |
| Legacy direct route exists | Frontend may bypass future provider layer | Deprecate after adapter migration |

## 4. Safe Migration Plan

### Step 1 — Freeze Legacy Behavior

Do not remove existing routes.

Document them and prevent new features from depending directly on them.

### Step 2 — Create Provider Interface

Create internal `FootballDataProvider` architecture.

### Step 3 — Wrap Old API

Move existing API-Football logic behind:

```text
LegacyFootballProvider
```

### Step 4 — Add Sportmonks Adapter

Add Sportmonks behind:

```text
SportmonksFootballProvider
```

### Step 5 — Add Provider Factory

Environment variable:

```text
FOOTBALL_DATA_PROVIDER=sportmonks
```

### Step 6 — Validate in Isolation

Test Sportmonks without changing user-facing pages.

### Step 7 — Compare Data

Compare:

- player identity
- club identity
- squads
- fixtures
- standings
- stats
- photos/logos

### Step 8 — Migrate One Module

First migrate:

```text
player search / player profile enrichment
```

Then:

```text
club profile / squad sync
```

Then:

```text
fixtures / standings
```

Then:

```text
live scores
```

## 5. Legacy Removal Checklist

Legacy API can be removed only when:

- every direct API-Football route is unused
- provider factory handles all football data calls
- Sportmonks validation passes
- cache layer is active
- sync logs are active
- health checks are provider-neutral
- frontend reads internal APIs only
- database mappings exist
- rollback strategy exists

## Final Migration Rule

The old API is not a failure. It is the temporary bridge.

The mistake would be letting that bridge become the architecture.
