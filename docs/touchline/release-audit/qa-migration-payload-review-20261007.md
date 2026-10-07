# QA migration payload checkpoint — 2026-10-07

Local artifact review only. No remote SQL, account binding, provider request, scheduler activation, deployment, or credential acquisition. The five source migrations remain unchanged. This document supplements `qa-locale-quota-plan-20261007.md`; it does not authorize application or prove hosted atomicity.

## Executable artifact

Run `node scripts/check-qa-release-migration-payloads-20261007.mjs` from this repository. Default output contains metadata only: source/payload SHA-256, byte counts and removed line numbers. The script resolves the migration directory relative to itself, reads only the five explicit files, checks all five source fingerprints before producing CLI output, and performs no file writes or network access.

For a deliberately requested local SQL payload, use `--payload L1`, `L2`, `Q1`, `Q2`, or `R`. This prints SQL to stdout only; it does not apply it. Exported `loadPayloads()` returns the same checked bytes for a separately authorized caller.

| ID | Source version | Transformation | Payload SHA-256 |
|---|---|---|---|
| L1 | 20261002183141 | Byte-identical | `13a85b62378261328c5edd01026b3cc392df1cbdcd9314c2a13c3f64ddec97f4` |
| L2 | 20261002200934 | Byte-identical | `438ab0f13338dce1b43e2461b8ff57f2752bf78f7e63fd4cd1b17483ff6da00b` |
| Q1 | 20261002152457 | Remove complete lines 2 and 139 only | `371df79d35d74dab6fe78a09018f5bd333b6854a7b443093ab785a9174719946` |
| Q2 | 20261003233637 | Remove complete lines 4 and 127 only | `7e276d98393cd493dcbb74d71a75f6a37f21e86575cb7967568ca68f3017a6d8` |
| R | 20261002160805 | Byte-identical | `01d8e34ec82252e3b0d2fd31a002ea76815a28071743cc9f00af8bafc2d11b7d` |

Q1/Q2 each lose exactly 15 bytes: `begin;` plus LF, and `commit;` plus LF. Their known, hash-bound boundaries must match exactly, with comments preceding BEGIN and COMMIT as the final nonempty line. Reinserting those two complete lines must reproduce the original bytes. No function body, ACL, comment, statement, or Q2 `SET LOCAL lock_timeout = '5s'` is changed. This is deliberately not a general SQL parser; any source drift fails closed and requires another review.

## Why normalization is necessary, and what remains unproven

The official [MCP implementation at commit 8a265089](https://github.com/supabase/mcp/blob/8a2650891e2fa6e5e895075663ba4f35867083d6/packages/mcp-server-supabase/src/platform/api-platform.ts#L252) forwards `name/query` verbatim to the Management API. It does not normalize transaction boundaries or return a migration version. The [hosted endpoint documentation](https://supabase.com/docs/reference/api/v1-apply-a-migration) supplies no explicit SQL/history atomicity guarantee.

The official [self-hosted implementation at commit 329b0a01](https://github.com/supabase/supabase/blob/329b0a015625eb5ae50485efa2c8f20b6fe9294e/apps/studio/lib/api/self-hosted/migrations.ts#L25) wraps supplied SQL and a subsequent history INSERT in BEGIN/COMMIT. Internal COMMIT would terminate that transaction before history insertion. This source proves that implementation only; it explicitly targets self-hosting and does not establish the closed hosted backend's behavior.

These payloads remove the demonstrated nested-boundary hazard. They do not supply their own transaction wrapper, edit migration history, preserve original timestamps in a generated remote version, or demonstrate atomic hosted execution. Existing `apply_migration` remains the preferred supported execution candidate; the strict hosted atomicity condition in the original plan is still UNVERIFIED. Do not replace that fact with a local PGlite assertion.

After any separately authorized application, record source version/hash → payload hash → actual remote version, and verify schema/history before the next step. An ambiguous response requires reconciliation before retry. Keep L1→L2, Q1→Q2 and R-before-Live dependencies. The single shared Starter subscription still requires coordinated consumption before provider enablement; installing these payloads does not create independent QA/Production budgets.

## Local evidence

Root verification (2026-10-07): read the complete checker and this receipt, independently opened the official hosted API reference and pinned self-hosted implementation, reran the metadata checker and git diff --check successfully. The hosted reference describes query/name/rollback and response codes, but does not specify the SQL-plus-history transaction guarantee. Accordingly, the local correction is verified; hosted atomic execution is NOT confirmed. No migration was applied merely to obtain a green status. Resolving this requires a documented/verified hosted executor guarantee or a separately reviewed transactional execution path; source inspection of the self-hosted wrapper is insufficient.

Executed on 2026-10-07, all exit 0:

- Default metadata command: five exact source fingerprints, boundary checks, byte reconstruction and payload hashes PASS.
- Independent in-memory retained-line comparison: five payloads matched the expected unchanged bytes or exact two-line subtraction.
- Ten negative checks: appended drift and a changed byte in each of the five sources were rejected by the fingerprint guard. No source files were modified for these checks.

MISSION: bounded local implementation/artifact review. SCOPE: this document and the checker script only. QA COMMIT: parent candidate base `30419c494911112f7b793ad8881e5b8e36c4f553`, dirty integration remains parent-owned. QA BRANCH/DEPLOYMENT/STABLE URL: not verified here. REMOTE BUILD BUDGET/CONSUMED: 0/0. FILES CHANGED: these two files. FUNCTIONAL RESULT: payload generation verified locally; SQL runtime and hosted atomicity unverified. SECURITY RESULT: no credentials, remote calls, history writes or activation. VISUAL/RESPONSIVE/ACCESSIBILITY/BROWSER: not applicable. TESTS: bounded artifact comparisons and drift rejection only. BUILD: not run; parent build undisturbed. OBSERVABILITY: metadata hashes. OPEN FINDING: hosted execution/history atomicity evidence. PRODUCTION: NOT TOUCHED. Parent owns combined ledger and release gate.

| Tool/skill | Actual action | Result |
|---|---|---|
| Code Work / Code Verification | Scoped implementation and invariant review | Only two assigned new files |
| Node.js | Hash, byte-preservation and rejection checks | PASS |
| Supabase documentation/source | Read-only official endpoint and implementation inspection | Hosted atomicity remains unverified |
| apply_patch | Create checker and evidence document | No source migration edits |
