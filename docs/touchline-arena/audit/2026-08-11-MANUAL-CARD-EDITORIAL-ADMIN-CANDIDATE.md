# Manual Card Editorial Admin Candidate — 2026-08-11

## Status

**LOCAL COMPLETE / DATABASE NOT TOUCHED / NOT DEPLOYED**

This candidate makes the existing shared editorial-card contract manageable
through one protected owner workflow. It does not use a valuation provider,
Sportmonks request, payment, checkout, contract mutation, roster sync, Vercel
setting or production database write.

## Operator flow

1. Open `/admin/manual-card-editorial` as a TouchLine owner.
2. Search the canonical player list and select exactly one player.
3. Enter a whole private EUR decision, season, internal note/source and one
   editorial state: `draft`, `review` or `published`.
4. The server validates the exact current player → club → one active
   Sportmonks Premier League membership chain before it can write anything.
5. The shared `card-engine` calculates tier and nominal TC price. The editor
   never types a tier or price independently.
6. `draft` and `review` remain private. Only `published` projects a tier and
   nominal display price to shared cards; manual EUR and internal evidence do
   not cross the public boundary.

The same page also has a club-scoped bulk **preview** for up to 50 rows:

```text
PLAYER NAME | MARKET VALUE | optional EUR
```

It returns `READY`, `AMBIGUOUS`, `NOT_FOUND`, `WRONG_CLUB`,
`NO_ACTIVE_MEMBERSHIP`, `DUPLICATE` or `REVIEW_REQUIRED`. It is read-only and
cannot publish rows while the migration is unapplied.

The protected workflow now renders its owner-facing copy in **EN/PT**. That
includes the one-player editor, lifecycle actions, internal-only fields, the
club-scoped bulk preview and immutable-history/revert status. Locale changes
do not alter canonical player identity, tier calculation, publication state or
the private/public data boundary.

## New local files

- `supabase/migrations/051_touchline_manual_card_editorial_profiles.sql`
  creates a protected profile table plus immutable audit history. It is
  additive and unapplied.
- `lib/touchlineArena/manual-market-value-editorial.ts` is the pure,
  provider-free value → central classification → editorial card bridge.
- `app/api/admin/manual-card-editorial/route.ts` is owner-only and validates
  canonical player/current club/one active Premier League membership before a
  protected write.
- `app/(app)/admin/manual-card-editorial/page.tsx` and
  `components/admin-manual-card-editorial-actions.tsx` provide the one-player
  protected editor.

## Gates before a real save or release

1. Review and explicitly authorize applying migration 051 to the intended
   database. This block did **not** apply it.
2. Verify the deployed schema has the normalized football identity tables and
   the intended `touchline_manual_card_editorial_profiles` RLS/grants.
3. In an owner session, save one `draft`, verify the immutable history row,
   then promote it through `review` and `published` after a visual check.
4. Run full local release gates and a protected Preview/production validation
   before any deployment. Do not use the old bulk value importer for this
   workflow.

## Validation performed locally

```text
node --test --experimental-strip-types \
  tests/touchline-manual-market-value-editorial.test.mts \
  tests/touchline-manual-card-editorial-admin-boundary.test.mts \
  tests/touchline-editorial-card-profile.test.mts
# 15 passed, 0 failed

pnpm exec tsc --noEmit --incremental false
# passed

git diff --check -- <candidate files>
# passed
```

No secrets were read or printed.
