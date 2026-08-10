# Live stale-snapshot presentation guard

Date: 2026-08-10
Status: LOCAL COMPLETE / PENDING DEPLOYMENT

## Purpose

Ensure that TouchLine Live never presents a stale persisted in-play snapshot
as if it were a current live score.

## Confirmed issue

`app/api/football-data/fantasy/livescores/route.ts` already exposes the
server-calculated `degraded` and `fetchedAt` metadata. A durable live snapshot
becomes degraded after five minutes; the partial persisted schedule is also
degraded by contract. Before this correction,
`TouchlineMatchCentre` discarded that metadata and rendered a `LIVE` label
from fixture status alone.

## Local correction

1. The shared Match Centre contract validates only the two persisted read
   states and their server-calculated freshness metadata.
2. The `/live` server render starts from an explicit degraded
   `partial-persisted-schedule` presentation state until the existing
   read-only endpoint provides a fresher result.
3. A visible, accessible EN/PT notice explains that live data is updating.
   If the data is a stale in-play snapshot, the score is labelled
   `LAST VERIFIED` / `ÚLTIMO VERIFICADO`, rather than `LIVE` / `AO VIVO`.
4. The client consumes only the already-public fixture DTO and its
   `verifiedAt` timestamp; it no longer depends on private fixture source
   metadata.

## Boundaries preserved

- No provider request, database write, cache refresh, sync, migration or
  remote configuration action was added.
- The browser does not compute freshness from its own clock. It trusts only
  the server's `degraded` field and preserves the last known presentation if
  a later read fails.
- Completed and scheduled fixtures retain their normal state; only a degraded
  in-play fixture loses the visual `LIVE` claim.

## Validation

- Focused Live/Match Centre/accessibility/navigation suite: **20/20 passed**.
- Full repository suite: **837/837 passed**.
- Strict TypeScript: `pnpm exec tsc --noEmit --incremental false` passed.
- ESLint: `pnpm lint` passed.
- Webpack production build: `pnpm build` passed.
- `git diff --check` passed.
- Local production render at `127.0.0.1:3107/live?lang=pt-BR` visibly showed
  `Dados ao vivo em atualização`, had no active animation, and had no
  horizontal overflow at the observed 1280 × 720 desktop viewport. The local
  environment had no populated canonical fixture, so this is not a claim of
  visual live-score-card coverage.

## Evidence

- `app/live/page.tsx`
- `components/touchline/match-centre/TouchlineMatchCentre.tsx`
- `components/touchline/match-centre/touchline-match-centre.module.css`
- `lib/touchlineArena/match-centre.ts`
- `tests/touchline-match-centre.test.mts`
- `tests/touchline-public-persisted-live-boundary.test.mts`
- `tests/touchline-public-motion-accessibility.test.mts`
