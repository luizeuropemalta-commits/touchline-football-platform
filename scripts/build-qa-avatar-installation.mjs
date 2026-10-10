import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const QA_PROJECT_REF = "xgxbwqxjssxxuihuwmgy";
export const SOURCES = Object.freeze([
  ["supabase/qa/057_touchline_qa_owner_avatar_preservation.sql", "f8740508962f4cc81e6846fc30325ea6675c34553f9162eb206e81834356ffda"],
  ["supabase/migrations/20261003014410_touchline_club_owner_avatar_publication.sql", "fc20c3929ed19fd74bb68051dc5213f5f25e96baaee603f67d45e56c5971ebaa"],
  ["supabase/migrations/20261003024223_touchline_avatar_lookup_envelope.sql", "23e7c0d597755f68c1676c1b4b52a8c73e6ea430eba9729f04cc34b86cbf0da2"],
  ["supabase/migrations/20261003071914_touchline_avatar_operation_recovery.sql", "a539ff87be7b110df043d025c494fc232bb598de06811ccae57961173a1ae617"],
]);
const root = fileURLToPath(new URL("../", import.meta.url));
const creator = "touchline_avatar_qa_install_creator";
const writer = "touchline_avatar_writer";
export const sha256 = value => createHash("sha256").update(value).digest("hex");
function replaceOnce(source, before, after) {
  assert.equal(source.split(before).length - 1, 1, `Expected exactly one adaptation: ${before}`);
  return source.replace(before, after);
}
export function businessBodies(source) {
  return [...source.matchAll(/create(?: or replace)? function [\s\S]*?as \$\$([\s\S]*?)\$\$;/g)].map(match => match[1]);
}

/** Local generator only. Target argument is an operator assertion, NOT DB attestation.
 * Default outer ROLLBACK. No credentials/network or automatic execution/history writes.
 * The bucket is intentionally separate; only the four ownership-dependent sources are assembled.
 */
