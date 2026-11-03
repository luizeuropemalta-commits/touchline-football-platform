# Avatar QA — owner-authorized repair runbook

Status: **EXTERNAL / NOT APPLIED / PHOTO FLOW NOT APPROVED**. Documentation only, 2026-11-02.

## Scope and prerequisite

Target exclusively Supabase QA **xgxbwqxjssxxuihuwmgy** (TouchLine Development QA). Verify the project reference in the authenticated dashboard and connection endpoint before opening a transaction. `current_database() = postgres` does not distinguish QA from Production. Do not include connection strings, tokens, JWTs, or personal documents in receipts.

The recorded hosted executor is nonsuperuser `postgres`; it cannot replace the writer-owned guard. CREATEROLE alone is not proof of authority. This runbook must be performed by Supabase support or an explicitly authorized database owner with authority to replace `touchline_avatar_private.assert_actor(uuid)` while retaining `touchline_avatar_writer` ownership and to create a postgres-owned helper. If that authority is absent, stop this operation; continue unrelated work. Do not grant writer membership to application roles or disable identity checks.

Recorded cause: seven avatar RPC paths reach a writer-owned INVOKER guard that accesses `auth.uid()` and `auth.users`, while writer lacks auth schema access. This receipt is historical evidence, not a fresh hosted inspection: `artifacts/avatar-auth-independent-20261102/receipt.json`.

## 1. Capture preimage before mutation

Save results privately in the QA change receipt. Preserve exact `pg_get_functiondef`, owner, ACL and configuration; these are the rollback preimage. Capture current role memberships including all membership options, and migration history for the affected versions. Abort if the bridge already exists or the guard differs from the reviewed original; reconcile first.

```sql
select current_user, session_user, version();
select oid, rolname, rolsuper, rolinherit, rolcreaterole, rolcanlogin
from pg_roles where rolname in ('postgres','touchline_avatar_writer');
select * from pg_auth_members
where roleid in (select oid from pg_roles where rolname in ('postgres','touchline_avatar_writer'))
   or member in (select oid from pg_roles where rolname in ('postgres','touchline_avatar_writer'));
select nspname, pg_get_userbyid(nspowner) owner, nspacl
from pg_namespace where nspname in ('auth','touchline_avatar_private');
select c.oid::regclass, pg_get_userbyid(c.relowner) owner, c.relacl
from pg_class c where c.oid='auth.users'::regclass;
select attname, attacl from pg_attribute
where attrelid='auth.users'::regclass and attname in ('id','deleted_at');
select p.oid::regprocedure, pg_get_userbyid(p.proowner) owner,
       p.prosecdef,p.proconfig,p.proacl,pg_get_functiondef(p.oid)
from pg_proc p where p.oid in (
 to_regprocedure('auth.uid()'),
 to_regprocedure('touchline_avatar_private.assert_actor(uuid)'),
 to_regprocedure('touchline_avatar_private.assert_auth_identity(uuid)'));
select * from supabase_migrations.schema_migrations
where version in ('20261003014410','20261102002000','20261102002338');
```

Also record existing effective privileges with `has_schema_privilege`, `has_function_privilege`, and `has_column_privilege`, and any default ACL entries affecting newly created functions. A NULL ACL means defaults, not no permissions. Do not change migration history manually just to report success.

## 2. Preferred transaction — narrow bridge, no membership mutation

This is an owner-authorized variant of migration `20261102002338`, not an instruction to retry failed role escalation. Execute as one transaction with stop-on-error. Recheck QA target immediately before execution. The helper owner must have actual auth access; `postgres` name alone is insufficient.

