# TouchLine candidate manifest — 20 September 2026

## Identity verified read-only

- Git root: `worktrees/qa-audit-20260919`
- Working baseline (`HEAD`): `7254d259ea91896f4c9c6313adb714a5a3c01d74`
- Remote `origin/qa` observed with `git ls-remote`: `7254d259ea91896f4c9c6313adb714a5a3c01d74`
- Remote `origin/main` observed with `git ls-remote`: `2e9197e37a25716952e4c26865ad9f4ba2858503`
- `main` is an ancestor of the QA baseline (QA is 67 commits ahead).
- Local `refs/heads/qa` and `refs/remotes/origin/qa` are stale and must not be
  used to select or publish this candidate. This checkout is detached.

This document is release evidence, not an authorization to commit, push,
deploy, apply SQL, or modify a remote environment.

## Working candidate inventory

The initial inventory contained 80 paths, excluding only `work/`, plus this
manifest. The refreshed inventory now contains **94** paths: 60 modified
tracked files and 34 untracked files. It includes the hermetic event fixtures,
rollover runtime helper and real-SQL regression harness, plus the function-only
settlement safety successor and its rollback. QA market-window application is
recorded in CURRENT_STATE. Both QA migrations and the integrated local gates
passed on 21 September as recorded below. Production remains a separate gate.

```text
CURRENT_EXECUTION_LEDGER.md
CURRENT_STATE.md
app/arena/ArenaClient.tsx
app/arena/arena-responsive.module.css
app/fantasy/FantasyGameweekClient.tsx
app/fantasy/fantasy.module.css
app/globals.css
app/layout.tsx
app/manifest.ts
app/visual-qa/market-premium-pitch/page.tsx
components/auth-form.tsx
components/touchline/ClubHubOutsideMatchRoster.tsx
components/touchline/TouchlineInboxList.tsx
components/touchline/TouchlineLandscapeBoundary.tsx
components/touchline/TouchlineLandscapeBoundary.module.css
components/touchline/a11y/TouchlineDialog.tsx
components/touchline/arena/TouchlineArenaIntro.tsx
components/touchline/arena/touchline-arena-intro.module.css
components/touchline/cards/TouchlineCardZoom.module.css
components/touchline/cards/TouchlineCardZoom.tsx
components/touchline/club-hub/ClubHubSectionNavigation.tsx
components/touchline/fantasy/TouchlineGameweekCard.tsx
components/touchline/match-centre/TouchlineMatchCentre.tsx
components/touchline/social/TouchlineSocial.module.css
docs/touchline/final-product-completion/TOUCHLINE_FINAL_PRODUCT_EXECUTION_LEDGER.md
docs/touchline/release-audit/20260920-candidate-manifest.md
docs/touchline/release-audit/20260920-route-coverage.md
lib/football-data/live-sync.ts
lib/football-data/player-season-statistics-store.ts
lib/touchlineArena/authoritative-roster-server.ts
lib/touchlineArena/arena-media-playback.ts
lib/touchlineArena/arena-onboarding.ts
lib/touchlineArena/central-inbox.ts
lib/touchlineArena/complete-catalogue-read-server.ts
lib/touchlineArena/orientation-gate.ts
lib/touchlineArena/player-ranking-rebuild-server.ts
lib/touchlineArena/public-season-player-points-server.ts
lib/touchlineArena/ranked-card-catalog-server.ts
lib/touchlineFantasy/server.ts
lib/touchlineFantasy/market-browser.ts
lib/touchlineFantasy/gameweek-lifecycle.ts
scripts/qa/run-touchline-route-smoke.mjs
scripts/run-vercel-release-tests.mjs
supabase/migrations/20260919151427_touchline_fantasy_kickoff_final_whistle_market_window.sql
supabase/migrations/20260920153000_touchline_fantasy_safe_rollover_settlement.sql
supabase/qa/055_touchline_qa_fantasy_kickoff_final_whistle_recovery.sql
supabase/qa/055_touchline_qa_fantasy_kickoff_final_whistle_recovery_postflight.sql
supabase/qa/055_touchline_qa_fantasy_kickoff_final_whistle_recovery_preimage.sql
supabase/qa/056_touchline_fantasy_safe_rollover_settlement_rollback.sql
tests/arena-auth-isolation.test.mts
tests/browser/touchline-arena-mobile-visual.spec.ts
tests/browser/touchline-card-frame-decode.spec.ts
tests/browser/touchline-player-leader-crown.spec.ts
tests/browser/touchline-public-launch-gate.spec.ts
tests/fixtures/social-events-live.README.md
tests/fixtures/social-events-live.synthetic.mts
tests/myclub-command-deck-and-boundary-trace.test.mts
tests/touchline-arena-433-video-layout.test.mts
tests/touchline-arena-audio.test.mts
tests/touchline-arena-fullscreen.test.mts
tests/touchline-arena-intro.test.mts
tests/touchline-arena-onboarding.test.mts
tests/touchline-arena-responsive-rhythm.test.mts
tests/touchline-authoritative-roster.test.mts
tests/touchline-card-zoom-crown-safe-zone.test.mts
tests/touchline-card-zoom-details.test.mts
tests/touchline-card-zoom-scroll-integrity.test.mts
tests/touchline-catalogue-rating-parity.test.mts
tests/touchline-central-inbox-route.test.mts
tests/touchline-central-inbox.test.mts
tests/touchline-clubhub-profile-order.test.mts
tests/touchline-commercial-card-surfaces.test.mts
tests/touchline-complete-catalogue-pagination.test.mts
tests/touchline-fantasy-market-browser.test.mts
tests/touchline-fantasy-lifecycle-pglite.test.mts
tests/touchline-fantasy-rollover.test.mts
tests/touchline-fantasy-market-window-pglite.test.mts
tests/touchline-fantasy-market-window-recovery-pglite.test.mts
tests/touchline-fantasy-markt-redesign.test.mts
tests/touchline-global-landscape.test.mts
tests/touchline-live-sync-outcome.test.mts
tests/touchline-match-centre.test.mts
tests/touchline-matchday-point-distribution.test.mts
tests/touchline-my-club-command-centre.test.mts
tests/touchline-neon-identity-regression.test.mts
tests/touchline-orientation-gate.test.mts
tests/touchline-public-locale.test.mts
tests/touchline-public-season-rating-authority.test.mts
tests/touchline-ranked-card-catalog-authority.test.mts
tests/touchline-ranking-source-pagination.test.mts
tests/touchline-release-build-gate.test.mts
tests/touchline-route-smoke.test.mts
tests/touchline-social-events-live.test.mts
tests/touchline-social-template-policy.test.mts
```

