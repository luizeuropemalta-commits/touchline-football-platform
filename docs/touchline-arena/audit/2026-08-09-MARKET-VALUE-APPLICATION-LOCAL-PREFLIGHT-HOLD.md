# Owner-approved market-value application — local preflight HOLD

**Recorded:** 2026-08-09
**Status:** `HOLD — LOCAL CANDIDATE ONLY / NOT DATABASE-EXECUTABLE`
**Scope:** local inspection and validation only. No database connection, SQL,
sync, migration, provider request, Preview, deployment, or value write was
performed.

## Purpose

Revalidate whether the owner-approved 2026/27 market-value candidate can move
from a provider-ID/name staging package into a safe, idempotent TouchLine
application plan. The required proof is an immutable canonical roster export
that binds every proposed value to one TouchLine player UUID, the exact
Sportmonks player/team IDs, the player's current club, and one active
competition-8 membership.

## Local evidence

The existing immutable local package remains the controlling input:

`docs/touchline-arena/market-values/manual-2026-27/owner-approved-transcript-2026-08-09/application-candidates/2026-08-09T19-25-39-089Z/`

Its manifest (`application-manifest.json`) is deterministic and records:

| Local dry-run state | Count | Treatment |
| --- | ---: | --- |
| Exact owner × Sportmonks name/team pair | 538 | staging pair only |
| Explicit EUR values | 533 | `READY_AFTER_CANONICAL_UUID_BINDING`; not executable |
| Matched rows without owner value | 5 | `PENDING_VALUE_MISSING`; null value; excluded |
| Provider-only roster rows | 23 | `PROVIDER_ONLY_REVIEW_PENDING`; null value; excluded |
| Owner-only rows | 20 | `OWNER_ONLY_REVIEW_PENDING`; no provider assignment/value proposal |
| Ambiguous name groups | 0 | required zero for the local candidate |

Every staged row has a deterministic
`row_idempotency_key_sha256`; every row is still
`application_eligible: false`. The five missing values remain Denner,
Mykhaylo Mudryk, Julian Eyestone, Dermot Mee, and Leo Shahar. They were not
converted to EUR 0 or a fallback tier/price.

## Schema and importer boundary

`supabase/migrations/050_touchline_market_value_engine.sql` supplies the only
future data targets permitted for this batch:

1. `football_player_market_values`;
2. `football_player_market_value_history`;
3. `football_market_value_import_runs`;
4. `football_market_value_import_items`; and
5. `football_market_value_job_runs`.

It does not provide a durable candidate-fingerprint or per-row idempotency-key
constraint. Therefore the current package is an idempotent *local proposal*,
not an executable importer: a later atomic executor must lock a batch
fingerprint, reject a different source under the same batch, and treat an
identical row-key/value/season replay as unchanged without duplicating history.

The existing `lib/touchlineArena/market-value-import-server.ts` is expressly
not approved for this candidate: it does not prove exact canonical
UUID/current-club/active-membership binding for every row, is not a full-batch
transaction, and can turn a pending input into a null current value. No new
executor was generated in this block because the mandatory identity input is
absent and the requested fail-closed stop condition applies.

No permitted plan may write `football_players`, `football_clubs`,
`football_squad_members`, `touchline_card_inventory`, contracts, price
catalogues, tiers, colours, offers, wallets, or roster state. Migration 050
also removed the old inventory reclassification triggers, so a correctly
scoped future write cannot mutate stored inventory/contract price or tier.
Public uncontracted cards may still derive displayed tier/colour/nominal price
from a newly verified value; that presentation policy remains a separate
post-application product and visual-QA gate, not a persistent write in this
batch.

## Concrete blocker

There is no local `touchline-canonical-roster-export-v1` containing canonical
player UUID, canonical club UUID, active membership UUID/status, competition
8, and source timestamps. The two archived direct Sportmonks snapshots contain
only provider identities and cannot substitute for that proof.

The dedicated configuration required by
`scripts/export-touchline-canonical-roster-readonly.mjs` is also absent by
presence-only inspection:

- `TOUCHLINE_ROSTER_EXPORT_MODE`;
- `TOUCHLINE_ROSTER_EXPORT_URL`;
- `TOUCHLINE_ROSTER_EXPORT_ANON_KEY`; and
- `TOUCHLINE_ROSTER_EXPORT_ACCESS_TOKEN`.

No secret value was read, copied, printed, or recorded. A generic authenticated
or service-role credential is not an acceptable substitute: the former is not
least-privilege under the recorded RLS/grant model, while the exporter rejects
the latter.

**Result:** the 533 rows cannot truthfully be UUID/membership-bound or made
database-application eligible in this block. This HOLD does not change the 20
owner-only `REVIEW`, five owner-value `PENDING`, or 23 provider-only
`PENDING` records.

## Validation performed locally

All commands ran with the bundled local Node runtime and no credentials:

```text
node --check scripts/build-owner-approved-sportmonks-application-candidate.mjs     PASS
node --test --experimental-strip-types tests/owner-approved-sportmonks-application-candidate.test.mts     PASS (6/6)
node scripts/build-owner-approved-sportmonks-application-candidate.mjs --check     PASS
pnpm typecheck     PASS
pnpm lint          PASS (only the existing ArenaClient Babel-size note)
git diff --check   PASS
```

The dry-run output exactly reproduced the candidate fingerprint
`60c03e7858bc0fd379f7ca183174f9f6612dc098e709f34061c301a1597564b5` and the
`538 / 533 / 5 / 23 / 20 / 0` count vector. The focused tests additionally
prove deterministic keys, partial/ambiguous/duplicate fail-closed behavior,
excluded pending/review rows, and no provider/database/sync/mutation capability
in the local candidate generator.

**Persistent checkpoint:** `f9b91bc108b9b885f20c82383707dffd93530dd3`
(`docs(market-values): record application preflight hold`).

## Minimum next gate

Do not write any data. First provision or inject a demonstrably least-privilege
read-only capability outside this worktree, then create a fresh, versioned
canonical roster export with an immutable revision fence. A local binding
dry-run may proceed only when all 533 explicit rows uniquely prove the required
UUID/team/current-club/active-membership relationship and every duplicate,
transfer, partial-response, and 20-club coverage exception is classified.
Only after that evidence, a separate atomic executor, rollback preflight,
card-presentation decision, and explicit write authorization may be proposed.

## Links

- Existing application-candidate evidence:
  `docs/touchline-arena/audit/2026-08-09-OWNER-APPROVED-SPORTMONKS-MARKET-VALUE-APPLICATION-CANDIDATE.md`
- Earlier credential/export preflight:
  `docs/touchline-arena/market-values/manual-2026-27/owner-approved-transcript-2026-08-09/roster-audits/2026-08-09T18-27-31Z/read-only-export-preflight.json`
- Future export contract:
  `scripts/export-touchline-canonical-roster-readonly.mjs`
- Local candidate generator:
  `scripts/build-owner-approved-sportmonks-application-candidate.mjs`
