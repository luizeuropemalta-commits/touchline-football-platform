# QA candidate manifest — 15 October 2026

## Objective

Publish one QA-only candidate that completes the ClubOwner plan presentation,
finite XI budget enforcement, coach/formation layout, eight-locale copy,
ranking award hierarchy, and shared card presentation. The related QA-only
finite-budget database migration was applied and verified before this commit.

## Included paths

- ClubOwner/XI market and pitch presentation: `app/clubowner/market-game.module.css`,
  `app/fantasy/FantasyGameweekClient.tsx`, `app/fantasy/fantasy.module.css`,
  `components/touchline/ClubOwnerMarketHeader.tsx`, and
  `components/touchline/pitch/TouchlinePitchSurface.{tsx,module.css}`.
- Ranking, awards, shared card, coach and social surfaces:
  `app/rankings/*`, `app/touchline-players/[player]/player-profile.module.css`,
  `app/visual-qa/golden-boot-preview/page.tsx`, `components/touchline/TouchlineCoachCategoryShowcase*`,
  `components/touchline/cards/Touchline*`, `components/touchline/social/TouchlineSocialRankingsLive*`,
  `lib/touchlineArena/{club-hub-showcase-i18n,clubhub-tier-showcase,player-leader-golden-ball-presentation,rankings-highlight-projection,tables-presentation-i18n}.ts`,
  and `public/touchlineArena/awards/*`.
- Finite-budget contract and QA safety evidence:
  `lib/touchlineFantasy/{market-browser,market-budget-i18n}.ts`,
  `scripts/assert-touchline-qa-persona.mts`,
  `scripts/qa/finite-budget-envelope-20261014.mjs`, relevant `tests/*.test.mts`,
  `CURRENT_STATE.md`, `CURRENT_EXECUTION_LEDGER.md`, and release checkpoint docs.

## Explicit exclusions

- `tsconfig.tsbuildinfo`: generated TypeScript state; never a release input.
- `public/touchline-maintenance.html`: unrelated owner-maintenance asset; it is
  preserved locally and not included in this QA candidate.

## Rollback

The last QA deployment remains the rollback target until this exact Git SHA is
remotely validated. The finite-budget migration has its separately reviewed
forward compensation envelope; do not delete migration history or use it once
writers resume without a fresh state check.
