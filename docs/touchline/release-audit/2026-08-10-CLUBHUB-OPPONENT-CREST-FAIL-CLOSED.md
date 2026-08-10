# ClubHub opponent crest fail-closed guard

Date: 2026-08-10
Status: LOCAL COMPLETE / PENDING DEPLOYMENT

## Purpose

Prevent the ClubHub Next Match surface from displaying the current club's
crest as an unverified opponent crest.

## Confirmed issue

The previous page-local fixture helper fell back to the club being viewed
whenever it could not resolve a fixture team by name or short code. Because it
was called for both home and away sides, an unknown opponent could appear with
the current club's crest and look like a confirmed identity.

## Local correction

1. A small pure resolver matches a fixture team only against the local
   canonical 20-club registry, first by provider team ID and then by approved
   name/short-code aliases.
2. A known canonical club receives its own local crest.
3. An unknown opponent retains only a supplied name/short code, with no crest;
   when no identity is supplied it displays the existing explicit
   `Opponent to be confirmed` / `Adversário a confirmar` text.
4. The current club can use its own crest only when its exact provider team ID
   is present. Both fixture sides receive the pending visual class when no
   crest is confirmed.

## Boundaries preserved

- No provider request, database write, schedule refresh, sync, migration,
  card/value/contract change or deployment was performed.
- Raw provider crest URLs remain excluded. The surface uses only the existing
  local canonical crest registry.
- The correction does not invent an opponent, score, fixture date or match
  state.

## Validation

- Focused ClubHub resolver/boundary/profile/resilience suite: **15/15
  passed**.
- Strict TypeScript: `pnpm exec tsc --noEmit --incremental false` passed.
- ESLint: `pnpm lint` passed.
- `git diff --check` passed.

## Evidence

- `lib/touchlineArena/club-match-preview.ts`
- `app/touchline-clubs/[club]/page.tsx`
- `tests/touchline-club-match-preview.test.mts`
- `tests/touchline-clubhub-persisted-fixture-boundary.test.mts`
