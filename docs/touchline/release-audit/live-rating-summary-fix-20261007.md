# Live rating summary regression fix — 2026-10-07

Scope: authorized one-expression product correction plus dedicated SSR regression. Skill code-work and engineering-decisions applied; current AGENTS and mission completion footer read. Canonical component path confirmed. Existing dirty changes preserved; no formatting/refactor/catalogue/gate change.

## Exact product delta

In `components/touchline/match-centre/TouchlineMatchCentre.tsx`, pointsSummary heading changed from:

`{verifiedDetail.playerStatistics.filter((row) => row.rating !== null).length} {dictionary.rating}`

to:

`{dictionary.ratingCount(verifiedDetail.playerStatistics.filter((row) => row.rating !== null).length)}`

The same existing ratingCount function already serves the verified-detail summary above. Filtering, factual values, ordering, auth, data reads and language gates remain unchanged. Rollback, if authorized, is this single expression reversal; do not revert the whole dirty file.

## Fresh evidence

New `tests/touchline-live-rating-summary-regression.test.mts` transpiles the complete real component, uses real React SSR and real locale/schedule/helpers. Only presentation children, icon artwork and CSS are doubled. Effects do not run; fetch is forbidden. Each of eight locales has independent literal singular/plural expectations scoped specifically to the real pointsSummary section (not matching the already-correct other summary).

Fixtures include numeric zero and 7.5 ratings plus a null unrated player. Assertions require correct summary counts, unchanged numeric values and no mutation of input facts.

Before fix: `node --experimental-strip-types --test tests/touchline-live-rating-summary-regression.test.mts` exited 1; all 16 cases failed at the summary oracle, e.g. German `2 BEWERTUNG` instead of `2 offizielle Bewertungen`. This established sensitivity to the actual defect rather than harness failure.

After fix: `node --experimental-strip-types --test tests/touchline-live-rating-summary-regression.test.mts tests/touchline-match-centre-i18n.test.mts` exited 0: **23 tests / 23 pass / 0 fail / 0 cancelled / 0 skipped / 0 todo**, duration 703.102125ms. Existing full catalogue, public draft gate and real SSR locale tests passed unchanged.

## Completion boundary

MISSION: focused Live rating-count correction. FILES CHANGED: component single expression, new regression test, this receipt. FUNCTIONAL RESULT: confirmed local SSR singular/plural across eight locales. VISUAL / RESPONSIVE / BROWSER MATRIX: not run here; root/visual agent own remaining inspection. ACCESSIBILITY: no ARIA/interaction change. SECURITY: no account/transport/gate change. TESTS: above. BUILD / TYPECHECK / LINT / FULL SUITE: not run under bounded slot; root integrates. QA BRANCH / COMMIT / DEPLOYMENT / URL: not asserted. REMOTE BUILD BUDGET / CONSUMED: 0 / 0. OBSERVABILITY: direct test exit/results inspected. OPEN FINDINGS: remaining Live interactions documented separately; not fixed or concealed by this slice. PRODUCTION: NOT TOUCHED.

No browser, server, build, dependency installation or network activity. No release approval inferred. Tools executed: source inspection, apply_patch scoped edits, finite focused Node SSR tests. Final rendered browser confirmation remains a separate gate.
