# TouchLine QA P0 Live real-time incident checkpoint

Recorded on 2026-08-21 before any P0 Live implementation.

## Scope boundary

- Target: QA only (`xgxbwqxjssxxuihuwmgy`, Vercel Preview branch `qa`).
- Production, `touchline.com.br`, Production Vercel settings, Production Supabase, DNS and Production data are excluded.
- The P0 Live incident temporarily supersedes the premium Card Engine programme.

## Preserved Block 4A state

- Original QA worktree: `/Users/luizlopez/Developer/touchline-football-platform-qa`
- Original QA worktree HEAD at capture: `c7048a38191935c4124ad8d1251567feb62dde6b`
- Existing database backup/run identifier supplied by the owner: `9fb94339-d9ce-4925-9d3c-59ef9b0cfe0e`
- Last known pending gate: Security Diff Scan; Block 4B must not start until the P0 is green and Block 4A resumes from that gate.
- The original worktree contains uncommitted Block 4A work and is intentionally left untouched. It must not be reset, cleaned, stashed, rebased or used for the P0 implementation.

Captured original-worktree manifest:

```text
 M CURRENT_STATE.md
 M app/(app)/admin/page.tsx
 M docs/touchline/final-product-completion/TOUCHLINE_FINAL_PRODUCT_EXECUTION_LEDGER.md
 M package.json
 M pnpm-lock.yaml
 M tsconfig.tsbuildinfo
?? .tmp-arena-calibration.png
?? app/(app)/admin/card-engine/
?? app/api/admin/card-engine/
?? components/admin-card-engine-console.tsx
?? docs/touchline-card-engine/
?? lib/touchlineArena/card-engine-editorial-import.ts
?? supabase/migrations/20260816165854_restrict_public_security_definer_function_execution.sql
?? supabase/migrations/20260818100529_touchline_card_engine_editorial_control_plane.sql
?? supabase/migrations/20260818101528_touchline_card_engine_effective_view_acl.sql
?? supabase/migrations/20260818101601_touchline_card_engine_batch_rollback_market_value.sql
?? supabase/migrations/20260818101708_touchline_card_engine_publish_batch_item_qualifier.sql
?? supabase/migrations/20260818101848_touchline_card_engine_publish_policy_version.sql
?? supabase/migrations/20260818101945_touchline_card_engine_publish_membership_binding.sql
?? tests/touchline-card-engine-editorial-control-plane.test.mts
?? tests/touchline-security-definer-execute-boundary.test.mts
```

## Isolated P0 worktree

- Path: `/Users/luizlopez/Developer/touchline-qa-p0-live-20260821`
- Branch: `codex/qa-p0-live-realtime-20260821`
- Baseline SHA: `8d3379cc7a3bb664c1cfa05654800462627d9975` (`origin/qa` at creation)
- Initial state: clean.

## Resume rule

After the Live P0 is proven green in QA, return to the original Block 4A worktree and continue from Security Diff Scan. Do not recreate the position migration, do not replace the backup identifier and do not start Block 5 before Blocks 4A and 4B are green.

## P0 implementation candidate

- Added a protected server-only live-sync command with a constant-time bearer check and an explicit functional-QA runtime/project assertion.
- Added adaptive cadence, Sportmonks in-play/latest plus exact-fixture reconciliation, existing-fixture-only canonical writes, status-regression guards, coherent snapshot persistence and explicit degraded reads.
- Added provider-backed minute, period, score/event freshness fields to the canonical fixture and allowlisted public DTO; Live, Arena and Club Hub consume the same persisted authority.
- Added QA-only forward and rollback SQL outside the Production migration directory. The forward SQL is bound to QA project `xgxbwqxjssxxuihuwmgy`, the stable QA alias, service-role execution, Vault and a one-minute pg_cron wake-up.
- The forward DDL was applied only to QA. Vault + pg_cron job `1` is configured for a one-minute wake-up and repeated `net._http_response` / Vercel records prove HTTP `200` execution.
- Vercel `TOUCHLINE_LIVE_SYNC_SECRET` was added only to Preview branch `qa` and is never logged or returned.
- Local gates after the runtime guard: focused boundary tests `12/12`, full suite `1145/1145`, TypeScript PASS, ESLint `0` errors with `5` pre-existing warnings, production build PASS with `134` generated routes, and `git diff --check` PASS.
- Codex Security diff scan `3ba25935-4e15-4999-904f-2de1a20fdf56` reviewed the frozen pre-guard snapshot and completed with zero reportable findings. Exact-commit scan `2e77b724-126b-4276-836a-63d87b346c08` reviewed commit `c15ad638a31349050d6aa85148809f4ac6d485d7` and also returned zero reportable findings.

## Final QA proof

- Commit `c15ad638a31349050d6aa85148809f4ac6d485d7` was pushed only to `qa`. Deployment `dpl_5oZFyoKBthxjCzrXCnaRUqTPpAJh` is READY and owns the stable QA alias.
- The canonical database contains exactly ten unique official fixtures. Fixture `19722203` is Arsenal FC `3–0` Coventry City, `Full Time`, minute `94:41`, with `14` provider events and its provider round persisted.
- `/api/football-data/fixture-schedule` and `/api/football-data/fantasy/livescores` each return HTTP `200`, ten unique IDs and the same final target state.
- The protected sync route rejects `GET` with `405`, rejects an unauthenticated `POST` with `401`, and accepts the scheduler bearer with `200`. Repeated scheduler runs remain idempotent and never create an unknown/duplicate fixture.
- Native authenticated Safari rendered ten fixtures, Matchweek 1 and Arsenal `3–0` Coventry at Full Time; Club Hub reflected the verified table result. Chromium desktop/tablet/phone-landscape, WebKit and Firefox rendered the same result with clean console/network.
- Vercel Observability recorded 24 successful sync requests in the scoped deployment window, zero `5xx`, and no runtime error for the Live endpoint set.
- Release preflight passed governance, TypeScript, lint with zero errors/five pre-existing warnings and `1117/1117` release tests.
- P0 status: GREEN / CLOSED. Production was not touched. Resume the preserved Block 4A worktree from Security Diff Scan.
