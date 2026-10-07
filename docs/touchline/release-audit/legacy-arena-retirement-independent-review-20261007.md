# Legacy Arena retirement — independent review, 2026-10-07

Scope: camera/code/onboarding retirement receipts and their exact recoverable preimages, not the entire dirty worktree diff. Read-only except this receipt. No test, build, browser, database or remote operation executed by this reviewer. code-verification principles applied: independently inspect actual deltas, distinguish retired tests from passed tests, preserve scope and state explicit limits.

## Evidence and result

No concrete blocking source defect found in the three submitted retirement batches.

Read both removal inventories and camera/code/onboarding retirement receipts. Independently recomputed SHA256 for all 17 recovery files in these exact directories; all match the corresponding receipt tables:

- `/Users/luizlopez/.Trash/touchline-legacy-arena-camera-20261007` — four files.
- `/Users/luizlopez/.Trash/touchline-legacy-arena-code-20261007-VXOHMZ` — ten files.
- `/Users/luizlopez/.Trash/touchline-onboarding-retirement-20261007.zmX4ZB` — three files.

Compared current mixed files directly with those Trash preimages, preserving pre-existing work rather than attributing all changes since HEAD to this task. Recovery originals remain present; this review did not restore, delete or empty Trash.

### Consumer graph

Searches across app/components/lib/tests/scripts found zero references to removed module names arena-formation-video-layout, arena-save-intent, arena-account-sync, arena-club-registry-adapter and formation-transition. Additional searches for their principal exported function/constant names, plus removed onboarding observer/destination helper, returned no current consumers. This supports orphan retirement, not an absolute proof against arbitrary computed imports outside the inspected roots.

### Current coverage preserved

- Score distribution diff removes only accountSync file read and two obsolete merge-source assertions, renaming the surviving test. Authoritative-roster current-season/scoring-v4 statistics and settlement provenance assertions remain; remaining settlement, ranking, coach and backup cases are unchanged from exact preimage.
- Live-coaches diff removes the dead adapter import and its Arena selector case only. Current England selectable-club/coach, identity, frozen registry/snapshot and ranking coverage remain unchanged.
- Onboarding module diff removes observer, private auxiliary type/constant and unconsumed destination helper only. Active `touchlineRegistrationEntryHref` body remains byte-identical in the displayed direct preimage diff. It still sanitizes returnTo, preserves administrative/visual-QA exceptions and emits `/intro?intro=first&onboarding=market` for normal registration. AuthForm still imports and invokes it.
- Onboarding test diff removes the observer harness and its14 cases plus one dead-helper case. Five active registration/continuation cases remain. Retired-destination tests lose only dead-helper import/assertion; all nine current cases and current ClubOwner destinations remain. Old tests are explicitly retired, not newly passed or skipped.
- Camera/browser batch retires legacy geometry/test and two obsolete gameplay specs; this does not replace their old UI coverage with current intro or XI coverage. Subsequent suite totals must account for the removal.

Agent receipts report focused15/15 for mixed code tests and26/26 for onboarding/intro/current entry tests. Those results were not rerun by this reviewer and do not replace the integrated suite root is running.

### Intro, audio, redirects and shared boundaries

Current source still has TouchlineGameEntry finish→`/clubowner?lang=...`, active registration→intro, root/retired route canonical intro flow and current shared media policy. The scoped preimage deltas do not edit these consumers, public flags, auth state, shared registries, scoring/data stores, namespaces or Fantasy geometry. No cascade removal is visible in the submitted manifests. Untouched consumer files were not checkpointed in these three Trash archives; this is scoped-delta/source confirmation, not a claim of repo-wide byte identity.

Independently hashed entry MP4, loop MP4 and poster JPEG; all match the media inventory exactly:

- entry `6353b67c34213302469442c57c86d900cb8ed6ad3b6ec81edfc7b49bb1bd4ccb`
- loop `74c24fc132e5cecbc280dd60da12542db7a7188a48156541eb396eabb599be02`
- poster `5c31a22a79f54aac7483cf8a991e555a311cddff07be940c02cc7c0102239c19`

`auth-ambient-audio.tsx` still imports and selects the loop for non-entry audio. Therefore the loop remains active shared media, not orphan footage eligible for immediate deletion.

## Remaining gates / conclusion

Scoped source retirement is coherent and recoverable. Integrated verification, fresh typecheck/lint/build and broader release gates are separate and not approved here. Audio disposition is explicitly pending; do not call entire legacy removal or full-site work complete, and do not remove the loop without a separately authorized preservation/migration decision and verification. No QA/deploy approval, production mutation, account/data deletion or financial behavior change is implied.

MISSION: independent scoped retirement review. FILES CHANGED: this receipt only. TESTS/BUILD/BROWSER: not executed. REMOTE BUILDS:0. PRODUCTION: not touched. Recovery hashes and exact mixed preimage diffs inspected. OPEN GATES: integrated results and audio decision.

