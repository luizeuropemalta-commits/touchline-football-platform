# Data Quality

Version: 0.2  
Author: Touchline Executive Documentation Board  
Last Updated: 2026-06-26  
Status: Active Architecture  
Dependencies: 01_Data_Strategy, 04_Sync_Engine, 08_Database  
Future Related Documents: Duplicate Detection Rules, Source Confidence Score, Manual Review Workflow, Provider Comparison Report

Data quality is one of Touchline's most important strategic assets.

## Quality Rules

- Every external record must have a source.
- Every synced record must have a last checked date.
- Duplicates must be detected before creation.
- Club-player-agent relationships must be treated as suggestions until verified.
- Higher-confidence sources should override lower-confidence sources only by rule.
- Manual owner review must be possible for uncertain data.

## Source Confidence Levels

| Level | Source Type | Example |
| --- | --- | --- |
| 100 | Touchline verified internal action | Admin-approved representation, verified transfer |
| 90 | Licensed structured provider | Sportmonks/Opta/Sportradar validated record |
| 70 | Provider-enriched profile | API-Football enrichment, partial stats |
| 50 | Public link registry | Transfermarkt profile URL and preview metadata |
| 30 | User-submitted unverified data | Manual field entry |

## Duplicate Prevention

Use a layered duplicate strategy:

1. provider entity mapping
2. normalized name comparison
3. date of birth comparison
4. country/nationality comparison
5. club/team context
6. admin manual review for uncertain duplicates

## Relationship Safety

Club-player-agent relationships discovered from external sources are suggestions unless verified.

External data can say:

```text
Possible relationship
```

Only Touchline verification can say:

```text
Verified representation or verified ownership/workflow
```

## Provider Comparison

During migration, compare:

- player names
- date of birth
- nationality
- current club
- position
- photos/logos
- squad membership
- transfer history
- fixture IDs
- competition IDs

Mismatch handling:

1. store both provider records
2. assign confidence
3. avoid automatic destructive overwrite
4. flag for review if business-critical

## Data Quality Warnings

The UI should distinguish:

- verified
- provider synced
- suggested
- stale
- needs review
- unavailable
- duplicate candidate

Users should never confuse suggested data with legally verified football relationships.
