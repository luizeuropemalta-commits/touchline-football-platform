# Mobile audit — 2026-09-23/24

## Scope and authority

Read-only public mobile diagnosis. No login/logout, customer-session reuse, data writes, production edits or deployment. The only authored artifact is this report. Existing dirty source was preserved. This is NOT a full-site mobile release PASS.

Tools: code-verification guidance, installed Playwright WebKit, source inspection. `agent-browser` executable was unavailable. Initial sandbox WebKit launch aborted before visiting the site; approved isolated execution succeeded. No Safari window was used.

## Deployment separation

- Production public response assets: `dpl_CZXL6E3gQJdt4sMXDWStdcvywfjq`.
- QA alias public response assets: `dpl_3BPTgXYjYvLTcnkvtnWX3WYt9Skz`.
- Root identifies QA source baseline as `273009af16f0d5fd128ca25a10e3265508f0d435`. This browser audit independently establishes deployment IDs, not their Git mapping. Local unpublished patches must not be attributed to production.

## Results

| Target | Executed evidence | Result |
|---|---|---|
| Production `/touchline-player-card-rankings?lang=pt-BR` | Fast and slower scroll to bottom, document-request tracking | 200, one document request, no JS error/crash, unchanged URL, 112 images, no videos, no horizontal overflow; bottom reached at y=10002 of height10344 |
| Production `/touchline-clubs/arsenal?lang=pt-BR` | Scroll to bottom | 200, one document request, no JS error/crash, unchanged URL, 159 images, no broken loaded images, landscape overflow0 |
| Production `/touchline-clubs`, `/touchline-tables`, `/live` | Initial public navigation and bounded scrolling | 200, no JS errors or failed requests observed; not exhaustive controls/complete-scroll coverage |
| Production `/my-club` | Public unauthenticated entry | Expected redirect to login; private squad/market NOT tested |
| Production `/arena` | Public initial entry | 200, no JS errors; intro visible; two paused video elements at readyState1 at sampling time. Some media requests cancelled; this alone does not prove a video defect |
| QA ranking and Arsenal | Two passes: fast/slower scrolling, last-card zoom open/close | 200, one document request each, no JS errors or unexpected departure; zoom opened one dialog and closed; landscape overflow0 |
| QA ranking → ClubHub → back → reload | Two independent passes using the public ClubHub link | Both returned to the same ranking URL and title after back and reload |
| QA fresh iPhone portrait ranking | Separate portrait browser context | viewport390×664, screen390×844; portrait media query true; orientation gate display:flex; protected content DIV inert=true, aria-hidden=true, visibility:hidden |

### Confirmed production orientation/layout defect

Production has no `[data-touchline-orientation-gate]` on the ranking/Arsenal routes. Changing Arsenal to portrait390×844 exposes horizontal overflow360px and visibly overlapping oversized cards/labels. Screenshot `/private/tmp/touchline-mobile-arsenal-portrait-20260923.png` was inspected. QA does contain the orientation gate and blocks a fresh portrait visit correctly.

### Reported dark-screen/reload incident

Not reproduced in the public simulated runs. Exactly one document navigation was recorded on instrumented ranking/Arsenal runs, despite multiple same-URL frame events in an earlier run. A frame event alone therefore must not be labelled reload. No observed crash or JS exception supports a root-cause claim yet.

Static local inspection: ranking presentation refresh uses `router.refresh` on changed snapshots, not scroll; orientation code keeps children mounted; push service worker has no fetch/reload handler. These facts concern inspected local source and are not proof about the exact production bundle. Source contains no proven scroll-triggered page exit in the inspected paths.

Arsenal loaded 53 unique image sources with an approximate raw RGBA pixel sum of31MiB. This excludes actual browser/GPU/cache overhead and is NOT a measured memory limit or proof of OOM.

## Simulation limitations

- WebKit runs on the Mac, not physical iPhone memory/thermal/GPU constraints.
- Resizing an existing landscape-emulated context did not flip the orientation media query reliably. Fresh portrait context is the reliable evidence above; physical rotate/back with open zoom remains a gate.
- Two QA scrolling passes were bounded; immediate scroll-to-end sampling can precede smooth-scroll completion. Do not claim two exhaustive bottom-to-top sweeps on QA from these results.
- No authenticated MyClub/Admin, team changes, payments, personal data or credentials accessed.
- No failed-network/loading injection or full keyboard/gamepad/TV matrix executed.
- No new corrective patch proposed for the unexplained reload; do not suppress refresh or alter memory behavior without reproducing the cause.

## Next gates before a mobile release claim

1. Match final candidate SHA/deployment and repeat public tests after integration.
2. Inspect final rendered landscape cards/header at small widths; compare production portrait failure against candidate protection.
3. Physical device reproduction: exact route, model, OS/browser, navigation sequence, orientation, and crash/console evidence. Distinguish OS process eviction, actual document reload, route redirect, and React error boundary.
4. Authenticated role-matched MyClub/market scroll, zoom and back/refresh without changing the XI.
5. Full route inventory with controls and two complete passes after any authorized fix; test portrait entry and physical rotation while a dialog is open.
6. Retain data/production release gates independently. This diagnostic does not authorize a deployment.
