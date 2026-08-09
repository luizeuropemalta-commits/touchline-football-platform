# Dedicated roster exporter — remote scope validation

**Recorded:** 2026-08-09  
**Project:** `TouchLine Arena` (`vxireiswggllwhbsmdcj`)  
**Status:** `NO_GO — REMOTE ROLE NOT CREATED; TOKEN NOT ISSUED; EXPORT NOT RUN`

## Purpose

Validate whether a dedicated `touchline_roster_exporter` principal can be
created with the owner-approved boundary: `SELECT` only for the five
canonical roster-export tables, no service role, no public-access expansion,
no DML, no RPC, no Storage, and no Auth administration.

The five requested tables are `football_competitions`, `football_clubs`,
`football_players`, `football_squad_members`, and
`football_data_sync_runs`. The intended data scope is Sportmonks competition
`8` and its 20 declared provider-team IDs.

## Remote read-only evidence

The authenticated Supabase dashboard was used only as `postgres` in SQL
Editor for metadata `SELECT` queries. No roster/player row was selected and
no DDL or DML statement was run.

The first metadata result established that:

- `touchline_roster_exporter` does not exist remotely;
- the five target table policies are currently `SELECT TO authenticated USING
  (true)`; none applies to a dedicated exporter role; and
- no table grant from `PUBLIC` exists for those five tables.

The second metadata result established the effective implicit privileges a
new PostgreSQL role would inherit through `PUBLIC`:

- database `postgres`: `CONNECT` and `TEMPORARY`;
- schema `public`: `USAGE`; and
- `EXECUTE` on a non-empty catalogue of `public` functions, including
  application functions such as `create_ecosystem_organization`,
  `handle_new_user`, `reserve_founder_plan_slot`,
  `search_global_football_links`, and
  `search_global_player_profiles`.

PostgreSQL has no per-role deny that overrides a `PUBLIC` grant. Therefore a
new `LOGIN` or PostgREST role would inherit function execution even if it were
granted `SELECT` only on the five tables. A direct database role could also
create temporary objects through the inherited database privilege.

## Decision and blocked acceptance criteria

The proposed role fails the following required criteria before creation:

| Criterion | Result | Evidence |
| --- | --- | --- |
| Only five roster tables / 20-club scope | not applicable | role does not exist and needs dedicated RLS policies |
| No `INSERT`, `UPDATE`, `DELETE` | not yet provable | no role was created for effective-permission tests |
| No RPC/function capability | **failed by design** | inherited `PUBLIC EXECUTE` catalogue |
| No broader platform access | **failed by design** | inherited `PUBLIC CONNECT`, `TEMPORARY`, schema use and function execution |
| No service role / no public expansion | pass for non-action | neither was used or changed |

Creating the role, issuing a password/JWT, or running the export would not
be safe while the no-RPC/no-broad-access criteria fail. The two roster extras
remain untouched and `PRESERVED_UNIDENTIFIED_PENDING`; no value, membership,
sync, card, or data change occurred.

## Why the narrow role cannot be applied now

The only direct way to remove the function capability is to revoke
`EXECUTE` from `PUBLIC` and regrant every required function to the existing
application roles. That is a project-wide authorization change with unknown
callers and possible product impact. It is not a narrow five-table role
change, and it would breach the owner's no-broadening condition without a
separate impact review and explicit authorization.

The existing exporter also accepts only a Supabase `authenticated` JWT.
That role is broad under the current policies. A direct PostgreSQL login would
instead require a separately hardened transport and process-only database
credential; it would still fail because of the implicit `PUBLIC` privileges.

## Safe future path — not approved or implemented

1. Inventory all `PUBLIC` function callers and create an impact-reviewed
   replacement grant matrix.
2. Obtain specific authorization for any project-wide `PUBLIC EXECUTE` and
   database `TEMPORARY` privilege change; do not infer it from the roster
   export authorization.
3. Create a dedicated role with `NOINHERIT`, `NOSUPERUSER`, `NOBYPASSRLS`, no
   memberships, only column-level `SELECT` on the five tables, and restrictive
   policies for provider `sportmonks`, competition `8`, and the 20 team IDs.
4. Prove effective permissions with metadata-only negative checks: target
   `SELECT` allowed; all target DML, every non-target table, schema creation,
   function execution, RPC, Storage, and Auth administration denied.
5. Only then issue a short-lived process-only credential, perform the
   revision-fenced export, stop on partiality/duplicates, remove the local
   credential from the process, and record revocation metadata without any
   secret value.

## Non-actions and rollback

No role, password, JWT, RLS policy, grant, function privilege, database
object, Auth user, export, sync, migration, deployment, or data row was
created or changed. Consequently no remote rollback is required. The
previous documented credential proposal remains historical context; this
report is the controlling remote validation result.
