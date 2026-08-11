# Canonical roster export and owner-approved binding — review-only

**Date:** 2026-08-11
**Remote scope:** two identical `SELECT` queries in the authorized Supabase SQL Editor.
**Remote writes:** none.

## Evidence

The query was limited to the current Premier League competition (`sportmonks`
competition `8`), the fixed 20 provider team IDs, active Sportmonks squad
memberships, and players whose current club matches that membership.

Two full CSV exports were created through the SQL Editor and compared locally:

- first/second result count: **588** rows each;
- raw CSV SHA-256: `4440e09420b6ab0e45e072ab2d0d512476a87d93b9435f190ece1be978274676` on both passes;
- canonical source revision: `e086ec65340f8de867850a55457967ce30a1eecd613a09c00503cc74c9c944b3`;
- canonical audit: **20 clubs**, **588 players**, **588 active memberships**,
  zero exceptional memberships, zero duplicate active memberships and zero
  duplicate provider player IDs.

The immutable local export is
`roster-audits/2026-08-11T18-31-00Z/canonical-roster-export.json`.
The derived reconciliation report and quarantine report are in the same
directory. They are evidence only, not import input.

## Exact UUID binding

The deterministic binding joined only the already-staged exact
`(provider_team_id, provider_player_id)` pairs to the fresh canonical export.
It did not match by name and it required a player UUID, current-club UUID,
active membership UUID, competition UUID and source timestamps for every row.

Result:

- **533 / 533** explicit-EUR rows bound exactly;
- **5** owner rows without a value remain `PENDING_VALUE_MISSING`;
- **23** provider-only rows remain pending/quarantined;
- **20** owner-only rows remain review-only;
- binding issues: **0**;
- manifest state: `review-required`, `applicationEligible: false`.

The review-only manifest is
`roster-audits/2026-08-11T18-31-00Z/owner-approved-canonical-binding-manifest.json`.
It is not an API payload and cannot execute a write.

## Gates still in force

1. Verify the remote migration state and apply the additive manual-editorial
   migrations only through their separate, atomic preflight.
2. Perform the transaction-level database dry run against this exact
   candidate/roster fingerprint.
3. Obtain an explicit write authorization for that immutable manifest.
4. Verify post-write counts and rollback evidence before enabling publication.

No player, card, price, tier, contract, value, membership, RLS policy,
credential, Vercel setting or production deployment changed in this step.
