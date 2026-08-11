# Owner-approved 533 atomic backfill and cutover gate

**Date:** 2026-08-11
**Project:** TouchLine Arena (`vxireiswggllwhbsmdcj`, production primary database)
**Operator route:** authorized Supabase SQL Editor only
**Public cutover:** **OFF / BLOCKED**

## Immutable input

- canonical two-pass roster export: 588 active memberships across the 20
  Premier League clubs, with matching CSV hashes;
- deterministic publication manifest fingerprint:
  `3bd9a66abb1de959f704a2142e5c34b5ee938a4d2689eb8626a4b5234b66560b`;
- exact write set: **533** owner-approved EUR rows;
- permanent exclusions: **5** value-missing, **23** provider-only, **20**
  owner-only rows. None was supplied to the batch command.

## Remote schema and command evidence

The additive lifecycle migrations 051/052 and the additional, scoped 053
batch-safety migration are present. Migration 053 adds only protected batch
fingerprint/audit links and three `SECURITY DEFINER` commands:

1. prepare the exact 533 rows;
2. promote only a complete prepared 533-row batch; and
3. revert that exact batch through its immutable preparation-history links.

All three commands revoke `PUBLIC`, `anon` and `authenticated` execution and
grant execution only to `service_role`. No public grant, RLS relaxation,
provider sync, roster mutation, contract mutation, wallet/payment operation or
Stripe operation was made.

## Database-level proof before application

The actual 533-row manifest was exercised in database transactions, not only
in source tests:

- prepare: **1** batch + **533** publications + **533** history rows;
- promote: **533** published cards, **0** incomplete tier/nominal-price rows,
  **1,066** history rows total;
- idempotent replay: still **1 / 533 / 1,066**, never double-written;
- deliberately invalid row at the middle of the batch: command failed with
  `TL_CARD_PUBLICATION_COMMAND_INVALID`; explicit rollback left **0** new
  batch/publication/history rows and the prior **29** values;
- full batch revert: after prepare + promote + revert in one transaction,
  **0** published cards and **29** values remained; outer rollback then
  restored the database to its pre-proof state.

The SQL implementation was corrected during these dry runs for a numeric-ID
regex, UUID aggregation, internal CTE/column ambiguity and transaction-time
audit timestamp comparison. Every failed proof aborted before commit.

## Applied backfill

After the proofs passed, one explicit transaction prepared and promoted the
immutable 533-row manifest. The command returned:

`published | 533 | idempotent_replay = false`

Post-write evidence:

- **1** batch, **533** batch-history links, **533** publication rows and
  **1,066** publication-history rows;
- **562** verified market values total: the new 533 plus the pre-existing 29;
- inventory remained **600** (baseline 600) and contracts remained **0**
  (baseline 0);
- all prepared rows retained a canonical active membership and the exact
  tier/nominal-GBP policy check passed at command time.

## Cutover gate — intentionally not enabled

The 533 records span **19** clubs. The twentieth club, Liverpool, has **29**
pre-existing verified values and working legacy coloured cards but **zero**
rows in the new publication lifecycle. Enabling
`TOUCHLINE_CARD_PUBLICATION_GATE=enabled` now would hide those Liverpool cards
because the new read model deliberately exposes only `published` lifecycle
rows.

Therefore the production public gate remains **OFF**. No Vercel setting or
deployment was changed. The next safe local block is an immutable, canonical
Liverpool publication candidate from those existing 29 verified records,
followed by the same all-or-nothing proof. It must not infer or invent a new
value.

That read-only candidate is now archived at
`roster-audits/2026-08-11T19-32-00Z/liverpool-existing-verified-publication-manifest.json`:
**29 / 29** canonical Liverpool rows, all sourced from existing
`manual_approval` verified values, fingerprint
`ccbe56721b4747690df91ebea5800906a9545443428ba64acfd066848a66b490`.
It is still `review-required` and cannot write. Applying it would need a
separately reviewed atomic 29-row lifecycle command; the existing 533 command
correctly rejects it rather than weakening its exact-count fence.

## Local validation

Focused archive/binding/application/atomic-command checks: **13/13 passed**.
`git diff --check` passed for the batch migration and its focused regression
test. This record does not claim a browser/device or production-cutover pass.
