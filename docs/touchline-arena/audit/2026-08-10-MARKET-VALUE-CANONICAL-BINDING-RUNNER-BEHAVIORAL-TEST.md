# Canonical value-binding runner — behavioral evidence

**Recorded:** 2026-08-10
**Status:** `LOCAL TEST COMPLETE / NOT EXECUTED AGAINST DATABASE`

## Purpose

The canonical value-binding adapter claims a two-pass revision fence. This
evidence validates that behavior with injected local readers rather than only
checking source text.

## Test seam

`lib/touchlineArena/owner-approved-market-value-binding-runner.ts` now holds
the pure batching and two-pass orchestration. The server-only reader remains
in `owner-approved-market-value-binding-server.ts` and injects into that pure
runner; the runner has no Supabase client, environment, provider, route or
write capability.

## Observed local cases

Using the immutable 2026/27 application candidate and synthetic canonical
bindings only:

1. **Stable read:** 19 team-local requests, each at most 60 IDs, ran twice;
   all 533 explicit EUR rows returned a review-only UUID/club/membership
   manifest. The `5 / 23 / 20` exclusions remained unchanged.
2. **Changed revision:** a different SHA-256 revision in one second-pass team
   response blocked the complete manifest and produced zero bound rows.
3. **Read failure/exception:** a blocked second pass and a thrown reader both
   became fail-closed manifests with zero rows; no partial result escaped.

The runner additionally rejects malformed reader echoes, missing SHA-256
revision fingerprints and invalid ready/blocked response shapes.

## Validation

```text
node --test --experimental-strip-types \
  tests/touchline-owner-approved-market-value-binding.test.mts \
  tests/owner-approved-sportmonks-application-candidate.test.mts \
  tests/owner-approved-transcript-reconciliation.test.mts \
  tests/touchline-market-value-import.test.mts
PASS: 25/25

pnpm typecheck
PASS

pnpm lint
PASS

git diff --check
PASS
```

No credential, database connection/query, provider request, import, sync,
migration, cache invalidation, Preview or deployment was performed. This is
behavioral coverage of local fake readers, not proof of current remote data.

## Gate

The actual 533-row UUID manifest remains uncreated until an authorized,
fresh canonical projection run passes the same fence. The runner does not
grant import authority; any later application still requires the separately
gated atomic executor, rollback/preflight evidence and explicit write
authorization.

**Persistent checkpoint:** `065a1cbc`
(`test(market-values): exercise canonical binding fence`).
