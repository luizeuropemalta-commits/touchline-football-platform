# Rate Limit

Version: 0.2  
Author: Touchline Executive Documentation Board  
Last Updated: 2026-06-26  
Status: Active Architecture  
Dependencies: 03_API_Adapter, 04_Sync_Engine, 05_Cache_Strategy, 10_Security, 12_Legal  
Future Related Documents: Provider Rate Limit Matrix, Abuse Prevention Rules, Matchday Traffic Policy

Touchline must respect provider rate limits and avoid aggressive crawling.

## Rules

- External fetches must be controlled server-side.
- Search should use the local database first.
- Provider requests should be cached.
- Sync jobs should have daily limits.
- Failed requests should back off instead of retrying aggressively.

## Provider Rate Limit Boundary

Every provider adapter must expose:

```text
getRateLimitStatus()
```

If the provider does not expose rate limit data, Touchline must estimate usage internally.

## User Request Protection

User actions must not create unbounded provider calls.

Examples:

- typing search cannot call provider every keystroke
- opening a profile cannot trigger unlimited enrichments
- refreshing Live Arena cannot bypass cache
- malicious users cannot force sync loops

## Backoff Rules

Provider errors should follow:

1. retry once if safe
2. back off
3. mark stale
4. serve cached data
5. log sync issue
6. alert admin only if repeated

## Cron and Background Sync

All scheduled sync endpoints must be protected by:

```text
MARKET_SYNC_SECRET
CRON_SECRET
TRANSFERMARKT_SYNC_SECRET
```

Future provider sync should use:

```text
FOOTBALL_DATA_SYNC_SECRET
```

## Matchday Protection

Live Arena creates the largest rate-limit risk.

Rules:

- fetch provider data once per global live window per competition/fixture group
- write normalized live state
- all users read normalized live state
- never make one provider call per user

## Abuse Cases

Rate limiting must defend against:

- search spam
- profile enrichment spam
- sync route abuse
- off-platform scraping attempts
- repeated failed provider calls
