# Dedicated 20-club roster read credential — proposal and acceptance gate

**Recorded:** 2026-08-09

**Status:** `PRE_PLATFORM_CHANGE_PROPOSAL` — no credential, Auth user, RLS
policy, grant, database row, sync, migration, deployment, or export has been
created by this document.

## Target

Provision one revocable, non-interactive credential solely for the local
`export-touchline-canonical-roster-readonly.mjs` audit. It must authenticate
as a non-service-role principal and read only the canonical data needed to
construct a `touchline-canonical-roster-export-v1` for competition `8`:

| Object | Required operation | Required fields/purpose |
| --- | --- | --- |
| `football_competitions` | `SELECT` | resolve Sportmonks competition `8` |
| `football_clubs` | `SELECT` | resolve the exact 20 provider team IDs |
| `football_squad_members` | `SELECT` | active memberships and freshness |
| `football_players` | `SELECT` | UUID, provider ID, current club, identity/freshness |
| `football_data_sync_runs` | `SELECT` | observed sync context only; never row-level causality |

The credential must never be a `service_role` key, database owner,
`postgres`, broad API key, or a TouchLine owner/admin account. It must not be
stored in the repository, `.env*`, browser storage, deployment environment,
or committed artifact. It may be injected only into the one local process as
the four `TOUCHLINE_ROSTER_EXPORT_*` names already validated by the exporter.

## Current local RLS/auth evidence

Migration `013_football_data_foundation.sql` enables RLS on the five target
tables, defines `SELECT` policies `to authenticated`, and grants `SELECT` to
`authenticated`; its DML grants are explicitly `service_role` only. This is
enough for the exporter to avoid service-role access, but it does **not yet
prove** that a newly created generic `authenticated` user is restricted to
only these tables across the complete remote project.

## Minimum permissions and hard stop

The platform configuration is acceptable only when all of the following are
demonstrably true before provisioning:

1. the principal is non-interactive and carries only the intended
   read-audit identity/claim;
2. its effective role has no `INSERT`, `UPDATE`, `DELETE`, `RPC`, storage,
   Auth admin, realtime-write, payment, or deployment capability;
3. its effective RLS scope is limited to the five listed canonical tables and
   cannot read unrelated authenticated surfaces or user/private data;
4. no existing public/anonymous policy or RLS policy needs to be broadened;
5. the exporter validates HTTPS project issuer, `anon` key, and an
   `authenticated` access JWT before connecting; and
6. the credential can be revoked immediately without changing roster data or
   application access.

If the platform can only create a normal generic `authenticated` user whose
existing project-wide policies grant more access, or if a custom claim/role
would require an RLS/grant/migration change, **stop**. That would exceed the
authorized scope; no credential is to be created through that path.

## Risks

- A generic Supabase Auth user may inherit every policy addressed to
  `authenticated`, not just the football data policies.
- A service-role key can bypass RLS and is categorically unsafe for this
  audit, even when the client code issues only `SELECT`.
- Using a dashboard SQL Editor, custom database role, or JWT-signing secret
  to work around scoping would either broaden privileges or introduce a
  credential capable of mutation.
- The resulting export contains canonical player and membership identifiers;
  it must be archived locally as an immutable, versioned audit artifact and
  must not become a public asset.

## Acceptance criteria before creation

- Platform metadata proves the effective identity and exact read scope.
- No RLS, grant, migration, public access, deployment, or existing product
  credential needs to change.
- A safe revocation action is documented (disable/delete the dedicated Auth
  principal or revoke its session/refresh token); it is not executed during
  provisioning validation.
- A short-lived access token can be injected into one process without being
  written to disk or printed.
- A sanitized preflight exits before connection when any required token,
  issuer, or mode check fails.
- The first live use performs only the two-pass `SELECT` export, blocks on
  partial/duplicate/incoherent data, and writes only fresh local files with
  `wx`.

## Revocation / rollback plan

If a credential is provisioned, remove its process environment immediately
after the export. Revoke the dedicated principal's session/refresh token (or
disable/delete that dedicated principal) through the platform identity UI;
then retain only its identifier, creation/revocation timestamps and outcome in
the audit ledger. No football row is rolled back because this credential has
no data mutation path. Do not use this plan to delete any existing user or
credential; it applies only to a future newly created dedicated principal.
