# TouchLine Current Execution Ledger — Canonical Entry Point

Status: CURRENT AUTHORITATIVE INDEX
Last reviewed: 2026-08-26

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

# 2026-08-26 — QA TouchLine Markt Gameweek XI redesign

- Reused Fantasy Gameweek V1 and made `/market-transfer` its canonical coach → formation → 11 cards → review → confirm → Arena journey; `/fantasy` now redirects into the same system. No Fantasy bench or parallel source of truth was created.
- Added server-owned T−5 lock, immutable confirmed snapshots, coach/XI carry-forward, twenty canonical coaches, exact-XI and club/budget validation, evidence-gated non-selection alerts, and foreign-key coverage in QA only. Transactional probes passed and were rolled back; `0` duplicate canonical keys remain.
- Arena and Club Owner now read the same confirmed canonical snapshot. Arena cannot mutate a synced Gameweek XI through the retired Quick Substitution route. The CUSTOMER's honest `SETTLED` `0/11` state was preserved; no test XI was left behind.
- Native Safari CUSTOMER passed desktop, iPad portrait and controlled mobile-identity landscape gating without logout, account switch, cookie/storage clearing or data mutation. Draft/state survived rotation; deadline punctuation remained deterministic and React hydration stayed clean after the Safari-specific formatting correction.
- Product SHA `fcce81095527fa55aa308ad7e20261ef7c770004`; QA Preview `dpl_EP6T5jfemYpbjJsQydEftT1bQ8dE` is `READY` on the stable QA alias. Focused `15/15`, complete `1302/1302`, remote release `1274/1274`, TypeScript, ESLint (`0` errors), build, governance, release-readiness and diff check passed. Production was not touched.

# 2026-08-26 — QA TouchLine Markt classic presentation restoration

- Product commit `b1b2b9419dbdadd5857337c57fbc6ba074fe3ff3` restores the compact classic Markt presentation without replacing the canonical Fantasy Gameweek implementation. The ordered path remains coach → formation → exactly 11 cards → review → confirm → Arena; there is no Fantasy bench or second system.
- Only the presentation changed. Selected on-pitch cards reuse `TouchlineGoalFacingPitchCard`, so the card tip faces the attacking goal and the floating Rating remains horizontal. Catalogue cards and the full portalled Zoom stay upright. No Rating, value, tier, publication, budget, formation, contract, roster or persistence rule changed.
- Focused coverage passed `57/57`; complete local coverage passed `1302/1302`; release-readiness, diff check and ESLint passed with zero errors and seven established warnings. Standalone local TypeScript/build attempts hit the known macOS FileProvider zero-CPU stall and were stopped without an emitted diagnostic. The exact-SHA Vercel build passed governance, TypeScript, ESLint, `1274/1274` release tests and all `135/135` generated routes.
- Preview `dpl_HBAz7zTkSnM77yCNAi3KMr98NCW3` is `READY` for `b1b2b94` on the stable QA alias. The preserved CUSTOMER session passed Safari desktop, iPad `820×1180` and phone `390×844`, rendering all twenty coaches and the honest settled `0/11` state without a data write. Markt/state requests returned HTTP `200`, and the deployment error-level query was empty. Production was not touched.

# 2026-08-26 — QA TouchLine Markt inter-round window

- Extended the existing Gameweek synchronizer, not the architecture: immutable fixture finalization opens the next Markt at `+5 minutes`, while the existing first-fixture boundary closes it at `−5 minutes`. The scheduled QA sync refreshes the bounded canonical fixture schedule when stale and preserves last-known data on provider failure.
- The first forward migration exposed an existing strict-window constraint when future rounds used `market_opens_at = locks_at`. Corrective commit `c3fcbc909c845b4fad5e344bb3a503ca6fca984a` materializes those rounds with a one-microsecond constraint sentinel and an earlier explicit fail-closed `UPCOMING` branch. The original migration was also corrected for fresh-database replay; no second function or state machine exists.
- QA database proof: five Gameweeks materialized, Gameweek 2 alone is `MARKET_OPEN`, Gameweeks 3–5 are `UPCOMING`, duplicate rounds `0`. Round 2 opened at `2026-08-24 21:10:00.356Z`, exactly five minutes after prior completion, and closes at `2026-08-28 18:55:00Z`, exactly five minutes before kickoff. `anon`/`authenticated` execute are false, `service_role` execute is true, `SECURITY DEFINER` and empty `search_path` are preserved.
- Native Safari CUSTOMER proved twenty enabled coaches, eleven enabled formation choices and enabled player selectors/catalogue on the stable QA alias. No Codex action saved, confirmed or sent a lineup to Arena. Focused `6/6`, complete `1303/1303`, TypeScript, scoped ESLint and diff-check passed. Security scan `7221d774-d381-4ec1-aba5-37e841341bd2` completed with zero findings.
- QA Preview `dpl_9kNYgssQN9cP9onxmvUQqCYsPicZ` is `READY` for `c3fcbc9` and owns the stable QA alias. Post-correction logs showed 17 cron starts and 17 completions with zero new Gameweek constraint failures. Production was not touched.
