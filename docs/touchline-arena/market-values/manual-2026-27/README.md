# Manchester City manual-value staging — 2026/27

This local-only intake was created after Luiz explicitly authorised the
Manchester City staging artifact for a future, guarded TouchLine import. It is
not a database import, a provider feed, a product claim, or authority to alter
cards, tiers, prices, contracts, wallets or production.

## Preserved source facts

- Source artifact: `manchester-city-2026-27-staging.csv` from the preserved
  2026-08-07 staging directory.
- SHA-256 at local recovery: `f8ee885f9e939db1ac0f79a620cca02d2d57a9a32afd98c8e9a04ec21984b44a`.
- Rows: 32 total; 31 have explicit EUR values; one has no value or currency.
- The source has no player-name or valuation-date column. Those fields remain
  blank here rather than inferred. `source_artifact_date` is provenance only,
  not a valuation date.
- The external IDs and URLs are retained only for protected import-run audit
  traceability. TouchLine UUIDs are the only import identity key. No URL was
  requested, scraped or verified during this local preparation.

## Application gate

The accompanying migration validates each UUID against an active Manchester
City membership and canonical team ID `9` at execution time. Any mismatch
rolls back the entire transaction. The blank-value record remains a `pending`
import item and must never clear, replace or fabricate a canonical value.

Remote application remains blocked by the SQL-editor incident, identity review
at the future database state, and a separate explicit owner authorisation.
