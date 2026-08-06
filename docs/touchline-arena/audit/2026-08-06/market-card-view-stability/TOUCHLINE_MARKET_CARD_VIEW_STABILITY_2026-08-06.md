# TouchLine Market Transfer — Card View Stability

Date: 2026-08-06

Scope: Card View in `/market-transfer` only

Production promotion: not performed

## Root cause

The Market Card View reused the live card runtime contract. It remained subscribed to ranking changes, retained interactive neon/hover paint transitions and sat inside a sticky backdrop-filtered panel. Safari/WebKit could repeatedly recompose that combination while the player list or unrelated Arena state updated. The Market live-status dot also kept an infinite opacity animation, reinforcing the visible blinking.

## Correction

- Added a memoized Market-only card preview.
- Memoized the selected player read model.
- Disabled live ranking subscription for the Market preview.
- Disabled interactive neon and non-Market card actions.
- Removed animated/filter paint transitions from the Market Card View only.
- Removed backdrop filtering from the sticky preview panel only.
- Stopped the infinite live-status dot animation.
- Preserved the approved card artwork, tier, border, nominal price rules and market-value rules.

## Validation

- TypeScript: PASS
- ESLint: PASS, with one pre-existing unrelated warning in `tests/touchline-active-route-structure.test.mts`
- Focused tests: 27/27 PASS
- Full tests: 668/668 PASS
- Production build: PASS; local production server started successfully
- Desktop 1440×900: 60 temporal samples, one unique visual state, zero horizontal overflow
- Tablet 820×1180: 60 temporal samples, one unique visual state, zero horizontal overflow
- Mobile 390×844: 60 temporal samples, one unique visual state, zero horizontal overflow
- Player change from Gianluigi Donnarumma to James Trafford: 75 temporal samples, one unique visual state
- Card opacity stayed `1`; visibility stayed `visible`; transform/filter/frame animation stayed `none`

## Evidence

- `desktop-card-view-stable.png`
- `desktop-card-view-focused.png`
- `tablet-card-view-stable.png`
- `mobile-card-view-stable.png`
- `mobile-card-view-focused.png`

Result: the Market Card View no longer blinks in the validated local production build.
