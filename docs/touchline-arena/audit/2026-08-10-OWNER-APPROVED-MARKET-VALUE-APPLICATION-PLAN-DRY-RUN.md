# Owner-approved 533-value application plan — pure dry-run

**Recorded:** 2026-08-10
**Status:** `LOCAL COMPLETE / NOT EXECUTED / NOT APPLIED`

## Purpose

Prepare the smallest possible non-executable hand-off between a future fresh
canonical UUID binding and a separately authorized atomic writer. This is not
an import, a database client, a server action, a route, or authorization to
change any value.

## Local artifact

- Planner:
  `lib/touchlineArena/owner-approved-market-value-application-plan.ts`
- Focused proof:
  `tests/touchline-owner-approved-market-value-application-plan.test.mts`
- Required upstream review-only binding contract:
  `lib/touchlineArena/owner-approved-market-value-binding.ts`

The planner accepts only the clean
`touchline-owner-approved-market-value-canonical-binding-v1` review manifest.
It produces a `touchline-owner-approved-market-value-application-plan-v1`
with `applicationEligible: false` and `execution: dry-run-only` in every
state.

## Fail-closed scope

A review-only plan is produced only when all of these are true:

1. the binding manifest contains exactly **533** complete explicit-EUR rows;
2. every row carries distinct source/idempotency hashes, exact provider
   team/player identity, canonical player/club/active-membership/competition
   UUIDs and valid freshness timestamps;
3. the rows cover all **19** approved manual-value clubs and a single canonical
   Premier League competition; and
4. the upstream canonical-read revision and candidate fingerprints are valid,
   with no binding issue.

Any invalid field, incomplete count, blocked binding, duplicate player or
membership, duplicate source/provider identity, changed club mapping, or
missing club blocks the **entire** plan and returns zero value rows.

The source vector is preserved verbatim:

| Group | Count | Plan behavior |
|---|---:|---|
| Explicit owner-approved EUR rows | 533 | The only rows present in the dry-run plan. |
| Owner rows with no value | 5 | `PENDING`; excluded from every write set. |
| Provider-only records | 23 | `PENDING`; excluded from every write set. |
| Owner-only records | 20 | `REVIEW`; excluded from every write set. |

The plan names only the future market-value/audit targets:
`football_player_market_values`,
`football_player_market_value_history`,
`football_market_value_import_runs`,
`football_market_value_import_items`, and
`football_market_value_job_runs`.
It explicitly protects card tier, card price, contract and club assignment;
there is no card, roster, tier, price or contract mutation path here.

## Evidence and validation

All checks were local and used synthetic canonical bindings only:

```sh
node --test --experimental-strip-types \
  tests/touchline-owner-approved-market-value-application-plan.test.mts \
  tests/touchline-owner-approved-market-value-binding.test.mts
pnpm exec tsc --noEmit --incremental false
pnpm exec eslint \
  lib/touchlineArena/owner-approved-market-value-application-plan.ts \
  tests/touchline-owner-approved-market-value-application-plan.test.mts
git diff --check
```

Results: focused tests **10/10 passed**; strict TypeScript and focused ESLint
passed; `git diff --check` passed. The source-capability test confirms the
planner has no environment, HTTP, server-only, Supabase/client, query or
mutation capability.

The complete repository gate also passed after the associated stale
Market-squad source assertion was updated to reflect its existing `useMemo`
implementation: **834/834 tests**, full ESLint, and the Webpack production
build passed. This did not invoke a database, provider, or deployment.

## Non-actions and next gate

No credential was read or printed. No database/provider request, write, sync,
migration, cache invalidation, Preview, production deployment, card change or
market-value application occurred.

The next separate gate remains unchanged: an explicitly authorized, stable,
two-pass canonical read must first produce a real dated 533-row UUID binding.
Only after that evidence, an approved **atomic** writer with transaction,
idempotency, rollback/preflight and post-write verification may be proposed.
The existing generic sequential importer is not this atomic writer and is not
authorized for this batch.
