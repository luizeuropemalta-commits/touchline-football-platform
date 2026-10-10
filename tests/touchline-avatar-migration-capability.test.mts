import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import test from "node:test";

const runtime = process.env.TOUCHLINE_FANTASY_PGLITE_MODULE;
const { PGlite } = runtime ? await import(pathToFileURL(runtime).href) : { PGlite: null };

test("non-superuser uses disposable role creator and leaves zero writer memberships", { skip: !runtime }, async (t) => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role qa_executor login nosuperuser createrole createdb bypassrls;
      create role anon; create role authenticated; create role service_role;
      grant create on schema public to qa_executor;
      grant create on database postgres to qa_executor;
      set session authorization qa_executor;
    `);
    const identity = (await db.query(`select current_user,session_user,rolsuper from pg_roles where rolname=current_user`)).rows[0];
    assert.deepEqual(identity,{current_user:"qa_executor",session_user:"qa_executor",rolsuper:false});
    t.diagnostic(String((await db.query("select version() version")).rows[0].version));
    const handoff = `
      create role avatar_migration_creator nologin nosuperuser createrole noinherit;
      grant avatar_migration_creator to qa_executor with inherit false, set true;
      set local role avatar_migration_creator;
      create role touchline_avatar_writer nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
      grant touchline_avatar_writer to qa_executor with inherit false, set true;
      reset role;
      create schema avatar_capability_proof;
      grant usage,create on schema avatar_capability_proof to touchline_avatar_writer;
      create function avatar_capability_proof.writer_identity() returns name
        language sql security definer set search_path='' as $$ select current_user $$;
      revoke all on function avatar_capability_proof.writer_identity() from public,anon,authenticated;
      grant usage on schema avatar_capability_proof to service_role;
      grant execute on function avatar_capability_proof.writer_identity() to service_role;
      alter function avatar_capability_proof.writer_identity() owner to touchline_avatar_writer;
      revoke create on schema avatar_capability_proof from touchline_avatar_writer;
      set local role avatar_migration_creator;
      revoke touchline_avatar_writer from qa_executor;
      reset role;
      drop role avatar_migration_creator;
      do $$ begin
        if exists(select 1 from pg_auth_members where roleid='touchline_avatar_writer'::regrole
          or member='touchline_avatar_writer'::regrole) then raise exception 'WRITER_MEMBERSHIP_REMAINS'; end if;
      end $$;
    `;
    // Inject failure both while temporary memberships exist and after cleanup.
    for (const sql of [handoff.replace("      revoke create on schema", "      select 1/0;\n      revoke create on schema"), `${handoff} select 1/0;`]) {
      await assert.rejects(db.exec(`begin; ${sql} commit;`),/division by zero/);
      await db.exec("rollback");
      assert.deepEqual((await db.query(`select
        to_regrole('touchline_avatar_writer')::text writer,
        to_regrole('avatar_migration_creator')::text creator,
        to_regnamespace('avatar_capability_proof')::text schema,
        (select count(*)::int from pg_auth_members where member='qa_executor'::regrole) executor_memberships
      `)).rows[0],{writer:null,creator:null,schema:null,executor_memberships:0});
    }
    await db.exec(`begin; ${handoff} commit;`);
    const state = (await db.query(`select
      (select count(*)::int from pg_auth_members where roleid='touchline_avatar_writer'::regrole or member='touchline_avatar_writer'::regrole) memberships,
      (select proowner::regrole::text from pg_proc where oid='avatar_capability_proof.writer_identity()'::regprocedure) owner,
      to_regrole('avatar_migration_creator')::text creator,
      has_function_privilege('anon','avatar_capability_proof.writer_identity()','execute') anon,
      has_function_privilege('authenticated','avatar_capability_proof.writer_identity()','execute') authenticated,
      has_function_privilege('service_role','avatar_capability_proof.writer_identity()','execute') service,
      has_schema_privilege('touchline_avatar_writer','avatar_capability_proof','create') can_create`)).rows[0];
    assert.deepEqual(state,{memberships:0,owner:"touchline_avatar_writer",creator:null,anon:false,authenticated:false,service:true,can_create:false});
    await assert.rejects(db.exec("set role touchline_avatar_writer"),/permission denied/);
    await assert.rejects(db.exec("grant touchline_avatar_writer to qa_executor with set true"),/permission denied/);
    await assert.rejects(db.exec(`create or replace function avatar_capability_proof.writer_identity()
      returns name language sql security definer set search_path='' as $$ select current_user $$`),/must be owner/);
    // Bootstrap identity is used only to emulate the independent runtime caller.
    await db.exec("reset session authorization; set session authorization service_role");
    assert.equal((await db.query("select avatar_capability_proof.writer_identity() who")).rows[0].who,"touchline_avatar_writer");
    await assert.rejects(db.exec("set role touchline_avatar_writer"),/permission denied/);
  } finally { await db.close(); }
});
