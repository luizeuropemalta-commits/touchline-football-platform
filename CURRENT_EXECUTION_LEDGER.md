# TouchLine Current Execution Ledger — Canonical Entry Point

Status: CURRENT AUTHORITATIVE INDEX
Last reviewed: 2026-08-14

Read [CURRENT_STATE.md](CURRENT_STATE.md) first for the active SHA, gates, blockers, and next action.

The append-only evidence ledger remains [TouchLine Final Product Execution Ledger](docs/touchline/final-product-completion/TOUCHLINE_FINAL_PRODUCT_EXECUTION_LEDGER.md). It is historical evidence and must not be truncated, moved, or rewritten as a shortcut.

After material work:

1. update `CURRENT_STATE.md` so it reflects only verified current facts;
2. append dated evidence to the long ledger;
3. mark superseded decisions explicitly rather than deleting them.
# 2026-08-21 — QA Live real-time P0

- Preserved the existing Card Engine Block 4A dirty worktree and backup `9fb94339-d9ce-4925-9d3c-59ef9b0cfe0e`; all P0 implementation is in the isolated worktree `/Users/luizlopez/Developer/touchline-qa-p0-live-20260821`.
- Proved the failure boundary: the ten official fixtures existed in QA and clients polled persisted endpoints, but no recurring server-side sync ran after kickoff.
- Implemented the QA-only provider-to-canonical-to-public pipeline, shared Live/Arena/Club Hub projection, guarded scheduler route, Vault/pg_cron DDL and rollback.
- Applied only the forward QA DDL to Supabase project `xgxbwqxjssxxuihuwmgy`; configured Vault + pg_cron job `1` for a one-minute wake-up. Cron and `net._http_response` records prove repeated successful HTTP `200` executions.
- Added `TOUCHLINE_LIVE_SYNC_SECRET` only to Vercel Preview branch `qa`; the value was generated locally, sent through stdin and never displayed.
- Verification after explicit QA runtime binding: focused `12/12`, full `1145/1145`, TypeScript PASS, lint 0 errors/5 pre-existing warnings, build 134 routes, diff-check PASS.
- Product commit `c15ad638a31349050d6aa85148809f4ac6d485d7` was pushed only to `qa`; deployment `dpl_5oZFyoKBthxjCzrXCnaRUqTPpAJh` is READY and owns the stable QA alias.
- Exact-commit Security Diff Scan `2e77b724-126b-4276-836a-63d87b346c08`: completed with zero reportable findings.
- Canonical/public proof: ten unique QA fixtures; `19722203` persisted and rendered as Arsenal FC `3–0` Coventry City, `Full Time`, minute `94:41`, `14` events. Both allowlisted public endpoints return the same ten unique IDs.
- Native authenticated Safari proved Live and Club Hub propagation. Chromium desktop/tablet/phone-landscape, WebKit and Firefox rendered the same fixture state with clean console/network. Vercel recorded 24 scheduler `200` responses in the scoped window, no `5xx`, and no runtime-error cluster.
- Release preflight passed governance, TypeScript, lint with zero errors/five pre-existing warnings and `1117/1117` release tests.
- P0 status: GREEN / CLOSED. Resume the preserved Block 4A Security Diff Scan next.
- Production: NOT TOUCHED.
