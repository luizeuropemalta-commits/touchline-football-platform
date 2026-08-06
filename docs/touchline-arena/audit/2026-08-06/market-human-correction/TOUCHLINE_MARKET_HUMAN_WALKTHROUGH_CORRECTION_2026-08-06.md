# TouchLine Market — Human Walkthrough Correction

Date: 2026-08-06

Scope: Market Transfer responsive hierarchy and squad-selection journey

Production promotion: not performed

## Reproduced defect

- The desktop roster retained a two-column card list while the middle track was compressed by the club rail and preview panel.
- Complete player names were consequently rendered as fragments even though the overall viewport had sufficient space.
- The account balance appeared after the squad builder instead of at the start of the acquisition journey.
- The current Market destination and Rankings destination were repeated in the same workspace.
- Mobile placed the large selected-card preview before the actionable player list.
- Mobile position filters were clipped by the sorting control.

## Corrections

- Moved the authoritative TC balance, active-contract count and remaining slots to the top of the Market panel.
- Made the balance summary sticky while the customer browses clubs and players.
- Connected every pitch slot selection to the corresponding Market position filter and smooth scroll target.
- Replaced the compressed desktop two-column player grid with one readable player row per card.
- Preserved complete player names instead of ellipsised fragments.
- Ordered the mobile journey as clubs, player roster, then selected-card preview.
- Kept every mobile position filter visible and placed sorting on its own row.
- Removed the self-referencing Market link and the duplicate local Ranking link.
- Removed the duplicate lower “Organizar elenco” action; the Training Centre remains in the top navigation.

## Validation

- TypeScript: PASS
- ESLint: PASS with one pre-existing unused-variable warning in `tests/touchline-active-route-structure.test.mts`
- Full automated suite: 666/666 PASS
- Focused Market regression suite: 44/44 PASS
- Production build: PASS, 118/118 static pages generated
- Chromium desktop/mobile/landscape: PASS
- WebKit desktop/mobile/landscape: PASS
- Horizontal document overflow: none
- Desktop player-name truncation: none in measured Market rows
- Mobile sticky balance: PASS
- Mobile order clubs → players → preview: PASS

## Local evidence

Screenshots and machine-readable browser results are stored in this directory and its `manual/` and `webkit-desktop/` subdirectories. They are intentionally not embedded in chat.
