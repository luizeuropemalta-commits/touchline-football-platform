# ClubHub bench and pending-card readability

Date: 2026-08-10
Status: LOCAL COMPLETE / PENDING DEPLOYMENT

## Purpose

Complete the mobile visual-audit block for two compact, customer-visible
labels without changing any player, card, value, contract, provider, database
or deployment data.

## Confirmed observations

- In the local **390px** ClubHub fixture, confirmed technical-bench names such
  as `Luca Nathaniel Cooper` had a visible width of 68px but a scroll width of
  120px. The CSS forced `nowrap` plus `ellipsis`, so names appeared as
  incomplete fragments.
- In the local **390px** pending-card fixture, the market-value field rendered
  `VALOR P…`. The card correctly stayed neutral and commercial fields stayed
  pending, but the state text itself was unnecessarily clipped.

## Local correction

- `ClubHubMatchdayTechnicalArea` now lets confirmed bench names wrap inside
  their existing 3 × 3 slot. It uses `overflow-wrap: anywhere`, normal
  whitespace and clipped (not ellipsized) text, retaining the same technical
  area, count and player identity.
- The fixed card artwork now uses the compact, fully readable pending state
  word `PENDENTE` / `PENDING` in the market-value panel. The field heading
  remains `VALOR DE MERCADO` / `MARKET VALUE`; the full explanation remains in
  the profile/detail surface. No numeric amount, market tier or card price is
  invented.

## Browser evidence

- **ClubHub PT-BR, 390px:** every sampled long bench name now has
  `scrollWidth === clientWidth`; the longest sampled names wrap to 25px or
  38px tall rather than clipping. Root width remained 390px/390px.
- **ClubHub EN, 768px:** sampled names are fully visible on one line and the
  root width remained 768px/768px.
- **ClubHub EN, 1280px:** the field layout and complete player nameplates were
  observed on the local production render with no root horizontal overflow.
- **Cards PT-BR, 390px:** the pending card visibly shows `PENDENTE` in full;
  the measured 106px value panel has `scrollWidth === clientWidth`, while the
  root remained 390px/390px.

## Regression coverage and gates

- New fixture regression checks forbid ellipsis/nowrap in confirmed bench
  names and require the compact EN/PT pending card labels.
- Focused fixture tests: **8/8 passed**.
- Full local suite: **848/848 passed**.
- Direct TypeScript check, production Webpack build,
  `pnpm run check:release-readiness` and `git diff --check` passed.
- ESLint passed with one existing warning in `ArenaClient.tsx` for an unused
  `formatFixtureDateTime` helper; no error was introduced or suppressed.

## Boundaries and remaining gates

- No database, provider, sync, migration, credential, market-value,
  card-tier/price, contract or deployment operation was run.
- Native Safari/iOS and Android observations remain external device gates; the
  browser evidence above is the local production render only.

## Evidence

- `components/touchline/ClubHubMatchdayTechnicalArea.module.css`
- `components/touchline/cards/TouchlineEliteExactCard.tsx`
- `tests/touchline-clubhub-profile-visual-fixture.test.mts`
- `tests/touchline-card-value-states-fixture.test.mts`
