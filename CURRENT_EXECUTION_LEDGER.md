# TouchLine Current Execution Ledger — Canonical Entry Point

Status: CURRENT AUTHORITATIVE INDEX
Last reviewed: 2026-08-26

Read [CURRENT_STATE.md](CURRENT_STATE.md) first for the active SHA, gates, blockers, and next action.

The append-only evidence ledger remains [TouchLine Final Product Execution Ledger](docs/touchline/final-product-completion/TOUCHLINE_FINAL_PRODUCT_EXECUTION_LEDGER.md). It is historical evidence and must not be truncated, moved, or rewritten as a shortcut.

After material work:

1. update `CURRENT_STATE.md` so it reflects only verified current facts;
2. append dated evidence to the long ledger;
3. mark superseded decisions explicitly rather than deleting them.

# 2026-09-02 — Vercel cost-safe commit/deploy governance

- Added the mandatory canonical policy at `docs/touchline/release-audit/VERCEL_COST_SAFE_COMMIT_AND_DEPLOY_POLICY.md` and linked it from `AGENTS.md` and `RELEASE_CHECKLIST.md`.
- Synchronized the cost gate into both canonical Mission Completion Gate copies so future governance validation fails closed if either instruction source drifts.
- Default remote-build budget is zero before explicit target authorization and one Git-native build for the approved exact SHA afterward. Duplicate paths, blind retries, `--force`, **Start Building Now**, full concurrency and silent build-machine upgrades are forbidden.
- Verification: mission governance PASS, release readiness `LOCAL_CHECKLIST_READY_NOT_RELEASE_APPROVAL`, focused governance/readiness tests `6/6`, `git diff --check` PASS.
- No commit, push, Vercel deployment, project/billing configuration change or Production action was performed.

# 2026-09-03 — 043 Goal/Hat consolidation and exact template inventory

- Consolidated `HAT_TRICK_HERO` into the 043 confirmed-goal family across the local registry, source reader, scheduler, executor, shared renderer and the additive migration 047 candidate. The migration and conservative rollback remain unapplied remotely.
- The active Hat visual now shows only one `82px`, maximum-weight yellow `HAT-TRICK` title in the exact TouchLine points colour `#f6d45f`; `HERO` is absent. The green `Bruno Fernandes MAKES IT THREE` line is `17px`. Website letters use the shared staggered zoom while static export and reduced-motion render the complete title immediately; browser geometry confirms no clipping or horizontal overflow.
- Added the code-backed `TEMPLATE_IMPLEMENTATION_STATUS.md` inventory and an executable exact-count guard: 12 template identities are registered locally. Penalty and own goal remain presentation variants of Goal, not duplicate identities. Instagram/Facebook outbound remains disabled, so the external automatic-posting count is 0.
- Verification after the revision-4 candidate: focused `23/23`, complete `1578/1578`, canonical release suite `1550/1550`, TypeScript PASS, ESLint 0 errors with 7 established warnings, `git diff --check` PASS, mission governance PASS, release readiness `LOCAL_CHECKLIST_READY_NOT_RELEASE_APPROVAL`, and Next production build `139/139` pages PASS. Browser evidence confirmed the native `1080×1350` Hat canvas, yellow one-line title, no `HERO`, decoded imagery and empty console.
- Luiz approved Hat revision 3 on 3 September 2026 after direct per-glyph yellow verification. A subsequent owner-requested revision 4 legibility candidate is now locally rendered: the club crest precedes the player name, long names wrap without covering it, `+12` is a `52px` primary TouchLine Points value derived from the existing `player_scoring_v3` rule for the persisted `10.00` rating, and the duplicate Match Rating explanation is removed. Revision 3 remains preserved; revision 4 is byte-locked for review and is not yet labelled as its approved replacement. No database write, shared-QA/Production mutation or social dispatch occurred.
- Git Preview `dpl_DHtPTBfuSPTyYJs1bssgVAjgqYwJ` for candidate `d0f5a4a` failed before the Next build because the deployment context intentionally excluded four new documentation inputs read by release tests. The failure was diagnosed from the exact Vercel build log; the SHA was not retried. The follow-up candidate minimally allowlists only those four small canonical files in `.vercelignore`.
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
- Product Preview `dpl_9kNYgssQN9cP9onxmvUQqCYsPicZ` reached `READY` for `c3fcbc9`; the stable QA alias follows the latest branch-head deployment with identical runtime code. Post-correction logs showed 17 cron starts and 17 completions with zero new Gameweek constraint failures. Production was not touched.

## 2026-08-28 Live fixture rail, verified stadium card and premium match header — QA GREEN / SAFARI RENDER PASS

