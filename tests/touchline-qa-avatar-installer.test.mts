import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { buildQaAvatarInstallation, businessBodies, QA_PROJECT_REF, SOURCES } from "../scripts/build-qa-avatar-installation.mjs";

const runtime = process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
const { PGlite } = runtime ? await import(pathToFileURL(runtime).href) : { PGlite: null };
const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("QA avatar adapter pins sources, rejects drift/targets, and preserves every business body", () => {
  const result = buildQaAvatarInstallation({ projectRef: QA_PROJECT_REF });
  assert.throws(() => buildQaAvatarInstallation({ projectRef: "production" }), /exact QA/);
  assert.throws(() => buildQaAvatarInstallation({ projectRef: QA_PROJECT_REF, readSource: (path: string) => source(path) + "\n" }), /hash drift/);
  assert.deepEqual(businessBodies(result.sql), SOURCES.flatMap(([path]: string[]) => businessBodies(source(path))));
  assert.equal((result.sql.match(/^begin;$/gm) ?? []).length, 1);
  assert.equal((result.sql.match(/^rollback;$/gm) ?? []).length, 1);
  assert.doesNotMatch(result.sql, /^commit;$/m);
  assert.ok(result.sql.indexOf("owner to touchline_avatar_writer;") > result.sql.lastIndexOf("create function public."));
});

// Minimal synthetic prerequisites exercise real avatar DDL/RPC/ACL behavior,
// not the real checkout/lineup/auth profile trigger or QA057 scenario workflow.
async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create role qa_executor login nosuperuser createrole createdb bypassrls;
    create role anon; create role authenticated; create role service_role bypassrls;
    grant create on database postgres to qa_executor;
    grant create on schema public to qa_executor;
    set session authorization qa_executor;
    create schema auth;
    create table auth.users(id uuid primary key,deleted_at timestamptz);
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create table public.users(id uuid primary key references auth.users(id),avatar_url text,full_name text);
    alter table public.users enable row level security;
    create table public.touchline_qa_fixture_runs(id uuid primary key);
    create table public.touchline_qa_owner_scenarios(run_id uuid,user_id uuid);
    create table public.touchline_user_arena_state(user_id uuid);
    create function public.touchline_assert_qa_fixture_target(text) returns void language plpgsql as $$ begin
      if $1 is distinct from '${QA_PROJECT_REF}' then raise exception 'TARGET'; end if; end $$;
    create function public.touchline_apply_qa_owner_scenario(text,uuid,uuid,text) returns jsonb language sql as $$select '{}'::jsonb$$;
    create function public.touchline_rollback_qa_owner_scenario(text,uuid,uuid) returns jsonb language sql as $$select '{}'::jsonb$$;
    insert into auth.users values('00000000-0000-4000-8000-000000000001',null);
    insert into public.users values('00000000-0000-4000-8000-000000000001',null,'Synthetic');
  `);
  return db;
}

test("full generated ownership chain rolls back, commits with exact ACLs, and performs generation-gated publication", { skip: !runtime }, async () => {
  const db = await fixture();
  const result = buildQaAvatarInstallation({ projectRef: QA_PROJECT_REF, executorRole: "qa_executor" });
  try {
    await db.exec(result.sql);
    assert.equal((await db.query("select to_regnamespace('touchline_avatar_private') n")).rows[0].n,null);
    assert.equal((await db.query("select count(*)::int n from information_schema.columns where table_name='touchline_qa_owner_scenarios' and column_name='avatar_apply_outcome'")).rows[0].n,0);
    const failed = result.sql.replace(/rollback;\n$/, "select 1/0; commit;\n");
    await assert.rejects(db.exec(failed),/division by zero/);
    await db.exec("rollback");
    assert.equal((await db.query("select count(*)::int n from pg_roles where rolname in ('touchline_avatar_writer','touchline_avatar_qa_install_creator')")).rows[0].n,0);
    const commit = result.sql.replace(/rollback;\n$/, "commit;\n");
    await db.exec(commit);
    const acl = (await db.query(`select
      (select count(*)::int from pg_auth_members where roleid='touchline_avatar_writer'::regrole or member='touchline_avatar_writer'::regrole) members,
      (select count(*)::int from pg_proc where pronamespace='touchline_avatar_private'::regnamespace and proowner='touchline_avatar_writer'::regrole) owned,
      (select count(*)::int from pg_proc where pronamespace='touchline_avatar_private'::regnamespace and
        (has_function_privilege('anon',oid,'execute') or has_function_privilege('authenticated',oid,'execute'))) public_private,
      has_table_privilege('service_role','touchline_avatar_private.receipts','SELECT,INSERT,UPDATE,DELETE') direct_receipts,
      has_function_privilege('service_role','public.touchline_publish_club_owner_avatar_v2(uuid,uuid,text,text,text,text)','execute') service
    `)).rows[0];
    assert.deepEqual(acl,{members:0,owned:13,public_private:0,direct_receipts:false,service:true});
    await assert.rejects(db.exec(commit),/PARTIAL_OR_EXISTING/);
    await db.exec("rollback");
    await db.exec("reset session authorization; set session authorization service_role");
    const actor = "00000000-0000-4000-8000-000000000001";
    const operation = "00000000-0000-4000-8000-000000000002";
    const digest = "a".repeat(64);
    const begin = (await db.query("select public.touchline_begin_club_owner_avatar_operation($1,$2,'0','0') r",[actor,operation])).rows[0].r;
    assert.equal(begin.status,"started");
    const publish = (await db.query("select public.touchline_publish_club_owner_avatar_v2($1,$2,'0','1',$3,$4) r",[actor,operation,digest,`${actor}/${operation}/${digest}.webp`])).rows[0].r;
    assert.equal(publish.status,"committed");
    assert.equal(publish.snapshot.revision,"1");
    assert.equal(publish.snapshot.generation,"2");
    await assert.rejects(db.exec("set role touchline_avatar_writer"),/permission denied/);
  } finally { await db.close(); }
});
