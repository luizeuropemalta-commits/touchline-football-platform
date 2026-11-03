# Independent release gaps audit — 2026-10-31

Scope: read-only inspection of product/tests; this document is the sole written artifact. Parent owns implementation and release. No test execution, remote mutation or deploy performed by this audit.

## Result

The inspected log contains exactly 90 skipped test cases: 89 browser cases behind explicit environment opt-ins, and 1 native macOS Swift opt-in. None of these 90 requires a physical iPhone or customer production account merely to execute. Two browser cases are explicitly diagnostic (Chromium repeat-mount and WebKit keyboard); crest calibration records a negative control and expressly does not approve T12. They must not be mistaken for end-to-end release evidence.

No case was proved obsolete by this review. The Swift case protects an existing local PNG-to-MP4 output utility, not mobile app readiness or public-site behavior; assess that utility's actual use before removing the guard. Do not delete skipped tests to improve the release count.

Skipped means not executed in this log; earlier focused receipts may cover a matching unchanged candidate, but that requires matching file/code hashes and explicit receipts. This document does not grant PASS to any skipped case.

The log also contains a Chromium launcher failure (`bootstrap_check_in`, permission denied 1100 / SIGTRAP). That is a separate runtime/environment failure, not a skipped case and not proof of memory exhaustion. The captured log is not a final all-pass release receipt.

## Execution boundaries

Commands below run existing test files sequentially and preserve each test's own timeout and capacity checks. Do not run every command concurrently. Browser binaries must already be available through Playwright and OS launch permission must work. Missing binary, permission, resource or assertion failures remain failures; do not bypass safety gates. Swift requires macOS, /usr/bin/swiftc, >5 GiB free disk and >=25% memory according to its guard.

The canonical broad release runner is `node scripts/run-vercel-release-tests.mjs`. It supplies SQL runtimes using `releaseSqlEnvironment` but intentionally preserves browser opt-ins. Running it again with no opt-ins will not close these 90 gaps. Its `--test-timeout=30000` differs from individual browser timeouts up to 300000; focused commands below retain per-file declared timeouts.

For focused SQL-backed browser tests, inherit the same environment first (no credentials):

```sh
cd /Users/luizlopez/Documents/Codex/2026-09-05/touchline-prompt-formalizer/worktrees/qa-stripe-release-20261029
export TOUCHLINE_FANTASY_PGLITE_MODULE="$(node --input-type=module -e 'import {fileURLToPath} from "node:url"; console.log(fileURLToPath(import.meta.resolve("@electric-sql/pglite")))')"
export TOUCHLINE_STUDIO_PGLITE_MODULE="$TOUCHLINE_FANTASY_PGLITE_MODULE"
export TOUCHLINE_GOLDEN_BOOT_PGLITE_MODULE="$TOUCHLINE_FANTASY_PGLITE_MODULE"
export TOUCHLINE_COMPANY_PGLITE_MODULE="$TOUCHLINE_FANTASY_PGLITE_MODULE"
export TOUCHLINE_AVATAR_QA_COMPATIBILITY=1
```

Use a fresh shell without inherited scenario/engine/locale filters. Default engine coverage differs by file: a command passing Chromium does not establish WebKit, Firefox or physical-device PASS. Frame density needs two invocations because gallery and normal tests are mutually exclusive. XI uses keyboard mode `all` so the diagnostic and normal behavior both execute.

## Exact local commands grouped by file

These are proposed executions, not executed receipts. Required absolute screenshot directories are included; tests create them. Existing optional capture variables are included only where the fixture supports them.