```sql
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
do $$
begin
 if to_regprocedure('touchline_avatar_private.assert_auth_identity(uuid)') is not null then
   raise exception 'BRIDGE_ALREADY_EXISTS_RECONCILE_FIRST';
 end if;
 if not exists (select 1 from pg_proc
   where oid=to_regprocedure('touchline_avatar_private.assert_actor(uuid)')
     and proowner=(select oid from pg_roles where rolname='touchline_avatar_writer')
     and not prosecdef) then
   raise exception 'GUARD_PREIMAGE_CHANGED';
 end if;
end $$;
create function touchline_avatar_private.assert_auth_identity(p_actor uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_actor is null then raise exception 'AVATAR_INVALID_ACTOR'; end if;
 if auth.uid() is not null and auth.uid() <> p_actor then
   raise exception using errcode='42501',message='AVATAR_AUTH_SUBJECT_MISMATCH';
 end if;
 if not exists(select 1 from auth.users where id=p_actor and deleted_at is null) then
   raise exception 'AVATAR_AUTH_IDENTITY_UNAVAILABLE';
 end if;
end $$;
alter function touchline_avatar_private.assert_auth_identity(uuid) owner to postgres;
-- Remove every initial grantee, including custom default-ACL grantees.
do $$ declare r record; begin
 for r in select distinct a.grantee from pg_proc p,
   lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   where p.oid='touchline_avatar_private.assert_auth_identity(uuid)'::regprocedure
 loop
   if r.grantee=0 then
     execute 'revoke all on function touchline_avatar_private.assert_auth_identity(uuid) from public';
   else
     execute format('revoke all on function touchline_avatar_private.assert_auth_identity(uuid) from %I',pg_get_userbyid(r.grantee));
   end if;
 end loop;
end $$;
grant execute on function touchline_avatar_private.assert_auth_identity(uuid)
 to touchline_avatar_writer;
create or replace function touchline_avatar_private.assert_actor(p_actor uuid)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_actor is null or p_actor::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
   raise exception 'AVATAR_INVALID_ACTOR';
 end if;
 perform touchline_avatar_private.assert_auth_identity(p_actor);
end $$;
-- Inspect before COMMIT: guard owner/ACL/config unchanged; helper definer,
-- owner postgres, empty search_path, EXECUTE only writer (owner retains ownership rights).
-- Compare all memberships and auth ACLs to preimage: no changes permitted.
-- Execute identity probes below using SAVEPOINTs, then COMMIT only if all pass.
```

No COMMIT is supplied blindly: the authorized operator must inspect the transaction and execute `COMMIT;` only after the checks below; otherwise `ROLLBACK;`. CREATE OR REPLACE preserves guard ownership and ACL. Do not run the repository migration's temporary GRANT/REVOKE as independent statements. No runtime role membership changes are required by this variant.

## 3. Identity and privilege probes before commit

Use QA fixture IDs obtained through authorized records; do not print private user data. Each expected exception must be inside a savepoint and followed by rollback to that savepoint, so a negative test does not abort later checks. Set JWT claims locally only inside this provider-owned test transaction; do not issue forged client tokens or change application authentication.

- As writer: valid known live actor, null subject (service path) succeeds; matching JWT subject succeeds. Null subject is intentional for the service RPC path, whose server authenticates and binds actor before calling.
- As writer: `set_config('request.jwt.claim.sub', other_fixture_uuid, true)` followed by `assert_actor(actor_uuid)` raises `42501 / AVATAR_AUTH_SUBJECT_MISMATCH`.
- Null actor raises `AVATAR_INVALID_ACTOR`; a valid-format UUID confirmed absent from auth raises `AVATAR_AUTH_IDENTITY_UNAVAILABLE`.
- Existing deleted QA identity, if available, raises identity unavailable. Do not create/delete a customer identity just for this check. If unavailable, record this hosted probe unproved and retain the local regression evidence separately.
- `anon`, `authenticated`, and `service_role` must not be able to execute the private helper directly, including inherited/PUBLIC privileges. Verify `has_function_privilege` and private schema ACLs. Verify writer has no new role memberships and no new auth schema/table grants.
- Inspect `pg_get_functiondef` and ACLs again; compare the guard's ACL and owner byte-for-byte/semantically to saved preimage. If any unexpected privilege appears, rollback.

