# Provider Switching Strategy

Version: 0.1  
Author: Touchline Executive Architecture Board  
Last Updated: 2026-06-26  
Status: Draft Architecture  
Dependencies: 01_Data_Strategy, 02_Sportmonks, 03_API_Adapter, 08_Football_Data_Architecture_Bible  
Future Related Documents: Provider Factory Spec, Provider Validation Tests, Failover Strategy

## Objective

Touchline must be able to move from one football data provider to another without rewriting the product.

Future migration should require only:

1. Add a new provider adapter.
2. Map provider fields to Touchline internal models.
3. Change `FOOTBALL_DATA_PROVIDER`.
4. Run validation tests.

No business logic rewrite.

No frontend rewrite.

No database redesign.

## Provider Selection

Environment variable:

```text
FOOTBALL_DATA_PROVIDER=sportmonks
```

Supported values:

```text
legacy
api-football
sportmonks
opta
sportradar
statsperform
```

## Provider Factory

The provider factory must:

- read the configured provider
- create the correct adapter
- validate required environment variables
- expose provider health
- fail safely
- never expose tokens to frontend

## Provider Token Rules

| Provider | Token Variable |
| --- | --- |
| Sportmonks | `SPORTMONKS_API_TOKEN` |
| API-Football legacy | `API_FOOTBALL_KEY` or `APISPORTS_KEY` |
| Opta | Future provider-specific server-only variable |
| Sportradar | Future provider-specific server-only variable |
| Stats Perform | Future provider-specific server-only variable |

No provider token may start with `NEXT_PUBLIC_`.

## Normalized Internal Models

Every provider must map to:

- `TouchlinePlayer`
- `TouchlineClub`
- `TouchlineCoach`
- `TouchlineFixture`
- `TouchlineCompetition`
- `TouchlineSeason`
- `TouchlineStanding`
- `TouchlineTransfer`
- `TouchlineSquadMember`
- `TouchlinePlayerStats`
- `TouchlineTeamStats`

## Field Mapping Principle

Provider-specific raw payloads may be stored for audit/debugging, but business logic must use normalized fields.

```text
raw_payload = reference
normalized_model = product truth
```

## Failover Strategy

Future failover order:

1. Serve fresh Touchline database data.
2. Serve stale-but-marked Touchline cached data.
3. Try preferred provider.
4. Try secondary provider if approved.
5. Show unavailable state with no crash.

## Module Migration Order

| Order | Module | Reason |
| --- | --- | --- |
| 1 | Player search | Current user pain point and already provider-assisted |
| 2 | Player profile enrichment | Makes profiles useful and complete |
| 3 | Club profile and squad sync | Needed for club pages and rankings |
| 4 | Coach profiles | Required before coach fantasy features |
| 5 | Fixtures | Foundation for competitions |
| 6 | Standings | Foundation for league context |
| 7 | Livescores | Required for Live Arena |
| 8 | Transfers | Must be separated from Touchline Card transfers |
| 9 | Advanced stats | Supports scoring engine and premium analytics |

## Provider Validation Checklist

Before activating any provider:

- token works
- endpoints are available in subscription
- pagination is understood
- rate limits are known
- image URLs are stable
- IDs are persistent
- includes/relations are tested
- response errors are normalized
- cache behavior is tested
- database mappings are tested
- health check reports accurately

## Business Safety Rule

Changing providers must never change:

- user IDs
- Touchline club IDs
- Touchline player IDs
- Touchline card IDs
- credit balances
- transfer history
- competition history

Provider migration changes external references, not Touchline identity.
