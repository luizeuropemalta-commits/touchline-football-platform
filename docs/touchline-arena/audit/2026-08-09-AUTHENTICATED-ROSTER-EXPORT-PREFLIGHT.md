# Authenticated 20-club roster export preflight

**Recorded:** 2026-08-09T18:27:31Z

**Status:** `BLOCKED_NO_AUTHENTICATED_READ_ONLY_CREDENTIAL`
**Scope:** select-only Sportmonks roster audit for Premier League competition
`8` and the configured 20 TouchLine provider-team IDs.

## Purpose

Luiz authorized only an authenticated, non-mutating read of the canonical 20
club rosters. This preflight verifies that the local export path cannot fall
back to a service role or silently use product credentials before it is run.

## Evidence

- Current process and current/sibling worktrees expose no dedicated
  `TOUCHLINE_ROSTER_EXPORT_*` variables and no `.env`/`.env.local` source.
  No secret value was printed or recorded.
- The exporter accepts only `TOUCHLINE_ROSTER_EXPORT_MODE=read-only`, an anon
  JWT with `role=anon`, and a dedicated bearer JWT with
  `role=authenticated`, `aud=authenticated`, and an issuer matching the
  configured HTTPS project URL. It rejects service-role semantics.
- A sanitized `env -i … export-touchline-canonical-roster-readonly.mjs
  --check` invocation returned
  `TL_ROSTER_EXPORT_READ_ONLY_MODE_REQUIRED` (exit `1`) before
  `createClient`, database connection, provider request, or local export.
- The exporter now requires an explicit `--check` or `--write-new`, runs two
  full snapshots behind a revision fence, and marks the audit incomplete on
  partial coverage, exception, duplicate provider player ID, duplicate active
  membership, or duplicate membership ID.

The immutable preflight manifest with all requested provider-team IDs is:
`docs/touchline-arena/market-values/manual-2026-27/owner-approved-transcript-2026-08-09/roster-audits/2026-08-09T18-27-31Z/read-only-export-preflight.json`.
Its command/test result record is
`docs/touchline-arena/market-values/manual-2026-27/owner-approved-transcript-2026-08-09/roster-audits/2026-08-09T18-27-31Z/validation-results.txt`.

## Result and risk

No canonical player, club, membership, freshness, or extra-player data was
read. Consequently no club is claimed complete or partial, and the two alleged
extras remain `PRESERVED_UNIDENTIFIED_PENDING`: no ID, value, status, or
membership was altered.

Using a service-role credential to force progress would violate the
read-only-credential requirement; no such fallback is implemented.

## Minimum next step

Inject a dedicated authenticated **read-only** session for this process only,
with the four documented `TOUCHLINE_ROSTER_EXPORT_*` names. Then run the
explicit export into a new UTC directory using `--write-new`, self-validate it
with the 20-club planner, and emit non-overwriting reconciliation/quarantine
artifacts. A non-ready export remains a blocker, not an input to import or
sync.

No DB write, SQL mutation, sync, migration, deploy, Preview, or credential
disclosure occurred.
