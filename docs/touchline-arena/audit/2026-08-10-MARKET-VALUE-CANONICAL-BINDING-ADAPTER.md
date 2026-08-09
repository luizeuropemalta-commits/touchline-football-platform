# Owner-approved market-value canonical binding adapter

**Recorded:** 2026-08-10
**Status:** `LOCAL COMPLETE / NOT EXECUTED / NOT APPLIED`

## Purpose

Prepare the one missing local safety step between the owner-approved
Sportmonks application candidate and any future market-value writer. The
adapter binds only the 533 explicit-EUR rows to the current canonical
TouchLine player, club and active-membership UUIDs. It is a review manifest,
not an import payload or write authorization.

## Implementation

- Pure fail-closed manifest builder:
  `lib/touchlineArena/owner-approved-market-value-binding.ts`.
- Server-only, uncached canonical reader and two-pass revision fence:
  `lib/touchlineArena/owner-approved-market-value-binding-server.ts`.
- Focused proof:
  `tests/touchline-owner-approved-market-value-binding.test.mts`.

The reader uses only the normalized persisted identity tables:

1. `football_players`;
2. `football_squad_members`;
3. `football_clubs`; and
4. `football_competitions`.

It does not call Sportmonks, the generic value importer, cache invalidation,
or any database mutation. The adapter is not exposed through an API route or
server action.

## Fail-closed contract

For each provider-team/player pair, the two fresh reads must agree and prove:

- one numeric Sportmonks player ID;
- one canonical player UUID with a valid `source_updated_at`;
- that player's exact current-club UUID and expected provider team ID;
- exactly one active Sportmonks membership globally for that player;
- matching membership club and competition UUID;
- the unique Sportmonks Premier League competition (`provider_competition_id`
  `8`); and
- valid UUID/timestamp provenance for player, club, membership and
  competition.

The reader limits a request to 60 provider IDs and batches by provider team.
It hashes each batch's canonical binding output, reads all batches twice, and
blocks the entire result if any query is unavailable, partial, duplicated,
incoherent or changes revision between passes. It never re-matches by name.

The output schema is
`touchline-owner-approved-market-value-canonical-binding-v1`. Every emitted
row contains the original idempotency/source hashes, provider IDs, canonical
player/club/membership/competition UUIDs, freshness timestamps and the owner
EUR value. Its status is always
`BOUND_PENDING_SEPARATE_WRITE_AUTHORIZATION` and
`application_eligible: false`.

## Fixed exclusions

The source candidate remains the immutable package at:

`docs/touchline-arena/market-values/manual-2026-27/owner-approved-transcript-2026-08-09/application-candidates/2026-08-09T19-25-39-089Z/`

The adapter requires its exact `558 / 538 / 533 / 5 / 23 / 20 / 0` count
vector. It selects only the 533
`READY_AFTER_CANONICAL_UUID_BINDING` rows. The five
`PENDING_VALUE_MISSING` rows, 23 provider-only `PENDING` records and 20
owner-only `REVIEW` records are explicit exclusions and cannot enter the
binding output or any future write set.

No Sportmonks provider ID is placed into `externalPlayerId`; the existing
generic importer maps that field to Transfermarkt-specific storage and is not
an input to this adapter.

## Validation

The focused suite proves a synthetic canonical binding for all 533 rows and
rejects a missing, duplicate or wrong-team binding; malformed candidate count
vectors; a populated pending value; invalid membership UUID/timestamp; and
write/provider/import/cache capability in the adapter source.

Commands run for this checkpoint are recorded in the final ledger entry.

**Persistent implementation checkpoint:** `e3a13739`
(`feat(market-values): add canonical binding preflight`).

## Gate and next step

No canonical DB read was invoked while implementing this adapter, so no real
UUID manifest is archived yet. The next authorized invocation must use the
existing server-side canonical projection only, persist any returned manifest
to a new dated artifact path, and stop if the two-read fence or any 533-row
binding fails.

Even a complete binding manifest does not authorize an import. A separate
atomic executor, rollback/preflight evidence and explicit write authorization
remain required. No database write, sync, migration, Preview, deployment,
provider request, card/value/tier/price/contract change occurred in this
checkpoint.
