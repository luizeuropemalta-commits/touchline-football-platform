# ClubOwner search — UI verification handoff

Scope: tests and evidence only, owned by `notification_schema_preflight`. Product and backend remain owned by root and `conditional_browser_completion`. This is local evidence, not approval of the hosted QA or release.

## Confirmed local evidence

- 53 PASS, 0 FAIL, 7 conditional browser tests SKIP in the latest bounded run. Earlier overlapping runs are not added to this count.
- Header renders the real compact trigger behind the public-discovery flag; it retains confirmed follower counts and canonical ranking behavior.
- Exchange Hub test dependency now points to the new SearchTrigger, preserving its existing receipt, financial and availability assertions.
- Directory privacy, separate photo consent, opt-in, hiding, unknown writes, reconciliation, and no duplicate writes remain covered. Only confirmed own-profile writes/reads remount the search snapshot.
- Real Search callbacks support the initial empty query, name fragments and tokens, ignoring case/accents and token order, a matching friend at rank 40 outside the initial page; a pasted public ID returns no match, cursor pagination, cross-page deduplication, pending/empty/error distinction and stale request cancellation.
- Actual row SSR in PT/EN confirms portrait fallback, name, rank, followers and follow action; no ID appears in visible text or labels. Internal ID remains in the correct public-profile navigation target.
- A snapshot-expired cursor returning 400 is not retried indefinitely: retry and explicit submit both restart with no cursor.
- Confirmed follow updates modify the corresponding public ID in parent state; another owner's follow is retained. A superseded snapshot response cannot overwrite the new state.
- The new browser fixture compiles the actual Trigger, portal Dialog, Search, avatar, request hook, accessibility hook, contract and CSS Modules. It uses actual React/ReactDOM and Next link/image boundaries from the existing bundled-fixture helper. Compilation is not DOM or visual proof.

Evidence: `artifacts/clubowner-search-ui-20261101/manifest.json`, `preimages.json`, `focused-runtime-plan-ring-final.log`, `dialog-bundle-source-receipt.json`, `eslint-plan-ring.log`. The four existing test files were preserved byte-for-byte as `.preimage` before editing; the fifth browser test is new.

## Requirement revision and review

The user explicitly changed discovery to name-only. The prior name-and-ID test version and manifest remain in `artifacts/clubowner-search-ui-20261101/name-only-preimage/` and `manifest-before-name-only.json`. Root removed the displayed public ID and modal settings footer. Three test files changed for this requirement; header and Hub tests remained byte-identical. The previous independent review is retained in `independent-test-review.json`; its ID-search success assertion is superseded. The focused addendum `name-only-independent-test-review.json` found one synthetic-boundary issue (empty query was filtered out); the explicit empty-query OR was restored, lint/import/diff-check passed, and the reviewer confirmed no remaining concrete blocker. No browser was executed. Public-profile editing/consent remains separate and its existing tests are preserved.

## Separate settings and search entrypoints

The new root-owned product delta is covered by real route SSR in PT/EN: `/clubowners` renders `settingsOnly`, the labelled privacy editor and unchecked consent; neither the old search heading nor a search input/form appears. Independent photo consent remains separate and no write occurs on entry. The public profile opens the compact SearchTrigger when its feature is enabled; it has no old directory back link. The ClubOwner header exposes a separate localized privacy-settings link.

The previous test version is preserved in `settings-entrypoints-preimage/`; three test files changed. The two-account browser fixture now uses the real Trigger at search entry and settingsOnly for consent, preserving opt-in, persistence, follow, hide and privacy assertions. Both the modal fixture and the separate editor/profile/trigger fixture compile in the latest run. Browser cases remain skipped. Existing React missing-key warnings from the extracted shell harness remain visible in the log and are not a native-browser finding. Independent review of this latest delta is requested.

## Browser proof prepared, not executed

`tests/clubowner-search-dialog-browser.test.mts` has four cases per engine: PT/EN × 390/1280 pixels. The fixture uses 40 synthetic public users and intercepted HTTP only. Assertions cover:

- Compact header and Exchange entry, no inline results/form before opening and no background search or write.
- Portal opening, input focus, labelled modal, background inertness, scroll lock, Tab wrap, Escape dismissal, return focus and close-button return focus for both triggers.
- Initial 20 public profiles ordered by supplied rank, followers, pagination to 39 distinct profiles despite a repeated boundary ID, then finding rank 40 using surname fragments and multiple name tokens; a pasted UUID returns no match. Name search never becomes ID search.
- Following from a row with one PUT despite repeated click, uncertain outcome disabling another write, GET reconciliation, confirmed count, unfollow, and no search-form submit as a side effect.
- 503 and malformed payloads remain errors; they do not become empty results or expose internal error text. Confirmed empty results remain distinct.
- A stale snapshot cursor returns 400, retains confirmed rows, and retry loads the first page without the expired cursor.
- Correct internal public-profile links, visible portrait/name/rank/followers, no displayed IDs, no editor/settings footer in the modal, document/dialog horizontal overflow checks, console errors and screenshots.

