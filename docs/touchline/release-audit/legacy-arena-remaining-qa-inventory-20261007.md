# Remaining legacy Arena QA surfaces — 2026-10-07

Read-only inventory while integrated suite93616 is running. Only this receipt written; source/tests remain immutable. No browser, database, build or test executed.

## Decision

`run-touchline-route-smoke.mjs` is **shared current QA infrastructure with stale Arena entries**, not an exclusively retired script. Preserve and repair narrowly. `arena-main-field` page/CSS is an **exclusive old static Arena composition fixture**, but the current release-readiness checker explicitly requires it. Removing only the route would break the release gate. Its shared card/pitch dependencies are current product components and must remain.

## Route smoke — consumers and old contract

Exact code consumer: tests/touchline-route-smoke.test.mts imports parseSmokeConfig/buildSmokeRoutes/classifySmokeRequest/isExpectedSmokeDocument/assessVisit/runRouteSmoke/routeSmokeMain and exercises configuration, request allowlists, persona segregation, failure classification, CLI boundaries and cleanup. Historical operational documentation includes docs/touchline/release-audit/20260920-route-coverage.md and candidate-manifest.md. No package.json/playwright config entry directly invokes this script. Lack of an npm script does not make it dead: it is an explicit CLI and is part of tests.

Stale sites in scripts/qa/run-touchline-route-smoke.mjs:

- buildSmokeRoutes lines115–117: root/coming-soon/Arena aliases expect final `/arena?lang=…` and `.arena-stage`. Current routes redirect `/intro`; main marker is `[data-touchline-game-entry]` with the real intro controls, not old gameplay.
- provePersona customer-denial check expects `/arena` from `/admin`; recheck actual current admin/proxy redirect source before changing this expectation. Customer runner is deliberately blocked before launch, so do not remove its safety gate to exercise this obsolete probe.
- Current route declarations also drive navigation and RSC allowlisting. Changing only rendered selector will continue blocking new destination requests; coordinate exact expected URL updates with classifier tests. Do not broadly allow `/intro`, arbitrary queries or all same-origin paths.
- Existing public console401 exception is narrowly path-scoped to old state endpoint; new intro does not need old state fetch. This is not permission to suppress all401s or alter provider calls.

Useful current coverage that MUST remain: exact local/canonical-QA/authorized-production origin admission; no implicit credential/state loading; explicit persona identity; dynamic club/player/coach path bounds; Admin route set; public route set; mutation/external/resource/unknown-query denial; server-effect route denylist including ClubOwner/Fantasy state; websocket/service-worker limits; cleanup and exit status. The old guard correctly notes GET/SSR can mutate server state.

Smallest safe repair manifest (after suite freeze lifts):

1. scripts/qa/run-touchline-route-smoke.mjs
2. tests/touchline-route-smoke.test.mts

Repair redirect expectations and corresponding pure/mock tests while preserving every safety constraint. Add exact positive control for alias→intro and negative wrong-destination/query cases. The intro may automatically advance (media failure/end/reduced motion/previous completion) to ClubOwner, which remains server-effect-blocked; do not weaken that denylist merely to get smoke green. A deterministic bounded intro visit must be designed and demonstrated on the current real route, and any resulting blocked advancement remains an honest failed/incomplete smoke. Current authenticated product smoke remains a separately authorized activity, not restored by old Arena code retirement.

## Static arena-main-field fixture — exact closure

Exclusive files:

1. app/visual-qa/arena-main-field/page.tsx
2. app/visual-qa/arena-main-field/arena-main-field.module.css
3. tests/touchline-arena-main-field-visual-fixture.test.mts (four dedicated structural tests)

The page builds its own synthetic11-player4-3-3 coordinates, technical coach and synthetic Live/FT/Next rail. It is not FantasyGameweekClient/current XI composition; no current product route imports it. Its only navigation reference found in app/components/lib is its own embedded iframe URL for viewport matrices. CSS is imported solely by its page and read by its dedicated test. No current global navigation link found.

Mandatory shared gate references:

- scripts/check-touchline-release-readiness.mjs: function input arenaMainFieldFixtureSource; token requirements lines130–139; EN/PT fixtureMatrix URLs lines192–193; readRepositoryInputs destructuring/read/returned field around215–243.
- tests/touchline-release-readiness-local.test.mts: loads fixture source at27 and expects its PT matrix URL at50.
- Historical docs: complete-product-route-inventory2026-08-15, Arena main-field visualQA2026-08-10, Arena scheduled-rail visualQA2026-08-10. Preserve history and mark retired via a new receipt; do not rewrite historical PASS as current coverage.

Smallest cohesive retirement manifest therefore has **five files**: the three exclusive files above plus the two release-readiness script/test consumers. Remove only retired fixture input/read/token block/two URLs and dedicated expectations, leaving all other fixture requirements, production isolation checks and manual gates intact. Ensure the test suite still proves missing remaining fixtures fail closed; do not change the checker to ignore arbitrary missing files. Archive exact preimages and record four retired tests explicitly.

Shared dependencies to preserve: TouchlineEliteExactCard, TouchlineCoachCard, TouchlinePitchSurface, card-rules, coach-card, coach-card-layout, demo-data/canonical club registry and visual-qa-locale. The fixture's static editorial profiles/nominal prices and hardcoded positions are local to that page; their removal must not remove real card metadata or public assets used elsewhere. No asset deletion is established by this inventory.

## Next step / limits

Root decides these two independent manifests only after current full suite finishes; no changes in this audit. No need to restore retired `.arena-stage` or redirect current pages backward. Any follow-on changes invalidate the current suite's final-source identity and need scoped tests plus combined verification. Root's broader checkpoints, media decisions and database protections remain unchanged.

MISSION: remaining QA legacy inventory. FILES CHANGED: receipt only. FUNCTIONAL/VISUAL/RESPONSIVE/ACCESSIBILITY/BROWSER: not executed. TESTS/BUILD: none. QA/DEPLOY/REMOTE BUILD BUDGET: not exercised/0. OPEN FINDINGS: shared smoke stale contract; release-gate closure required before fixture retirement. PRODUCTION: NOT TOUCHED.