- **Bounded correction:** product commit `685b162b77ca28c302d07883eba419a0e7b71832` fixes the existing Live fixture rail, adds localized day/date labels, rounds the navigation neon to the pill boundary and strengthens the existing match hero. No second fixture, venue, lineup or ingestion system was created.
- **Verified venue path:** one deduplicated catalog maps Selhurst Park (`venue 201`, Crystal Palace `team 51`, capacity `25,486`) and Etihad Stadium (`venue 151`, Manchester City `team 9`) through both provider venue and canonical home-team identities. Fixture `19722189` returns the sanitized Selhurst Park DTO and the UI displays the attributed image card. Etihad capacity remains omitted until explicitly confirmed.
- **Truthful lineup state:** official lineup availability can be detected when lineup data exists, but the provider does not expose a guaranteed future publication timestamp. The UI therefore keeps the honest pending state rather than fabricating a countdown; a clickable lineup CTA is queued for the first verified lineup payload.
- **Verification:** focused `27/27`, full `1330/1330`, TypeScript, ESLint (`0` errors; seven established unrelated warnings), diff check, mission governance, release readiness and local build `135/135` passed. Browser checks at `1440×900`, `1024×768` and `844×390` proved desktop vertical and mobile horizontal rail movement, zero document overflow, complete image loading, rounded navigation glow and an empty console. Native Safari CUSTOMER rendered the stable QA match and stadium presentation; direct rail manipulation was not claimed because the UI-control bridge intermittently returned `noWindowsAvailable`.
- **Release/observability:** Preview `dpl_Hek1DH9NLBrHKB3CrXPqZLYGzDqm` is `READY` for exact SHA `685b162`, URL `https://touchline-arena-official-2uj6u4q5z-fifa-agent-plataform.vercel.app`, and owns the stable QA alias. Runtime traffic is `87×200`, `8×307`, `2×204`, with no error/fatal event. Production was not touched.

## 2026-08-28 Live twenty-stadium aerial card catalog — QA GREEN / NATIVE SAFARI PASS

- Product commit `9d615d2e81b97f21c7ae6ef6253e6b53e59cfbf8` extends the existing fail-closed venue catalog from two to twenty exact home-team/venue mappings and uses the supplied aerial assets only inside the small premium Stadium card. The main Live background and every fixture/score/date/navigation behavior remain unchanged.
- All twenty local assets are optimized 960×960 WebP files. The stable QA schedule returns verified venue names and matching aerial assets for all `40/40` persisted fixtures; Selhurst Park and Anfield were rendered as separate home-ground cross-checks. Missing or failed images retain a premium landmark fallback.
- Focused `24/24`, full `1332/1332`, TypeScript, ESLint with zero errors, diff check, governance, release-readiness and build `135/135` passed. WebKit passed `844×390`, `1024×768` and `1440×900`; the in-app browser and native Safari rendered the correct Selhurst Park card. Preview `dpl_2a4zrAMWyHyVWPitmDeMXd9T9tyX` is `READY` for exact SHA `9d615d2`, with empty build-error and error/fatal runtime-log results. Production was not touched.

## 2026-08-28 Old Trafford Live hero — QA GREEN / NATIVE SAFARI PASS

- Commit `ebfd8a893059a2e7dcf37ed542c4b333677e7c75` applies the approved interior only to exact Old Trafford/Manchester United home matches and fails back to the generic pitch. Pre-match shows kickoff once in the lower row; only authoritative live state shows pulsing Portuguese `AO VIVO`. No predicted lineup is called official and no provider-release countdown is invented while `metadata.lineup_confirmed` remains outside the persisted pipeline.
- The hero contract is `105:68` (`1.5441:1`). WebKit measured `906.94×587.34` at `1440×900`, `531.69×344.33` at `1024×768` and `777.31×503.39` at `844×390`, all with zero horizontal overflow. The `1600×1000` image uses `cover` at `50% 62%`, cropping about `1.75%` from each lateral and retaining field and stands.
- Focused `28/28`, full `1336/1336`, TypeScript, lint with zero errors, diff check, governance, release-readiness and build `135/135` passed. Native Safari rendered the Portuguese QA hero with preserved session. Preview `dpl_8dvwgpb1KvsGJQw2ESrkSq1DnoQv` is `READY` for exact SHA `ebfd8a8`, owns the stable QA alias, and has no build error or deployment-scoped error/fatal runtime event. Production was not touched.

## 2026-09-01 Production release attempt — ROLLED BACK / PUBLIC GATE RESTORED

- Candidate `2e9197e37a25716952e4c26865ad9f4ba2858503` passed the canonical release preflight, TypeScript, ESLint with zero errors and seven established warnings, `1540/1540` tests, `138/138` route build, clean-worktree verification and Security Diff Scan `76eb1df7-9369-4335-9fab-2e534dd5d859` with zero findings. It was fast-forwarded once to `origin/main` and produced the single Production deployment `dpl_GBeFWTCxSz96siMeP5J69yGmJwRF` (`READY`). No migration, database write, provider sync or social outbound was executed.
- Production smoke found a blocking data/schema gap: `/api/football-data/fixture-schedule` returned a handled HTTP `503` (`No persisted fixture schedule is available`); the authenticated Markt showed `Serviço temporariamente indisponível`; Live showed no current fixtures. Supabase read-only evidence found all `29` Production fixtures still `Not Started` while QA had `20` `Full Time` plus `30` future fixtures. Production also had zero player fixture/season statistics, zero active ranking snapshot and zero fantasy fixture feeds.
- Read-only schema comparison confirmed Production lacks the canonical Fantasy config/Gameweek tables and RPC, the analytics recording RPC and the published formation registry that exist in QA. API logs showed the corresponding `404` calls. This is not a web-code crash and cannot be corrected safely by another Vercel build.
- The deployment was rolled back immediately to gated deployment `dpl_wPGLJpo7AmgRHPF7ZtQobtBQrhDS`; `touchline.com.br` again serves the premium construction gate on protected product routes. The Production launch flag was restored to fail-closed for future builds. The exact temporary Vercel link directory and its short-lived local credentials were deleted after verification.
- Required next gate: independently review and authorize a selective Production data/schema cutover plus canonical foundation/fixture/statistics/ranking backfill. Social migrations/outbound remain excluded. Do not reopen the public product until the full functional matrix passes against Production data.