```sh
TOUCHLINE_RUN_CARD_ENGINE_LANGUAGE_BROWSER=1 node --test --test-concurrency=1 --experimental-strip-types tests/admin-card-engine-language-browser.test.mts
TOUCHLINE_RUN_PUBLICATION_INBOX_BROWSER=1 node --test --test-concurrency=1 --experimental-strip-types tests/card-publication-inbox-browser.test.mts
TOUCHLINE_RUN_SEASON_CHECKOUT_BROWSER=1 node --test --test-concurrency=1 --experimental-strip-types tests/club-season-checkout-browser.test.mts
TOUCHLINE_RUN_PUBLIC_AVATAR_BROWSER=1 node --test --test-concurrency=1 --experimental-strip-types tests/clubowner-public-avatar-browser.test.mts
TOUCHLINE_RUN_CLUBOWNER_PUBLIC_BROWSER=1 node --test --test-concurrency=1 --experimental-strip-types tests/clubowner-public-browser.test.mts
TOUCHLINE_RUN_COACH_CATALOGUE_BROWSER=1 node --test --test-concurrency=1 --experimental-strip-types tests/coach-catalogue-browser.test.mts
TOUCHLINE_RUN_COMPANY_BROWSER=1 node --test --test-concurrency=1 --experimental-strip-types tests/company-alerts-browser.test.mts
TOUCHLINE_RUN_COMPANY_BROWSER=1 node --test --test-concurrency=1 --experimental-strip-types tests/company-documents-browser.test.mts
TOUCHLINE_RUN_COMPANY_BROWSER=1 node --test --test-concurrency=1 --experimental-strip-types tests/company-finance-browser.test.mts
TOUCHLINE_RUN_COMPANY_BROWSER=1 node --test --test-concurrency=1 --experimental-strip-types tests/company-mail-browser.test.mts
TOUCHLINE_RUN_COMPANY_BROWSER=1 node --test --test-concurrency=1 --experimental-strip-types tests/company-settlement-correction-browser.test.mts
TOUCHLINE_RUN_ROSTER_BROWSER=1 node --test --test-concurrency=1 --experimental-strip-types tests/roster-reconciliation-browser.test.mts
TOUCHLINE_RUN_SOCIAL_ADMIN_LANGUAGE_BROWSER=1 node --test --test-concurrency=1 --experimental-strip-types tests/social-admin-language-browser.test.mts
TOUCHLINE_RUN_LOCALE_BROWSER_TESTS=1 node --test --test-concurrency=1 --experimental-strip-types tests/touchline-account-locale-menu-browser.test.mts
TOUCHLINE_RUN_ADMIN_FINANCE_BROWSER=1 node --test --test-concurrency=1 --experimental-strip-types tests/touchline-admin-finance-language-browser.test.mts
TOUCHLINE_RUN_ADMIN_FOOTBALL_BROWSER=1 node --test --test-concurrency=1 --experimental-strip-types tests/touchline-admin-football-language-browser.test.mts
TOUCHLINE_RUN_ADMIN_MARKET_BROWSER=1 node --test --test-concurrency=1 --experimental-strip-types tests/touchline-admin-market-language-browser.test.mts
TOUCHLINE_RUN_ADMIN_OWNER_BROWSER=1 node --test --test-concurrency=1 --experimental-strip-types tests/touchline-admin-owner-language-browser.test.mts
TOUCHLINE_RUN_APP_LOADING_BROWSER_TESTS=1 node --test --test-concurrency=1 --experimental-strip-types tests/touchline-app-loading-browser.test.mts
TOUCHLINE_RUN_AUTH_CINEMATIC_PLAYBACK_TESTS=1 node --test --test-concurrency=1 --experimental-strip-types tests/touchline-auth-cinematic-playback-browser.test.mts
TOUCHLINE_RUN_BETA_BOOTSTRAP_BROWSER=1 TOUCHLINE_BETA_CAPTURE_DIR=/tmp/touchline-release-gap-evidence/touchline-beta-bootstrap-browser.test node --test --test-concurrency=1 --experimental-strip-types tests/touchline-beta-bootstrap-browser.test.mts
TOUCHLINE_RUN_BETA_CARD_LOCKS_BROWSER=1 TOUCHLINE_CARD_LOCKS_CAPTURE_DIR=/tmp/touchline-release-gap-evidence/touchline-beta-card-locks-browser.test node --test --test-concurrency=1 --experimental-strip-types tests/touchline-beta-card-locks-browser.test.mts
TOUCHLINE_RUN_FRAME_DENSITY_BROWSER=1 node --test --test-concurrency=1 --experimental-strip-types tests/touchline-card-frame-density-browser.test.mts
TOUCHLINE_RUN_FRAME_DENSITY_BROWSER=1 TOUCHLINE_FRAME_DENSITY_GALLERY=1 node --test --test-concurrency=1 --experimental-strip-types tests/touchline-card-frame-density-browser.test.mts
TOUCHLINE_RUN_CARD_NEON_BROWSER_TESTS=1 node --test --test-concurrency=1 --experimental-strip-types tests/touchline-card-hover-neon-browser.test.mts
TOUCHLINE_RUN_ZOOM_LANDSCAPE_BROWSER_TESTS=1 node --test --test-concurrency=1 --experimental-strip-types tests/touchline-card-zoom-landscape-browser.test.mts
TOUCHLINE_RUN_AVATAR_MODAL_BROWSER=1 TOUCHLINE_AVATAR_MODAL_CAPTURE_DIR=/tmp/touchline-release-gap-evidence/touchline-club-owner-avatar-modal-browser.test node --test --test-concurrency=1 --experimental-strip-types tests/touchline-club-owner-avatar-modal-browser.test.mts
TOUCHLINE_RUN_AVATAR_PREPARATION_BROWSER=1 TOUCHLINE_AVATAR_PREPARATION_CAPTURE_DIR=/tmp/touchline-release-gap-evidence/touchline-club-owner-avatar-preparation-browser.test node --test --test-concurrency=1 --experimental-strip-types tests/touchline-club-owner-avatar-preparation-browser.test.mts
TOUCHLINE_RUN_RELEASE_BROWSER_TESTS=1 node --test --test-concurrency=1 --experimental-strip-types tests/touchline-club-release-browser.test.mts
TOUCHLINE_RUN_LINEUP_ANCHOR_BROWSER_TESTS=1 node --test --test-concurrency=1 --experimental-strip-types tests/touchline-clubhub-delayed-lineup-anchor-browser.test.mts
TOUCHLINE_RUN_MATCHDAY_TRANSITION_BROWSER=1 node --test --test-concurrency=1 --experimental-strip-types tests/touchline-clubhub-matchday-transition-browser.test.mts
TOUCHLINE_RUN_SCORE_LAYOUT_BROWSER=1 node --test --test-concurrency=1 --experimental-strip-types tests/touchline-clubhub-score-layout-browser.test.mts
TOUCHLINE_RUN_TICKETS_NEXT_BROWSER=1 TOUCHLINE_TICKETS_NEXT_CAPTURE_DIR=/tmp/touchline-release-gap-evidence/touchline-clubhub-tickets-next-browser.test node --test --test-concurrency=1 --experimental-strip-types tests/touchline-clubhub-tickets-next-browser.test.mts
TOUCHLINE_RUN_ARENA_SCROLL_BROWSER_TESTS=1 node --test --test-concurrency=1 --experimental-strip-types tests/touchline-clubowner-arena-scroll-browser.test.mts
TOUCHLINE_RUN_PLAN_BROWSER_TESTS=1 node --test --test-concurrency=1 --experimental-strip-types tests/touchline-clubowner-page-theme.test.mts
TOUCHLINE_RUN_TECHNICAL_RAIL_BROWSER_TESTS=1 node --test --test-concurrency=1 --experimental-strip-types tests/touchline-clubowner-technical-rail-browser.test.mts
TOUCHLINE_RUN_COACH_BORDER_BROWSER_TESTS=1 node --test --test-concurrency=1 --experimental-strip-types tests/touchline-coach-border-browser.test.mts
TOUCHLINE_RUN_COACH_GEOMETRY_BROWSER_TESTS=1 node --test --test-concurrency=1 --experimental-strip-types tests/touchline-coach-ranking-geometry-browser.test.mts
TOUCHLINE_RUN_COACH_CREST_BROWSER_TESTS=1 node --test --test-concurrency=1 --experimental-strip-types tests/touchline-coach-zoom-crest-browser.test.mts
TOUCHLINE_RUN_CREST_CALIBRATION_BROWSER=1 node --test --test-concurrency=1 --experimental-strip-types tests/touchline-crest-outline-calibration-browser.test.mts
TOUCHLINE_RUN_CREST_OUTLINE_BROWSER=1 node --test --test-concurrency=1 --experimental-strip-types tests/touchline-crest-outline-pixels-browser.test.mts
TOUCHLINE_RUN_UTILITY_SHELL_BROWSER_TESTS=1 node --test --test-concurrency=1 --experimental-strip-types tests/touchline-customer-utility-shell-browser.test.mts
TOUCHLINE_RUN_EXCHANGE_FRIENDS_BROWSER=1 node --test --test-concurrency=1 --experimental-strip-types tests/touchline-exchange-friends-browser.test.mts
TOUCHLINE_RUN_EXCHANGE_HUB_BROWSER=1 TOUCHLINE_EXCHANGE_HUB_CAPTURE_DIR=/tmp/touchline-release-gap-evidence/touchline-exchange-hub-browser.test node --test --test-concurrency=1 --experimental-strip-types tests/touchline-exchange-hub-browser.test.mts
TOUCHLINE_RUN_EXCHANGE_COMMAND_BROWSER=1 TOUCHLINE_EXCHANGE_CAPTURE_DIR=/tmp/touchline-release-gap-evidence/touchline-exchange-negotiations-browser.test node --test --test-concurrency=1 --experimental-strip-types tests/touchline-exchange-negotiations-browser.test.mts
TOUCHLINE_RUN_EXCHANGE_PLAN_BROWSER=1 TOUCHLINE_EXCHANGE_CAPTURE_DIR=/tmp/touchline-release-gap-evidence/touchline-exchange-plan-unlock-browser.test node --test --test-concurrency=1 --experimental-strip-types tests/touchline-exchange-plan-unlock-browser.test.mts
TOUCHLINE_RUN_SEARCH_CONTENT_BROWSER_TESTS=1 node --test --test-concurrency=1 --experimental-strip-types tests/touchline-football-search-content-browser.test.mts
TOUCHLINE_RUN_LOCALE_BROWSER_TESTS=1 node --test --test-concurrency=1 --experimental-strip-types tests/touchline-global-error-portrait.test.mts
TOUCHLINE_RUN_INBOX_CONTENT_BROWSER_TESTS=1 node --test --test-concurrency=1 --experimental-strip-types tests/touchline-inbox-content-browser.test.mts
TOUCHLINE_RUN_LIVE_LINEUP_LINKS_BROWSER=1 TOUCHLINE_LIVE_LINEUP_LINKS_CAPTURE_DIR=/tmp/touchline-release-gap-evidence/touchline-live-club-lineup-links-browser.test node --test --test-concurrency=1 --experimental-strip-types tests/touchline-live-club-lineup-links-browser.test.mts
TOUCHLINE_RUN_LOCALE_BROWSER_TESTS=1 node --test --test-concurrency=1 --experimental-strip-types tests/touchline-live-interactions-browser.test.mts
TOUCHLINE_RUN_MATCH_CARD_BROWSER_TESTS=1 node --test --test-concurrency=1 --experimental-strip-types tests/touchline-match-card-badge-interactions-browser.test.mts
TOUCHLINE_RUN_MATCH_CARD_BROWSER_TESTS=1 node --test --test-concurrency=1 --experimental-strip-types tests/touchline-match-card-badge-visual-browser.test.mts
TOUCHLINE_RUN_HERO_GOALS_BROWSER_TESTS=1 node --test --test-concurrency=1 --experimental-strip-types tests/touchline-match-hero-goals-browser.test.mts
TOUCHLINE_RUN_XI_BROWSER_TESTS=1 TOUCHLINE_RUN_ORIGINAL_MARKET_BROWSER=1 TOUCHLINE_RUN_MARKET_ZOOM_SIGNING_BROWSER=1 TOUCHLINE_RUN_COLLECTION_BROWSER_TESTS=1 TOUCHLINE_RUN_MARKET_CLOCK_BROWSER=1 TOUCHLINE_XI_BUDGET_PROOF=1 TOUCHLINE_XI_INDICATOR_PROOF=1 TOUCHLINE_XI_ARENA_LAYOUT_PROOF=1 TOUCHLINE_XI_MOUNT_DIAGNOSTIC=1 TOUCHLINE_DIAGNOSE_XI_KEYBOARD=all TOUCHLINE_MARKET_CAPTURE_DIR=/tmp/touchline-release-gap-evidence/touchline-my-club-xi-browser.test node --test --test-concurrency=1 --experimental-strip-types tests/touchline-my-club-xi-browser.test.mts
TOUCHLINE_RUN_NOTIFICATIONS_CONTENT_BROWSER_TESTS=1 node --test --test-concurrency=1 --experimental-strip-types tests/touchline-notifications-content-browser.test.mts
TOUCHLINE_RUN_TABLE_BROWSER_TESTS=1 node --test --test-concurrency=1 --experimental-strip-types tests/touchline-official-league-table-publication-browser.test.mts
TOUCHLINE_RUN_PAGE_SAFE_AREA_BROWSER_TESTS=1 node --test --test-concurrency=1 --experimental-strip-types tests/touchline-page-safe-area-browser.test.mts
TOUCHLINE_RUN_PLAYER_AVAILABILITY_BROWSER_TESTS=1 node --test --test-concurrency=1 --experimental-strip-types tests/touchline-player-availability-interactions-browser.test.mts
TOUCHLINE_RUN_PLAYER_AVAILABILITY_BROWSER_TESTS=1 node --test --test-concurrency=1 --experimental-strip-types tests/touchline-player-availability-visual-browser.test.mts
TOUCHLINE_RUN_SOCIAL_CROSS_ACCOUNT_BROWSER=1 node --test --test-concurrency=1 --experimental-strip-types tests/touchline-player-social-cross-account-browser.test.mts
TOUCHLINE_RUN_REHEARSAL_BROWSER_TESTS=1 node --test --test-concurrency=1 --experimental-strip-types tests/touchline-push-rehearsal-browser.test.mts
TOUCHLINE_RUN_PODIUM_BROWSER_TESTS=1 node --test --test-concurrency=1 --experimental-strip-types tests/touchline-ranking-podium-publication-browser.test.mts
TOUCHLINE_RUN_RANKING_ZOOM_BROWSER_TESTS=1 node --test --test-concurrency=1 --experimental-strip-types tests/touchline-ranking-zoom-persistence-browser.test.mts
TOUCHLINE_RUN_LOCALE_BROWSER_TESTS=1 node --test --test-concurrency=1 --experimental-strip-types tests/touchline-register-states-browser.test.mts
TOUCHLINE_RUN_RELEASE_JOURNAL_BROWSER=1 node --test --test-concurrency=1 --experimental-strip-types tests/touchline-release-journal-browser.test.mts
TOUCHLINE_RUN_RELEASE_JOURNAL_BROWSER=1 node --test --test-concurrency=1 --experimental-strip-types tests/touchline-release-journal-tabs-browser.test.mts
TOUCHLINE_RUN_SEASON_BROWSER_TESTS=1 node --test --test-concurrency=1 --experimental-strip-types tests/touchline-season-publication-browser.test.mts
TOUCHLINE_RUN_SITE_FOOTER_BROWSER_TESTS=1 node --test --test-concurrency=1 --experimental-strip-types tests/touchline-site-footer-browser.test.mts
TOUCHLINE_RUN_SITE_FRAME_BROWSER_TESTS=1 node --test --test-concurrency=1 --experimental-strip-types tests/touchline-site-frame-browser.test.mts
TOUCHLINE_RUN_SWIFT_OUTPUT_PREFLIGHT=1 node --test --test-concurrency=1 --experimental-strip-types tests/touchline-swift-output-preflight.test.mts
```

