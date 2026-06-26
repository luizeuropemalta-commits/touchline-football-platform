# Cache Strategy

Version: 0.2  
Author: Touchline Executive Documentation Board  
Last Updated: 2026-06-26  
Status: Active Architecture  
Dependencies: 03_API_Adapter, 04_Sync_Engine, 06_Rate_Limit, 08_Database  
Future Related Documents: Search Cache Rules, Profile Cache Rules, Image Cache Rules, Live Arena Cache Policy

Caching exists to make Touchline fast, stable and cost-efficient.

## Cache Priorities

1. Search results.
2. Player profiles.
3. Club profiles.
4. Agent and agency profiles.
5. Live match data.
6. External preview images.

Cache rules must balance freshness, cost and user experience.

## Provider Cost Rule

Touchline must never call a paid football provider every time a user types into search.

Search flow:

```text
User types
↓
Touchline search index/database
↓
Touchline cached result
↓
Provider discovery only if allowed and rate-limited
```

## Cache Layers

| Layer | Purpose |
| --- | --- |
| Browser/UI cache | Smooth navigation and repeat views |
| Server cache | Reduce repeated provider/internal API work |
| Database cache tables | Store normalized provider snapshots |
| Search index | Fast autocomplete and ranked results |
| CDN image cache | Fast badges/photos/avatars |
| Live state cache | Short-lived matchday data |

## Suggested TTL Rules

| Data Type | Suggested TTL |
| --- | --- |
| Countries / positions | 30 days |
| Competitions / seasons | 7–30 days |
| Club profiles | 24 hours |
| Player profiles | 24 hours |
| Squads | 6–24 hours |
| Standings | 5–60 minutes on matchday, daily otherwise |
| Fixtures | 5–60 minutes depending on match proximity |
| Livescores | 5–15 seconds during live window |
| Search results | 5 minutes to 24 hours depending on source |

## Cache Invalidation

Invalidate cache when:

- provider sync updates canonical entity
- user updates verified Touchline profile
- admin resolves duplicate
- competition round changes
- match state changes
- provider mapping changes

## Future Search Engine

When the database grows beyond comfortable Postgres search limits, Touchline should introduce:

- Meilisearch
- Typesense
- Algolia
- OpenSearch

But the search engine must index Touchline canonical records, not provider raw responses.
