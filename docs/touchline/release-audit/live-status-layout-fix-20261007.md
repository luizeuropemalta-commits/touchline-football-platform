# Live tablet status clipping — bounded CSS repair

2026-10-07. Owner-authorized repair, code-work skill applied; current AGENTS/engineering decisions and completion governance retained. Exclusive manifest: match-centre CSS, new status-layout test, this receipt. No TSX/catalogue/harness edits.

## Observed failure and exact change

Directly inspected both `en-GB-tablet-selected.png` and `pt-BR-tablet-selected.png` under `/private/tmp/touchline-test-runtime-20261007.1UPtcv/visual/live-2026-10-07T10-07-12.738Z`. At 1024px viewport the narrow right column gives a roughly 532×345 hero. Its top status pill reaches/clips the upper edge and its lower LIVE/AO VIVO countdown is visibly cut by the bottom rounded perimeter.

Source combines preferred `aspect-ratio: 105 / 68`, grid centered content, viewport-scaled crests/padding and `overflow: hidden`. The crowded content can exceed the preferred aspect-ratio box. Minimal repair: add only `min-block-size: min-content;` to the base `.hero` rule, retaining all other declarations and responsive overrides.

The pitch ratio remains **preferred**, not an absolute clipping constraint: content can make the panel taller when required. Decoration remains clipped to the existing rounded border; status text is neither hidden nor reduced. No arbitrary fixed pixel height, extra status duplication, negative offset or viewport-specific language special case. Root must verify the resulting field presentation remains acceptable when intrinsic height wins.

## Focused evidence

New `tests/touchline-live-status-layout.test.mts` asserts explicit intrinsic content minimum, retained ratio/overflow, no fixed/max block height override, retained status outputs and no hiding. This is a **static CSS contract regression, not a browser geometry test**.

Before edit: focused new test exit1, 1 PASS / 1 FAIL, missing min-block-size assertion. After edit:

`node --experimental-strip-types --test tests/touchline-live-status-layout.test.mts tests/touchline-live-fixed-layout.test.mts tests/touchline-match-centre.test.mts`

Exit0; **31 tests / 31 PASS / 0 FAIL / 0 cancelled / 0 SKIP / 0 todo**; 107.389083ms. Existing preferred ratio and fixed LTR tests passed unchanged. Runtime emitted only the existing experimental stripTypeScriptTypes warning.

## Render gate still required

Root/visual owner must rerender same EN/PT tablet-selected scenes, inspect both status elements and require each bounding rectangle fully inside hero content edges with no cut text. Also check long names/canonical club CTA, stale/upcoming status, phone/desktop and Arabic to ensure the content minimum does not create unwanted geometry/overflow. Do not call this visual PASS until fresh rendered evidence exists. If exact 105:68 outer ratio is mandatory under every content state, this change needs a different contained-content design rather than concealing overflow.

MISSION: scoped Live CSS correction. FUNCTIONAL: source contract confirmed locally. VISUAL: original failure directly observed; corrected render pending. RESPONSIVE/ACCESSIBILITY/BROWSER: pending root render; no text hiding introduced. SECURITY/DATA: unaffected. BUILD/TYPECHECK/LINT/FULL SUITE: not run; root integration responsibility. QA BRANCH/COMMIT/DEPLOYMENT/URL: not asserted. REMOTE BUDGET/CONSUMED: 0/0. FILES CHANGED: exact three-file manifest above. PRODUCTION: NOT TOUCHED.

Tools executed: local image inspection, bounded source reads, apply_patch and finite unit tests. No browser, server, build, dependency installation or network. Rollback is removal of this single new declaration; preserve unrelated dirty CSS.

## Authorized follow-up: Arabic text direction / German rail overlap

Read `live-remaining-visual-inspection-20261007.md` and directly opened `de-DE-tablet-stale.png` and `ar-SA-tablet-stale.png` in the same capture directory. German long status visibly enters the adjacent crest initials; Arabic mixed TouchLine paragraphs use the inherited LTR base.

Exact additional source changes:

