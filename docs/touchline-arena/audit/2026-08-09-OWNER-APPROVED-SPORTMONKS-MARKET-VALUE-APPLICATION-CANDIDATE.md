# Owner-approved × Sportmonks market-value application candidate

**Recorded:** 2026-08-09
**Status:** `LOCAL PLAN ONLY — NOT DATABASE-EXECUTABLE`

## Purpose and boundary

This package joins owner-approved 2026/27 values to the archived direct
Sportmonks 20-club roster snapshot by exact normalized player name inside the
assigned provider team. It is a local evidence package and future-application
specification, not a migration, importer, sync, or database operation.

No TouchLine database, roster membership, player, card, contract, price,
colour, tier, offer, wallet, Preview, deployment, or provider request was
changed while producing it. The Sportmonks credential was not used again for
this local join and is not present in any artifact.

## Immutable inputs and output package

| Input or output | SHA-256 / revision | Role |
| --- | --- | --- |
| Owner CSV | `55dac15d…299cd3` | 558 owner-supplied transcript rows |
| Owner manifest | `3480156f…4df9a` | selected-message provenance |
| Owner selection | `192692cf…19f94` | ordered transcript selection |
| Sportmonks roster snapshot | `b3d4d672…7ae94d` | controlling direct-GET 20-club snapshot |
| Sportmonks source revision | `c332d196…9b4829` | sanitized snapshot revision |
| Candidate fingerprint | `60c03e78…64b5` | deterministic batch identity |

The dated package is preserved at:

`docs/touchline-arena/market-values/manual-2026-27/owner-approved-transcript-2026-08-09/application-candidates/2026-08-09T19-25-39-089Z/`

| Artifact | Meaning |
| --- | --- |
| `application-manifest.json` | hashes, candidate ID, counts, and future-write gates |
| `matched-owner-values.csv` | 538 exact club/name pairs with source-row and provider IDs |
| `provider-only-quarantined-pending.json` | 23 provider-only rows with null value |
| `owner-only-review.json` | 20 owner-only rows with no provider assignment/value proposal |

The generator uses a fresh UTC directory and `wx` file creation. It never
replaces an earlier package.

## Reconciliation result

| State | Count | Treatment |
| --- | ---: | --- |
| Exact owner × provider club/name pair | 538 | staged only; no canonical TouchLine UUID yet |
| Exact pair with explicit EUR value | 533 | `READY_AFTER_CANONICAL_UUID_BINDING` |
| Exact pair with missing owner value | 5 | `PENDING_VALUE_MISSING`, null value |
| Provider-only roster member | 23 | `PROVIDER_ONLY_REVIEW_PENDING`, `PENDING`, null value |
| Owner-only supplied row | 20 | `OWNER_ONLY_REVIEW_PENDING`, no provider assignment/value proposal |
| Ambiguous name group | 0 | required for a valid package |

The five matched-but-pending rows remain Denner, Mykhaylo Mudryk, Julian
Eyestone, Dermot Mee, and Leo Shahar. They are never converted to EUR `0`, a
Ruby tier, a fallback price, or an apply row.

The direct snapshot contains no `football_players.id`, canonical club UUID, or
active membership UUID. Therefore every one of the 538 rows remains
`application_eligible: false`. A Sportmonks player ID must not be placed in
the existing importer's `externalPlayerId`, because that field persists as a
Transfermarkt identifier.

## Future idempotent application — proposal only

No SQL migration is generated. A separate atomic executor may be proposed only
after a fresh versioned canonical roster export proves for every one of the 533
explicit-value rows: one canonical player UUID, the same Sportmonks player and
team IDs, current club equality, exactly one active competition-8 membership,
and human approval of every binding/conflict.

Each staged row has `row_idempotency_key_sha256`, derived from its owner row,
provider player/team pair, value, season, transcript selection, and provider
snapshot revision. A future executor must lock the candidate fingerprint,
reject a different source under that batch, and treat a replay of the same
key/value/season as unchanged without duplicating immutable history.

Only these future targets are permitted:

- `football_player_market_values`;
- `football_player_market_value_history`;
- `football_market_value_import_runs`;
- `football_market_value_import_items`; and
- `football_market_value_job_runs`.

It must exclude the five pending matched values, all 23 provider-only pending
records, and all 20 owner-only review records. It must not write player, club,
membership, inventory, card-contract, price-catalogue, offer, wallet, tier, or
colour data. The existing generic importer is not an executor for this batch:
it needs canonical UUIDs, is not full-batch transactional, and can null a
current value for a pending row.

## Tier, price, contract, colour, and visual QA boundary

The candidate changes none of those surfaces. Migration `050` disabled the
legacy player-value-to-inventory reclassification triggers, so a correctly
scoped future value write must not mutate stored inventory tier, stored card
price, active contract, or stored card colour.

Public, uncontracted card projections currently derive displayed tier/colour
and nominal price from a verified market value. Thus a later verified value
can change presentation without mutating inventory or a contract. This is a
separate product rule; the candidate does not hide it. Active-contract cards
retain their stored tier/price authority.

After a future authorized application, visual acceptance requires:

1. desktop (1280px) and mobile (390px) checks in `en-GB` and `pt-BR`;
2. one verified sample at each of the seven tier boundaries;
3. one provider-only `PENDING` card with neutral frame, explicit copy, and no
   invented commercial price/action;
4. one active-contract card retaining stored tier/price after a value refresh;
   and
5. profile, ClubHub, zoom, and Market surfaces checked for the same state.

The current profile zoom path does not yet propagate all canonical
market-value/classification state. It must be corrected or explicitly failed
before cross-surface equivalence is claimed. No product card was rendered from
this unapplied candidate.

## Local validation and remaining gate

Passed before the checkpoint:

- `node --check scripts/build-owner-approved-sportmonks-application-candidate.mjs`;
- `node --test --experimental-strip-types tests/owner-approved-sportmonks-application-candidate.test.mts` — **6/6**; and
- generator `--check` plus one `--write-new` archive run.

The focused test proves the precise `538 / 533 / 5 / 23 / 20 / 0` result,
source/provider-ID uniqueness, fail-closed partial/ambiguous/duplicate input,
deterministic idempotency keys, no database/provider/sync/mutation capability,
and prohibited persistent economic surfaces.

**Persistent candidate checkpoint:**
`a241ce7862a3b90450000bd70f4edc7a1b0c6ce6`
(`feat(market-values): stage owner Sportmonks application candidate`).

The next permitted step is a separately authorized immutable canonical
UUID/current-club/active-membership export and dry-run binding. It must also
resolve the recorded Bruno Guimarães Arsenal/Newcastle source conflict without
a one-player manual patch.
