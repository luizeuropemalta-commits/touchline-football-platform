# Bruno Guimaraes roster placement — product decision

**Recorded:** 2026-08-09  
**Authority:** Luiz Lopes, TouchLine owner  
**Source:** owner confirmation in Codex source thread
`019fdfb2-003a-7fa0-aa05-6b268b203143`  
**Status:** `PRODUCT_DECISION_RECORDED` / `HOLD_ACTIVE`

## Decision

Bruno Guimaraes belonging to **Arsenal FC** is intentional and correct for
the TouchLine product. A TouchLine presentation that still places him at
**Newcastle United** is a data-presentation discrepancy, not a reason to
reassign him to Newcastle or to change the owner-approved Arsenal source row.

## Evidence boundary

This is an owner product decision, not a database verification. Luiz further
confirmed that **Sportmonks is the definitive source for clubs, players, and
roster membership**. The owner-approved transcript is authoritative only for
the supplied market values; it never replaces roster identity evidence.

No canonical player UUID, Sportmonks player ID, active membership,
`source_updated_at`, or sync-run provenance was read or inferred while
recording this decision. The owner-approved transcript staging includes an
Arsenal FC Bruno Guimaraes row; that source remains identity-review-only until
the canonical reconciliation gate is satisfied.

## Active hold and non-actions

The canonical SQL Editor / roster-currency incident HOLD remains active. This
record authorizes none of the following:

- no manual player-club patch;
- no database read or write;
- no Sportmonks refresh, sync, import, migration, or export;
- no roster membership activation/inactivation, deletion, overwrite, or
  reassignment;
- no deployment or Preview action.

## Future resolution requirement

After the independent incident closure and a new explicit resume decision,
resolve the discrepancy only through the full 20-club canonical roster
reconciliation: versioned read-only export, UUID/provider-ID/current-club and
active-membership validation, reviewed atomic delta proposal, audit trail, and
rollback plan. A one-player/manual correction is explicitly out of scope.

### Minimum gate-closure proposal

1. Independently close the SQL Editor / roster-currency incident and record
   the closure evidence plus an explicit authorization to resume *read-only*
   export work.
2. Produce one new, immutable `touchline-canonical-roster-export-v1` for the
   20 configured Sportmonks team IDs. It must contain club/player UUIDs,
   numeric provider IDs, competition `8`, active memberships,
   `source_updated_at`, source revision, and run provenance.
3. Validate coverage, duplicate active memberships, current-club agreement,
   identity uniqueness, and membership freshness before joining any value row.
   Preserve invalid, unmatched, and DB-only rows as review/quarantine report
   entries; do not silently drop or mutate them.
4. Reconcile the 19-club owner-value staging only by unique canonical
   UUID/provider-ID/current-club matches. Treat Arsenal/Bruno as an expected
   canonical outcome to report, not as a manual override. Emit a new dated,
   non-overwriting reconciliation and `QUARANTINED/PENDING` report.
5. Only after the resulting reviewed delta, audit trail, and rollback plan are
   accepted may a separate write proposal be considered. This document grants
   no write or sync authority.
