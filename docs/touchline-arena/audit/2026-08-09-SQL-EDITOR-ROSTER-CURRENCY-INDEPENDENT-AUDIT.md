# SQL Editor / roster-currency incident — independent read-only audit

**Audit date:** 2026-08-09  
**Scope:** TouchLine production project metadata, preserved local artifacts,
Git provenance, and the canonical task transcript.  
**Status:** `INCONCLUSIVE — HOLD CONTINUES`  
**Remote action during this audit:** dashboard metadata/log/history views only;
no SQL or direct table read was initiated, and no database, sync, migration,
export, Preview, or deployment action was performed.

## Purpose

Determine whether the previously observed SQL Editor tab can be proven to have
executed, and whether the available migration history is safe enough to resume
roster-currency work. This audit does not repair, compensate for, or infer a
remote data change.

## Finding

The potential direct SQL execution cannot be confirmed or disproven from the
available evidence. The remote migration baseline is also not established.
Accordingly, the canonical HOLD remains in force.

## Evidence

### 1. Original incident record

The preserved task transcript records the following, without altering the
remote database:

- [source transcript](</Users/luizlopez/.codex/sessions/2026/08/08/rollout-2026-08-08T06-46-52-019fdfb2-003a-7fa0-aa05-6b268b203143.jsonl>)
  physical line `8893`, timestamp `2026-08-09T01:15:49.433Z`: an existing
  SQL Editor tab displayed a Liverpool inventory `UPDATE` and a generic
  “Success. No rows returned” result.
- The same transcript, lines `8937` and `10119`, records the absence of a
  query execution timestamp, actor, job/run ID, affected-row count, commit
  receipt, or changed-row list. The prior audit found only REST `GET` events
  in the available log view; that does not exclude direct SQL Editor activity.

This is evidence that a write-capable query was visible. It is not evidence
that its transaction committed.

### 2. Independent Supabase dashboard metadata inspection

The dashboard was opened only to inspect visible metadata for project
`vxireiswggllwhbsmdcj` / `main Production`:

- Saved SQL query `f180a411-06e1-4eca-9d22-25b8f89779be` exists in the SQL
  Editor. Its visible editor content is a Liverpool
  `touchline_card_inventory` source/timestamp update, under the `postgres`
  role. The visible Results panel currently says **“Click Run to execute your
  query”**. It exposes no historical execution receipt, actor, timestamp,
  affected-row count, commit status, or query-job identifier.
- The Postgres Logs screen was set to **Last 2 days**, which encompasses the
  documented 2026-08-07 21:12–21:40 UTC incident window relative to the
  displayed 2026-08-09 time. It showed **“No data”** and the platform notice
  that refresh can take up to 24 hours. This is a negative log observation,
  not proof that no direct SQL ran.
- The Database Migrations dashboard displayed **“Run your first migration”**
  and no migration entries. This proves that no platform migration record was
  visible in that UI at audit time; it does not prove that direct SQL or
  unregistered DDL never ran.

### 3. Local query artifacts and Git provenance

The potential query has a local counterpart, but it is not versioned execution
evidence:

- [052 Liverpool manual value artifact](</Users/luizlopez/Documents/Codex/2026-06-22/build-phase-1-of-a-premium/supabase/migrations/052_touchline_liverpool_manual_market_values_2026_08_07.sql>)
  is untracked. SHA-256:
  `61aae0dcb81c225ba2b0ea5fe3a53cf465a2d831111fad245af2455029c32f30`.
- [053 Liverpool inventory-source artifact](</Users/luizlopez/Documents/Codex/2026-06-22/build-phase-1-of-a-premium/supabase/migrations/053_touchline_liverpool_market_value_read_model_source.sql>)
  is untracked. SHA-256:
  `45706497a9f927089faffe650de2bf80ae6413d65589523ccf72a22a88d4a3fd`.
  It contains `BEGIN`, an update of only `market_value_source` and
  `updated_at` for eligible Liverpool inventory rows, an assertion of `29`,
  and `COMMIT`. Its filesystem birth time is `2026-08-07T21:21:55.083Z`.
- Neither `052` nor `053` is present in reachable Git history. Their local
  timestamps correlate with the incident window but cannot establish remote
  execution.
- The current candidate holds local migration source `001`–`050`, with
  historical gaps `014` and `016`; it is not a remote migration receipt.
  Historical `014` was removed in commit `6b4b6361`; temporary local `051`
  was removed in `9793f30a`. Any remote record of `014`, `016`, `051`, `052`,
  or `053` is therefore `UNCLASSIFIED` until independently evidenced.
- The versioned [Migration 050 safety report](../market-values/MIGRATION_050_SAFETY_REPORT.md)
  says the migration was prepared locally and not remotely applied. That is
  source-control evidence, not a remote state attestation.

### 4. Why the ambiguity is material

`053` would be narrow but material if committed: it could relabel the source
and refresh the timestamp of up to 29 published/available Liverpool inventory
cards. It would not, by its text, alter their stored value, tier, contract, or
price.

The local schema also has a provenance gap: the
`touchline_card_inventory_history` table is written by the Admin API, while
the table itself has an `updated_at` trigger rather than an update-history
trigger. A direct SQL update could therefore bypass history. See
[migration 018](../../../supabase/migrations/018_touchline_card_inventory_admin.sql)
and the Admin route’s history insertion path.

## Cause and risk assessment

**Immediate cause:** a saved, write-capable SQL Editor query was displayed in
a production project without an auditable execution receipt. Its current view
cannot distinguish a prior execution from an unexecuted saved query.

**Systemic cause:** local SQL artifacts, production schema changes, and
platform migration/audit records are not reconciled into one immutable
execution ledger. Direct SQL lacks a row-history trigger for this inventory
surface, and there was no independently constrained audit identity available.

**Risk:** do not issue a compensating update. Doing so could convert an
unconfirmed incident into a real mutation, obscure timestamps, and make a
future forensic comparison less reliable. Remote schema drift also makes it
unsafe to assume that local migrations describe production.

## Minimum closure protocol — proposal only

No item below is authorized or executed by this audit.

1. Obtain an independent Supabase control-plane record for
   `2026-08-07 21:12–21:40 UTC`: SQL Editor/query history or audit-log export
   with query text/hash, actor, start/end time, result, transaction
   commit/rollback state, and affected-row count. Store it as a new dated,
   hashed evidence artifact; do not overwrite prior reports.
2. Classify every remotely visible migration/schema change against the current
   source baseline and the historical `014`, temporary `051`, and untracked
   `052`/`053` artifacts. Do not fabricate migration-history rows to make the
   UI appear complete.
3. If control-plane evidence is insufficient, the HOLD remains. Only after a
   separate authorization may an independently provisioned, least-privilege
   Postgres audit identity be used for a narrow corroboration. It must be
   non-superuser, have no DML/DDL privilege, enforce
   `default_transaction_read_only=on`, and prove that setting at session
   start. Never substitute `service_role`, a browser token, or the SQL Editor.
4. That later read-only audit must fingerprint only the required schema,
   migration metadata, grants/triggers, currency invariants, and roster
   membership invariants. It must produce a new immutable report before any
   roster export, sync, manual patch, or value import is reconsidered.

## Decision

`HOLD_CONTINUES`. The evidence is insufficient to prove a safe remote state
or an unknown execution outcome. No manual Bruno/Arsenal correction,
compensating Liverpool update, database connection, sync, export, migration,
or deployment is permitted by this document.
