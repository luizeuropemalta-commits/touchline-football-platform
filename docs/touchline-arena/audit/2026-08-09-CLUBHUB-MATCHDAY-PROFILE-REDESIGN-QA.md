# ClubHub matchday profile redesign — local QA

**Date:** 2026-08-09
**Status:** LOCAL COMPLETE — NOT DEPLOYED
**Scope:** ClubHub profile presentation only; no database, Sportmonks request,
sync, migration, card-economy, value, contract, tier, price or deployment
operation was performed.

## Purpose

Move the ClubHub profile into the approved real-club-first order:

1. club identity, verified aggregate club value, honours and next match;
2. the XI on the existing pitch;
3. a distinct technical area for an official coach and nine official bench
   places;
4. a plain roster of players outside the shown matchday group;
5. the server-owned Official League Table; and only then
6. TouchLine card/ranking content.

The change must neither invent a coach/bench nor duplicate a player between
the XI, bench and outside-matchday roster.

## Data boundary and fail-closed behaviour

- The persisted fixture feed currently provides line-up members with selected
  fixture/team identity plus `isStarter` and `isSubstitute`. It does **not**
  provide a matchday-coach DTO.
- `buildTouchLineClubMatchdayPresentation()` therefore confirms the technical
  area only when the same fixture supplies an exact unique XI, nine unique
  substitutes and a fixture/team-matching official coach.
- Until the coach source exists, the production page intentionally passes no
  coach and shows **Awaiting official matchday sheet / Aguardando súmula
  oficial da partida**, with nine unnamed places. It never falls back to the
  static coach seed, a club projection or an Arena bench helper.
- The displayed ID set is the XI plus the confirmed bench only. The plain
  outside-matchday roster and post-table card grid exclude that set. A preview
  XI is also excluded from the plain roster so a player is never repeated.
- The hero shows an official club value only when every current card value is
  verified. Otherwise it explicitly shows the existing updating state; no
  partial total or fabricated zero is displayed.

## Implementation evidence

- `lib/touchlineArena/club-lineup.ts` contains the pure, fixture-scoped
  matchday presentation model.
- `components/touchline/ClubHubMatchdayTechnicalArea.tsx` renders the blue
  technical area and is presentation-only: no network, provider, database or
  card-economy imports.
- `components/touchline/ClubHubOutsideMatchRoster.tsx` renders the separate
  plain roster without rank, points, price, tier, contract or profile action.
- `app/touchline-clubs/[club]/page.tsx` enforces the approved section order.
- `components/touchline/ClubHubOfficialLineup.module.css` uses a compensated
  safe top inset and dark, two-line nameplates. It removes ellipsis and fits
  the visual stress names at 390px without overlap or page overflow.

## Local validation

All validation used a blank-environment loopback server and the static route
`/visual-qa/clubhub-profile-contract`; this fixture imports no account,
database, provider or economic data.

- Focused regression suite: **39/39 passed**. It covers exact fixture/team
  identity, an XI plus exactly nine bench members, missing coach/partial/
  duplicate/mismatched sheets failing closed, no roster duplication, profile
  ordering, no TouchLine economics in the pre-table roster, initial 20-club
  table and card-state regression boundaries.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed; the only output is the pre-existing Babel size note for
  `app/arena/ArenaClient.tsx`.
- `git diff --check`: passed.
- Browser QA, desktop 1280px static confirmed fixture: confirmed XI, one
  coach, nine named bench players, three outside-matchday players, 20 table
  rows, 23 unique displayed identities and no horizontal overflow.
- Browser QA, 390px static pending fixture: awaiting state, no coach name,
  nine blank technical places, 20 table rows, no horizontal overflow. All 11
  pitch labels had normal whitespace, clipped-text mode rather than ellipsis,
  no hidden third line and no label-to-label overlap.

The user-provided remote Vercel screenshot showing an Updating card is useful
as a current-product observation only. It was not used as acceptance evidence
for this local, no-data fixture and no card-value rule changed in this block.

## Remaining gates

1. A sanitized persisted matchday coach field is required before a real
   ClubHub page may show a coach or named nine-player bench.
2. A later data-backed visual pass must use an authorized, read-only source;
   it must prove the real XI/bench/outside partition and EN/PT copy without
   making provider or sync calls.
3. The owner-approved value batch remains local-only. Its 533 confirmed EUR
   rows are not applied to Preview or any database; the separate canonical
   UUID binding and application gates remain in force.
4. This block does not approve Preview or production release.

## Next visual proposal — not started

The requested card/crest neon change remains a separate visual block: one
unclipped trace should travel through the centre of the canonical card border,
with a soft trail and ignition, canonical tier-border colour, club-colour
crest treatment, and a `prefers-reduced-motion` static alternative. It must
not be folded into this ClubHub profile change or alter card tier, price,
contract or value rules.

## Persistent checkpoint

`230909d60c4f18ed4c1784d2a8ed9b6197311018`
(`feat(clubhub): separate verified matchday profile sections`)
