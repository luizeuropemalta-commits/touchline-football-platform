# Admin / customer navigation — local follow-up

Owner explicitly asked to remove the ClubOwner path from administrator navigation after a QA screenshot showed the customer-only404 boundary. This is a new, narrow UI/auth-navigation follow-up to the already delivered automatic-points candidate bd0998c343bcca1c156c8afee3e5221cdb879926. No Sportmonks, market value, scoring, team, prices, privileges or database changes are in this delta.

## Behavior

- Public pages do not know the session role:their primary shared navigation is now My account / Minha conta, pointing to `/account`.
- `/account` verifies Auth server-side and dispatches only to fixed routes:admin→`/admin`,customer→`/clubowner`,guest→login with an internal return.
- Known administrator navigation uses Admin→`/admin`; known customer navigation retains Club Owner→`/clubowner`.
- Opening an old `/clubowner` link as administrator returns to `/admin` BEFORE loading a customer snapshot or privileged avatar state. It does not create a team or grant customer access.
- Missing-session and error-bearing Auth receipts never authorize a role. Unknown/error conditions fail closed to login; no raw error, identity or token is exposed.
- Admin retains the existing panel's local-session Sair control. This delta does not implement or claim a new sign-out flow or browser history behavior. No real sign-out was executed.
- Existing public shared button styles remain unchanged. New account labels exist in eight catalogues; six draft locale release gates remain closed. Administrative paths retain EN/PT.

## Explicit source/test manifest

Product:

1. app/account/page.tsx (new server-only navigation entry)
2. app/clubowner/page.tsx
3. components/touchline/TouchlineGlobalNavigation.tsx
4. lib/touchlineArena/auth-i18n.ts
5. lib/touchlineArena/global-navigation.ts
6. lib/touchlineArena/navigation-i18n.ts

Audit tooling:

7. scripts/qa/build-touchline-route-audit-manifest.mts

Tests:

8. tests/touchline-account-entry.test.mts (new)
9. tests/arena-auth-isolation.test.mts
10. tests/arena-server-auth-deadline.test.mts
11. tests/touchline-card-overlay-admin-shortcut.test.mts
12. tests/touchline-club-owner-avatar-context-server.test.mts
13. tests/touchline-clubowner-auth-error-envelope.test.mts
14. tests/touchline-market-route-draft-gate.test.mts
15. tests/touchline-my-club-canonical-route.test.mts
16. tests/touchline-navigation-locale-catalogue.test.mts
17. tests/touchline-neon-identity-regression.test.mts
18. tests/touchline-route-audit-manifest.test.mts

Documentation/checkpoints are separate local files; no blind staging of generated tsbuildinfo or protected untracked assets, roster/market evidence, maintenance HTML or earlier acceptance report.

## Verification checkpoint

- Initial focused navigation/session tests38 PASS.
- TypeScript and focused lint/diff exit0 before the final error-envelope hardening; complete gates must cover current source.
- First full gate5333 tests:5310 PASS,9 FAIL,14 SKIP. Failure evidence retained in `/tmp/touchline-admin-account-navigation-release-gate-20261016.log`.
- Failures were old404 expectations, the old primary helper name and route inventory72→73 after adding `/account`. Tests now require exact admin redirects before customer reads instead of deleting the exclusion checks. One old URL mock hardcoded `/login` regardless of requested route; corrected to honor its path.
- Corrected focused rerun91 PASS,0 FAIL,0 SKIP,2.507s, `/tmp/touchline-admin-account-navigation-retest-20261016.log`.
- Independent review and final re-review report no residualP0/P1/P2; review is not remote/browser approval.
- Second full gate running: `/tmp/touchline-admin-account-navigation-release-gate-final-20261016.log`. No anticipated PASS. Optimized build, compiled browser proof and exact clean candidate remain pending at this checkpoint.

Second full gate subsequently exited0:5333 tests,5319 PASS,0 FAIL,14 SKIP,221.124s. It started before the final one-line strict-null Auth-envelope hardening and its extra case; do not use it alone to clear the final tree. The stricter path will receive fresh focused/full verification. Isolated optimized build now in progress at `/tmp/touchline-admin-account-navigation-build-20261016.log`; no source changes beyond that hardening during this build.

## Authorization and next gate

SUPERSEDING owner reply: explicitly authorized "Sim, publicar somente no QA" for one additional Git-native QA deployment of this navigation fix after final tests. New scope budget1, consumed0 at this checkpoint. Never reuse or duplicate the earlier bd0998c3 build. No Production authority.

Optimized isolated build exited0 (compile17.2s,TypeScript11.8s); six product sources verified SHA256-equal to canonical. Compiled local browser matrix10/10 PASS:Chromium and WebKit390x844,768x1024,844x390,1280x800,1440x900, label Minha conta and `/account?lang=pt-BR`, no observed document overflow or page errors. Actual guest click844 in both engines lands on `/login?lang=pt-BR&returnTo=%2Faccount%3Flang%3Dpt-BR`. Screenshots landscape844 and desktop1440 visually inspected. Artifacts `/tmp/touchline-account-navigation-browser-20261016.json` and `/tmp/touchline-account-navigation-{chromium,webkit}-{844,1440}-20261016.png`. This does not prove authenticated role dispatch or sign-out with real cookies.

Final canonical gate is running on the hardened source and added actual-component admin/customer label test: `/tmp/touchline-admin-account-navigation-release-gate-frozen-20261016.log`. No source/test edits are permitted before its result and candidate freeze. Local verification server3320 was stopped by its exact task-owned PID after browser proof; no other process was stopped. Vercel project linkage matches prj_GtCzQlIE8AJdm0hSf7GB5yOWejmM / fifa-agent-plataform, Node24; Preview(qa) variable names/scopes inspected, no environment write or secret export. Package/lock unchanged; no install. Branchqa remote remains bd0998c3 and no qa deployment is queued/building at this preflight.

Historical checkpoint (superseded by the explicit owner reply above):QA still bd0998c3, automatic points delivery unchanged. No new commit/push/deploy, session change or Production action at that earlier checkpoint; additional build authority was then pending. Do not use the earlier candidate's consumed build budget or duplicate its deployment.

Rollback target for any later authorized QA candidate is bd0998c3 / dpl_2qt6KDa4Y4irqi1HcusWbKWCPauc. Preserve the recovered identity and all points/data. Local follow-up rollback must be a reviewed task-only Git revert; no broad checkout/reset/delete.

Customer-session acceptance remains separate. The owner offered to open a separate customer session; subsequent screenshot confirms the current session is still administrator. An attempt to locate the existing Safari QA window for a separate Admin tab found none and safely performed no navigation. No account was switched, signed out or impersonated.

## Final local preflight

Final hardened canonical tree:complete verify:release exit0,5334 tests/5320 PASS/0 FAIL/14 SKIP,220.569s; TypeScript/lint/governance/input checks pass,8 pre-existing lint warnings/0 errors. Log `/tmp/touchline-admin-account-navigation-release-gate-frozen-20261016.log`. Build and10-case compiled-browser evidence above cover unchanged six product sources. Actual component SSR additionally asserts Admin label/no ClubOwner href for administrator and the preserved customer destination. No product/test change after this gate. Independent review found noP0/P1/P2; exact manifest/clean committed candidate and final GO QA still required before the one authorized push. Package/lock unchanged, no dependency installation or new migration. Existing Sentry release/source-map receipt is not revalidated by this navigation check. Whole-product audit remains incomplete.
