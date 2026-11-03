# Arena reserves — bounded implementation receipt

## Finding and implementation

The normal technical rail in `app/fantasy/FantasyGameweekClient.tsx` was guarded by `!arenaOpen`, so its two reserve groups (4 + 5) disappeared in Arena. Arena retained only the coach and starting XI.

Added an Arena-only bank after the pitch, using the existing `ClubOwnerCollectionSlots`, all nine reserve positions, the same collection state and catalogue, live-season ratings, and the same card width as the pitch. No parallel card renderer or player state was introduced. Action availability still requires both `editable` and `collectionSlotsEditable`. The ordinary ClubOwner reserve rail remains unchanged.

The scoped `.arenaReserves .slot` rule permits the shared cards to determine their row height rather than being constrained to the normal 120px row. Arena sizing/jitter CSS was not edited by this subtask.

## Evidence

- `tests/touchline-arena-reserves.test.mts` executes the actual JSX branch through a component seam: nine canonical reserves, market/readiness gating, and no normal-view duplication.
- RED before implementation: 3 failures because the Arena bank did not exist.
- GREEN after implementation: 61 passed, 0 failed, 0 skipped across the new test and Arena zone-wrapper, mobile-layout, responsive-rhythm, fullscreen, live-mirror and fantasy-arena-projection tests.
- Command: `node --experimental-strip-types --test tests/touchline-arena-reserves.test.mts tests/touchline-arena-zone-wrapper.test.mts tests/touchline-arena-mobile-layout.test.mts tests/touchline-arena-responsive-rhythm.test.mts tests/touchline-arena-fullscreen.test.mts tests/touchline-arena-live-mirror.test.mts tests/touchline-fantasy-arena-projection.test.mts`.

## Delivery boundary

Local behavioral evidence only. Rendered Safari, mobile overflow and physical iPhone remain integrated validation gates; this does not prove the reported iPhone crash is resolved. No browser sessions, database, remote deploy, or Production touched. Existing WIP preserved. Parent owns integrated ledger, build and visual approval.

## Rendered reserves validation

Extended the existing isolated Arena harness to render the actual ClubOwnerCollectionSlots bank with nine synthetic reserve identities and the shared card width. Chromium and WebKit each passed at 667x375, 844x390, 1024x768, 1280x900 and 1920x1080: 10 rendered cases, two runner tests, zero failures/skips.

Assertions cover all nine reserve slots, canonical artwork width matching XI, artwork inside its slot, non-overlapping wrapped slots, scrolling to the last reserve row, no horizontal overflow, full-width pitch ratio and 30-frame geometry stability after viewport shrink/restore. Existing keyboard traversal, focus return, Escape and body-scroll checks also passed. No additional product defect reproduced in this matrix.

Files changed in this validation: tests/fixtures/ClubOwnerArenaScrollFixture.tsx and tests/touchline-clubowner-arena-scroll-browser.test.mts. Logs: artifacts/arena-reserves-20261102/{chromium-render,webkit-render}.log.

Local execution used existing process-scoped TOUCHLINE_LOCAL_IGNORE_MEMORY_GATE=1 and TOUCHLINE_LOCAL_BROWSER_DISK_RESERVE_MIB=1024, retaining a 1 GiB disk reserve. Initial default disk check and sandbox Chromium startup failed before behavioral execution; rerun used the authorized isolated browser executor. No Safari session, remote service, database or deploy was touched.

This is isolated component/browser proof with synthetic identities, not authenticated QA or physical iPhone pinch-zoom proof. Physical iPhone reload/crash validation remains unresolved. Existing production server 3100 predates the reserves patch.
