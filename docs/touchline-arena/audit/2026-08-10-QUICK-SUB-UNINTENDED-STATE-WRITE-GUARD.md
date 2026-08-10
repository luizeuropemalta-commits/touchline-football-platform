# Quick Substitution unintended state-write guard

Date: 2026-08-10
Status: LOCAL COMPLETE / PENDING DEPLOYMENT

## Purpose

Prevent a Quick Substitution visit or an empty `clearLineup` URL state from
silently overwriting an authenticated ClubOwner's remote Arena lineup.

## Confirmed issue

Before this change, the Arena persistence effect could schedule a
`PUT /api/touchline-arena/state` 700 ms after both roster reads completed.
That effect also ran for `standalonePanel="bench"`. Separately,
`?clearLineup=1` emptied the client lineup and the API accepted `lineup: []`,
which made a remote upsert possible without a confirmation step.

## Local correction

1. `app/arena/ArenaClient.tsx` returns before local or remote lineup
   persistence when the surface is the standalone Quick Sub panel or the
   current lineup is empty. Any existing delayed timer is cancelled.
2. `app/api/touchline-arena/state/route.ts` rejects empty arrays. The endpoint
   accepts only a non-empty lineup of at most eleven owned inventory entries.
3. Regression tests prove the guard precedes both `saveLineup` and the remote
   `PUT`, and that the API's static validation requires `lineup.length > 0`.

## Boundaries preserved

- No database request, roster change, contract, card, value, sync, migration,
  provider call or deployment was executed during the correction.
- The Quick Sub browser-session projection remains non-authoritative by design;
  this change prevents incidental writes but does not claim a server-owned
  match event log.
- `clearLineup` no longer has a client path to erase the remote saved lineup.
  A future explicit destructive reset would require a separately designed,
  confirmed command and authorization.

## Validation

- Focused Arena/Quick Sub/authoritative roster suite: **36/36 passed**.
- Full repository suite: **835/835 passed**.
- TypeScript: `pnpm exec tsc --noEmit --incremental false` passed.
- ESLint: `pnpm lint` passed.
- Webpack production build: `pnpm build` passed.
- `git diff --check` passed.

## Evidence

- `app/arena/ArenaClient.tsx`
- `app/api/touchline-arena/state/route.ts`
- `tests/touchline-quick-substitution-session-ui.test.mts`
- `tests/touchline-authoritative-roster.test.mts`