## Follow-on QA fixture and smoke retirement

Independently inspected the two supplied retirement patches and all four modified-file diffs directly against seven exact originals in `/Users/luizlopez/.Trash/touchline-legacy-arena-qa-20261007`. No unrelated delta found in those comparisons. Three retired originals (arena-main-field page/CSS/dedicated test) remain recoverable; app/components/lib/scripts have no surviving dependency on that route/module, and the only current test reference explicitly asserts its absence from the fixture matrix. Shared cards, coach and pitch dependencies were not cascade-deleted.

The readiness checker removes only the obsolete fixture parameter, read, tokens and two locale matrix entries. All six remaining fixture token requirements remain unchanged: ClubHub, card, card neon, owner portrait, official table and twenty-club gallery. Missing required tokens still contribute to LOCAL_CONTRACT_INVALID; added test independently blanks each input and requires its specific failure prefix. No ready-by-default fallback or reduced public-origin/environment/isolation gate was introduced.

Route-smoke source changes are exactly three alias destination/render-target replacements plus non-admin redirect expectation `/arena`→`/intro`. This matches current root/coming-soon/arena source and proxy introRedirect for customer admin denial. Exact preimage comparisons show request mutation/external-origin/auth-action/API guards, duplicate-query/RSC handling, server-side-effect denylist, session/expected-user identity and administrator proof unchanged. Current ClubOwner stays blocked by SERVER_SIDE_EFFECT_AUTHORIZATION_REQUIRED; naming it as destination does not authorize probing its SSR side effects.

New tests accept only exact locale intro aliases and retain negative cases for wrong locale, unexpected hash/final target, duplicate query, skipIntro, intro=first and undeclared parameters. Fake harness redirects were aligned to the real route contract, without weakening existing identity/mutation checks. These are source/unit-contract tests, not a new real-browser smoke result. Returning users may auto-finish intro from saved state and be safely blocked by the existing ClubOwner guard; this patch does not promise arbitrary-session smoke success or bypass that boundary.

Recovery SHA256 independently recorded:

| Relative file | SHA256 |
| --- | --- |
| app/visual-qa/arena-main-field/page.tsx | b6659021266e379502ebd7ad979e058e4fd3547e0080305d70807e50c03e4808 |
| app/visual-qa/arena-main-field/arena-main-field.module.css | 54e8fb2e9fb88e44bffeda05093a228439eb97119f995ef89b5cbf7cf34332fc |
| tests/touchline-arena-main-field-visual-fixture.test.mts | e45b1be2661513539e3dbd4c0c2b40d2b75274f729b3e9f8f392ee9ee856beae |
| scripts/check-touchline-release-readiness.mjs | 168fe82ce6f014e1b875fa5c44ef00124b68c09ad9d5d6062297c1f560e7712d |
| tests/touchline-release-readiness-local.test.mts | b34c1df9b23c5446bf2affef935a041875a31e96dba75824584eb908f778cfaf |
| scripts/qa/run-touchline-route-smoke.mjs | 15a7702104af39e95fa403d01df9b2d929087c63226d9ee6a178e553ddd5fd55 |
| tests/touchline-route-smoke.test.mts | 71e18a06a1a9af3818f1b2a6fb4bc3da374a36530ae5f99392862ee7db7dadaa |

No static blocker found. Root reports focused28/28 and prior full4685PASS/0skip with tsc/lint0errors; prior full predates this follow-on and cannot be reused as final combined proof. Final combined suite and audio decision remain separate pending gates. No tests/build/browser executed by this reviewer; only this receipt appended.

## Route-count follow-on review

Root reported run79790:4681PASS/1FAIL/0skip, with the sole reported failure expecting72 pages after the authorized fixture deletion. Independently compared `tests/touchline-route-audit-manifest.test.mts` against its exact Trash preimage in the same QA archive. Preimage SHA256 verified as `c912a43f80e4efcc2e52feb42bab7b9089e8d04118ea752a3a654dd8b5e44006`.

Delta is only PAGE expectation72→71 plus explicit absence of `/visual-qa/arena-main-field`. Independently counted current app page files with a file listing:71; retired page is absent. Manifest implementation discovers actual `/page.tsx` files rather than a manually shortened allowlist. API94, boundary7, metadata3, proxy1, route uniqueness and all auth/identity/notification/Server Action coverage remain untouched. This is justified contract reconciliation, not a skipped test or acceptance of an unrelated missing page. No static blocker found.

Root reports11focusedPASS and a separate recoverable stale Next typecache migration plus network-denied typegen exit0; those commands and caches were not rerun or independently audited in this source-test assignment. Fresh combined/static/build verification remains necessary after this last test edit. The prior failing full run is retained as failure evidence, not relabeled green.
