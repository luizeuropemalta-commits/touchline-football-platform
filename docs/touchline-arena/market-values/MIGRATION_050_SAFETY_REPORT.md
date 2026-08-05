# Migration 050 — Market Value Engine safety review

Status: prepared locally; **not applied to any remote database**.

## Scope

- Creates the TouchLine-owned current value table, immutable player history,
  import runs/items, and job definitions/runs.
- Renames the pre-existing card-economy history table from migration 033 to
  `touchline_card_market_value_history`; it does not delete rows.
- Removes the legacy triggers that automatically changed card classifications
  after a generic player-data update. Existing cards and contracts remain as
  they are. Future seasonal reclassification needs its own approved action.
- Enables RLS and grants table access only to the service role. No anonymous or
  authenticated browser role can read or write the operational tables.

## Preflight before remote application

1. Take a Supabase backup/snapshot.
2. Confirm migration 033 is present and inspect the existing history-table
   columns. The rename only occurs when the old `card_id` column exists.
3. Confirm no external consumer relies on the old table name directly.
4. Apply in a transaction during a quiet maintenance window.
5. Verify all six new tables, the immutable-history trigger, the seeded four
   job definitions, RLS/grants, and the two dropped legacy triggers.
6. Run the import and public-read-model integration tests using a controlled
   licensed sample file. Do not use fabricated values.

## Rollback

Before any verified import, rollback is schema-only: drop the six new tables
and functions/triggers created by this migration, then rename
`touchline_card_market_value_history` back to
`touchline_player_market_value_history` and recreate the retired triggers only
if the former behaviour is explicitly desired. After imports begin, retain the
immutable records and roll forward with a corrective migration; never delete
history to conceal a mistake.