Example negative probe pattern (substitute only verified fixture IDs):

```sql
savepoint identity_probe;
set local role touchline_avatar_writer;
select set_config('request.jwt.claim.sub','<other-live-QA-UUID>',true);
select touchline_avatar_private.assert_actor('<actor-live-QA-UUID>'::uuid);
-- Expected error. Then, as transaction owner:
rollback to savepoint identity_probe;
```

## 4. Application proof after committed authorized repair

Do not enable UI based solely on SQL success. With each of the two customer QA accounts: authenticated read/current; upload valid normalized image; verify new revision/current pointer; refresh/login; verify photo propagation to profile, discovery, ranking; replace image; repeat/recover operation without duplicate publication; reject actor mismatch, anonymous access, malformed/oversize upload and stale CAS. Record request status and sanitized operation IDs. Do not capture session secrets.

A replacement first confirms the new object and pointer. The old image is removed by the separate retention authorization/worker. Verify both its journal and actual object absence after cleanup; do not promise immediate physical deletion or claim only one stored object until measured. On uncertain publication, preserve recovery state; do not delete either object speculatively.

## 5. Rollback preserving pre-existing privileges

Before commit: `ROLLBACK;` restores the full transaction, including new helper and guard definition. No role memberships or auth grants were changed.

After commit: use the same authorized owner and QA target; begin a transaction, compare current definitions with this repair receipt (abort on later edits), execute the exact saved preimage `CREATE OR REPLACE FUNCTION ...assert_actor...` from step 1, verify original owner/config/ACL, then `DROP FUNCTION touchline_avatar_private.assert_auth_identity(uuid);` **without CASCADE**, only if the receipt proves this repair created it and no unexpected dependencies exist. Compare memberships/auth grants to preimage; commit only after equality. The restored original function remains blocked as before; record this honestly. Do not delete avatar rows, objects, audit, operations, or migration history as rollback.

If support chooses original-design auth grants instead of the bridge, it must grant only schema USAGE, auth.uid EXECUTE and auth.users SELECT(id,deleted_at), by their actual owners. Record which privileges were absent and which grantor added them. Rollback revokes only newly introduced grants from that grantor and never pre-existing table/column/function/schema privileges. No generic revoke-all rollback is acceptable. Obtain provider-reviewed exact SQL from the captured ACL preimage before this alternative.

## Delivery record

MISSION: document owner-authorized QA avatar recovery. SCOPE: runbook + evidence link only.
QA BRANCH/COMMIT: shared qa-stripe-release-20261029 WIP; no commit made by this task.
QA DEPLOYMENT: unchanged. REMOTE BUILD BUDGET / CONSUMED: 0 / 0.
STABLE QA URL: https://touchline-arena-official-git-qa-fifa-agent-plataform.vercel.app
FUNCTIONAL/SECURITY RESULT: plan reviewed locally; hosted authority and execution remain EXTERNAL.
VISUAL/RESPONSIVE/ACCESSIBILITY/BROWSER: not executed; no UI edits.
TESTS/BUILD: documentation checks only; no new runtime PASS.
OBSERVABILITY: prior receipt linked; preimage/after evidence mandatory at execution.
OPEN FINDINGS: provider-owner execution, hosted identity probes, real upload/replacement/retention proof.
PRODUCTION: NOT TOUCHED.

| Tool | Executed | Result |
|---|---|---|
| Local shell/file inspection | yes | document and receipt validation |
| Supabase remote | no | no mutation or fresh inspection in this task |
| Browser/build/deploy | no | outside scope |

Canonical completion gate: [TOUCHLINE_MISSION_FOOTER](../project-memory/TOUCHLINE_MISSION_FOOTER.md). This runbook does not satisfy application, hosted or device gates by its existence.
