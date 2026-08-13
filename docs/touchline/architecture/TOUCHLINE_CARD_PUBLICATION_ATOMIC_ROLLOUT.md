# TouchLine card publication — atomic rollout design

Status: **design complete; not migrated, not callable remotely.**

## Atomic command boundary

The protected Admin route must call one forward-migration database function,
not independently write four tables. Its input is a validated canonical
player/membership/competition tuple plus the reviewed manual EUR value,
effective season, calculated tier and nominal card price.

Inside one transaction, the function must:

1. lock the publication row for the player (`FOR UPDATE`);
2. re-check the current player, club and exactly one active Sportmonks
   Premier League membership;
3. lock and upsert `football_player_market_values`;
4. insert immutable `football_player_market_value_history`;
5. upsert `touchline_card_publications` with the calculated tier, nominal
   price and explicit lifecycle state;
6. insert immutable `touchline_card_publication_history`, including the exact
   previous publication and previous canonical value snapshots;
7. return the published safe projection only after all writes succeed.

Any validation or write error raises an exception so PostgreSQL rolls back the
complete operation. Cache tags are revalidated by the route only after this
successful return; cache revalidation is never treated as part of the
transaction and never makes an incomplete record public.

The current bulk interface is deliberately **preview-only**: it has no bulk
publish endpoint or sequential fallback, so it cannot partially apply a
batch. Before a bulk-publish control can be enabled, it must use a separate
staged atomic database command which validates *every* row before its first
value/publication write and rolls the complete batch back on any failure.

## Revert command boundary

The immutable publication-history record must contain both the prior
publication snapshot and the prior canonical value snapshot. Revert must lock
the current publication/value rows, restore the previous canonical value and
publication together, append both immutable histories and return only after
commit. A history entry without complete prior value + publication evidence is
not revertible.

The local route delegates only to this command. If migration 052 is absent it
returns a fail-closed 503 response; it no longer has a sequential fallback.

## Safe cutover

1. Apply the additive schema migration and atomic-command forward migration.
2. Keep the old public card read behaviour behind the explicit
   `TOUCHLINE_CARD_PUBLICATION_GATE=enabled` gate. It defaults disabled, so a
   code/schema deployment preserves only existing *verified* canonical cards
   while no new manual publication has been backfilled. This transitional
   path still suppresses the EUR value itself and all pending/unclassified
   cards.
3. Read only the existing canonical roster/value records and generate a
   backfill candidate; do not publish it automatically.
4. Validate every candidate's player UUID, current club, active membership,
   season, value, tier and nominal price. Quarantine any failure.
5. Execute an all-or-nothing dry run and retain counts/fingerprints.
6. Validate the candidate in the isolated Preview/local browser matrix.
7. Backfill and explicitly publish only the reviewed rows.
8. Verify published versus roster counts, card borders, neon, nominal prices,
   cache update and the absence of public pending cards.
9. Enable the public publication gate only after all previous checks pass.

Rollback is the inverse: disable the public publication gate first, use the
atomic revert command for the reviewed batch, verify counts/history, then
decide separately whether any forward schema remains in place. Historical
migrations are never deleted or edited.

## Nominal-price invariant

`calculated_price_tc` is a legacy-compatible field name only. It represents
the TouchLine nominal card price, not a wallet balance, fiat conversion or
launch-season payable amount:

| Tier | Nominal price |
| --- | ---: |
| Ruby Red | £0 |
| Sapphire Blue | £1 |
| Amethyst Purple | £2 |
| Radiant Gold | £4 |
| Emerald Green | £7 |
| Clear Diamond | £10 |
| Diamond Gold | £15 |

The complimentary launch season may make the amount payable £0; it must not
rewrite the nominal price or classification.

## Admin and new-player flow

The protected Admin page derives `NEW PLAYER · MARKET VALUE REQUIRED` alerts
only from the canonical Premier League roster. An alert requires one current
club, exactly one active Sportmonks membership in competition `8`, and either
no publication row or a `detected`/`market_value_required` lifecycle.

The alert is not a public card and does not trigger an external request, Git
commit or deployment. The owner resolves it through the protected sequence:

`canonical player → manual EUR value → tier engine → border/neon → nominal
price → review/preview → explicit publish → post-commit cache revalidation`.

Any ambiguous, transferred, inactive or non-Premier-League player produces no
alert and no publishable card until canonical identity is repaired. Reviewed,
ready and published records are intentionally absent from the alert queue.