The existing `clubowner-public-browser.test.mts` was adapted to the paginated response contract and the new keyboard-submit search. Its separate-account consent, persistence, follow, hide and privacy checks remain intact. It was not reexecuted in this scope.

### Resource blocker and exact next action

No browser process was started. Available disk was 466 MiB when most recently rechecked (previous 689 MiB observation retained in the superseded manifest), below the parent-approved 1536 MiB starting threshold and 1024 MiB reserve. `memory_pressure` reported 37% free; the child's sandbox denied the `sysctl` pressure read, so this child does not claim a pressure reading. Parent separately confirmed pressure 1. No memory bypass or lowered reserve was used.

When the parent rechecks ≥1536 MiB available, pressure 1 and ≥25% free memory, reserve one browser lane and run one engine at a time:

```sh
TOUCHLINE_LOCAL_BROWSER_DISK_RESERVE_MIB=1024 TOUCHLINE_RUN_CLUBOWNER_SEARCH_BROWSER=1 TOUCHLINE_CLUBOWNER_SEARCH_BROWSER_ENGINE=chromium node --experimental-strip-types --test --test-concurrency=1 tests/clubowner-search-dialog-browser.test.mts
```

Coordinate before substituting `webkit` and then `firefox`. Preserve screenshots and inspect them rather than declaring visual PASS from assertions alone. Run the older consent/browser suite separately once resources permit. These local browser checks cannot prove hosted authentication, database projection/RLS, actual persistence, native Safari, or physical iPhone pinch stability.

## Mission completion gate

| Item | Status / limit |
|---|---|
| MISSION | Regression tests for new ClubOwner discovery modal |
| SCOPE | Six test files and own evidence/report only |
| QA BRANCH / COMMIT | Shared `qa-stripe-release-20261029`, base `47ebfffbbda98cbb89bcd3ad08fb19efd1e50694`, WIP preserved |
| QA DEPLOYMENT | No deployment in this scope |
| REMOTE BUILD BUDGET / CONSUMED | 0 / 0 |
| STABLE QA URL | https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app |
| FUNCTIONAL RESULT | Local bounded assertions PASS; DOM/hosted gate remains open |
| VISUAL / RESPONSIVE / ACCESSIBILITY | Browser fixture prepared; not approved |
| SECURITY | No new auth/session/database/config writes; consent tests retained; only synthetic fixture data |
| BROWSER MATRIX | Chromium/WebKit/Firefox pending; Safari and physical devices not covered |
| TESTS | Latest 53 PASS, 0 FAIL, 7 conditional SKIP; no summing prior runs |
| BUILD | No Next build; real isolated fixture bundle compiled |
| OBSERVABILITY | Test logs, original test bytes, source hashes and explicit capacity blocker retained |
| OPEN FINDINGS | Browser execution pending capacity; name-only review closed; settings-entrypoint delta review requested |
| PRODUCTION | NOT TOUCHED |

| TOOL / PLUGIN | Action | Evidence / decision |
|---|---|---|
| Shell / Node / React / TypeScript | Source inspection, focused SSR/callback tests, real bundle compile | Local proof only |
| ESLint / Git | Focused lint and whitespace validation | Logs and manifest |
| Playwright | Test implementation, no launch | Capacity blocker retained; no visual PASS |
| Collaboration | Test ownership, browser lane and independent review coordinated | Root and backend agent retain their paths |
| Supabase / Vercel | Not needed for this test-only scope | No tool action or remote mutation |

## Historical settings-only source snapshot

The five test files remain frozen and match the 48 PASS manifest. Root subsequently changed only `photoPrivacy` PT/EN copy to disclose ranking position (reported reviewer P3). The contract-file hash therefore differs. The 48 PASS evidence applies to the previous snapshot; it is not silently reassigned to the edited copy. The exact old/new hashes are in `settings-entrypoints-freeze-check.json`. Root is recording the final source snapshot for its separately coordinated browser run. This child has not launched a browser or repeated the suite.

