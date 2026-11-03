import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const actor = '11111111-1111-4111-8111-111111111111';
const deleted = '22222222-2222-4222-8222-222222222222';
test('private identity bridge works without granting writer access to Auth', async () => {
 const db = new PGlite();
 try {
 await db.exec(`create role anon; create role authenticated; create role service_role; create role touchline_avatar_writer;
 create schema auth; create schema touchline_avatar_private;
 create table auth.users(id uuid primary key, deleted_at timestamptz);
 insert into auth.users values ('${actor}',null),('${deleted}',now());
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema touchline_avatar_private to touchline_avatar_writer;
 create function touchline_avatar_private.assert_actor(uuid) returns void language plpgsql as $$begin return; end$$;
 alter function touchline_avatar_private.assert_actor(uuid) owner to touchline_avatar_writer;
 revoke all on function touchline_avatar_private.assert_actor(uuid) from public;
 `);
 await db.exec(readFileSync(new URL('../supabase/migrations/20261102002338_touchline_avatar_private_identity_bridge.sql',import.meta.url),'utf8'));
 const privileges = await db.query<{auth_access:boolean}>('select has_schema_privilege(\'touchline_avatar_writer\',\'auth\',\'USAGE\') auth_access');
 assert.equal(privileges.rows[0].auth_access,false);
 for (const role of ['anon','authenticated','service_role']) {
  const result = await db.query<{allowed:boolean}>(`select has_function_privilege('${role}','touchline_avatar_private.assert_auth_identity(uuid)','EXECUTE') allowed`);
  assert.equal(result.rows[0].allowed,false);
 }
 await db.exec('set role touchline_avatar_writer');
 await db.query('select touchline_avatar_private.assert_actor($1)',[actor]);
 await assert.rejects(db.query('select * from auth.users'),/permission denied/);
 await assert.rejects(db.query('select touchline_avatar_private.assert_actor($1)',[deleted]),/AVATAR_AUTH_IDENTITY_UNAVAILABLE/);
 await assert.rejects(db.query('select touchline_avatar_private.assert_actor(null)'),/AVATAR_INVALID_ACTOR/);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[deleted]);
 await assert.rejects(db.query('select touchline_avatar_private.assert_actor($1)',[actor]),/AVATAR_AUTH_SUBJECT_MISMATCH/);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[actor]);
 await db.query('select touchline_avatar_private.assert_actor($1)',[actor]);
 } finally { await db.close(); }
});