## Complete skipped-case inventory

| # | Case | File | Class |
|---|---|---|---|
| 1 | real Card Engine PT/EN tabs, payloads, denied errors, pending states and locale changes | `tests/admin-card-engine-language-browser.test.mts` | Browser opt-in |
| 2 | membership issue visible and switching players resets editorial fields | `tests/card-publication-inbox-browser.test.mts` | Browser opt-in |
| 3 | season checkout offers and return states render safely across PT/EN and three engines | `tests/club-season-checkout-browser.test.mts` | Browser opt-in |
| 4 | public photo consent, visible serial loading, replacement and cancellation in real browsers | `tests/clubowner-public-avatar-browser.test.mts` | Browser opt-in |
| 5 | public directory and profile work across isolated accounts, languages and browser engines | `tests/clubowner-public-browser.test.mts` | Browser opt-in |
| 6 | coach Admin: real UI → handler → local SQL, review/publication and preserved former identity in 24 browser flows | `tests/coach-catalogue-browser.test.mts` | Browser opt-in |
| 7 | alerts recover GET/POST errors, reject missing read receipt and confirm PT/EN on three engines | `tests/company-alerts-browser.test.mts` | Browser opt-in |
| 8 | isolated private document form verifies retry identity and confirmed link PT/EN desktop/mobile | `tests/company-documents-browser.test.mts` | Browser opt-in |
| 9 | isolated finance form uses names, actor-free commands and stable retries PT/EN desktop/mobile | `tests/company-finance-browser.test.mts` | Browser opt-in |
| 10 | mail review PT/EN recovers errors, paginates and renders untrusted text safely | `tests/company-mail-browser.test.mts` | Browser opt-in |
| 11 | settlement correction requires confirmation, preserves retry identity and refreshes history PT/EN | `tests/company-settlement-correction-browser.test.mts` | Browser opt-in |
| 12 | real roster Admin PT/EN renders paused, loading, empty, unavailable and exact guarded decision/retry payloads | `tests/roster-reconciliation-browser.test.mts` | Browser opt-in |
| 13 | social Admin real render and actions preserve PT/EN payloads, denied/error states and approval locks | `tests/social-admin-language-browser.test.mts` | Browser opt-in |
| 14 | real React StrictMode menu fences identity changes and confirms save before browser navigation | `tests/touchline-account-locale-menu-browser.test.mts` | Browser opt-in |
| 15 | real React StrictMode auth select uses confirmed writes and fences uncertainty and identity changes | `tests/touchline-account-locale-menu-browser.test.mts` | Browser opt-in |
| 16 | real locale control recovers bounded reads and fences delayed identity and write receipts | `tests/touchline-account-locale-menu-browser.test.mts` | Browser opt-in |
| 17 | real Finance page renders PT/EN summaries and error states at phone tablet and desktop widths | `tests/touchline-admin-finance-language-browser.test.mts` | Browser opt-in |
| 18 | real football Admin renders official data and safe synchronization controls in both languages | `tests/touchline-admin-football-language-browser.test.mts` | Browser opt-in |
| 19 | real market Admin preserves search locale and displays data and failures across devices | `tests/touchline-admin-market-language-browser.test.mts` | Browser opt-in |
| 20 | real owner dashboard renders PT/EN navigation and error states across devices | `tests/touchline-admin-owner-language-browser.test.mts` | Browser opt-in |
| 21 | isolated real loading preserves skeleton geometry and accessible status in eight locales | `tests/touchline-app-loading-browser.test.mts` | Browser opt-in |
| 22 | real cinematic background loads local media and advances without forcing play | `tests/touchline-auth-cinematic-playback-browser.test.mts` | Browser opt-in |
| 23 | real enrollment and collection hook use100M then explicit Ruby bootstrap95M without legacy endpoints | `tests/touchline-beta-bootstrap-browser.test.mts` | Browser opt-in |
| 24 | Beta card locks: browse all clubs, inspect zoom and unlock canonical plans without mutation | `tests/touchline-beta-card-locks-browser.test.mts` | Browser opt-in |
| 25 | real player and coach frames select native density candidates across seven tiers | `tests/touchline-card-frame-density-browser.test.mts` | Browser opt-in |
| 26 | real coach gallery at responsive widths DPR1 selects frames without identity overlap | `tests/touchline-card-frame-density-browser.test.mts` | Browser opt-in |
| 27 | real cards light only on pointer hover, animate their perimeter and never duplicate frame bitmap | `tests/touchline-card-hover-neon-browser.test.mts` | Browser opt-in |
| 28 | canonical player/coach zoom (all): two landscape notch sides, crowns, dismissal and focus | `tests/touchline-card-zoom-landscape-browser.test.mts` | Browser opt-in |
| 29 | real avatar host modal keeps uncertain work across close and traps/restores focus in StrictMode | `tests/touchline-club-owner-avatar-modal-browser.test.mts` | Browser opt-in |
| 30 | real browser photo preparation: large file orientation preview/upload identity and cancellation | `tests/touchline-club-owner-avatar-preparation-browser.test.mts` | Browser opt-in |
| 31 | isolated Release review: original card, no-write cancel/Escape, focus and narrow layout | `tests/touchline-club-release-browser.test.mts` | Browser opt-in |
| 32 | native delayed ClubHub anchor arrival, reload and history (not Next/RSC routing) | `tests/touchline-clubhub-delayed-lineup-anchor-browser.test.mts` | Browser opt-in |
| 33 | one update transitions historical XI → official NS → live → FT while advancing Next game | `tests/touchline-clubhub-matchday-transition-browser.test.mts` | Browser opt-in |
| 34 | real ClubHub score status remains contained beside real crests in eight locales | `tests/touchline-clubhub-score-layout-browser.test.mts` | Browser opt-in |
| 35 | all clubs expose official tickets above a next-only card across desktop, tablet and phone | `tests/touchline-clubhub-tickets-next-browser.test.mts` | Browser opt-in |
| 36 | real Arena portal scrolls a full-width pitch without trapping controls below the viewport | `tests/touchline-clubowner-arena-scroll-browser.test.mts` | Browser opt-in |
| 37 | ClubOwner plan themes reach sibling Market panels without recoloring cards or other routes | `tests/touchline-clubowner-page-theme.test.mts` | Browser opt-in |
| 38 | ClubOwner technical rail preserves nine real cards, coach crown and horizontal keyboard access | `tests/touchline-clubowner-technical-rail-browser.test.mts` | Browser opt-in |
| 39 | coach frames keep one silhouette and purchase text below the art in every tier and size | `tests/touchline-coach-border-browser.test.mts` | Browser opt-in |
| 40 | real ranking panel contains seven synthetic coach rows without internal scrolling | `tests/touchline-coach-ranking-geometry-browser.test.mts` | Browser opt-in |
| 41 | real player and coach zoom crests match on desktop and phone without shrinking compact cards | `tests/touchline-coach-zoom-crest-browser.test.mts` | Browser opt-in |
| 42 | independent subpixel crest calibration records neutral ramp and negative controls without approving T12 | `tests/touchline-crest-outline-calibration-browser.test.mts` | Browser opt-in |
| 43 | real card crests have visible solid white contour at small and enlarged scales | `tests/touchline-crest-outline-pixels-browser.test.mts` | Browser opt-in |
| 44 | real customer utility shell keeps one header/main/logout and accessible primary and secondary rails | `tests/touchline-customer-utility-shell-browser.test.mts` | Browser opt-in |
| 45 | Exchange searches people by public name and ID without publishing or editing a profile | `tests/touchline-exchange-friends-browser.test.mts` | Browser opt-in |
| 46 | Exchange Hub actual browser: readiness locales mobile dialogs focus and readonly accounts | `tests/touchline-exchange-hub-browser.test.mts` | Browser opt-in |
| 47 | isolated real Exchange browser selection confirmation receipt and unknown outcome | `tests/touchline-exchange-negotiations-browser.test.mts` | Browser opt-in |
| 48 | real Exchange lock opens canonical plans: nested Escape focus inertness quote and no accidental transaction | `tests/touchline-exchange-plan-unlock-browser.test.mts` | Browser opt-in |
| 49 | actual football search renderer preserves its row, readable labels and locally scrolling focus | `tests/touchline-football-search-content-browser.test.mts` | Browser opt-in |
| 50 | narrow desktop preview stays visible while touch-phone portrait keeps the gate | `tests/touchline-global-error-portrait.test.mts` | Browser opt-in |
| 51 | mobile portrait shows a global error while normal gameplay remains behind the orientation gate | `tests/touchline-global-error-portrait.test.mts` | Browser opt-in |
| 52 | actual Inbox return keeps side-by-side content and local focus, and rejects a synthetic failed receipt | `tests/touchline-inbox-content-browser.test.mts` | Browser opt-in |
| 53 | real Live keeps both club XI links below crests before teamsheets arrive, across twenty clubs and selection changes | `tests/touchline-live-club-lineup-links-browser.test.mts` | Browser opt-in |
| 54 | Live mounted interactions: recovery, disclosure, detail identity and guest language | `tests/touchline-live-interactions-browser.test.mts` | Browser opt-in |
| 55 | hover tooltip does not steal Escape from an independently opened modal | `tests/touchline-match-card-badge-interactions-browser.test.mts` | Browser opt-in |
| 56 | hydrated match-card tooltip stays in viewport, supports touch/keyboard and preserves card boundary | `tests/touchline-match-card-badge-interactions-browser.test.mts` | Browser opt-in |
| 57 | original match cards SSR preserves artwork and accessible labels at desktop and phone widths | `tests/touchline-match-card-badge-visual-browser.test.mts` | Browser opt-in |
| 58 | real MatchCentre goals: five authors per column, grouped balls and long names without frame growth | `tests/touchline-match-hero-goals-browser.test.mts` | Browser opt-in |
| 59 | original market mounted: explicit destination cancellation delayed confirmation | `tests/touchline-my-club-xi-browser.test.mts` | Browser opt-in |
| 60 | original market zoom signing mounted: staged confirmation only | `tests/touchline-my-club-xi-browser.test.mts` | Browser opt-in |
| 61 | real Beta budget DOM: five players spend 100M, locks credit replacements and comparison never upgrades | `tests/touchline-my-club-xi-browser.test.mts` | Browser opt-in |
| 62 | real XI indicator integration: geometry, tooltip, Arena and failed-read recovery | `tests/touchline-my-club-xi-browser.test.mts` | Browser opt-in |
| 63 | Arena overlay keeps its coach off the touchline, canonical formation and all XI slots aligned at desktop and landscape sizes | `tests/touchline-my-club-xi-browser.test.mts` | Browser opt-in |
| 64 | diagnostic: repeated Chromium mount without interaction | `tests/touchline-my-club-xi-browser.test.mts` | Browser diagnostic opt-in |
| 65 | diagnostic: WebKit EN native and real XI keyboard navigation | `tests/touchline-my-club-xi-browser.test.mts` | Browser diagnostic opt-in |
| 66 | empty ClubOwner preserves pitch, bench, outside slots, Exchange and embedded Live even when recovery fails | `tests/touchline-my-club-xi-browser.test.mts` | Browser opt-in |
| 67 | collection structure: visible without activating ownership or purchases | `tests/touchline-my-club-xi-browser.test.mts` | Browser opt-in |
| 68 | collection filled bench: nine original cards stay separated from coach and each other | `tests/touchline-my-club-xi-browser.test.mts` | Browser opt-in |
| 69 | collection DOM: original plus slots 4+5 and 15, purchase confirmed before card and budget update | `tests/touchline-my-club-xi-browser.test.mts` | Browser opt-in |
| 70 | real My Club XI DOM: replace, focus, explicit save and readback | `tests/touchline-my-club-xi-browser.test.mts` | Browser opt-in |
| 71 | compact market clock remains visible with completed setup and before squad symbols | `tests/touchline-my-club-xi-browser.test.mts` | Browser opt-in |
| 72 | actual Notifications presentation keeps native quiet-time controls reachable in its read-only local canvas | `tests/touchline-notifications-content-browser.test.mts` | Browser opt-in |
| 73 | two real official tables and ClubHub score share goal/correction publications and preserve local state | `tests/touchline-official-league-table-publication-browser.test.mts` | Browser opt-in |
| 74 | page wrappers preserve baseline spacing and clear simulated safe areas in three engines | `tests/touchline-page-safe-area-browser.test.mts` | Browser opt-in |
| 75 | hover tooltip does not steal Escape from an independently opened modal | `tests/touchline-player-availability-interactions-browser.test.mts` | Browser opt-in |
| 76 | hydrated availability tooltip stays in viewport, supports touch/keyboard and preserves card boundary | `tests/touchline-player-availability-interactions-browser.test.mts` | Browser opt-in |
| 77 | the approved red cross SSR preserves its accessible label and artwork | `tests/touchline-player-availability-visual-browser.test.mts` | Browser opt-in |
| 78 | social totals reconcile across isolated accounts without remount or replaying writes | `tests/touchline-player-social-cross-account-browser.test.mts` | Browser opt-in |
| 79 | real React StrictMode rehearsal stays one-shot and account-bound with synthetic browser/provider boundaries | `tests/touchline-push-rehearsal-browser.test.mts` | Browser opt-in |
| 80 | published /rankings awards update together without replacing the selected player's dialog | `tests/touchline-ranking-podium-publication-browser.test.mts` | Browser opt-in |
| 81 | one ranking dialog survives top3/top20 removal, incomplete catalogue and withdrawal with real focus/scroll | `tests/touchline-ranking-zoom-persistence-browser.test.mts` | Browser opt-in |
| 82 | register eight-language pending/error states stay named and announced without a real signup | `tests/touchline-register-states-browser.test.mts` | Browser opt-in |
| 83 | real IndexedDB journal: two connections, immutable keys and post-success abort | `tests/touchline-release-journal-browser.test.mts` | Browser opt-in |
| 84 | real IndexedDB removal commits exact identity and rolls back request errors or post-success abort | `tests/touchline-release-journal-browser.test.mts` | Browser opt-in |
| 85 | two actual pages preserve journal references and a single immutable conflict winner | `tests/touchline-release-journal-tabs-browser.test.mts` | Browser opt-in |
| 86 | two actual pages remove only an exact reference and preserve other account and season keys after reopen | `tests/touchline-release-journal-tabs-browser.test.mts` | Browser opt-in |
| 87 | real shared transport updates profiles, club leaders and open zoom without remount or per-card fetch | `tests/touchline-season-publication-browser.test.mts` | Browser opt-in |
| 88 | real footer keeps copyright and its configured icon in one row at every width | `tests/touchline-site-footer-browser.test.mts` | Browser opt-in |
| 89 | real frame CSS reserves the footer position through empty, loading and ready markup | `tests/touchline-site-frame-browser.test.mts` | Browser opt-in |
| 90 | real Swift output preflight preserves existing targets and rejects lookup errors | `tests/touchline-swift-output-preflight.test.mts` | Native macOS opt-in |