Independent product review is recorded separately in `artifacts/social-ranked-search-20261101/modal-settings-entrypoints-independent-review.json`: no concrete functional blocker in the reviewed delta. The single P3 disclosure omission in `photoPrivacy` was corrected by root; a read-only follow-up confirms ranking position is now listed in PT/EN with separate photo consent retained. Nine of ten reviewed product hashes still match; the contract hash differs only under the stated copy update. Exact verification is in `settings-product-review-followup.json`. This source review does not prove DOM, hosted QA, or device behavior.

## Confirmed-plan portrait and follow-action delta

The newest bounded run supersedes the historical 48-PASS snapshot: **53 PASS, 0 FAIL, 7 conditional browser SKIP**. Product copy now discloses active plan and ranking position while photo consent remains separate. Six test files are frozen in the current manifest. The five former tests and the newly authorized avatar-browser test were preserved in `plan-ring-preimage/`; prior manifests/logs remain unchanged. The actual settings-route assertion now uses the correct `introduction` copy key.

New SSR coverage proves confirmed Beta/Standard/Master/VIP and null/missing plan keys reach the portrait; unconfirmed plans remain neutral. Profile follow controls retain the visible Seguindo/Following label, descriptive unfollow action, `aria-pressed` and decorative check. Uncertain writes still require a GET reconciliation, never a replayed PUT. Consent and anonymous/private fields were not weakened. The existing avatar transport browser test changes only its obsolete no-plan green-ring expectation to the current neutral ring.

The new modal fixture creates five deterministic synthetic portraits as real WebP bytes via the installed sharp dependency; the lightweight decoder test passed. No private photo or remote image is used. The prepared browser flow serves those portraits on versioned intercepted avatar endpoints, verifies decoded dimensions and all five ring colours, compares plan-matched fallbacks, checks brand-green Seguir/Follow, desktop hover and keyboard-focus fill, and discreet Following with a check. The 390px contexts explicitly set `hasTouch` and use mobile emulation in Chromium/WebKit (Firefox receives touch-capable viewport only because it does not support `isMobile`); actual tap exercises the no-stuck-hover rule. Screenshots are prepared for portraits, following state and full modal. These DOM/style assertions have **not** run in this child.

Root suspended browser execution while integrating this requirement and now owns the next monitored browser window. Earlier disk readings above are historical; this child has not reclassified capacity or started any browser. Focused lint and own-path diff-check passed. Independent review of the final six-test delta was requested. Product, remote data, flags and Production remain unchanged by this child.

The parent-monitored Chromium attempt at 08:09:15 UTC stopped **before spawn**: available disk 1500.12 MiB, below the approved 1536 MiB starting floor; memory pressure 1 and 42% free. `monitored-chromium-receipt.json` records `started: false` / `BLOCKED_PREFLIGHT` with the final product/test hashes. No browser cases ran and no visual PASS is claimed. The independent settings-entrypoint test receipt now exists and reports no concrete blocker in that reviewed test delta; the earlier 48-PASS snapshot remains historical.

Independent plan-ring test review is closed with no concrete blocker in the six-file delta, all six hashes matching the manifest (`plan-ring-independent-test-review.json`). Reviewer did not rerun any test or browser. A separate pre-existing limitation was noticed in the older avatar-browser fixture: its search response has the old shape and it expects an explicit Search button. That conditional suite was skipped and is not claimed as runtime proof; root was informed that its boundary must be refreshed before execution. The new modal fixture already uses the current paginated/ranked DTO and keyboard/debounced input.

## Older avatar fixture boundary repaired

Root authorized the narrow compatibility repair to `tests/clubowner-public-avatar-browser.test.mts`. The fixture now starts at the real settingsOnly consent editor, opens discovery through the actual modal trigger, searches using the input/Enter flow, and returns the complete ranked public DTO with nextCursor. A new lightweight check compiles all actual components and validates the synthetic DTO with the real parser. It passed **1 test, 0 failures; 1 browser test skipped**; lint and diff-check passed. This follow-up is not added to the previous 53-PASS total, whose original snapshot is preserved.

All prior consent/transport assertions remain: independent opt-in, persistence, no discovery photo loading from settings, 20 distinct requests with concurrency1 per ranked snapshot, WebP display, neutral no-plan ring, replaced blob revocation, null/404 behavior,503/manual retry, wrong-identity URL rejection and queued-request cancellation on unmount. The new initial-ranked-list flow and subsequent name query each check20 unique image requests; a deliberate new snapshot is distinguished from an automatic retry. No browser was launched. Preimage, hashes and evidence are in `avatar-boundary-checkpoint.json`; independent review requested. No product, data, gate or deployment change.
