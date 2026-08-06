# TouchLine Arena — Idle Card Removal

Date: 2026-08-06  
Scope: Arena idle field only  
Production promotion: not performed

## Root cause

The personal Arena layer treated a saved roster (`shouldRenderPlayers`) as
permission to mount player and coach cards. During account and roster
reconciliation, that state changed asynchronously, allowing one card to flash
over an Arena that was not in an active matchday journey.

## Correction

The personal field layer now requires an explicit matchday/fixture activation.
A saved roster by itself cannot mount player cards, the coach technical-area
card, or their shared field layer. A canonical fixture activates the layer only
after its complete lineup loads. The explicit isolated demo route remains
available for product QA.

## Automated validation

- TypeScript: PASS
- ESLint (changed files): PASS
- Focused Arena/Live tests: 18/18 PASS
- Full test suite: 668/668 PASS
- Production build: PASS

## Temporal and responsive validation

Idle Arena (`/arena?lang=pt-BR&skipIntro=1`):

- After 3 seconds: player cards 0; coach cards 0; field layers 0
- After 10 seconds: player cards 0; coach cards 0; field layers 0
- Desktop after reload and 8 seconds: player cards 0; coach cards 0; field layers 0
- Mobile portrait after reload and 8 seconds: player cards 0; coach cards 0; field layers 0

Explicit demo matchday (`demoLineup=1`):

- Player cards: 11
- Coach cards: 1
- Field layers: 1

This confirms that the correction removes the idle flash at the render-policy
boundary without disabling the card layer used by an explicit game journey.

## Local evidence

- `desktop-idle-empty.png`
- `mobile-idle-empty.png`
- `arena-idle-card-removal-validation.json`