## Additional gaps outside the 90

Physical Safari/iPhone pinch zoom crash, Android/tablet behavior, real push delivery, full QA account-to-account Exchange and live provider publication cannot be certified by these isolated mocked/local fixtures. Keep separate gates and validate deployed build identity, account identities and data receipts. Browser viewport simulation is not physical-device evidence.

Canonical runner also deliberately omits seven documentation-artifact files and six local social replay files. Those omissions are distinct from SKIP counts; they are not automatically obsolete or product failures. Inspect the DOCS_ARTIFACT_TESTS and LOCAL_ARTIFACT_REPLAY_TESTS sets in scripts/run-vercel-release-tests.mjs when changing release scope.

## Correction to prior roster review

Confirmed current source: supabase/migrations/20261027210456_roster_reconciliation_workflow.sql line 123 explicitly rejects `p_actor='cron:roster-v1' and v_action<>'capture'` with ROSTER_OWNER_REQUIRED. Thus cron capture-only is enforced in SQL as well as the server. Earlier implication that SQL did not enforce this was incorrect. Any automatic apply needs an explicit separately scoped system command/policy and audit identity; do not silently impersonate an owner or relax the public review RPC.

Source log SHA256: `ff481ec75cf82084b6856461716ba825709b6fc527a7e742f41ea8d4a495721a`.
