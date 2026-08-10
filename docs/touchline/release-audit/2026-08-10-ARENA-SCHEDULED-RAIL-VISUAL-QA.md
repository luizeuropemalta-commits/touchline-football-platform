# Arena scheduled rail visual QA

Date: 2026-08-10
Status: LOCAL COMPLETE / PENDING DEPLOYMENT

## Purpose

Complete the visual regression proof for the approved Arena rail rule: a
scheduled fixture must show the two teams plus localized `Next` / `Próximo`;
only Live / Match Centre may show a calendar date or kickoff time.

## Local-only correction

- Added a third, scheduled state to
  `/visual-qa/arena-main-field`: `Tottenham — Newcastle · Next/Próximo`.
- Kept the existing live (`LIVE · 63′` / `AO VIVO · 63′`) and final (`FT` /
  `FINAL`) examples. The fixture uses synthetic cards, coach and score data
  only; it is not evidence that market values or player data were applied.
- Added the fixture to the executable EN/PT local release-readiness matrix.

## Browser evidence actually observed

Local browser visits to all six direct fixture variants recorded the three
rail states, no date pattern, and no root horizontal overflow:

| Locale | 1280 | 768 | 390 |
| --- | --- | --- | --- |
| `en-GB` | PASS | PASS | PASS |
| `pt-BR` | PASS | PASS | PASS |

The companion matrix renders real-width `1280`, `768` and `390` iframe
viewports, so the named widths are not desktop-scaled screenshots. Native
Safari/WebKit, iOS Safari and Chrome Android remain external device gates.

## Boundaries preserved

- No `ArenaClient`, account, Live endpoint, database, provider, browser
  storage, drag interaction, sync, migration, credential or deployment
  configuration is used by the fixture.
- The real Arena continues to localize future rail status through its existing
  display helper; this block does not redesign Quick Sub or alter its authority.

## Validation

- Focused Arena fixture, rail and release-readiness tests: **8/8 passed**.
- Full local suite: **846/846 passed**.
- Strict TypeScript, ESLint (exit 0), Webpack production build and
  `git diff --check` were rerun before publication.

## Evidence

- `app/visual-qa/arena-main-field/page.tsx`
- `tests/touchline-arena-main-field-visual-fixture.test.mts`
- `tests/touchline-arena-premium-score-rail.test.mts`
- `scripts/check-touchline-release-readiness.mjs`
- `tests/touchline-release-readiness-local.test.mts`
