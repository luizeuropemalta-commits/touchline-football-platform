# Liverpool 29 existing-verified lifecycle publication

**Date:** 2026-08-11
**Scope:** the existing Liverpool verified-value set only
**Public gate at this checkpoint:** still off until production build/deployment

## Immutable source and command

- Source archive: `roster-audits/2026-08-11T19-32-00Z/liverpool-existing-verified-values.json`
  with source SHA-256
  `415f7fd96009c8d4b902b01e220bc904fbf075e5997f2908b79a8b2054f07522`.
- Deterministic 29-row manifest fingerprint:
  `ccbe56721b4747690df91ebea5800906a9545443428ba64acfd066848a66b490`.
- Dedicated additive migration:
  `supabase/migrations/054_touchline_existing_verified_liverpool_29_atomic_batch.sql`.
- The 533-row command is unchanged. The 29-row command only reads the
  already verified Liverpool market-value row and creates/progresses a
  protected publication-lifecycle row. It contains no insert, update or delete
  of `football_player_market_values`.

## Database proofs

The database command was exercised against the exact manifest before commit:

- prepare inside a transaction: 29 `ready_to_publish` rows; outer rollback;
- prepare + publish + lifecycle revert inside a transaction: 29 published,
  then 29 lifecycle rows reverted while all 29 existing verified values stayed
  intact; outer rollback;
- repeated prepare of the same fingerprint: one batch and 29 links only;
  outer rollback.

The committed command returned batch
`16c1b5dc-5aa4-4d9f-828c-c60e5a9d1a58`, `published`, **29**, replay `false`.

## Pre-cutover aggregate check

The protected published lifecycle now reports:

| Check | Result |
| --- | ---: |
| Owner-approved batch | 533 |
| Liverpool existing-verified batch | 29 |
| Published lifecycle cards | 562 |
| Unique players | 562 |
| Distinct Premier League clubs | 20 |
| Incomplete rows | 0 |
| Canonical membership mismatches | 0 |
| Duplicate players | 0 |
| Invalid nominal GBP prices | 0 |
| Wrong tier / fake Ruby | 0 |
| Fake GBP zero | 0 |
| Unverified values | 0 |

The immutable 5 missing-value, 23 provider-only and 20 owner-only review
records remain outside both write sets. No provider sync, card inventory,
contract, wallet, payment, Stripe or public RLS/grant change was made.

## Remaining cutover gates

1. full reviewed release validation and production build;
2. deployment of the reviewed Git SHA to `touchline.com.br`;
3. only then enable `TOUCHLINE_CARD_PUBLICATION_GATE=enabled` and deploy the
   environment cutover;
4. live 20-club/surface/viewport smoke test, with immediate gate disable on a
   P0 rendering or binding failure.