`docs/touchline/release-audit/20260920-candidate-manifest.md` itself is now a
task-owned release record and must be included if this manifest is committed.

## Explicit exclusions

- `work/` — local task material, never stage or deploy.
- `.env*`, `.next/`, `node_modules/`, caches, local databases, logs, and
  private Social Studio artifacts — none appeared in the captured status list;
  all remain prohibited release input.
- Both migrations are included, independently reviewed, real-SQL tested and
  applied only in QA; production application is a separate guarded operation.

## Verified local gate — 21 September

- Full suite: 2154 total, 2146 pass, zero fail, eight optional Social SQL skips.
  Explicit PGlite execution includes 20 lifecycle and 17 window/recovery cases.
- Remote-compatible verify:release: exit 0; 2099 total, 2054 pass, 45 skips;
  includes input/readiness, TypeScript and lint.
- Final production build: exit 0, 145/145 routes generated. Receipt:
  /private/tmp/touchline-resolve-stable4-build-final.log, session58004.
  Earlier interrupted and isolated-module-resolution attempts are superseded.
  Generated output lives outside iCloud; no source or dependencies changed.
- Chromium public/crown/frame/landscape checks: 14/14 passed. Fixture rendering
  is not authenticated customer/Admin, native Safari or live-data acceptance.
- QA remote migrations: 20260920211911 and 20260920220827. Four lifecycle
  functions remain service-only; atomic migration preserved eight table hashes.
- Independent review: no remaining P0/P1 in the bounded lifecycle change.
- Re-hash all 94 inputs against the verified source bytes before staging;
  subsequent changes in this gate are documentation only.

## Publication boundary and remaining gates

1. Stage the explicit 94 paths, review staged diff and secret/generated-input
   exclusions; commit only these verified bytes and prove a clean tree.
2. CHECKOUT=detached; TARGET_REF=refs/heads/qa. The independent fiscal accepts
   this explicit target without changing the occupied stale local qa worktree.
   Commit the exact candidate and advance remote `qa` by one ordinary
   fast-forward Git push. Do not use the stale local tracking refs, a CLI
   deploy, a redeploy, force push, or a second deployment trigger.
3. Recheck remote qa remains the baseline and is ancestor of the new commit,
   environment names/scopes, no duplicate/in-progress build, and fiscal GO.
   Budget: exactly one Git-triggered QA build for the new SHA.
4. Target: fifa-agent-plataform/touchline-arena-official Preview, branch qa.
   Last good QA rollback: dpl_CZVHkkQxz7zNWVsaKMPRrj55pvX8, SHA7254d259.
   Roll back app first; only then guarded SQL inverse056 if necessary.
   No social/card-publication flag is enabled by this candidate.
5. After READY verify SHA/ref/alias, public and customer/Admin smoke and logs.
   Native Safari is currently blocked by the locked Mac. Production remains
   blocked until QA acceptance and production-specific DB/environment checks.

Production is not touched by this candidate-manifest record.