- `.fixtureCentre small`: replace nowrap with normal wrapping, add min-width:0/max-width:100%/overflow-wrap:anywhere. No clipping/ellipsis or word shortening; rail column and crest geometry unchanged.
- MatchCentre derives `textDirection` from its already-resolved language and supplies `lang` on its root. Adds local dir only on freshness copy, league text, rail section label/status, venue copy, plain information articles and pending/empty paragraphs. Shell, hero, home/away grid, score, header/navigation and information-grid layout retain physical LTR. No global RTL CSS, mirrored transforms or bidi override. `ratingCount` repair preserved.
- Narrow text-surface selectors use `text-align:start`; no dictionary changes.

Added two static regression contracts in the existing authorized status-layout test: long status can wrap without hiding; local text direction exists and layout containers cannot inherit that dir assignment.

Focused command:

`node --experimental-strip-types --test tests/touchline-live-status-layout.test.mts tests/touchline-live-fixed-layout.test.mts tests/touchline-match-centre-rtl-css.test.mts tests/touchline-match-centre-i18n.test.mts tests/touchline-live-rating-summary-regression.test.mts`

Exit0: **30/30 PASS, 0 fail/cancelled/skipped/todo**, 732.992708ms. Includes real component SSR across locales and singular/plural regression; static directional contracts are not visual proof. Root must recapture DE stale/loading/error and AR text/identity/date surfaces plus the tablet selected clipping case. No browser/build/full suite launched here.

Manifest extension was explicitly granted for `TouchlineMatchCentre.tsx` local lang/dir only, same CSS/test/receipt. All work checkpointed here. At owner's reduced-credit instruction, agent stops after this handoff; no additional scope or agents.

## Root integration and fresh local render, 2026-10-07

The initial `min-block-size: min-content` repair described above did **not** prevent the selected tablet countdown from clipping in a fresh render. Root reproduced this and superseded that CSS approach: the base `.hero` now grows with its content; the `105 / 68` preferred aspect ratio applies only at viewport width 1440px and above. The static layout/design tests were updated to describe that actual responsive contract. This section supersedes the earlier pending visual gate and initial CSS rationale; it does not erase the observed failure.

The existing isolated fixture was refreshed with exactly the current MatchCentre TSX/CSS files, then served on one local Next server without project credentials. The post-change selective state matrix at `/private/tmp/touchline-test-runtime-20261007.1UPtcv/visual/live-2026-10-07T12-37-59.887Z` produced 16 tablet screenshots: EN/PT/DE/AR × selected/stale/loading/error; exit 0, no page errors or unexpected requests, and the script's selected hero geometry assertion passed. Root inspected PT selected, DE stale and AR selected; status and countdown remained in the pitch; German status wrapped rather than entering the crest rail; Arabic copy was locally RTL without mirroring the physical field/team grid.

The final selected-state responsive matrix at `/private/tmp/touchline-test-runtime-20261007.1UPtcv/visual/live-2026-10-07T12-39-21.372Z` produced 24 screenshots: all eight agreed locales × desktop/tablet/phone; exit 0, no page errors or unexpected requests, and the selected hero geometry assertion passed in every case. Root inspected AR phone, EN desktop, DE phone and TR tablet images; no cropped status, countdown, crest collision or misplaced physical pitch was observed in these samples. Synthetic team names in fixture images are test data, not a localization verdict on live provider names. The previous 120-capture baseline remains historical pre-repair evidence; it is not represented as a fresh final matrix.

The previously unexecuted Live interaction browser file was repaired **only in its fixture stubs** and run with `TOUCHLINE_RUN_LOCALE_BROWSER_TESTS=1`: 5/5 PASS, 0 fail/skip, covering held snapshot/503 recovery, bell read-only/error, selected/stale detail behavior, and guest locale handoff/reload. Focused MatchCentre/layout/i18n tests: 40/40 PASS, 0 fail/skip. `git diff --check` on scoped source/tests passed. This closes the **bounded local Live page verification** for the reviewed fixture states and screen sizes, not a hosted QA or production acceptance. No real alert was sent and no account/device permission was changed. The complete candidate suite, independent release review and hosted QA remain separate gates before deployment.
