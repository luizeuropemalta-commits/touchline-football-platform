# ClubHub trophy carousel — full-exit pagination

Date: 2026-08-10
Status: LOCAL COMPLETE / PENDING DEPLOYMENT

## Purpose

Remove the partial trophy tiles that were visible at the left and right edges
of the ClubHub honours carousel during continuous movement.

## Confirmed cause

The previous client component rendered four copies of the same honours set and
animated one continuous linear track. The ClubHub viewport then used a fading
edge mask. A trophy could therefore be visible while leaving at one side while
the next trophy was already partially entering at the other.

## Local correction

- Honours are now split into complete responsive pages rather than repeated on
  a continuous track.
- Before a page changes, every visible trophy fades and moves out as one group;
  the component unmounts that page briefly, then mounts the next complete page
  and brings it in. A new trophy never starts entering before the previous
  group has fully disappeared.
- The edge mask and duplicated carousel sets were removed. The current page is
  a centred grid, so no clipped half-card can appear at either edge.
- If all trophies fit, the component stays static. `prefers-reduced-motion`
  keeps pagination manually operable but disables automatic movement and the
  transition.

## Boundaries preserved

- No trophy asset, club data, card/value/tier/contract data, provider, database,
  sync, migration or deployment state was changed.
- The change is limited to the ClubHub trophy presentation and its regression
  tests.

## Validation

- Focused honours, ClubHub and accessibility suite: **35/35 passed**.
- Full local suite: **839/839 passed**.
- Strict TypeScript, ESLint, Webpack production build and `git diff --check`
  passed.
- Local production browser observation at **1280 × 720**: Manchester City now
  renders all five trophies as full cards, no carousel edge fragments and no
  horizontal overflow.
- The responsive page-size math and mobile grid contract cover the 390px and
  768px layouts. Native phone/tablet browser observation remains an external
  device QA gate and is not claimed as completed here.

## Evidence

- `components/touchline/ClubTrophyCarousel.tsx`
- `app/touchline-clubs/[club]/page.tsx`
- `tests/touchline-neon-identity-regression.test.mts`
- `tests/touchline-public-motion-accessibility.test.mts`
