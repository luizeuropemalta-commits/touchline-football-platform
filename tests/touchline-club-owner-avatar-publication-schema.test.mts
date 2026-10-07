import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = () => read("supabase/migrations/20261003014410_touchline_club_owner_avatar_publication.sql");
const signatures = ["touchline_read_club_owner_avatar(uuid)", "touchline_find_club_owner_avatar_operation(uuid,uuid)", "touchline_publish_club_owner_avatar(uuid,uuid,text,text,text)"];

test("only three service-only invoker RPCs delegate to a private constrained writer", () => {
  const sql = migration();
  assert.match(sql, /create role touchline_avatar_writer nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls/);
  assert.match(sql, /AVATAR_MIGRATION_OWNER_CAPABILITY_REQUIRED/);
  assert.match(sql, /pg_catalog\.pg_auth_members/);
  assert.doesNotMatch(sql, /grant touchline_avatar_writer to|set_config\(|set role /i);
  assert.equal([...sql.matchAll(/create function public\.touchline_\w+/g)].length, 3);
  for (const signature of signatures) {
    assert.ok(sql.includes(`revoke all on function public.${signature} from public,anon,authenticated,service_role;`));
    assert.ok(sql.includes(`grant execute on function public.${signature} to service_role;`));
  }
  for (const block of sql.matchAll(/create function public\.[\s\S]*?\$\$;/g)) {
    assert.match(block[0], /security invoker set search_path=''/);
    assert.doesNotMatch(block[0], /security definer/);
  }
});

test("receipts retain auth identity, exact immutable binding, RLS and no direct service DML", () => {
  const sql = migration();
  assert.match(sql, /actor_id uuid not null references auth\.users\(id\) on delete restrict/);
  assert.match(sql, /primary key\(actor_id,operation_id\)/);
  assert.match(sql, /unique\(actor_id,revision\)/);
  assert.match(sql, /force row level security/);
  assert.match(sql, /revoke all on touchline_avatar_private\.receipts from public,anon,authenticated,service_role/);
  assert.match(sql, /grant select,insert on touchline_avatar_private\.receipts to touchline_avatar_writer/);
  assert.doesNotMatch(sql, /grant (?:all|update|delete).*receipts/i);
  assert.match(sql, /object_key = actor_id::text \|\| '\/' \|\| operation_id::text \|\| '\/' \|\| digest \|\| '\.webp'/);
  assert.match(sql, /avatar_url = '\/api\/account\/avatar\?version=' \|\| operation_id::text/);
});

test("publication locks account, replays first, CASes once, and preserves bigint strings", () => {
  const sql = migration();
  const publish = sql.match(/create function touchline_avatar_private\.publish\([\s\S]*?\$\$;/)?.[0] ?? "";
  assert.match(publish, /for update/);
  assert.ok(publish.indexOf("if found then") < publish.indexOf("v_revision <> v_expected"));
  assert.match(publish, /'operation_conflict'/); assert.match(publish, /'conflict'/);
  assert.match(publish, /insert into touchline_avatar_private\.receipts/);
  assert.match(publish, /set avatar_url=v_url,avatar_revision=v_revision\+1/);
  assert.doesNotMatch(publish, /exception when|delete from|commit;|rollback;/i);
  assert.match(sql, /'expectedRevision',r\.expected_revision::text/);
  assert.match(sql, /'revision',r\.revision::text/);
  assert.match(sql, /9223372036854775806/);
  assert.match(sql, /auth\.uid\(\) is not null and auth\.uid\(\) <> p_actor/);
});

test("guard preserves other profile fields, rejects direct changes and recreation with history", () => {
  const sql = migration();
  assert.match(sql, /new\.avatar_url is distinct from old\.avatar_url/);
  assert.match(sql, /current_user <> 'touchline_avatar_writer'/);
  assert.match(sql, /AVATAR_PROFILE_RECREATION_FORBIDDEN/);
  assert.match(sql, /perform 1 from public\.users where id=new\.id for key share/);
  assert.match(sql, /if not found and exists\(select 1 from touchline_avatar_private\.receipts where actor_id=new\.id\)/);
  assert.match(sql, /before insert on public\.users/);
  assert.match(sql, /before update on public\.users/);
  assert.doesNotMatch(sql, /revoke .*on (?:table )?public\.users from/i);
  assert.match(sql, /grant update\(avatar_url,avatar_revision\) on public\.users to touchline_avatar_writer/);
});

test("QA presence requires the exact approved forward bodies, without rewriting historical functions", () => {
  const sql = migration(); const qa = read("supabase/qa/057_touchline_qa_owner_avatar_preservation.sql");
  const bodies = [...qa.matchAll(/create or replace function public\.(touchline_(?:apply|rollback)_qa_owner_scenario)\([\s\S]*?as \$\$([\s\S]*?)\$\$;/g)];
  assert.equal(bodies.length, 2);
  for (const [, , body] of bodies) assert.ok(sql.includes(createHash("md5").update(body).digest("hex")));
  assert.match(sql, /AVATAR_QA057_COMPATIBILITY_REQUIRED/);
  assert.doesNotMatch(sql, /create or replace function public\.touchline_(?:apply|rollback)_qa_owner_scenario/);
  assert.notEqual(createHash("md5").update(bodies[0][2]).digest("hex"), createHash("md5").update(bodies[0][2].replace("35", "34")).digest("hex"), "negative control: altered business body is not admitted");
});

test("real SQL matrix is isolated and rollback-only; static tests do not claim DB proof", () => {
  const sql = read("supabase/tests/club_owner_avatar_publication.sql");
  for (const marker of ["ISOLATED_DATASET_REQUIRED", "DIRECT_WRITE_ACCEPTED", "REPLAY_CHANGED_REVISION", "AUTH_SUBJECT_MISMATCH_ACCEPTED", "PROFILE_RECREATION_ACCEPTED", "ROLLBACK_LOST_PRIOR_STATE", "AVATAR_MIGRATION_OWNER_CAPABILITY_REQUIRED", "UNPRIVILEGED_OWNER_TRANSFER_ACCEPTED"]) assert.ok(sql.includes(marker), marker);
  assert.match(sql, /set local role service_role/);
  assert.match(sql, /set local role authenticated/);
  assert.match(sql, /rollback;\s*$/);
  assert.doesNotMatch(sql, /\bcommit;/i);
  assert.match(sql, /concurrency.*separate sessions/i);
});

test("lookup envelope is a forward-only body replacement with unchanged actor scope and capabilities", () => {
  const sql = read("supabase/migrations/20261003024223_touchline_avatar_lookup_envelope.sql");
  assert.equal([...sql.matchAll(/create or replace function /g)].length, 1);
  assert.match(sql, /create or replace function touchline_avatar_private\.find_operation\(p_actor uuid,p_operation uuid\)/);
  assert.match(sql, /returns jsonb language plpgsql security definer set search_path=''/);
  assert.match(sql, /perform touchline_avatar_private\.assert_actor\(p_actor\)/);
  assert.match(sql, /AVATAR_INVALID_OPERATION/);
  assert.match(sql, /where actor_id=p_actor and operation_id=p_operation/);
  assert.match(sql, /'version',1,'status','absent','actorId',p_actor::text/);
  assert.match(sql, /'operationId',p_operation::text,'receipt',null/);
  assert.match(sql, /'version',1,'status','found','actorId',p_actor::text/);
  assert.match(sql, /'operationId',p_operation::text,'receipt',touchline_avatar_private\.receipt_json\(v_receipt\)/);
  assert.doesNotMatch(sql, /\b(?:grant|revoke|drop|insert|update|delete)\b|alter function|create (?:table|role|policy|trigger)/i);
  const matrix = read("supabase/tests/club_owner_avatar_publication.sql");
  for (const marker of ["ABSENT_OPERATION_ENVELOPE_INVALID", "OWNER_RECEIPT_SCOPE_INVALID", "SUPERSEDED_HISTORY_LOST", "ROLLBACK_LOST_PRIOR_STATE", "PROFILE_DELETE_ERASED_RECEIPT"]) assert.ok(matrix.includes(marker));
});
