# Sync Engine

Version: 0.2  
Author: Touchline Executive Documentation Board  
Last Updated: 2026-06-26  
Status: Active Architecture  
Dependencies: 03_API_Adapter, 05_Cache_Strategy, 06_Rate_Limit, 07_Data_Quality, 08_Database  
Future Related Documents: Daily Sync Jobs, Sync Failure Recovery, Sync Audit Logs, Queue Architecture, Sportmonks Starter Capability Map

The sync engine controls how Touchline keeps football data updated.

## Rules

- Sync must be server-side.
- Sync must respect provider limits.
- Sync must log success and failure.
- Sync must avoid duplicates.
- Sync must not overwrite verified Touchline data with weaker external data.

## Database-First Sync Rule

External provider calls update Touchline database records.

Frontend reads from Touchline database/internal APIs.

The sync engine is the bridge between external data and internal product experience.

## Sync Categories

| Category | Frequency | Examples |
| --- | --- | --- |
| Static data | Weekly/monthly | countries, competitions, teams, positions |
| Daily data | Daily | squads, player profiles, injuries, standings |
| Matchday data | Every few minutes during match windows | fixtures, lineups, match events |
| Live data | High frequency during live windows | livescores, cards, goals, substitutions |
| Economy-sensitive data | Scheduled and audited | official values, eligibility, card categories |

## Migration Sync Strategy

During migration:

1. Keep old API sync jobs active.
2. Add Sportmonks sync jobs in isolated validation mode.
3. Store Sportmonks sync output in normalized tables or staging records.
4. Compare old provider results against Sportmonks.
5. Promote Sportmonks to preferred provider one module at a time.

## Sync Job Requirements

Every sync job must record:

- provider
- endpoint
- requested entity type
- started at
- completed at
- status
- request count
- records created
- records updated
- records skipped
- error message
- rate limit information

## Idempotency

Running the same sync twice must not create duplicate records.

Every provider entity must map to:

```text
provider_name + provider_entity_type + provider_entity_id
```

Then to one Touchline canonical entity.

## Unsafe Sync Behavior

The sync engine must not:

- overwrite verified internal records with low-confidence provider data
- create duplicate players/clubs
- update financial/economy state without audit
- trigger user notifications from unverified data
- expose provider tokens
- run unlimited user-triggered provider searches

## Sportmonks Starter Sync Priorities

The Sportmonks Starter capability map defines the first safe sync scope:

```text
06_Football_Data/10_Sportmonks_Starter_Capability_Map.md
```

First sync sequence:

1. Competitions/leagues selected in the Starter plan.
2. Seasons for those competitions.
3. Teams/clubs in those competitions.
4. Team squads.
5. Player profiles from squads.
6. Fixtures/calendar.
7. Standings.

This order avoids orphaned records and creates stable provider mappings before live or matchday data is introduced.

## Deferred Sync Categories

The sync engine must not schedule these until V2 readiness:

- livescores
- match events
- lineups
- live standings
- injuries and suspensions
- commentaries
- TV stations
- news feeds

## Starter Rate-Limit Protection

Starter usage must be conservative:

1. Sync selected leagues only.
2. Cache static data aggressively.
3. Prefer includes to reduce multiple calls.
4. Queue user-triggered enrichment.
5. Never allow frontend polling against external providers.
6. Disable live polling until Live Arena architecture is approved.
