# 20-club roster reconciliation — local server-only candidate

**Recorded:** 2026-08-09

**Status:** `LOCAL_CANDIDATE_TESTED` / `NO_REMOTE_EXECUTION` / `HOLD_PRESERVED`
**Scope:** Sportmonks Premier League competition `8`; the configured 20
TouchLine provider-team IDs, including Liverpool only for roster audit and
excluding it from the 19-club manual-value scope.

## Purpose

This candidate adds a deterministic reconciliation **planner**, not a sync or
importer. It compares two explicitly supplied,
`touchline-canonical-roster-export-v1` snapshots:

1. a saved canonical baseline; and
2. an already-captured incoming Sportmonks snapshot.

The planner has no database client, provider client, HTTP route, scheduler,
filesystem access, environment read, or apply function. It cannot contact or
change production. The thin server-only facade prevents a client bundle from
importing the planner, while the pure core remains locally testable.

## Candidate artifacts

- [Pure planner](../../../lib/football-data/twenty-club-roster-reconciliation.ts)
- [Server-only facade](../../../lib/football-data/twenty-club-roster-reconciliation-server.ts)
- [Focused test suite](../../../tests/touchline-twenty-club-roster-reconciliation.test.mts)
- [Existing owner-value offline staging/reconciliation](../market-values/manual-2026-27/owner-approved-transcript-2026-08-09/owner-approved-market-values-2026-08-09.reconciliation-report.json)

The facade `prepareTouchlineTwentyClubRosterReconciliation()` accepts only
already-captured in-memory input and returns a plan marked
`execution: "dry-run-only"` and `applicationEligible: false`. It is not wired
to an API route, sync starter, market-value importer, database client, or UI.

## Safety contract

Every accepted snapshot must have valid `exportedAt`, source `runId`, source
revision, one fresh Sportmonks competition `8`, exactly the configured 20
team IDs, valid club/player/membership UUIDs, numeric provider player IDs,
matching current club and active membership, and source timestamps.

The following block the entire plan with zero proposed operations:

| Condition | Result |
| --- | --- |
| Missing/duplicated club or empty scoped response | `BLOCKED_PARTIAL_PROVIDER_RESPONSE` |
| Invalid snapshot provenance | `BLOCKED_INVALID_SNAPSHOT_PROVENANCE` |
| One provider player ID active more than once | `BLOCKED_DUPLICATE_PROVIDER_PLAYER_ID` |
| One canonical player with multiple active scoped memberships | `BLOCKED_DUPLICATE_ACTIVE_MEMBERSHIP` |
| Invalid provider/current-club/competition/freshness binding | `BLOCKED_INVALID_ACTIVE_MEMBERSHIP` |

A complete input still does not produce a write. It can only classify records
for review:

- `NO_CHANGE`
- `ADD_REVIEW_REQUIRED`
- `TRANSFER_REVIEW_REQUIRED`
- `PRESERVE_UNSEEN_REVIEW_REQUIRED`

An absent member in the incoming snapshot is explicitly preserved for review;
the candidate never proposes an implicit inactivation or deletion. A
Newcastle-to-Arsenal Bruno Guimaraes transfer is therefore a review-only,
audit-ready delta, never a one-player patch.

## Owner-list completeness and the two extras

When the planner receives owner roster rows in addition to the two canonical
snapshots, a valid active member in the manual 19-club scope without an exact
normalised owner roster row is returned only as:

```text
reconciliationState: QUARANTINED
manualValueState: PENDING
applicationEligible: false
market value: absent
```

It includes the canonical player, club and membership IDs plus source
timestamps for later human review. The planner does not write
`QUARANTINED` to `football_squad_members`; that table has no such status.
Liverpool remains audit-only/out of manual-value scope and is never falsely
quarantined solely because it is absent from the 19-club value staging.

No current claim is made that the two alleged extras have been identified: the
required remote read-only export remains under the separate SQL-editor HOLD.
This candidate only guarantees their future report-only treatment after a
complete, provenance-bearing input exists.

## Local validation

Executed from the candidate worktree without database, provider, sync, deploy
or browser activity:

```text
node --test --experimental-strip-types tests/touchline-twenty-club-roster-reconciliation.test.mts
# 6 passed, 0 failed

pnpm typecheck
# passed

pnpm exec eslint lib/football-data/twenty-club-roster-reconciliation.ts \
  lib/football-data/twenty-club-roster-reconciliation-server.ts \
  tests/touchline-twenty-club-roster-reconciliation.test.mts
# passed
```

The focused test proves complete-plan behavior, partial-response blocking,
duplicate provider-ID and active-membership blocking, a complete
Newcastle-to-Arsenal transfer classified for review, quarantine/PENDING
output for an unmatched manual-scope member, Liverpool exclusion from that
manual scope, and absence of client/provider/environment/I/O/DML/executor
capabilities in the new modules.

## Separate future application plan — not implemented

1. After the independent SQL-editor gate is explicitly reopened for
   read-only work, capture a new revision-fenced canonical 20-club roster
   export under a least-privilege, database-enforced read-only identity.
2. Archive the new export without overwriting historical artifacts, then run
   this local planner against the previous canonical export and the newly
   captured input.
3. Stop if any blocker, duplicate, incomplete coverage, stale source, or
   identity conflict is present. Produce report-only quarantine/PENDING rows
   for DB-only members and preserve every existing membership.
4. Have a human review every add, transfer, unseen member, identity binding,
   and value match. Generate a separate immutable preflight containing the
   exact before/after delta, expected revisions, actor, audit references and
   rollback snapshot.
5. Only after a specific later write authorization, use a **new**, protected,
   per-club atomic executor with optimistic revision checks, append-only audit
   records, post-commit readback and compensating rollback. That executor is
   deliberately not part of this candidate.

## Non-actions

This candidate did not query or modify a database, invoke Sportmonks, run a
sync, generate a migration, apply an import, change a membership, deploy, or
open Preview. It does not alter the pending owner-value staging or historical
Liverpool artifacts.
