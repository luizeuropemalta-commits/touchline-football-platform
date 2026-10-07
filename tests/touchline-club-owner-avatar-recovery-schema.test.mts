import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const sql = read("supabase/migrations/20261003071914_touchline_avatar_operation_recovery.sql");
const body = (name: string) => {
  const value = sql.match(new RegExp(`create(?: or replace)? function touchline_avatar_private\\.${name}\\([\\s\\S]*?\\$\\$;`))?.[0];
  assert.ok(value, name); return value;
};

test("recovery journals have restricted durable identity, one pending operation and immutable binding", () => {
  assert.match(sql, /actor_id uuid primary key references public\.users\(id\) on delete restrict/);
  assert.match(sql, /references touchline_avatar_private\.account_operations\(actor_id\) on delete restrict/);
  assert.match(sql, /where state='pending'/);
  assert.match(sql, /AVATAR_OPERATION_BINDING_IMMUTABLE/);
  assert.match(sql, /new\.base_generation is distinct from old\.base_generation/);
  assert.match(sql, /old\.state <> 'pending'/);
  assert.doesNotMatch(sql, /on delete cascade|truncate |delete from|create role|grant touchline_avatar_writer to/i);
});

test("begin alone starts a worker and CASes both revision and generation under ordered locks", () => {
  const begin = body("begin_operation");
  assert.ok(begin.indexOf("public.users where id=p_actor for update") < begin.indexOf("account_operations where actor_id=p_actor for update"));
  assert.ok(begin.indexOf("account_operations where actor_id=p_actor for update") < begin.indexOf("operations where actor_id=p_actor and operation_id=p_operation for update"));
  for (const value of ["'started'", "'pending'", "'operation_conflict'", "'busy'", "'conflict'"]) assert.ok(begin.includes(value));
  assert.match(begin, /v_revision <> v_expected or v_account\.generation <> v_base/);
  assert.match(begin, /v_base > 9223372036854775805/);
  assert.ok(begin.indexOf("if v_existing then") < begin.indexOf("v_base > 9223372036854775805"));
});

test("fence requires exact active binding and idle fencing advances a durable barrier", () => {
  const fence = body("fence_operation");
  assert.match(fence, /active_operation_id is distinct from p_expected_active/);
  assert.match(fence, /fenced_through_generation=greatest\(fenced_through_generation,v_expected\)/);
  assert.match(fence, /generation=generation\+1/);
  assert.match(fence, /'barrier_applied'/);
  assert.match(fence, /'fenced'/);
  assert.doesNotMatch(fence, /'ready'|expires_at|now\(\).*state/);
});

test("v2 publication is active-generation gated, atomic and strictly replay bound", () => {
  const publish = body("publish_v2");
  for (const value of ["v_op.generation <> v_generation", "v_op.expected_revision <> v_expected", "v_receipt.digest<>p_digest", "v_op.state <> 'pending'", "active_operation_id is distinct from p_operation"]) assert.ok(publish.includes(value), value);
  assert.match(publish, /insert into touchline_avatar_private\.receipts/);
  assert.match(publish, /set avatar_url=v_url,avatar_revision=v_revision\+1/);
  assert.match(publish, /set state='committed',receipt_operation_id=p_operation/);
  assert.doesNotMatch(publish, /exception when|commit;|rollback;/i);
  const legacy = body("publish");
  assert.match(legacy, /AVATAR_GENERATION_REQUIRED/);
  assert.match(legacy, /'committed'/);
  assert.doesNotMatch(legacy, /insert into|update public|update touchline/i);
});

test("status is a read-only coherent snapshot, not fabricated legacy history", () => {
  const status = body("operation_status");
  assert.match(status, /language plpgsql volatile security definer set search_path=''/);
  assert.match(status, /left join touchline_avatar_private\.account_operations/);
  assert.match(status, /left join touchline_avatar_private\.operations/);
  assert.match(status, /'legacy',v\.journal_operation is null/);
  assert.match(status, /'generation',v\.operation_generation::text/);
  assert.match(status, /'fencedThroughGeneration',v\.fenced_through::text/);
  assert.doesNotMatch(status, /insert into|update |delete |for update/i);
});

test("four new service-only invoker RPCs and RLS retain a no-membership dedicated writer", () => {
  const names = ["begin_club_owner_avatar_operation(uuid,uuid,text,text)", "read_club_owner_avatar_operation_status(uuid,uuid)", "fence_club_owner_avatar_operation(uuid,text,uuid)", "publish_club_owner_avatar_v2(uuid,uuid,text,text,text,text)"];
  assert.equal([...sql.matchAll(/create function public\.touchline_/g)].length, 4);
  for (const name of names) {
    assert.ok(sql.includes(`revoke all on function public.touchline_${name} from public,anon,authenticated,service_role;`));
    assert.ok(sql.includes(`grant execute on function public.touchline_${name} to service_role;`));
  }
  assert.equal([...sql.matchAll(/force row level security/g)].length, 2);
  assert.match(sql, /AVATAR_MIGRATION_OWNER_CAPABILITY_REQUIRED/);
  assert.match(sql, /AVATAR_WRITER_CAPABILITY_DRIFT/);
  assert.match(sql, /perform touchline_avatar_private\.assert_actor\(p_actor\)/);
  for (const value of sql.matchAll(/create function public\.[\s\S]*?\$\$;/g)) assert.match(value[0], /security invoker set search_path=''/);
});

test("SQL acceptance matrix is rollback-only and names the actual recovery/ACL invariants", () => {
  const matrix = read("supabase/tests/club_owner_avatar_operation_recovery.sql");
  for (const marker of ["ISOLATED_DATASET_REQUIRED", "DUPLICATE_BEGIN_RESTARTED", "IDLE_FENCE_LATE_BEGIN_ACCEPTED", "FENCE_CLOSED_NEW_OPERATION", "LEGACY_PUBLISH_ACCEPTED", "PROFILE_DELETE_WITH_PENDING_ACCEPTED", "TERMINAL_REPLAY_LOST", "GENERATION_HEADROOM_MISSING", "AUTH_SUBJECT_MISMATCH_ACCEPTED", "ROLLBACK_LOST_PENDING"]) assert.ok(matrix.includes(marker), marker);
  assert.match(matrix, /rollback;\s*$/);
  assert.doesNotMatch(matrix, /\bcommit;/i);
});
