# Local transaction and recovery proof — 2026-10-07

**PASS locally, five of five actual migrations, zero skips. Hosted execution remains a separate gate.** This proof uses only an in-memory PGlite PostgreSQL engine and synthetic data; it does not call Supabase, Sportmonks, any provider or a remote database.

Command: with `TOUCHLINE_FANTASY_PGLITE_MODULE` pointing to the verified local runtime, run `node scripts/test-qa-migration-transaction-envelope-20261007.mjs`. Missing runtime fails rather than skipping. The original absolute import was replaced with this explicit environment binding before release to avoid making the receipt runner depend on one Mac path.

Runtime: existing `/private/tmp/touchline-test-runtime-20261007.1UPtcv/node_modules/@electric-sql/pglite/dist/index.js`. The script accepts no arguments, connection string or hosted target. Its private envelope helper is not exported and SQL is not printed. No files or credentials are written. The two predecessor fixtures are read from the repository; prerequisite table/role definitions follow the existing locale and recovery SQL tests.

## Envelope exercised

For each L1, L2, Q1, Q2 and R, the test uses `loadPayloads()` from the hash-bound payload checker:

1. Explicit BEGIN and bounded lock/statement timeouts.
2. EXCLUSIVE lock on the synthetic migration-history table, retained until transaction end.
3. Fail-closed existing-version check, before any migration statement.
4. Actual checked payload; Q1/Q2 have only their known outer BEGIN/COMMIT lines removed.
5. Plain history INSERT with exact source version, name and normalized SQL in `statements`; no conflict suppression or existing-history edit.
6. COMMIT.

The synthetic history schema includes `version text PRIMARY KEY`, `statements text[]`, `name text`, `created_by text`, `idempotency_key text`, and `rollback text[]`. It reflects column types reported by the parent QA preflight, but does not claim to reproduce every hosted default, constraint, trigger or permission.

## Fresh executable evidence

For every migration, a temporary synthetic BEFORE INSERT history trigger verifies the new DDL is already visible, then raises `FORCED_HISTORY_INSERT_FAILURE`. Thus a migration error before reaching history insertion cannot falsely pass this test. After explicit ROLLBACK, the complete inspected snapshot equals its pre-migration state: public columns/defaults, function definitions/ACLs, relation ACLs/RLS, constraints, policies, triggers, existing preference/recovery rows, and migration history.

The failure trigger is then removed in the synthetic database only. Successful envelope execution proves the new DDL marker and exactly one history row containing the full exact normalized payload. Reapplying the envelope raises `LOCAL_PROOF_ALREADY_APPLIED` before DDL; subsequent ROLLBACK leaves the committed snapshot unchanged. Earlier committed migrations remain present while each later failure is rolled back. Final history count is five and quota scope count is zero.

Observed output, exit 0:

```text
L1: PASS history-insert failure rolls back; success persists DDL+exact history; retry rejects unchanged
L2: PASS history-insert failure rolls back; success persists DDL+exact history; retry rejects unchanged
Q1: PASS history-insert failure rolls back; success persists DDL+exact history; retry rejects unchanged
Q2: PASS history-insert failure rolls back; success persists DDL+exact history; retry rejects unchanged
R: PASS history-insert failure rolls back; success persists DDL+exact history; retry rejects unchanged
PASS 5/5; no skips; local PostgreSQL/PGlite envelope only; hosted connector behavior UNVERIFIED
```

## Recovery procedure and limits

Before COMMIT, SQL/history failure aborts the transaction; explicitly roll back the session and confirm schema/history match the expected before-state. Never assume a transport error means rollback: reconcile the exact version, stored statements and affected schema before retry. An existing version fails closed, including when its history differs; no overwrite or automatic repair.

After a verified COMMIT, preserve the migration and data. Keep affected consumers paused/disabled and use a separately reviewed forward correction if needed. This proves transaction recovery before commit, not a compensating reverse migration after commit. Preserve L1→L2 and Q1→Q2; finish R before Live resumes. A later sub-lot failure must not erase an earlier commit.

For hosted use, a separately reviewed executor must enforce exact QA project `xgxbwqxjssxxuihuwmgy`, expected connection identity/history shape and prerequisites, check source/payload hashes immediately before application, and submit the entire explicit envelope in one session/request. The local script supplies no hosted executor. An EXCLUSIVE history lock serializes conflicting writers for the envelope; this local test does not simulate hosted contention or validate CLI connection/transaction transport. Independently verify those properties, actual history defaults/constraints and permissions. Do not pass an explicit history-writing envelope to a runner that independently appends another history row.

No result here proves the hosted `apply_migration` connector's internal transaction handling. The independently discovered CLI route may avoid that opaque wrapper, but requires parent review and hosted postflight. No remote migration has been executed by this task.

MISSION: bounded local transaction proof. SCOPE/FILES CHANGED: this document and `scripts/test-qa-migration-transaction-envelope-20261007.mjs` only. QA BRANCH/COMMIT/DEPLOYMENT/STABLE URL: parent-owned, not changed here. REMOTE BUILD BUDGET/CONSUMED: 0/0. FUNCTIONAL/SECURITY RESULT: synthetic SQL envelope rollback, persistence and retry guard PASS for all five payloads. VISUAL/RESPONSIVE/ACCESSIBILITY/BROWSER: not applicable. TESTS: targeted script only, five cases, zero skips. BUILD: not run. OBSERVABILITY: exact assertions and command output above. OPEN FINDINGS: hosted executor, permissions, contention and postflight unverified by this proof. PRODUCTION: NOT TOUCHED. Parent owns integration ledger and final release gate.

| Tool/skill | Actual action | Evidence |
|---|---|---|
| Code Work / Code Verification / Supabase | Bounded SQL and recovery review | Explicit transaction contract and limitations |
| PGlite | Five actual payloads plus synthetic failure injection | 5/5 PASS |
| apply_patch | Only the two assigned new files | No migration source changes |
