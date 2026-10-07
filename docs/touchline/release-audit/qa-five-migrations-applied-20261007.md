# Five QA migrations — applied and verified

2026-10-07. Owner requested confirmation of recovery then continuation to QA deployment. Target only `xgxbwqxjssxxuihuwmgy`; Production not accessed or modified. No provider activation, scheduler activation, notification send, account creation or preference selection.

## Execution proof

Root independently reran the five actual normalized SQL payloads through the in-memory PostgreSQL transaction/history failure proof: 5/5 PASS, no skips. Official CLI query handler forwards the complete SQL request without appending migration history. The installed CLI 2.114.0 accessed the exact QA target using existing authentication; read-only identity returned postgres/PostgreSQL17.6. A BEGIN/SET LOCAL/transaction-id assertion/ROLLBACK probe returned `transaction_local_state_rolled_back=true` from the hosted QA transport. Independent reviewer accepted the explicit-envelope route, replacing the opaque apply_migration evidence gap for this execution path only.

Root created `scripts/apply-qa-release-migration-20261007.mjs`: fixed QA target, all source hashes checked, explicit transaction, bounded timeouts, exclusive history and preference/recovery locks, absent-version and predecessor checks, locked preimage digest guards, actual payload, plain history INSERT, COMMIT, then exact stored-payload comparison. No automatic retry. Independent review GO consumed before application. Syntax, targeted lint and mission governance checks exit0.

## Committed versions, in execution order

| ID | Version | CLI result | Immediate check |
|---|---|---|---|
| L1 | 20261002183141 | exit0, exact history | nullable locale column, no default |
| L2 | 20261002200934 | exit0, exact history | revision-aware invoker RPC, no old overload |
| Q1 | 20261002152457 | exit0, exact history | quota tables RLS; direct grants postgres only |
| Q2 | 20261003233637 | exit0, exact history | expanded endpoint constraint present |
| R | 20261002160805 | exit0, exact history | deferral RPC present |

Source/payload fingerprints are in `qa-migration-payload-review-20261007.md`. Q1/Q2 execution removes ONLY their original outer BEGIN/COMMIT because the reviewed envelope owns the transaction. Source migration files remain unchanged. Original version identifiers preserved in committed history; no duplicate generated versions or applied-history edits.

## Postflight

- All five exact versions present; each stored SQL payload compared exactly by the runner.
- Preferences: 1 row, all preexisting fields digest unchanged; added locale/revision only.
- Recovery: 10 rows, all preexisting fields digest unchanged; added reservation columns only.
- Quota scopes:0; attempts:0. No account binding enabled.
- Active cron jobs:0. Before application: no other active client session and no running sync started in the preceding30minutes.
- Hosted migration history: expected text/text[] columns, version PK, idempotency unique, no user triggers, INSERT permitted.
- No production changes, Git push, Vercel build or deploy.

## Recovery and remaining release gates

These versions are committed. Do not repeat or remove their history. Before-commit failure proof is not an undo of committed DDL. Preserve added columns, revisions, reservations and receipts; keep consumers disabled and use reviewed forward correction if a defect appears. Unknown outcomes require schema/history comparison before retry.

Local application suite4812PASS/0FAIL/0SKIP, TypeScript0, lint0 with4existing warnings, updated build139/139 exit0. This resolves the five-schema dependency, not immutable candidate/remote configuration/QA smoke. Public locale gate and provider binding remain separate release configuration. Single Sportmonks Starter subscription confirmed2000/entity/hour; separate QA/production databases do not coordinate its budget. Keep provider disabled until coordination/exclusive testing is approved.

MISSION: RELEASE prerequisite. SCOPE: five QA migrations only. QA COMMIT: integration base30419c4, new immutable release SHA pending. QA DEPLOYMENT: not performed. REMOTE BUILD BUDGET/CONSUMED:2/0 (owner subsequently authorized gate-OFF then gate-ON QA builds). TESTS:4812product tests plus5targeted transaction proofs. BUILD:139static outputs,exit0. SECURITY: RLS/grants/preimage/history checked. VISUAL/BROWSER: prior page evidence, remote smoke pending. OPEN FINDINGS: release identity/configuration/provider enablement. PRODUCTION: NOT TOUCHED.
