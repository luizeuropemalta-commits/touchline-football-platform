# Mobile rendering audit — 2026-11-02

Scope: local candidate `qa-stripe-release-20261029`; route/component inspection and isolated behavioral tests. No deploy, remote mutation, Arena CSS change, or physical iPhone validation. Existing WIP belongs to its respective owners.

## Confirmed defect and correction

`lib/touchlineArena/visible-decoration-motion.ts:10`: both an observed pitch and an independently observed nested card obtained the same animation from `getAnimations({ subtree: true })`. Returning the pitch to view could resume a still-offscreen card. The controller now accepts only animation targets whose nearest observed decoration is the current node (`:14`). This preserves independent ownership without removing neon effects.

RED evidence: nested-card browser regression expected `paused`, received `running` after scrolling the pitch out and back into view while the card remained offscreen. Deterministic controller harness reproduced the same sequence. GREEN: ownership harness plus decoration browser suite, 4 PASS / 0 FAIL. Browser cases exercise Chromium and WebKit. This is a confirmed animation lifecycle defect, **not a demonstrated cause of the reported iPhone reload/crash**.

Changed product file: controller only. Corresponding tests: `tests/touchline-visible-decoration-ownership.test.mts`, `tests/touchline-visible-decoration-browser.test.mts`.

## Coverage by surface

| Surface | Inspected mechanism | Evidence / remaining scope |
| --- | --- | --- |
| ClubOwner and Fantasy (`app/clubowner`, `app/fantasy`) | `FantasyGameweekClient.tsx:616` pitch resize; `:661` guide-height observer; shared pitch/card decoration | Ownership bug fixed. Arena sizing/oscillation is being handled by parent; no duplicate changes here. Authenticated full-page pinch and long-session memory remain unproved. |
| Rankings (`app/rankings`, `app/touchline-player-card-rankings`) | Shared player card and zoom; many simultaneously displayed cards | Shared controller fix applies wherever installed. Existing `touchline-ranking-zoom-persistence-browser.test.mts` covers 1280×900, 390×844 and 844×390 with Chromium, but was inventoried, not rerun in this supplemental batch. |
| ClubHub (`app/touchline-clubs`, `[club]`) | `ClubHubFixtureStrip.tsx:94` resize/loop measurement; `ClubTrophyCarousel.tsx:172` page-size observer; observed decoration | Observer cleanup and state equality/loop conditions inspected. No additional confirmed defect. Live full-page resource profiling remains pending. |
| Live (`app/live`) | Shared match/card surfaces, badges, overlays | Badge geometry/lifecycle verified below; live polling plus physical pinch not reproduced here. |
| Public ClubOwners (`app/clubowners`, `[publicId]`) | Shared overlays/avatar/list surfaces | Route inventoried; new search/profile work belongs to parallel owner. Not counted as rendered mobile approval. |
| All game routes | `TouchlineLandscapeBoundary`, `orientation-gate.ts:4` media gate | Gate keeps children mounted, changes inert/focus, exits native fullscreen when required; no route reload found in gate. Unit/source composition tests pass. |

## Supplemental tests executed

1. `node --experimental-strip-types --test tests/touchline-badge-viewport-placement.test.mts tests/touchline-intro-orientation-draft-composition.test.mts`: **18 PASS, 0 FAIL, 0 SKIP**. Includes narrow visual viewport, width-before-measurement, visual viewport offsets, coalesced events, unchanged-position identity, cleanup, tall text, keyboard scrolling and orientation consumer composition. Controlled geometry is not native pinch.
2. `node --experimental-strip-types --test tests/touchline-orientation-gate.test.mts tests/touchline-global-landscape.test.mts`: **10 PASS, 0 FAIL, 0 SKIP**. Repeated rotation, focus/inert restoration, cleanup and asynchronous fullscreen exit.
3. `TOUCHLINE_RUN_ZOOM_LANDSCAPE_BROWSER_TESTS=1 node --experimental-strip-types --test tests/touchline-card-zoom-landscape-browser.test.mts`: **1 PASS, 0 FAIL, 0 SKIP**, 47.1 s. Chromium/WebKit/Firefox × 844×390 and 812×375 × synthetic left/right notch = 12 combinations. Actual local card artwork loaded; controls, crowns, dismissal and focus checked; no JS errors reported. Test uses reduced motion and synthetic safe-area insets; it is not an iPhone/GPU/native pinch stress test.

The earlier 4-test ownership/decoration result is a separate focused run; no broad-suite totals or release approval are inferred.

## Risk inventory, not diagnosed causes

- Full-screen blur in `TouchlineCardZoom.module.css:77` and card drop-shadow at `:87`, plus animated pitch effects in `components/touchline/pitch/TouchlinePitchSurface.module.css`, deserve physical-device compositing/memory measurement with normal motion. Their presence alone does not prove a crash.
- Card shell ResizeObserver (`TouchlineEliteExactCard.tsx:878`) and shirt name fitting (`:1081`) were inspected. Name fitting rounds results and preserves equal state; cleanup disconnects the observer. No new feedback-loop reproduction was obtained.
- Badge visual viewport listeners are coalesced into one animation frame and removed on cleanup. The tests establish this behavior, not iOS process memory safety.

## App readiness boundary

- `app/layout.tsx:65` permits native page scaling: device-width, initial scale 1 and viewport-fit cover; no maximum-scale/user-scalable prohibition found there.
- Manifest and Apple web-app metadata exist (`app/layout.tsx:38–50`, `public/manifest.webmanifest`), with launch/icons/fullscreen/landscape declarations.
- `public/touchline-push-sw.js:11,34` handles push and notification click. It has no fetch/offline cache handler; installing the push worker (`push-device-registration.ts:96`) is not proof of offline app behavior.
- File inventory for Capacitor, app.json, Info.plist, AndroidManifest, Podfile and xcodeproj returned no native-wrapper candidates. Store submission, signing, native lifecycle and device matrix are not approved by this audit.

## Remaining acceptance gate

Reproduce repeated page pinch/zoom and rotation on a real iPhone in ClubOwner, Arena, Rankings, ClubHub and Live with normal animations, then background/foreground and navigate repeatedly. Record device/iOS/browser, route, animation state, errors and memory/process termination evidence. Verify no reload, white page, remount/state loss or oscillation. Desktop WebKit and synthetic viewport tests cannot close this gate.
