# Roster exporter remote preflight — NO-GO

**Date:** 2026-08-11
**Scope:** Supabase administrative catalogue inspection only.
**Remote changes:** none.

## Intended capability

The proposed `touchline_roster_exporter` principal would read only the five
canonical roster tables required for the two-pass export:

- `football_competitions`
- `football_clubs`
- `football_players`
- `football_squad_members`
- `football_provider_mappings`

It must not receive a service-role key, DML, RPC, Auth administration, storage
or public access.

## Read-only evidence observed in the authorized Supabase dashboard

1. `touchline_roster_exporter` does **not** currently exist.
2. All five target tables have RLS enabled and no `PUBLIC` SELECT grant.
3. The generic `authenticated` role currently has effective SELECT, INSERT,
   UPDATE and DELETE table grants on all five target tables. It is therefore
   not a least-privilege substitute.
4. The `public` schema has **52 functions executable by `PUBLIC`**.

No secrets, data rows, tokens, values or customer records were viewed or
recorded.

## Decision

**NO-GO: do not create the exporter role or issue a token.**

PostgreSQL roles inherit `PUBLIC` privileges. Revoking `EXECUTE` from only the
new role does not override the 52 existing `PUBLIC` function grants. Creating
the requested role now would violate the required no-RPC boundary.

The only technical remedy is an independent, project-wide security hardening:
inventory every public function, revoke `PUBLIC EXECUTE` where appropriate and
regrant only explicit callers, then validate application behaviour. That is a
materially broader change than a read-only export principal and is not applied
here.

## Safe alternatives

1. Authorize and complete that separate global privilege-hardening project,
   then repeat this preflight before creating the dedicated exporter role.
2. Use a separately approved server-owned read path that already has an
   explicit application authority, while keeping the resulting roster export
   local/review-only. It must still pass the canonical two-pass,
   membership/UUID and no-write gates.

Neither option authorizes applying the 533 values, migrations, Vercel changes
or a production deployment.