export function buildQaAvatarInstallation({ projectRef, executorRole = "postgres", readSource = path => readFileSync(resolve(root, path), "utf8") } = {}) {
  assert.equal(projectRef, QA_PROJECT_REF, "Only the exact QA project is admitted");
  assert.match(executorRole, /^[a-z][a-z0-9_]{0,62}$/);
  assert.ok(![writer, creator, "anon", "authenticated", "service_role"].includes(executorRole));
  const originals = SOURCES.map(([path, hash]) => {
    const sql = readSource(path);
    assert.equal(sha256(sql), hash, `Source hash drift: ${path}`);
    return sql;
  });
  const transfers = [];
  const parts = originals.map((sql, index) => {
    if (index !== 2) {
      sql = replaceOnce(sql, "\nbegin;\n", "\n");
      sql = replaceOnce(sql, "\ncommit;", "\n");
    }
    if (index === 1 || index === 3) {
      sql = replaceOnce(sql, "  if not exists(select 1 from pg_catalog.pg_roles where rolname=current_user and rolsuper)\n  then raise exception 'AVATAR_MIGRATION_OWNER_CAPABILITY_REQUIRED'; end if;", "  if current_user <> '" + executorRole + "' or not pg_has_role(current_user,'touchline_avatar_writer','SET')\n  then raise exception 'AVATAR_MIGRATION_OWNER_CAPABILITY_REQUIRED'; end if;");
      const matches = [...sql.matchAll(/^alter function touchline_avatar_private\.[^\n]+ owner to touchline_avatar_writer;$/gm)];
      assert.equal(matches.length, index === 1 ? 7 : 6);
      for (const [statement] of matches) { transfers.push(statement); sql = replaceOnce(sql, statement, "-- Ownership transfer deferred until all body replacements and ACLs are complete."); }
    }
    if (index === 1) {
      sql = replaceOnce(sql, "create role touchline_avatar_writer nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;", "-- Writer was created by the transaction-local creator before source application.");
      const check = "do $$\nbegin\n  if exists(select 1 from pg_catalog.pg_auth_members\n    where roleid='touchline_avatar_writer'::regrole or member='touchline_avatar_writer'::regrole)\n  then raise exception 'AVATAR_WRITER_MEMBERSHIP_FORBIDDEN'; end if;\nend $$;";
      sql = replaceOnce(sql, check, "-- Exact zero-membership check deferred to final cleanup, before outer transaction end.");
    }
    if (index === 3) {
      sql = replaceOnce(sql, "    or exists(select 1 from pg_catalog.pg_auth_members where roleid=r.oid or member=r.oid)", "    or exists(select 1 from pg_catalog.pg_auth_members where member=r.oid)");
    }
    assert.deepEqual(businessBodies(sql), businessBodies(originals[index]), "Business function bodies must remain byte-identical");
    return sql;
  });
  const sql = `-- QA ONLY ${QA_PROJECT_REF}; independently pin the actual connection before use.
-- Local rehearsal artifact. No history entries or bucket installation are included.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
select pg_advisory_xact_lock(900100,57);
do $$ begin
  if current_user <> '${executorRole}' or not exists(select 1 from pg_roles where rolname=current_user and rolcreaterole and not rolsuper)
  then raise exception 'AVATAR_EXECUTOR_MISMATCH'; end if;
  if to_regrole('${creator}') is not null or to_regrole('${writer}') is not null
    or to_regnamespace('touchline_avatar_private') is not null
    or exists(select 1 from information_schema.columns where table_schema='public' and table_name='users' and column_name='avatar_revision')
    or exists(select 1 from information_schema.columns where table_schema='public' and table_name='touchline_qa_owner_scenarios' and column_name in ('avatar_apply_outcome','avatar_rollback_outcome'))
    or exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in
      ('touchline_read_club_owner_avatar','touchline_find_club_owner_avatar_operation','touchline_publish_club_owner_avatar',
       'touchline_begin_club_owner_avatar_operation','touchline_read_club_owner_avatar_operation_status','touchline_fence_club_owner_avatar_operation','touchline_publish_club_owner_avatar_v2'))
  then raise exception 'AVATAR_PARTIAL_OR_EXISTING_INSTALLATION'; end if;
  if to_regprocedure('public.touchline_apply_qa_owner_scenario(text,uuid,uuid,text)') is null
    or to_regprocedure('public.touchline_rollback_qa_owner_scenario(text,uuid,uuid)') is null
  then raise exception 'AVATAR_QA_BASELINE_REQUIRED'; end if;
end $$;
create role ${creator} nologin nosuperuser createrole noinherit;
grant ${creator} to ${executorRole} with inherit false, set true;
set local role ${creator};
create role ${writer} nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant ${writer} to ${executorRole} with inherit false, set true;
reset role;
${parts.join("\n")}
-- All thirteen business helpers now have final bodies and final ACLs.
grant create on schema touchline_avatar_private to ${writer};
${transfers.join("\n")}
revoke create on schema touchline_avatar_private from ${writer};
set local role ${creator};
revoke ${writer} from ${executorRole};
reset role;
drop role ${creator};
do $$ declare p record; begin
  if exists(select 1 from pg_auth_members where roleid='${writer}'::regrole or member='${writer}'::regrole)
    or to_regrole('${creator}') is not null
    or has_schema_privilege('${writer}','touchline_avatar_private','CREATE')
  then raise exception 'AVATAR_WRITER_FINAL_CAPABILITY_DRIFT'; end if;
  for p in select oid,proowner from pg_proc where pronamespace='touchline_avatar_private'::regnamespace loop
    if p.proowner <> '${writer}'::regrole or has_function_privilege('anon',p.oid,'execute') or has_function_privilege('authenticated',p.oid,'execute')
    then raise exception 'AVATAR_PRIVATE_FUNCTION_DRIFT'; end if;
  end loop;
end $$;
rollback;
`;
  return { sql, sha256: sha256(sql), sources: SOURCES.map(([path, hash]) => ({ path, sha256: hash })) };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  assert.ok(args.length === 0 || (args.length === 1 && args[0] === "--sql"), "Only --sql is accepted; execution is never supported");
  const result = buildQaAvatarInstallation({ projectRef: QA_PROJECT_REF });
  process.stdout.write(args.includes("--sql") ? result.sql : JSON.stringify({ sha256: result.sha256, sources: result.sources, transactionEnd: "rollback", executes: false }, null, 2) + "\n");
}
